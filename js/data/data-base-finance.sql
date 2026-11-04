-- Brigade financial accounting.
-- Run this after data-base.sql, data-base-roles.sql and data-base-photos.sql.

CREATE TABLE IF NOT EXISTS public.brigade_financial_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brigade_id text NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('accrual', 'advance', 'payout')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  occurred_on date NOT NULL DEFAULT CURRENT_DATE,
  floor_id text,
  opening_id text,
  rate_per_opening numeric(12,2),
  door_count integer,
  note text NOT NULL DEFAULT '',
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brigade_financial_entries_accrual_fields CHECK (
    entry_type <> 'accrual' OR (
      floor_id IS NOT NULL AND opening_id IS NOT NULL
      AND rate_per_opening IS NOT NULL AND door_count IS NOT NULL AND door_count > 0
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS brigade_financial_entries_one_accrual_per_opening
  ON public.brigade_financial_entries (opening_id)
  WHERE entry_type = 'accrual';
CREATE INDEX IF NOT EXISTS brigade_financial_entries_brigade_date
  ON public.brigade_financial_entries (brigade_id, occurred_on DESC, created_at DESC);

ALTER TABLE public.brigade_financial_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Managers can view brigade financial entries" ON public.brigade_financial_entries;
DROP POLICY IF EXISTS "Admins can add actual brigade payments" ON public.brigade_financial_entries;
CREATE POLICY "Managers can view brigade financial entries"
  ON public.brigade_financial_entries FOR SELECT TO authenticated
  USING ((SELECT public.is_manager_or_admin()));
CREATE POLICY "Admins can add actual brigade payments"
  ON public.brigade_financial_entries FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_admin())
    AND entry_type IN ('advance', 'payout')
  );
REVOKE ALL ON public.brigade_financial_entries FROM PUBLIC;
GRANT SELECT ON public.brigade_financial_entries TO authenticated;
GRANT INSERT (brigade_id, entry_type, amount, occurred_on, note)
  ON public.brigade_financial_entries TO authenticated;

CREATE OR REPLACE FUNCTION public.finance_rate_config(p_state jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'brigades', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_array(brigade_item.value->>'id', brigade_item.value->'defaultRatePerOpening')
        ORDER BY brigade_item.value->>'id'
      )
      FROM jsonb_array_elements(COALESCE(p_state->'brigades', '[]'::jsonb)) AS brigade_item(value)
      WHERE brigade_item.value ? 'defaultRatePerOpening'
        AND brigade_item.value->'defaultRatePerOpening' <> 'null'::jsonb
    ), '[]'::jsonb),
    'floors', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_array(floor_item.value->>'id', floor_item.value->'ratePerOpening')
        ORDER BY floor_item.value->>'id'
      )
      FROM jsonb_array_elements(COALESCE(p_state->'objects', '[]'::jsonb)) AS object_item(value)
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(object_item.value->'blocks', '[]'::jsonb)) AS block_item(value)
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(block_item.value->'floors', '[]'::jsonb)) AS floor_item(value)
      WHERE floor_item.value ? 'ratePerOpening'
        AND floor_item.value->'ratePerOpening' <> 'null'::jsonb
    ), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.finance_rate_config(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.accepted_opening_finance_candidates(p_state jsonb)
RETURNS TABLE (
  brigade_id text,
  floor_id text,
  opening_id text,
  rate_per_opening numeric,
  door_count integer,
  accepted_on date,
  note text
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH modern_openings AS (
    SELECT
      floor_item.value->>'brigadeId' AS brigade_id,
      floor_item.value->>'id' AS floor_id,
      opening_item.value->>'id' AS opening_id,
      NULLIF(floor_item.value->>'ratePerOpening', '')::numeric AS rate_per_opening,
      jsonb_array_length(COALESCE(opening_item.value->'doors', '[]'::jsonb))::integer AS door_count,
      CASE
        WHEN length(COALESCE(opening_item.value->>'acceptedAt', '')) >= 10
          THEN substring(opening_item.value->>'acceptedAt' FROM 1 FOR 10)::date
        ELSE CURRENT_DATE
      END AS accepted_on,
      COALESCE(opening_item.value->>'title', 'Принятый проём') AS note
    FROM jsonb_array_elements(COALESCE(p_state->'objects', '[]'::jsonb)) AS object_item(value)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(object_item.value->'blocks', '[]'::jsonb)) AS block_item(value)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(block_item.value->'floors', '[]'::jsonb)) AS floor_item(value)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(floor_item.value->'apartments', '[]'::jsonb)) AS apartment_item(value)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(apartment_item.value->'openings', '[]'::jsonb)) AS opening_item(value)
    WHERE opening_item.value->>'reviewStatus' = 'accepted'
  ),
  legacy_openings AS (
    SELECT
      floor_item.value->>'brigadeId' AS brigade_id,
      floor_item.value->>'id' AS floor_id,
      'legacy-' || COALESCE(door_item.value->>'id', COALESCE(apartment_item.value->>'id', 'apt') || '-' || door_item.ordinality::text) AS opening_id,
      NULLIF(floor_item.value->>'ratePerOpening', '')::numeric AS rate_per_opening,
      1 AS door_count,
      CURRENT_DATE AS accepted_on,
      'Старая дверь №' || COALESCE(door_item.value->>'n', door_item.ordinality::text) AS note
    FROM jsonb_array_elements(COALESCE(p_state->'objects', '[]'::jsonb)) AS object_item(value)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(object_item.value->'blocks', '[]'::jsonb)) AS block_item(value)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(block_item.value->'floors', '[]'::jsonb)) AS floor_item(value)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(floor_item.value->'apartments', '[]'::jsonb)) AS apartment_item(value)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(apartment_item.value->'doors', '[]'::jsonb)) WITH ORDINALITY AS door_item(value, ordinality)
    WHERE door_item.value->>'status' = 'accepted'
      AND COALESCE(apartment_item.value->'openings', '[]'::jsonb) = '[]'::jsonb
  )
  SELECT * FROM modern_openings
  UNION ALL
  SELECT * FROM legacy_openings;
