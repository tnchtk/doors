-- Enforce that only administrators can permanently remove objects or blocks.
-- Run in Supabase SQL Editor after data-base-roles.sql.

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
  current_state jsonb;
  existing_object jsonb;
  existing_block jsonb;
  submitted_object jsonb;
  object_id text;
  block_id text;
BEGIN
  IF NOT public.is_manager_or_admin() THEN
    RAISE EXCEPTION 'Нет прав на изменение общих данных' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_state) <> 'object' THEN
    RAISE EXCEPTION 'Состояние должно быть JSON-объектом' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_state->'objects') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Список объектов должен быть массивом' USING ERRCODE = '22023';
  END IF;

  SELECT a.state, a.revision
    INTO current_state, saved_revision
    FROM public.app_state AS a
    WHERE a.id = 1 AND a.revision = p_expected_revision
    FOR UPDATE;
  IF saved_revision IS NULL THEN
    RAISE EXCEPTION 'WORKSPACE_CONFLICT' USING ERRCODE = '40001';
  END IF;

  IF NOT public.is_admin() THEN
    FOR existing_object IN
      SELECT entry.value FROM jsonb_array_elements(COALESCE(current_state->'objects', '[]'::jsonb)) AS entry(value)
    LOOP
      object_id := existing_object->>'id';
      SELECT entry.value INTO submitted_object
        FROM jsonb_array_elements(p_state->'objects') AS entry(value)
        WHERE entry.value->>'id' = object_id
        LIMIT 1;
      IF submitted_object IS NULL THEN
        RAISE EXCEPTION 'Менеджер не может окончательно удалять объекты' USING ERRCODE = '42501';
      END IF;
      IF jsonb_typeof(COALESCE(submitted_object->'blocks', '[]'::jsonb)) <> 'array' THEN
        RAISE EXCEPTION 'Список блоков должен быть массивом' USING ERRCODE = '22023';
      END IF;

      FOR existing_block IN
        SELECT entry.value FROM jsonb_array_elements(COALESCE(existing_object->'blocks', '[]'::jsonb)) AS entry(value)
      LOOP
        block_id := existing_block->>'id';
        IF NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(submitted_object->'blocks', '[]'::jsonb)) AS entry(value)
          WHERE entry.value->>'id' = block_id
        ) THEN
          RAISE EXCEPTION 'Менеджер не может окончательно удалять блоки' USING ERRCODE = '42501';
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  UPDATE public.app_state AS a
    SET state = p_state,
        revision = a.revision + 1,
        updated_by = (SELECT auth.uid()),
        updated_at = now()
    WHERE a.id = 1 AND a.revision = p_expected_revision
    RETURNING a.revision INTO saved_revision;

  IF saved_revision IS NULL THEN
    RAISE EXCEPTION 'WORKSPACE_CONFLICT' USING ERRCODE = '40001';
  END IF;
  RETURN saved_revision;
END;
$$;

REVOKE ALL ON FUNCTION public.save_app_state(bigint, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_app_state(bigint, jsonb) TO authenticated;
