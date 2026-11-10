-- Статус работ на этаже (вместо статусов отдельных дверей) и приёмка этажа целиком.
-- Запускать в Supabase SQL Editor один раз, после data-base-foreman-brigades.sql.
-- Заменяет прежнюю функцию отчёта по этажу (data-base-floor-report.sql запускать больше не нужно).
--
-- Статусы этажа (floor.status): not_started, in_progress, pending (закончен, на проверке),
-- changes_requested (нужна доработка), accepted (принят).
-- Бригадир: set_foreman_floor_status (не начат / в работе) и submit_foreman_floor (этаж закончен).
-- Менеджер или администратор: accept_floor_with_accrual (принять этаж и начислить оплату).
-- Статусы дверей и проёмов внутри этажа меняются вместе со статусом этажа, поэтому
-- отчёты и дашборд продолжают считать установленные двери.

CREATE OR REPLACE FUNCTION public.apply_floor_transition(
  p_floor jsonb,
  p_floor_status text,
  p_review text,
  p_door_status text,
  p_now text
)
RETURNS jsonb
LANGUAGE sql
SET search_path=''
AS $$
  SELECT p_floor || jsonb_build_object(
    'status',p_floor_status,
    'apartments',(
      SELECT COALESCE(jsonb_agg(
        CASE WHEN jsonb_typeof(a.value->'openings')='array' THEN
          a.value || jsonb_build_object('openings',(
            SELECT COALESCE(jsonb_agg(
              CASE WHEN o.value->>'reviewStatus'='accepted' THEN o.value
              ELSE o.value || jsonb_build_object(
                'reviewStatus',p_review,
                'submittedAt',CASE WHEN p_review='pending' THEN to_jsonb(p_now) ELSE COALESCE(o.value->'submittedAt','null'::jsonb) END,
                'acceptedAt',CASE WHEN p_review='accepted' THEN to_jsonb(p_now) ELSE 'null'::jsonb END,
                'updatedAt',p_now,
                'doors',(
                  SELECT COALESCE(jsonb_agg(
                    d.value || jsonb_build_object(
                      'status',p_door_status,
                      'installedAt',CASE
                        WHEN p_door_status IN ('installed','accepted')
                          THEN COALESCE(NULLIF(d.value->'installedAt','null'::jsonb),to_jsonb(p_now))
                        ELSE 'null'::jsonb
                      END
                    ) ORDER BY d.ordinality
                  ),'[]'::jsonb)
                  FROM jsonb_array_elements(COALESCE(o.value->'doors','[]'::jsonb)) WITH ORDINALITY AS d(value,ordinality)
                )
              ) END
              ORDER BY o.ordinality
            ),'[]'::jsonb)
            FROM jsonb_array_elements(a.value->'openings') WITH ORDINALITY AS o(value,ordinality)
          ))
        ELSE a.value END
        ORDER BY a.ordinality
      ),'[]'::jsonb)
      FROM jsonb_array_elements(COALESCE(p_floor->'apartments','[]'::jsonb)) WITH ORDINALITY AS a(value,ordinality)
    )
  );
$$;
REVOKE ALL ON FUNCTION public.apply_floor_transition(jsonb,text,text,text,text) FROM PUBLIC;

