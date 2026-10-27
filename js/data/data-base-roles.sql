-- Incremental role and admin migration for the shared Doors CRM.
-- Run this after data-base.sql in the Supabase SQL Editor.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS brigade_id text;

UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.id AND (p.email IS DISTINCT FROM u.email);

-- Existing accounts: make the earliest account the initial administrator
-- when no administrator has been assigned yet. Other accounts start as foremen.
UPDATE public.profiles SET role = 'foreman' WHERE role IS NULL;
UPDATE public.profiles
SET role = 'admin'
WHERE id = (
  SELECT id FROM public.profiles WHERE is_active ORDER BY created_at, id LIMIT 1
) AND NOT EXISTS (
  SELECT 1 FROM public.profiles WHERE role = 'admin' AND is_active
);

ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'foreman';
ALTER TABLE public.profiles ALTER COLUMN role SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_role_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'manager', 'foreman'));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_profile_for_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile_name text;
BEGIN
  profile_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'Сотрудник'
  );
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (NEW.id, profile_name, NEW.email, 'foreman');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.is_active AND p.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.is_active
      AND p.role IN ('admin', 'manager')
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_manager_or_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager_or_admin() TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can read their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read team profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update team profiles" ON public.profiles;
CREATE POLICY "Members can read their own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) AND (SELECT public.is_active_member()));
CREATE POLICY "Admins can read team profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));
CREATE POLICY "Admins can update team profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name, email, role, is_active, brigade_id)
  ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_last_admin_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.role = 'admin' AND OLD.is_active
     AND (NEW.role <> 'admin' OR NOT NEW.is_active) THEN
    PERFORM pg_advisory_xact_lock(70620261014);
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id <> OLD.id AND p.role = 'admin' AND p.is_active
    ) THEN
      RAISE EXCEPTION 'Нельзя отключить последнего активного администратора';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_keep_admin ON public.profiles;
CREATE TRIGGER profiles_keep_admin
BEFORE UPDATE OF role, is_active ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_last_admin_removal();

ALTER TABLE public.app_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Active members can read shared state" ON public.app_state;
DROP POLICY IF EXISTS "Active members can update shared state" ON public.app_state;
DROP POLICY IF EXISTS "Managers and admins can read shared state" ON public.app_state;
DROP POLICY IF EXISTS "Managers and admins can update shared state" ON public.app_state;
CREATE POLICY "Managers and admins can read shared state"
  ON public.app_state FOR SELECT TO authenticated
  USING ((SELECT public.is_manager_or_admin()));
CREATE POLICY "Managers and admins can update shared state"
  ON public.app_state FOR UPDATE TO authenticated
  USING ((SELECT public.is_manager_or_admin()))
  WITH CHECK ((SELECT public.is_manager_or_admin()));
REVOKE INSERT, UPDATE, DELETE ON public.app_state FROM authenticated;
GRANT SELECT ON public.app_state TO authenticated;

CREATE OR REPLACE FUNCTION public.save_app_state(
  p_expected_revision bigint,
  p_state jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  saved_revision bigint;
BEGIN
  IF NOT public.is_manager_or_admin() THEN
    RAISE EXCEPTION 'Нет прав на изменение общих данных' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_state) <> 'object' THEN
    RAISE EXCEPTION 'Состояние должно быть JSON-объектом' USING ERRCODE = '22023';
  END IF;

  UPDATE public.app_state
  SET state = p_state,
      revision = revision + 1,
      updated_by = (SELECT auth.uid()),
      updated_at = now()
  WHERE id = 1 AND revision = p_expected_revision
  RETURNING revision INTO saved_revision;

  IF saved_revision IS NULL THEN
    RAISE EXCEPTION 'WORKSPACE_CONFLICT' USING ERRCODE = '40001';
  END IF;
  RETURN saved_revision;
END;
$$;
REVOKE ALL ON FUNCTION public.save_app_state(bigint, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_app_state(bigint, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_foreman_app_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile_role text;
  assigned_brigade text;
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
  SELECT p.role, p.brigade_id INTO profile_role, assigned_brigade
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

  IF assigned_brigade IS NOT NULL THEN
    FOR object_item IN SELECT value FROM jsonb_array_elements(COALESCE(source_state->'objects', '[]'::jsonb)) LOOP
      filtered_blocks := '[]'::jsonb;
      FOR block_item IN SELECT value FROM jsonb_array_elements(COALESCE(object_item->'blocks', '[]'::jsonb)) LOOP
        filtered_floors := '[]'::jsonb;
        FOR floor_item IN SELECT value FROM jsonb_array_elements(COALESCE(block_item->'floors', '[]'::jsonb)) LOOP
          IF floor_item->>'brigadeId' = assigned_brigade THEN
            filtered_floors := filtered_floors || jsonb_build_array(floor_item);
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

    SELECT COALESCE(jsonb_agg(value), '[]'::jsonb) INTO filtered_brigades
    FROM jsonb_array_elements(COALESCE(source_state->'brigades', '[]'::jsonb))
    WHERE value->>'id' = assigned_brigade;
    SELECT COALESCE(jsonb_agg(value), '[]'::jsonb) INTO filtered_requests
    FROM jsonb_array_elements(COALESCE(source_state->'requests', '[]'::jsonb))
    WHERE value->>'brigadeId' = assigned_brigade;
  END IF;

  filtered_state := source_state || jsonb_build_object(
    'objects', filtered_objects,
    'brigades', filtered_brigades,
    'requests', filtered_requests,
    'purchases', '[]'::jsonb,
    'movements', '[]'::jsonb,
    'problemsResolved', '{}'::jsonb,
    'activityLog', '[]'::jsonb
  );
  RETURN jsonb_build_object('state', filtered_state, 'revision', current_revision);
END;
$$;
REVOKE ALL ON FUNCTION public.get_foreman_app_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_foreman_app_state() TO authenticated;
