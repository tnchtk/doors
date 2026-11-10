-- Destructive one-time cleanup. Run only after confirming the exact scope.
-- Removes every block, floor, apartment, opening, and door from all objects.
-- Keeps object names, brigade records, requests, inventory, and photos in private storage.
-- Stops if the live counts or financial history differ from the reviewed project state.

BEGIN;

DO $$
DECLARE
  v_state jsonb;
  v_objects jsonb;
  v_object_count integer;
  v_object_names text;
  v_block_count integer;
  v_apartment_count integer;
  v_door_count integer;
  v_request_count integer;
  v_finance_count integer;
  v_local_finance_count integer;
BEGIN
  SELECT state INTO v_state
  FROM public.app_state
  WHERE id=1
  FOR UPDATE;

  IF v_state IS NULL THEN
    RAISE EXCEPTION 'Очистка остановлена: общая база не найдена.';
  END IF;

  SELECT count(*) INTO v_object_count
  FROM jsonb_array_elements(COALESCE(v_state->'objects','[]'::jsonb));

  SELECT string_agg(o.value->>'name',', ' ORDER BY o.value->>'name') INTO v_object_names
  FROM jsonb_array_elements(COALESCE(v_state->'objects','[]'::jsonb)) AS o(value);

  SELECT count(*) INTO v_block_count
  FROM jsonb_array_elements(COALESCE(v_state->'objects','[]'::jsonb)) AS o(value)
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.value->'blocks','[]'::jsonb)) AS b(value);

  SELECT count(*) INTO v_apartment_count
  FROM jsonb_array_elements(COALESCE(v_state->'objects','[]'::jsonb)) AS o(value)
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.value->'blocks','[]'::jsonb)) AS b(value)
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(b.value->'floors','[]'::jsonb)) AS f(value)
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(f.value->'apartments','[]'::jsonb)) AS a(value);

  SELECT count(*) INTO v_door_count
  FROM jsonb_array_elements(COALESCE(v_state->'objects','[]'::jsonb)) AS o(value)
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.value->'blocks','[]'::jsonb)) AS b(value)
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(b.value->'floors','[]'::jsonb)) AS f(value)
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(f.value->'apartments','[]'::jsonb)) AS a(value)
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(a.value->'openings','[]'::jsonb)) AS p(value)
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.value->'doors','[]'::jsonb)) AS d(value);

  v_request_count:=CASE
    WHEN jsonb_typeof(v_state->'requests')='array' THEN jsonb_array_length(v_state->'requests')
    ELSE 0
  END;

  SELECT count(*) INTO v_finance_count
  FROM public.brigade_financial_entries;

  v_local_finance_count:=CASE
    WHEN jsonb_typeof(v_state->'financeEntries')='array' THEN jsonb_array_length(v_state->'financeEntries')
    ELSE 0
  END;

  IF v_object_count<>2 OR v_object_names<>'ГИК Маликова, Кочмондор'
    OR v_block_count<>4 OR v_apartment_count<>3 OR v_door_count<>45
    OR v_request_count<>0 OR v_finance_count<>0 OR v_local_finance_count<>0 THEN
    RAISE EXCEPTION 'Очистка остановлена: состояние базы изменилось. Сейчас объектов % (%), блоков %, квартир %, дверей %, заявок %, финансовых операций %/%.' ,
      v_object_count,v_object_names,v_block_count,v_apartment_count,v_door_count,v_request_count,v_finance_count,v_local_finance_count;
  END IF;

  SELECT jsonb_agg(o.value||jsonb_build_object('blocks','[]'::jsonb) ORDER BY o.ordinality)
  INTO v_objects
  FROM jsonb_array_elements(COALESCE(v_state->'objects','[]'::jsonb)) WITH ORDINALITY AS o(value,ordinality);

  UPDATE public.app_state
  SET state=jsonb_set(v_state,'{objects}',COALESCE(v_objects,'[]'::jsonb),true),
      revision=revision+1,
      updated_at=now()
  WHERE id=1;
END;
$$;

COMMIT;