$$;
REVOKE ALL ON FUNCTION public.accepted_opening_finance_candidates(jsonb) FROM PUBLIC;

-- Managers can update operational data, but rates and acceptance accruals
-- can only be changed through the admin rate editor and the RPC below.
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
  current_revision bigint;
  current_state jsonb;
  actor_role text;
BEGIN
  SELECT p.role INTO actor_role
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid()) AND p.is_active;
  IF actor_role NOT IN ('admin', 'manager') OR actor_role IS NULL THEN
    RAISE EXCEPTION 'Нет прав на изменение общих данных' USING ERRCODE = '42501';
  END IF;
  IF p_state IS NULL OR jsonb_typeof(p_state) <> 'object' THEN
    RAISE EXCEPTION 'Состояние должно быть JSON-объектом' USING ERRCODE = '22023';
  END IF;

  SELECT a.state, a.revision INTO current_state, current_revision
  FROM public.app_state AS a
  WHERE a.id = 1
  FOR UPDATE;
  IF current_state IS NULL OR current_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'WORKSPACE_CONFLICT' USING ERRCODE = '40001';
  END IF;

  IF actor_role = 'manager'
     AND public.finance_rate_config(current_state) IS DISTINCT FROM public.finance_rate_config(p_state) THEN
    RAISE EXCEPTION 'FINANCIAL_RATES_ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  IF actor_role = 'manager' AND EXISTS (
    SELECT 1
    FROM public.accepted_opening_finance_candidates(current_state) AS existing
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.accepted_opening_finance_candidates(p_state) AS candidate
      WHERE candidate.opening_id = existing.opening_id
    )
  ) THEN
    RAISE EXCEPTION 'ACCEPTED_OPENINGS_LOCKED' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.accepted_opening_finance_candidates(p_state) AS candidate
    WHERE candidate.opening_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.accepted_opening_finance_candidates(current_state) AS existing
      WHERE existing.opening_id = candidate.opening_id
    )
  ) THEN
    RAISE EXCEPTION 'ACCEPTANCE_RPC_REQUIRED' USING ERRCODE = '42501';
  END IF;

  UPDATE public.app_state AS a
  SET state = p_state,
      revision = revision + 1,
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

