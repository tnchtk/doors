-- Run once after data-base-photos.sql.
-- Records the server timestamp when an assigned foreman changes a door to installed.
-- Existing doors are not backfilled because their installation dates are unknown.

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
  v_brigade_id text;
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
  SELECT role,brigade_id INTO v_profile_role,v_brigade_id
  FROM public.profiles WHERE id=(SELECT auth.uid()) AND is_active;
  IF v_profile_role IS DISTINCT FROM 'foreman' OR v_brigade_id IS NULL THEN
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
        IF v_floor_row.value->>'id'<>p_floor_id OR v_floor_row.value->>'brigadeId'<>v_brigade_id THEN CONTINUE; END IF;
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
