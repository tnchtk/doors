-- Бригадир может вести несколько бригад, а у каждой бригады только один бригадир.
-- Запускать в Supabase SQL Editor один раз, после data-base-finance.sql, data-base-photos.sql
-- и data-base-installation-history.sql, и ДО data-base-floor-report.sql.
-- Что делает:
--   1) добавляет profiles.brigade_ids (список бригад) и переносит в него прежнюю brigade_id;
--   2) убирает ограничение «одна бригада на бригадира», вместо него следит, чтобы одна бригада
--      не оказалась у двух активных бригадиров;
--   3) переписывает серверные функции бригадира так, чтобы они работали со списком бригад.

DROP INDEX IF EXISTS public.profiles_one_active_foreman_per_brigade;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS brigade_ids text[] NOT NULL DEFAULT '{}';
UPDATE public.profiles SET brigade_ids = ARRAY[brigade_id]
WHERE brigade_id IS NOT NULL AND brigade_ids = '{}';

GRANT UPDATE (brigade_ids) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_unique_foreman_brigades()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.role = 'foreman' AND NEW.is_active AND cardinality(NEW.brigade_ids) > 0 THEN
    PERFORM pg_advisory_xact_lock(70620261015);
    IF EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id <> NEW.id AND p.role = 'foreman' AND p.is_active AND p.brigade_ids && NEW.brigade_ids
    ) THEN
      RAISE EXCEPTION 'Эта бригада уже закреплена за другим бригадиром' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_unique_foreman_brigades ON public.profiles;
CREATE TRIGGER enforce_unique_foreman_brigades
  BEFORE INSERT OR UPDATE OF role, is_active, brigade_ids ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_unique_foreman_brigades();

