-- Supabase/PostgreSQL schema for the shared Doors CRM.
-- Run once in Supabase SQL Editor. The browser uses only the publishable key;
-- never put a secret/service-role key in the website.

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT 'Сотрудник',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.enforce_max_active_users()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(70620261013);
  IF NEW.is_active AND (
    SELECT count(*) FROM public.profiles
    WHERE is_active AND id IS DISTINCT FROM NEW.id
  ) >= 10 THEN
    RAISE EXCEPTION 'В базе может быть не более 10 активных пользователей';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_max_active_users
BEFORE INSERT OR UPDATE OF is_active ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_max_active_users();

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
  INSERT INTO public.profiles (id, full_name) VALUES (NEW.id, profile_name);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_profile
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_profile_for_auth_user();

-- Existing UI state is stored as one JSON document so all current screens
-- keep working while sharing one authoritative revision across employees.
CREATE TABLE public.app_state (
  id integer PRIMARY KEY CHECK (id = 1),
  state jsonb NOT NULL DEFAULT '{"objects":[],"brigades":[],"requests":[],"purchases":[],"movements":[],"problemsResolved":{},"activityLog":[]}'::jsonb
    CHECK (jsonb_typeof(state) = 'object'),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_state (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_active_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.is_active
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_member() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_member() TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can read their own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) AND (SELECT public.is_active_member()));

ALTER TABLE public.app_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active members can read shared state"
  ON public.app_state FOR SELECT TO authenticated
  USING ((SELECT public.is_active_member()));
CREATE POLICY "Active members can update shared state"
  ON public.app_state FOR UPDATE TO authenticated
  USING ((SELECT public.is_active_member()))
  WITH CHECK ((SELECT public.is_active_member()));

GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT, UPDATE ON public.app_state TO authenticated;

-- Compare-and-save prevents one employee from silently overwriting another
-- employee's newer changes. A conflict is returned as SQLSTATE 40001.
CREATE OR REPLACE FUNCTION public.save_app_state(
  p_expected_revision bigint,
  p_state jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  saved_revision bigint;
BEGIN
  IF NOT public.is_active_member() THEN
    RAISE EXCEPTION 'Нет доступа к общей базе' USING ERRCODE = '42501';
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

-- Enable live refresh in Supabase Realtime when the standard publication exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'app_state'
     ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.app_state';
  END IF;
END;
$$;
