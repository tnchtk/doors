-- Run after data-base.sql and data-base-roles.sql.
-- Adds private photo storage and a narrowly scoped foreman work-update RPC.

INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('door-photos','door-photos',false,10485760,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public=false,
  file_size_limit=EXCLUDED.file_size_limit,
  allowed_mime_types=EXCLUDED.allowed_mime_types;

-- Safely wrap old flat apartment.doors arrays as one-door legacy openings.
-- Existing door status and problem text are retained; no existing image files
-- were stored by the previous photo flag, so the migration records that flag.
DO $$
DECLARE
  v_state jsonb;
  v_objects jsonb;
  v_blocks jsonb;
  v_floors jsonb;
  v_apartments jsonb;
  v_openings jsonb;
  v_apartment jsonb;
  v_door jsonb;
  v_object_row record;
  v_block_row record;
  v_floor_row record;
  v_apartment_row record;
  v_door_row record;
BEGIN
  SELECT state INTO v_state FROM public.app_state WHERE id=1 FOR UPDATE;
  IF v_state IS NULL THEN RETURN; END IF;
  v_objects:=COALESCE(v_state->'objects','[]'::jsonb);
  FOR v_object_row IN SELECT value,ordinality FROM jsonb_array_elements(v_objects) WITH ORDINALITY LOOP
    v_blocks:=COALESCE(v_object_row.value->'blocks','[]'::jsonb);
    FOR v_block_row IN SELECT value,ordinality FROM jsonb_array_elements(v_blocks) WITH ORDINALITY LOOP
      v_floors:=COALESCE(v_block_row.value->'floors','[]'::jsonb);
      FOR v_floor_row IN SELECT value,ordinality FROM jsonb_array_elements(v_floors) WITH ORDINALITY LOOP
        v_apartments:=COALESCE(v_floor_row.value->'apartments','[]'::jsonb);
        FOR v_apartment_row IN SELECT value,ordinality FROM jsonb_array_elements(v_apartments) WITH ORDINALITY LOOP
          v_apartment:=v_apartment_row.value;
          IF jsonb_typeof(v_apartment->'openings') IS DISTINCT FROM 'array'
             AND jsonb_typeof(v_apartment->'doors')='array' THEN
            v_openings:='[]'::jsonb;
            FOR v_door_row IN SELECT value,ordinality FROM jsonb_array_elements(COALESCE(v_apartment->'doors','[]'::jsonb)) WITH ORDINALITY LOOP
              v_door:=(v_door_row.value-'photo')||jsonb_build_object(
                'photos','[]'::jsonb,
                'legacyPhotoFlag',COALESCE(v_door_row.value->'photo','false'::jsonb)
              );
              v_openings:=v_openings||jsonb_build_array(jsonb_build_object(
                'id','legacy-'||COALESCE(v_door_row.value->>'id',v_apartment_row.ordinality::text||'-'||v_door_row.ordinality::text),
                'type','legacy',
                'n',v_door_row.ordinality,
                'title','Старая дверь №'||COALESCE(v_door_row.value->>'n',v_door_row.ordinality::text),
                'doors',jsonb_build_array(v_door),
                'reviewStatus',CASE WHEN v_door_row.value->>'status'='accepted' THEN 'accepted' ELSE 'not_submitted' END,
                'foremanNote','',
                'managerNote','',
                'submittedAt',NULL,
                'acceptedAt',NULL
              ));
            END LOOP;
            v_apartment:=(v_apartment-'doors')||jsonb_build_object('openings',v_openings);
          END IF;
          v_apartments:=jsonb_set(v_apartments,ARRAY[(v_apartment_row.ordinality-1)::text],v_apartment,true);
        END LOOP;
        v_floors:=jsonb_set(v_floors,ARRAY[(v_floor_row.ordinality-1)::text],jsonb_set(v_floor_row.value,'{apartments}',v_apartments,true),true);
      END LOOP;
      v_blocks:=jsonb_set(v_blocks,ARRAY[(v_block_row.ordinality-1)::text],jsonb_set(v_block_row.value,'{floors}',v_floors,true),true);
    END LOOP;
    v_objects:=jsonb_set(v_objects,ARRAY[(v_object_row.ordinality-1)::text],jsonb_set(v_object_row.value,'{blocks}',v_blocks,true),true);
  END LOOP;
  UPDATE public.app_state SET state=jsonb_set(v_state,'{objects}',v_objects,true),revision=revision+1,updated_at=now() WHERE id=1;
END;
$$;

DROP FUNCTION IF EXISTS public.save_foreman_opening_work(bigint,text,text,text,text,text,jsonb,text,boolean);
DROP FUNCTION IF EXISTS public.save_foreman_opening_work(bigint,text,text,text,text,text,jsonb,text,boolean,boolean);
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
              v_doors:=v_doors||jsonb_build_array(v_door_row.value||jsonb_build_object('status',v_status,'photos',v_update->'photos'));
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
  v_brigade_id text;
BEGIN
  SELECT role,brigade_id INTO v_role,v_brigade_id FROM public.profiles
  WHERE id=(SELECT auth.uid()) AND is_active;
  IF v_role IN ('admin','manager') THEN RETURN true; END IF;
  IF v_role IS DISTINCT FROM 'foreman' OR v_brigade_id IS NULL THEN RETURN false; END IF;
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
      AND f.value->>'id'=p_floor_id AND f.value->>'brigadeId'=v_brigade_id
      AND ap.value->>'id'=p_apartment_id AND op.value->>'id'=p_opening_id
      AND d.value->>'id'=p_door_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.can_access_door_photo(text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_door_photo(text,text,text,text,text,text) TO authenticated;

DROP POLICY IF EXISTS "Assigned staff can view door photos" ON storage.objects;
DROP POLICY IF EXISTS "Assigned staff can upload door photos" ON storage.objects;
CREATE POLICY "Assigned staff can view door photos" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id='door-photos' AND array_length(string_to_array(name,'/'),1)>=7
  AND public.can_access_door_photo(split_part(name,'/',1),split_part(name,'/',2),split_part(name,'/',3),split_part(name,'/',4),split_part(name,'/',5),split_part(name,'/',6))
);
CREATE POLICY "Assigned staff can upload door photos" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id='door-photos' AND array_length(string_to_array(name,'/'),1)>=7
  AND public.can_access_door_photo(split_part(name,'/',1),split_part(name,'/',2),split_part(name,'/',3),split_part(name,'/',4),split_part(name,'/',5),split_part(name,'/',6))
);
