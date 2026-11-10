-- Отчёт бригадира «Этаж закончен».
-- Запускать в Supabase SQL Editor после data-base-foreman-brigades.sql.
-- Функция отправляет на проверку менеджеру все ещё не отправленные проёмы назначенного этажа
-- и сохраняет на этаже отметку foremanReport. Если в каком-то проёме есть неустановленная
-- дверь или дверь без фото, отчёт не отправляется.

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
  v_profile_role text;
  v_brigade_ids text[];
  v_state jsonb;
  v_revision bigint;
  v_new_revision bigint;
  v_found boolean:=false;
  v_object_row record;
  v_block_row record;
  v_floor_row record;
  v_apartments jsonb;
  v_eligible integer;
  v_incomplete integer;
  v_now text:=now()::text;
BEGIN
  SELECT role,brigade_ids INTO v_profile_role,v_brigade_ids
  FROM public.profiles WHERE id=(SELECT auth.uid()) AND is_active;
  IF v_profile_role IS DISTINCT FROM 'foreman' OR COALESCE(cardinality(v_brigade_ids),0)=0 THEN
    RAISE EXCEPTION 'Отправлять отчёт по этажу может только назначенный бригадир' USING ERRCODE='42501';
  END IF;
  IF length(COALESCE(p_note,''))>2000 THEN
    RAISE EXCEPTION 'Комментарий слишком длинный' USING ERRCODE='22023';
  END IF;

  SELECT state,revision INTO v_state,v_revision FROM public.app_state WHERE id=1 FOR UPDATE;
  IF v_revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'WORKSPACE_CONFLICT' USING ERRCODE='40001';
  END IF;

  FOR v_object_row IN SELECT value,ordinality FROM jsonb_array_elements(COALESCE(v_state->'objects','[]'::jsonb)) WITH ORDINALITY LOOP
    IF v_object_row.value->>'id'<>p_object_id THEN CONTINUE; END IF;
    FOR v_block_row IN SELECT value,ordinality FROM jsonb_array_elements(COALESCE(v_object_row.value->'blocks','[]'::jsonb)) WITH ORDINALITY LOOP
      IF v_block_row.value->>'id'<>p_block_id THEN CONTINUE; END IF;
      FOR v_floor_row IN SELECT value,ordinality FROM jsonb_array_elements(COALESCE(v_block_row.value->'floors','[]'::jsonb)) WITH ORDINALITY LOOP
        IF v_floor_row.value->>'id'<>p_floor_id OR NOT COALESCE(v_floor_row.value->>'brigadeId'=ANY(v_brigade_ids),false) THEN CONTINUE; END IF;

        SELECT
          count(*) FILTER (WHERE COALESCE(o.value->>'reviewStatus','') NOT IN ('pending','accepted')),
          count(*) FILTER (WHERE COALESCE(o.value->>'reviewStatus','') NOT IN ('pending','accepted') AND (
            jsonb_array_length(COALESCE(o.value->'doors','[]'::jsonb))=0
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(COALESCE(o.value->'doors','[]'::jsonb)) AS d(value)
              WHERE d.value->>'status' IS DISTINCT FROM 'installed'
                 OR CASE WHEN jsonb_typeof(d.value->'photos')='array' THEN jsonb_array_length(d.value->'photos')=0 ELSE true END
            )
          ))
        INTO v_eligible,v_incomplete
        FROM jsonb_array_elements(COALESCE(v_floor_row.value->'apartments','[]'::jsonb)) AS a(value)
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(a.value->'openings','[]'::jsonb)) AS o(value);

        IF v_eligible=0 THEN
          RAISE EXCEPTION 'На этаже нет проёмов, которые можно отправить на проверку' USING ERRCODE='22023';
        END IF;
        IF v_incomplete>0 THEN
          RAISE EXCEPTION 'Не готово проёмов: %. Для каждой двери отметьте установку и добавьте фото.',v_incomplete USING ERRCODE='22023';
        END IF;

        SELECT COALESCE(jsonb_agg(
          CASE WHEN jsonb_typeof(a.value->'openings')='array' THEN
            a.value||jsonb_build_object('openings',(
              SELECT COALESCE(jsonb_agg(
                CASE WHEN COALESCE(o.value->>'reviewStatus','') IN ('pending','accepted') THEN o.value
                ELSE o.value||jsonb_build_object('reviewStatus','pending','submittedAt',to_jsonb(v_now),'updatedAt',v_now) END
                ORDER BY o.ordinality),'[]'::jsonb)
              FROM jsonb_array_elements(a.value->'openings') WITH ORDINALITY AS o(value,ordinality)
            ))
          ELSE a.value END
          ORDER BY a.ordinality),'[]'::jsonb)
        INTO v_apartments
        FROM jsonb_array_elements(COALESCE(v_floor_row.value->'apartments','[]'::jsonb)) WITH ORDINALITY AS a(value,ordinality);

        v_state:=jsonb_set(
          v_state,
          ARRAY['objects',(v_object_row.ordinality-1)::text,'blocks',(v_block_row.ordinality-1)::text,'floors',(v_floor_row.ordinality-1)::text],
          v_floor_row.value||jsonb_build_object(
            'apartments',v_apartments,
            'foremanReport',jsonb_build_object('submittedAt',v_now,'note',COALESCE(p_note,''),'openingsCount',v_eligible)
          ),
          true
        );
        v_found:=true;
      END LOOP;
    END LOOP;
  END LOOP;
  IF NOT v_found THEN RAISE EXCEPTION 'Этаж не найден среди назначенных' USING ERRCODE='42501'; END IF;

  UPDATE public.app_state SET state=v_state,revision=revision+1,updated_by=(SELECT auth.uid()),updated_at=now()
  WHERE id=1 AND revision=p_expected_revision RETURNING revision INTO v_new_revision;
  IF v_new_revision IS NULL THEN RAISE EXCEPTION 'WORKSPACE_CONFLICT' USING ERRCODE='40001'; END IF;
  RETURN v_new_revision;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_foreman_floor(bigint,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_foreman_floor(bigint,text,text,text,text) TO authenticated;