CREATE OR REPLACE FUNCTION public.accept_opening_with_accrual(
  p_expected_revision bigint,
  p_object_id text,
  p_block_id text,
  p_floor_id text,
  p_apartment_id text,
  p_opening_id text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_role text;
  current_state jsonb;
  current_revision bigint;
  saved_revision bigint;
  object_index integer;
  block_index integer;
  floor_index integer;
  apartment_index integer;
  opening_index integer;
  target_floor jsonb;
  target_opening jsonb;
  updated_opening jsonb;
  updated_doors jsonb;
  opening_path text[];
  rate numeric;
  door_count integer;
  amount numeric;
  brigade_id text;
BEGIN
  SELECT p.role INTO actor_role
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid()) AND p.is_active;
  IF actor_role NOT IN ('admin', 'manager') OR actor_role IS NULL THEN
    RAISE EXCEPTION 'Нет прав принимать проёмы' USING ERRCODE = '42501';
  END IF;

  SELECT a.state, a.revision INTO current_state, current_revision
  FROM public.app_state AS a
  WHERE a.id = 1
  FOR UPDATE;
  IF current_state IS NULL OR current_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'WORKSPACE_CONFLICT' USING ERRCODE = '40001';
  END IF;

  SELECT
    object_item.ordinality::integer - 1,
    block_item.ordinality::integer - 1,
    floor_item.ordinality::integer - 1,
    apartment_item.ordinality::integer - 1,
    opening_item.ordinality::integer - 1,
    floor_item.value,
    opening_item.value
  INTO object_index, block_index, floor_index, apartment_index, opening_index, target_floor, target_opening
  FROM jsonb_array_elements(COALESCE(current_state->'objects', '[]'::jsonb)) WITH ORDINALITY AS object_item(value, ordinality)
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(object_item.value->'blocks', '[]'::jsonb)) WITH ORDINALITY AS block_item(value, ordinality)
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(block_item.value->'floors', '[]'::jsonb)) WITH ORDINALITY AS floor_item(value, ordinality)
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(floor_item.value->'apartments', '[]'::jsonb)) WITH ORDINALITY AS apartment_item(value, ordinality)
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(apartment_item.value->'openings', '[]'::jsonb)) WITH ORDINALITY AS opening_item(value, ordinality)
  WHERE object_item.value->>'id' = p_object_id
    AND block_item.value->>'id' = p_block_id
    AND floor_item.value->>'id' = p_floor_id
    AND apartment_item.value->>'id' = p_apartment_id
    AND opening_item.value->>'id' = p_opening_id
  LIMIT 1;

  IF target_opening IS NULL THEN
    RAISE EXCEPTION 'Проём не найден' USING ERRCODE = 'P0002';
  END IF;
  IF target_opening->>'reviewStatus' = 'accepted' THEN
    RETURN current_revision;
  END IF;
  IF target_opening->>'reviewStatus' <> 'pending' THEN
    RAISE EXCEPTION 'Проём должен быть отправлен на проверку';
  END IF;
  IF jsonb_array_length(COALESCE(target_opening->'doors', '[]'::jsonb)) = 0 OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(target_opening->'doors', '[]'::jsonb)) AS door_item(value)
    WHERE door_item.value->>'status' NOT IN ('installed', 'accepted')
       OR jsonb_array_length(COALESCE(door_item.value->'photos', '[]'::jsonb)) = 0
  ) THEN
    RAISE EXCEPTION 'OPENING_NOT_READY';
  END IF;

  brigade_id := NULLIF(target_floor->>'brigadeId', '');
  rate := NULLIF(target_floor->>'ratePerOpening', '')::numeric;
  IF brigade_id IS NULL OR rate IS NULL OR rate <= 0 THEN
    RAISE EXCEPTION 'TARIFF_REQUIRED';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_set(door_item.value, '{status}', '"accepted"'::jsonb, true)
    ORDER BY door_item.ordinality
  ), '[]'::jsonb)
  INTO updated_doors
  FROM jsonb_array_elements(COALESCE(target_opening->'doors', '[]'::jsonb)) WITH ORDINALITY AS door_item(value, ordinality);

  door_count := jsonb_array_length(updated_doors);
  amount := rate + CASE WHEN door_count = 2 THEN 500 ELSE 0 END;
  updated_opening := target_opening || jsonb_build_object(
    'reviewStatus', 'accepted',
    'acceptedAt', now(),
    'managerNote', '',
    'doors', updated_doors
  );
  opening_path := ARRAY[
    'objects', object_index::text, 'blocks', block_index::text,
    'floors', floor_index::text, 'apartments', apartment_index::text,
    'openings', opening_index::text
  ];

  INSERT INTO public.brigade_financial_entries (
    brigade_id, entry_type, amount, occurred_on, floor_id, opening_id,
    rate_per_opening, door_count, note, created_by
  ) VALUES (
    brigade_id, 'accrual', amount, CURRENT_DATE, p_floor_id, p_opening_id,
    rate, door_count, COALESCE(target_opening->>'title', 'Принятый проём'), (SELECT auth.uid())
  ) ON CONFLICT (opening_id) WHERE entry_type = 'accrual' DO NOTHING;

  UPDATE public.app_state AS a
  SET state = jsonb_set(current_state, opening_path, updated_opening, false),
      revision = revision + 1,
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
REVOKE ALL ON FUNCTION public.accept_opening_with_accrual(bigint, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_opening_with_accrual(bigint, text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_backfill_opening_accruals()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  source_state jsonb;
  inserted_count integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Только администратор может начислить принятую историю' USING ERRCODE = '42501';
  END IF;
  SELECT a.state INTO source_state
  FROM public.app_state AS a
  WHERE a.id = 1
  FOR UPDATE;
  IF source_state IS NULL THEN
    RAISE EXCEPTION 'Не найдены общие данные';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.accepted_opening_finance_candidates(source_state) AS candidate
    WHERE candidate.brigade_id IS NULL OR candidate.rate_per_opening IS NULL OR candidate.rate_per_opening <= 0
  ) THEN
    RAISE EXCEPTION 'TARIFF_REQUIRED';
  END IF;

  INSERT INTO public.brigade_financial_entries (
    brigade_id, entry_type, amount, occurred_on, floor_id, opening_id,
    rate_per_opening, door_count, note, created_by
  )
  SELECT
    candidate.brigade_id,
    'accrual',
    candidate.rate_per_opening + CASE WHEN candidate.door_count = 2 THEN 500 ELSE 0 END,
    candidate.accepted_on,
    candidate.floor_id,
    candidate.opening_id,
    candidate.rate_per_opening,
    candidate.door_count,
    candidate.note || ' · Историческое начисление',
    (SELECT auth.uid())
  FROM public.accepted_opening_finance_candidates(source_state) AS candidate
  ON CONFLICT (opening_id) WHERE entry_type = 'accrual' DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_backfill_opening_accruals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_backfill_opening_accruals() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_foreman_finance_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile_role text;
  assigned_brigade text;
  accrued numeric := 0;
  advances numeric := 0;
  payouts numeric := 0;
  paid numeric := 0;
  balance numeric := 0;
BEGIN
  SELECT p.role, p.brigade_id INTO profile_role, assigned_brigade
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid()) AND p.is_active;
  IF profile_role IS DISTINCT FROM 'foreman' THEN
    RAISE EXCEPTION 'Эта функция доступна только бригадиру' USING ERRCODE = '42501';
  END IF;
  IF assigned_brigade IS NOT NULL THEN
    SELECT
      COALESCE(sum(e.amount) FILTER (WHERE e.entry_type = 'accrual'), 0),
      COALESCE(sum(e.amount) FILTER (WHERE e.entry_type = 'advance'), 0),
      COALESCE(sum(e.amount) FILTER (WHERE e.entry_type = 'payout'), 0)
    INTO accrued, advances, payouts
    FROM public.brigade_financial_entries AS e
    WHERE e.brigade_id = assigned_brigade;
  END IF;
  paid := advances + payouts;
  balance := accrued - paid;
  RETURN jsonb_build_object(
    'brigadeId', assigned_brigade,
    'accrued', accrued,
    'advances', advances,
    'payouts', payouts,
    'paid', paid,
    'balance', balance,
    'owed', GREATEST(GREATEST(accrued - advances, 0) - payouts, 0),
    'advanceToWorkOff', GREATEST(advances - accrued, 0),
    'overpaid', GREATEST(payouts - GREATEST(accrued - advances, 0), 0)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_foreman_finance_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_foreman_finance_summary() TO authenticated;

-- A foreman receives a balance for their assigned brigade, never the ledger or tariffs.
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
    'activityLog', '[]'::jsonb,
    'financeEntries', '[]'::jsonb
  );
  RETURN jsonb_build_object('state', filtered_state, 'revision', current_revision);
END;
$$;
REVOKE ALL ON FUNCTION public.get_foreman_app_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_foreman_app_state() TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'brigade_financial_entries'
  ) THEN
    RETURN;
  END IF;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.brigade_financial_entries;
EXCEPTION WHEN undefined_object THEN
  NULL;
END;
$$;