-- Бригадир ставит этажу статус «не начат» или «в работе».
CREATE OR REPLACE FUNCTION public.set_foreman_floor_status(
  p_expected_revision bigint,
  p_object_id text,
  p_block_id text,
  p_floor_id text,
  p_status text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v_role text;
  v_brigade_ids text[];
  v_state jsonb;
  v_revision bigint;
  v_new_revision bigint;
  v_oi integer;
  v_bi integer;
  v_fi integer;
  v_floor jsonb;
  v_now text:=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  SELECT role,brigade_ids INTO v_role,v_brigade_ids
  FROM public.profiles WHERE id=(SELECT auth.uid()) AND is_active;
  IF v_role IS DISTINCT FROM 'foreman' OR COALESCE(cardinality(v_brigade_ids),0)=0 THEN
    RAISE EXCEPTION 'Менять статус этажа может только назначенный бригадир' USING ERRCODE='42501';
  END IF;
  IF p_status NOT IN ('not_started','in_progress') THEN
    RAISE EXCEPTION 'Недопустимый статус этажа' USING ERRCODE='22023';
  END IF;

  SELECT state,revision INTO v_state,v_revision FROM public.app_state WHERE id=1 FOR UPDATE;
  IF v_revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'WORKSPACE_CONFLICT' USING ERRCODE='40001';
  END IF;

  SELECT o.ordinality::integer-1,b.ordinality::integer-1,f.ordinality::integer-1,f.value
  INTO v_oi,v_bi,v_fi,v_floor
  FROM jsonb_array_elements(COALESCE(v_state->'objects','[]'::jsonb)) WITH ORDINALITY AS o(value,ordinality)
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.value->'blocks','[]'::jsonb)) WITH ORDINALITY AS b(value,ordinality)
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(b.value->'floors','[]'::jsonb)) WITH ORDINALITY AS f(value,ordinality)
  WHERE o.value->>'id'=p_object_id AND b.value->>'id'=p_block_id AND f.value->>'id'=p_floor_id
  LIMIT 1;
  IF v_floor IS NULL OR NOT COALESCE(v_floor->>'brigadeId'=ANY(v_brigade_ids),false) THEN
    RAISE EXCEPTION 'Этаж не найден среди назначенных' USING ERRCODE='42501';
  END IF;
  IF v_floor->>'status' IN ('pending','accepted') OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(v_floor->'apartments','[]'::jsonb)) AS a(value)
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(a.value->'openings')='array' THEN a.value->'openings' ELSE '[]'::jsonb END) AS o(value)
    WHERE o.value->>'reviewStatus'='pending'
  ) THEN
    RAISE EXCEPTION 'Этаж уже отправлен менеджеру или принят' USING ERRCODE='42501';
  END IF;

  v_state:=jsonb_set(
    v_state,
    ARRAY['objects',v_oi::text,'blocks',v_bi::text,'floors',v_fi::text],
    public.apply_floor_transition(v_floor,p_status,'not_submitted',p_status,v_now),
    false
  );
  UPDATE public.app_state SET state=v_state,revision=revision+1,updated_by=(SELECT auth.uid()),updated_at=now()
  WHERE id=1 AND revision=p_expected_revision RETURNING revision INTO v_new_revision;
  IF v_new_revision IS NULL THEN RAISE EXCEPTION 'WORKSPACE_CONFLICT' USING ERRCODE='40001'; END IF;
  RETURN v_new_revision;