CREATE OR REPLACE FUNCTION public.save_foreman_opening_work(
  p_expected_revision bigint,
  p_object_id text,
  p_block_id text,
  p_floor_id text,
  p_apartment_id text,
  p_opening_id text,
  p_door_updates jsonb,
  p_foreman_note text,
  p_submit boolean,
  p_report_issue boolean
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
  v_opening jsonb;
  v_updated_opening jsonb;
  v_doors jsonb;
  v_door_updates jsonb;
  v_update jsonb;
  v_photo jsonb;
  v_door_row record;
  v_photo_row record;
  v_object_row record;
  v_block_row record;
  v_floor_row record;
  v_apartment_row record;
  v_opening_row record;
  v_door_id text;
  v_status text;
  v_path_prefix text;
BEGIN
  SELECT role,brigade_ids INTO v_profile_role,v_brigade_ids
  FROM public.profiles WHERE id=(SELECT auth.uid()) AND is_active;
  IF v_profile_role IS DISTINCT FROM 'foreman' OR COALESCE(cardinality(v_brigade_ids),0)=0 THEN
    RAISE EXCEPTION 'Обновлять проёмы может только назначенный бригадир' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_door_updates) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Некорректный список дверей' USING ERRCODE='22023';
  END IF;
  IF length(COALESCE(p_foreman_note,''))>2000 THEN
    RAISE EXCEPTION 'Комментарий слишком длинный' USING ERRCODE='22023';
  END IF;
  IF COALESCE(p_submit,false) AND COALESCE(p_report_issue,false) THEN
    RAISE EXCEPTION 'Выберите отправку на проверку или сообщение о замечании' USING ERRCODE='22023';
  END IF;
  IF COALESCE(p_report_issue,false) AND NULLIF(trim(COALESCE(p_foreman_note,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Опишите замечание по проёму' USING ERRCODE='22023';
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
        FOR v_apartment_row IN SELECT value,ordinality FROM jsonb_array_elements(COALESCE(v_floor_row.value->'apartments','[]'::jsonb)) WITH ORDINALITY LOOP
          IF v_apartment_row.value->>'id'<>p_apartment_id THEN CONTINUE; END IF;
          FOR v_opening_row IN SELECT value,ordinality FROM jsonb_array_elements(COALESCE(v_apartment_row.value->'openings','[]'::jsonb)) WITH ORDINALITY LOOP
            IF v_opening_row.value->>'id'<>p_opening_id THEN CONTINUE; END IF;
            v_opening:=v_opening_row.value;
            IF v_opening->>'reviewStatus' IN ('pending','accepted') THEN
              RAISE EXCEPTION 'Проём уже отправлен менеджеру или принят' USING ERRCODE='42501';
            END IF;
            IF jsonb_array_length(p_door_updates)<>jsonb_array_length(COALESCE(v_opening->'doors','[]'::jsonb)) THEN
              RAISE EXCEPTION 'Нельзя менять состав дверей в проёме' USING ERRCODE='42501';
            END IF;
            v_doors:='[]'::jsonb;
            FOR v_door_row IN SELECT value FROM jsonb_array_elements(COALESCE(v_opening->'doors','[]'::jsonb)) LOOP
              v_door_id:=v_door_row.value->>'id';
              SELECT value INTO v_update FROM jsonb_array_elements(p_door_updates) WHERE value->>'id'=v_door_id LIMIT 1;
              IF v_update IS NULL THEN RAISE EXCEPTION 'Дверь не найдена' USING ERRCODE='42501'; END IF;
              v_status:=v_update->>'status';
              IF v_status NOT IN ('not_started','materials_ready','in_progress','installed') THEN
                RAISE EXCEPTION 'Недопустимый статус двери' USING ERRCODE='42501';
              END IF;
              IF jsonb_typeof(v_update->'photos') IS DISTINCT FROM 'array' THEN
                RAISE EXCEPTION 'Некорректный список фотографий' USING ERRCODE='22023';
              END IF;
              v_path_prefix:=p_object_id||'/'||p_block_id||'/'||p_floor_id||'/'||p_apartment_id||'/'||p_opening_id||'/'||v_door_id||'/%';
              FOR v_photo_row IN SELECT value FROM jsonb_array_elements(v_update->'photos') LOOP
                v_photo:=v_photo_row.value;
                IF COALESCE(v_photo->>'path','') NOT LIKE v_path_prefix THEN
                  RAISE EXCEPTION 'Фотография не относится к этой двери' USING ERRCODE='42501';
                END IF;
              END LOOP;
              IF COALESCE(p_submit,false) AND (v_status<>'installed' OR jsonb_array_length(v_update->'photos')=0) THEN
                RAISE EXCEPTION 'Перед отправкой установите дверь и добавьте фото' USING ERRCODE='22023';
              END IF;
              v_doors:=v_doors||jsonb_build_array(
                v_door_row.value||jsonb_build_object(
                  'status',v_status,
                  'photos',v_update->'photos',
                  'installedAt',CASE
                    WHEN v_status='installed' THEN CASE
                      WHEN v_door_row.value->>'status'='installed' THEN COALESCE(v_door_row.value->'installedAt','null'::jsonb)
                      ELSE to_jsonb(now()::text)
                    END
                    ELSE 'null'::jsonb
                  END
                )
              );
              v_update:=NULL;
            END LOOP;
            v_updated_opening:=v_opening||jsonb_build_object(
              'doors',v_doors,
              'foremanNote',COALESCE(p_foreman_note,''),
              'reviewStatus',CASE WHEN COALESCE(p_submit,false) THEN 'pending' WHEN COALESCE(p_report_issue,false) THEN 'issue_reported' ELSE COALESCE(v_opening->>'reviewStatus','not_submitted') END,
              'submittedAt',CASE WHEN COALESCE(p_submit,false) THEN to_jsonb(now()::text) ELSE COALESCE(v_opening->'submittedAt','null'::jsonb) END,
              'issueReportedAt',CASE WHEN COALESCE(p_report_issue,false) THEN to_jsonb(now()::text) ELSE COALESCE(v_opening->'issueReportedAt','null'::jsonb) END,
              'updatedAt',now()::text
            );
            v_state:=jsonb_set(v_state,ARRAY['objects',(v_object_row.ordinality-1)::text,'blocks',(v_block_row.ordinality-1)::text,'floors',(v_floor_row.ordinality-1)::text,'apartments',(v_apartment_row.ordinality-1)::text,'openings',(v_opening_row.ordinality-1)::text],v_updated_opening,true);
            v_found:=true;
          END LOOP;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;
  IF NOT v_found THEN RAISE EXCEPTION 'Проём не найден среди назначенных этажей' USING ERRCODE='42501'; END IF;

  UPDATE public.app_state SET state=v_state,revision=revision+1,updated_by=(SELECT auth.uid()),updated_at=now()
  WHERE id=1 AND revision=p_expected_revision RETURNING revision INTO v_new_revision;
  IF v_new_revision IS NULL THEN RAISE EXCEPTION 'WORKSPACE_CONFLICT' USING ERRCODE='40001'; END IF;
  RETURN v_new_revision;
END;
$$;
REVOKE ALL ON FUNCTION public.save_foreman_opening_work(bigint,text,text,text,text,text,jsonb,text,boolean,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_foreman_opening_work(bigint,text,text,text,text,text,jsonb,text,boolean,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_access_door_photo(
  p_object_id text,p_block_id text,p_floor_id text,p_apartment_id text,p_opening_id text,p_door_id text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v_role text;
  v_brigade_ids text[];
BEGIN
  SELECT role,brigade_ids INTO v_role,v_brigade_ids FROM public.profiles
  WHERE id=(SELECT auth.uid()) AND is_active;
  IF v_role IN ('admin','manager') THEN RETURN true; END IF;
  IF v_role IS DISTINCT FROM 'foreman' OR COALESCE(cardinality(v_brigade_ids),0)=0 THEN RETURN false; END IF;
  RETURN EXISTS(
    SELECT 1
    FROM public.app_state a,
      jsonb_array_elements(COALESCE(a.state->'objects','[]'::jsonb)) o,
      jsonb_array_elements(COALESCE(o.value->'blocks','[]'::jsonb)) b,
      jsonb_array_elements(COALESCE(b.value->'floors','[]'::jsonb)) f,
      jsonb_array_elements(COALESCE(f.value->'apartments','[]'::jsonb)) ap,
      jsonb_array_elements(COALESCE(ap.value->'openings','[]'::jsonb)) op,
      jsonb_array_elements(COALESCE(op.value->'doors','[]'::jsonb)) d
    WHERE a.id=1 AND o.value->>'id'=p_object_id AND b.value->>'id'=p_block_id
      AND f.value->>'id'=p_floor_id AND f.value->>'brigadeId'=ANY(v_brigade_ids)
      AND ap.value->>'id'=p_apartment_id AND op.value->>'id'=p_opening_id
      AND d.value->>'id'=p_door_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.can_access_door_photo(text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_door_photo(text,text,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_foreman_app_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile_role text;
  assigned_brigades text[];
  source_state jsonb;
  current_revision bigint;
  object_item jsonb;
  block_item jsonb;
  floor_item jsonb;
  filtered_objects jsonb := '[]'::jsonb;
  filtered_blocks jsonb;
  filtered_floors jsonb;
  filtered_brigades jsonb := '[]'::jsonb;
  filtered_requests jsonb := '[]'::jsonb;
  filtered_state jsonb;
BEGIN
  SELECT p.role, p.brigade_ids INTO profile_role, assigned_brigades
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid()) AND p.is_active;
  IF profile_role IS DISTINCT FROM 'foreman' THEN
    RAISE EXCEPTION 'Эта функция доступна только бригадиру' USING ERRCODE = '42501';
  END IF;
  SELECT a.state, a.revision INTO source_state, current_revision
  FROM public.app_state a WHERE a.id = 1;
  IF source_state IS NULL THEN
    RAISE EXCEPTION 'Не найдены общие данные';
  END IF;

  IF COALESCE(cardinality(assigned_brigades), 0) > 0 THEN
    FOR object_item IN SELECT value FROM jsonb_array_elements(COALESCE(source_state->'objects', '[]'::jsonb)) LOOP
      filtered_blocks := '[]'::jsonb;
      FOR block_item IN SELECT value FROM jsonb_array_elements(COALESCE(object_item->'blocks', '[]'::jsonb)) LOOP
        filtered_floors := '[]'::jsonb;
        FOR floor_item IN SELECT value FROM jsonb_array_elements(COALESCE(block_item->'floors', '[]'::jsonb)) LOOP
          IF floor_item->>'brigadeId' = ANY(assigned_brigades) THEN
            filtered_floors := filtered_floors || jsonb_build_array(floor_item - 'ratePerOpening');
          END IF;
        END LOOP;
        IF jsonb_array_length(filtered_floors) > 0 THEN
          filtered_blocks := filtered_blocks || jsonb_build_array(jsonb_set(block_item, '{floors}', filtered_floors, true));
        END IF;
      END LOOP;
      IF jsonb_array_length(filtered_blocks) > 0 THEN
        filtered_objects := filtered_objects || jsonb_build_array(jsonb_set(object_item, '{blocks}', filtered_blocks, true));
      END IF;
    END LOOP;

    SELECT COALESCE(jsonb_agg(value - 'pricePerDoor' - 'advance' - 'paid' - 'defaultRatePerOpening'), '[]'::jsonb)
    INTO filtered_brigades
    FROM jsonb_array_elements(COALESCE(source_state->'brigades', '[]'::jsonb))
    WHERE value->>'id' = ANY(assigned_brigades);
    SELECT COALESCE(jsonb_agg(value), '[]'::jsonb) INTO filtered_requests
    FROM jsonb_array_elements(COALESCE(source_state->'requests', '[]'::jsonb))
    WHERE value->>'brigadeId' = ANY(assigned_brigades);
  END IF;

  filtered_state := source_state || jsonb_build_object(
    'objects', filtered_objects,
    'brigades', filtered_brigades,
    'requests', filtered_requests,
    'purchases', '[]'::jsonb,
    'movements', '[]'::jsonb,
    'problemsResolved', '{}'::jsonb,
    'activityLog', '[]'::jsonb,
    'financeEntries', '[]'::jsonb
  );
  RETURN jsonb_build_object('state', filtered_state, 'revision', current_revision);
END;
$$;
REVOKE ALL ON FUNCTION public.get_foreman_app_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_foreman_app_state() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_foreman_finance_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile_role text;
  assigned_brigades text[];
  one_id text;
  accrued numeric;
  advances numeric;
  payouts numeric;
  total_accrued numeric := 0;
  total_advances numeric := 0;
  total_payouts numeric := 0;
  per_brigade jsonb := '[]'::jsonb;
BEGIN
  SELECT p.role, p.brigade_ids INTO profile_role, assigned_brigades
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid()) AND p.is_active;
  IF profile_role IS DISTINCT FROM 'foreman' THEN
    RAISE EXCEPTION 'Эта функция доступна только бригадиру' USING ERRCODE = '42501';
  END IF;
  FOREACH one_id IN ARRAY COALESCE(assigned_brigades, '{}'::text[]) LOOP
    SELECT
      COALESCE(sum(e.amount) FILTER (WHERE e.entry_type = 'accrual'), 0),
      COALESCE(sum(e.amount) FILTER (WHERE e.entry_type = 'advance'), 0),
      COALESCE(sum(e.amount) FILTER (WHERE e.entry_type = 'payout'), 0)
    INTO accrued, advances, payouts
    FROM public.brigade_financial_entries AS e
    WHERE e.brigade_id = one_id;
    total_accrued := total_accrued + accrued;
    total_advances := total_advances + advances;
    total_payouts := total_payouts + payouts;
    per_brigade := per_brigade || jsonb_build_array(jsonb_build_object(
      'brigadeId', one_id,
      'accrued', accrued,
      'advances', advances,
      'payouts', payouts,
      'paid', advances + payouts,
      'balance', accrued - advances - payouts,
      'owed', GREATEST(GREATEST(accrued - advances, 0) - payouts, 0),
      'advanceToWorkOff', GREATEST(advances - accrued, 0),
      'overpaid', GREATEST(payouts - GREATEST(accrued - advances, 0), 0)
    ));
  END LOOP;
  RETURN jsonb_build_object(
    'brigadeId', assigned_brigades[1],
    'brigades', per_brigade,
    'accrued', total_accrued,
    'advances', total_advances,
    'payouts', total_payouts,
    'paid', total_advances + total_payouts,
    'balance', total_accrued - total_advances - total_payouts,
    'owed', GREATEST(GREATEST(total_accrued - total_advances, 0) - total_payouts, 0),
    'advanceToWorkOff', GREATEST(total_advances - total_accrued, 0),
    'overpaid', GREATEST(total_payouts - GREATEST(total_accrued - total_advances, 0), 0)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_foreman_finance_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_foreman_finance_summary() TO authenticated;