END;
$$;
REVOKE ALL ON FUNCTION public.set_foreman_floor_status(bigint,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_foreman_floor_status(bigint,text,text,text,text) TO authenticated;

-- Бригадир сообщает, что этаж закончен: этаж и все его проёмы уходят менеджеру на проверку.
CREATE OR REPLACE FUNCTION public.submit_foreman_floor(
  p_expected_revision bigint,
  p_object_id text,
  p_block_id text,
  p_floor_id text,
  p_note text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v_role text;
  v_brigade_ids text[];
  v_state jsonb;
  v_revision bigint;
  v_new_revision bigint;
  v_oi integer;
  v_bi integer;
  v_fi integer;
  v_floor jsonb;
  v_open integer;
  v_now text:=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  SELECT role,brigade_ids INTO v_role,v_brigade_ids
  FROM public.profiles WHERE id=(SELECT auth.uid()) AND is_active;
  IF v_role IS DISTINCT FROM 'foreman' OR COALESCE(cardinality(v_brigade_ids),0)=0 THEN
    RAISE EXCEPTION 'Отправлять отчёт по этажу может только назначенный бригадир' USING ERRCODE='42501';
  END IF;
  IF length(COALESCE(p_note,''))>2000 THEN
    RAISE EXCEPTION 'Комментарий слишком длинный' USING ERRCODE='22023';
  END IF;

  SELECT state,revision INTO v_state,v_revision FROM public.app_state WHERE id=1 FOR UPDATE;
  IF v_revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'WORKSPACE_CONFLICT' USING ERRCODE='40001';
  END IF;

  SELECT o.ordinality::integer-1,b.ordinality::integer-1,f.ordinality::integer-1,f.value
  INTO v_oi,v_bi,v_fi,v_floor
  FROM jsonb_array_elements(COALESCE(v_state->'objects','[]'::jsonb)) WITH ORDINALITY AS o(value,ordinality)
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.value->'blocks','[]'::jsonb)) WITH ORDINALITY AS b(value,ordinality)
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(b.value->'floors','[]'::jsonb)) WITH ORDINALITY AS f(value,ordinality)
  WHERE o.value->>'id'=p_object_id AND b.value->>'id'=p_block_id AND f.value->>'id'=p_floor_id
  LIMIT 1;
  IF v_floor IS NULL OR NOT COALESCE(v_floor->>'brigadeId'=ANY(v_brigade_ids),false) THEN
    RAISE EXCEPTION 'Этаж не найден среди назначенных' USING ERRCODE='42501';
  END IF;
  IF v_floor->>'status' IN ('pending','accepted') THEN
    RAISE EXCEPTION 'Этаж уже отправлен менеджеру или принят' USING ERRCODE='42501';
  END IF;

  SELECT count(*) INTO v_open
  FROM jsonb_array_elements(COALESCE(v_floor->'apartments','[]'::jsonb)) AS a(value)
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(a.value->'openings')='array' THEN a.value->'openings' ELSE '[]'::jsonb END) AS o(value)
  WHERE COALESCE(o.value->>'reviewStatus','')<>'accepted';
  IF v_open=0 THEN
    RAISE EXCEPTION 'На этаже нет дверей, которые можно отправить на проверку' USING ERRCODE='22023';
  END IF;

  v_floor:=public.apply_floor_transition(v_floor,'pending','pending','installed',v_now)
    - 'managerNote'
    || jsonb_build_object('foremanReport',jsonb_build_object('submittedAt',v_now,'note',COALESCE(p_note,''),'openingsCount',v_open));
  v_state:=jsonb_set(v_state,ARRAY['objects',v_oi::text,'blocks',v_bi::text,'floors',v_fi::text],v_floor,false);
  UPDATE public.app_state SET state=v_state,revision=revision+1,updated_by=(SELECT auth.uid()),updated_at=now()
  WHERE id=1 AND revision=p_expected_revision RETURNING revision INTO v_new_revision;
  IF v_new_revision IS NULL THEN RAISE EXCEPTION 'WORKSPACE_CONFLICT' USING ERRCODE='40001'; END IF;
  RETURN v_new_revision;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_foreman_floor(bigint,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_foreman_floor(bigint,text,text,text,text) TO authenticated;

-- Менеджер или администратор принимает этаж: проёмы принимаются, бригаде начисляется оплата
-- (тариф за проём, плюс 500 сомов за двойной проём). Фото для приёмки не требуются.
CREATE OR REPLACE FUNCTION public.accept_floor_with_accrual(
  p_expected_revision bigint,
  p_object_id text,
  p_block_id text,
  p_floor_id text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v_role text;
  v_state jsonb;
  v_revision bigint;
  v_new_revision bigint;
  v_oi integer;
  v_bi integer;
  v_fi integer;
  v_floor jsonb;
  v_brigade text;
  v_rate numeric;
  v_open integer;
  v_pending integer;
  v_now text:=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id=(SELECT auth.uid()) AND is_active;
  IF v_role IS NULL OR v_role NOT IN ('admin','manager') THEN
    RAISE EXCEPTION 'Нет прав принимать этаж' USING ERRCODE='42501';
  END IF;

  SELECT state,revision INTO v_state,v_revision FROM public.app_state WHERE id=1 FOR UPDATE;
  IF v_state IS NULL OR v_revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'WORKSPACE_CONFLICT' USING ERRCODE='40001';
  END IF;

  SELECT o.ordinality::integer-1,b.ordinality::integer-1,f.ordinality::integer-1,f.value
  INTO v_oi,v_bi,v_fi,v_floor
  FROM jsonb_array_elements(COALESCE(v_state->'objects','[]'::jsonb)) WITH ORDINALITY AS o(value,ordinality)
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.value->'blocks','[]'::jsonb)) WITH ORDINALITY AS b(value,ordinality)
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(b.value->'floors','[]'::jsonb)) WITH ORDINALITY AS f(value,ordinality)
  WHERE o.value->>'id'=p_object_id AND b.value->>'id'=p_block_id AND f.value->>'id'=p_floor_id
  LIMIT 1;
  IF v_floor IS NULL THEN RAISE EXCEPTION 'Этаж не найден' USING ERRCODE='P0002'; END IF;

  SELECT
    count(*) FILTER (WHERE COALESCE(o.value->>'reviewStatus','')<>'accepted'),
    count(*) FILTER (WHERE o.value->>'reviewStatus'='pending')
  INTO v_open,v_pending
  FROM jsonb_array_elements(COALESCE(v_floor->'apartments','[]'::jsonb)) AS a(value)
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(a.value->'openings')='array' THEN a.value->'openings' ELSE '[]'::jsonb END) AS o(value);

  IF v_open=0 THEN RETURN v_revision; END IF;
  IF v_floor->>'status' IS DISTINCT FROM 'pending' AND v_pending=0 THEN
    RAISE EXCEPTION 'Этаж должен быть отправлен на проверку';
  END IF;

  v_brigade:=NULLIF(v_floor->>'brigadeId','');
  v_rate:=NULLIF(v_floor->>'ratePerOpening','')::numeric;
  IF v_brigade IS NULL OR v_rate IS NULL OR v_rate<=0 THEN
    RAISE EXCEPTION 'TARIFF_REQUIRED';
  END IF;

  INSERT INTO public.brigade_financial_entries (
    brigade_id,entry_type,amount,occurred_on,floor_id,opening_id,rate_per_opening,door_count,note,created_by
  )
  SELECT
    v_brigade,'accrual',
    v_rate+CASE WHEN jsonb_array_length(COALESCE(o.value->'doors','[]'::jsonb))=2 THEN 500 ELSE 0 END,
    CURRENT_DATE,p_floor_id,o.value->>'id',v_rate,
    jsonb_array_length(COALESCE(o.value->'doors','[]'::jsonb)),
    COALESCE(o.value->>'title','Принятый проём'),
    (SELECT auth.uid())
  FROM jsonb_array_elements(COALESCE(v_floor->'apartments','[]'::jsonb)) AS a(value)
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(a.value->'openings')='array' THEN a.value->'openings' ELSE '[]'::jsonb END) AS o(value)
  WHERE COALESCE(o.value->>'reviewStatus','')<>'accepted'
  ON CONFLICT (opening_id) WHERE entry_type='accrual' DO NOTHING;

  v_floor:=public.apply_floor_transition(v_floor,'accepted','accepted','accepted',v_now) - 'managerNote';
  v_state:=jsonb_set(v_state,ARRAY['objects',v_oi::text,'blocks',v_bi::text,'floors',v_fi::text],v_floor,false);
  UPDATE public.app_state SET state=v_state,revision=revision+1,updated_by=(SELECT auth.uid()),updated_at=now()
  WHERE id=1 AND revision=p_expected_revision RETURNING revision INTO v_new_revision;
  IF v_new_revision IS NULL THEN RAISE EXCEPTION 'WORKSPACE_CONFLICT' USING ERRCODE='40001'; END IF;
  RETURN v_new_revision;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_floor_with_accrual(bigint,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_floor_with_accrual(bigint,text,text,text) TO authenticated;
