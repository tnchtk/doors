-- Заявки бригадира на материалы с телефона.
-- Запускать в Supabase SQL Editor один раз, после data-base-foreman-brigades.sql.
-- Бригадир создаёт заявку по назначенному этажу. Заявка привязывается к объекту, блоку и этажу
-- автоматически, попадает во вкладку «Снабжение» к менеджерам и видна самому бригадиру со статусом.
-- Менеджеры меняют статус заявок обычным сохранением данных, отдельной функции для них не нужно.

CREATE OR REPLACE FUNCTION public.create_foreman_material_request(
  p_expected_revision bigint,
  p_object_id text,
  p_block_id text,
  p_floor_id text,
  p_items jsonb,
  p_comment text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v_role text;
  v_brigade_ids text[];
  v_name text;
  v_state jsonb;
  v_revision bigint;
  v_new_revision bigint;
  v_block_name text;
  v_floor jsonb;
  v_items jsonb:='[]'::jsonb;
  v_item jsonb;
  v_mat text;
  v_qty numeric;
  v_count integer:=0;
  v_number bigint;
  v_request jsonb;
  v_today text:=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD');
BEGIN
  SELECT role,brigade_ids,full_name INTO v_role,v_brigade_ids,v_name
  FROM public.profiles WHERE id=(SELECT auth.uid()) AND is_active;
  IF v_role IS DISTINCT FROM 'foreman' OR COALESCE(cardinality(v_brigade_ids),0)=0 THEN
    RAISE EXCEPTION 'Создавать заявки может только назначенный бригадир' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Некорректный список материалов' USING ERRCODE='22023';
  END IF;
  IF length(COALESCE(p_comment,''))>1000 THEN
    RAISE EXCEPTION 'Комментарий слишком длинный' USING ERRCODE='22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_mat:=v_item->>'matId';
    IF v_mat IS NULL OR v_mat NOT IN ('polotno','korob','dobor','nalich','petli','zamok','ruchka','planka','porog','krepezh','pena','shpingalet') THEN
      RAISE EXCEPTION 'Неизвестный материал' USING ERRCODE='22023';
    END IF;
    BEGIN
      v_qty:=(v_item->>'qty')::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Некорректное количество' USING ERRCODE='22023';
    END;
    IF v_qty IS NULL OR v_qty<=0 OR v_qty>1000 OR v_qty<>trunc(v_qty) THEN
      RAISE EXCEPTION 'Количество должно быть целым числом от 1 до 1000' USING ERRCODE='22023';
    END IF;
    v_items:=v_items||jsonb_build_array(jsonb_build_object('matId',v_mat,'qty',v_qty::integer));
    v_count:=v_count+1;
  END LOOP;
  IF v_count=0 OR v_count>20 THEN
    RAISE EXCEPTION 'Укажите от 1 до 20 материалов' USING ERRCODE='22023';
  END IF;

  SELECT state,revision INTO v_state,v_revision FROM public.app_state WHERE id=1 FOR UPDATE;
  IF v_revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'WORKSPACE_CONFLICT' USING ERRCODE='40001';
  END IF;

  SELECT b.value->>'name',f.value INTO v_block_name,v_floor
  FROM jsonb_array_elements(COALESCE(v_state->'objects','[]'::jsonb)) AS o(value)
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.value->'blocks','[]'::jsonb)) AS b(value)
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(b.value->'floors','[]'::jsonb)) AS f(value)
  WHERE o.value->>'id'=p_object_id AND b.value->>'id'=p_block_id AND f.value->>'id'=p_floor_id
  LIMIT 1;
  IF v_floor IS NULL OR NOT COALESCE(v_floor->>'brigadeId'=ANY(v_brigade_ids),false) THEN
    RAISE EXCEPTION 'Этаж не найден среди назначенных' USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(max(COALESCE(
    CASE WHEN r.value->>'number' ~ '^[0-9]{1,15}$' THEN (r.value->>'number')::bigint END,
    NULLIF(regexp_replace(COALESCE(r.value->>'id',''),'[^0-9]','','g'),'')::bigint
  )),0)+1 INTO v_number
  FROM jsonb_array_elements(COALESCE(v_state->'requests','[]'::jsonb)) AS r(value)
  WHERE length(regexp_replace(COALESCE(r.value->>'id',''),'[^0-9]','','g'))<=15;

  v_request:=jsonb_build_object(
    'id','req'||replace(gen_random_uuid()::text,'-',''),
    'number',v_number,
    'objId',p_object_id,
    'blockId',p_block_id,
    'blockName',v_block_name,
    'floorId',p_floor_id,
    'floor',v_floor->'num',
    'items',v_items,
    'comment',COALESCE(p_comment,''),
    'status','new',
    'brigadeId',v_floor->>'brigadeId',
    'date',v_today,
    'createdBy','foreman',
    'createdByName',COALESCE(v_name,'')
  );
  v_state:=jsonb_set(v_state,'{requests}',COALESCE(v_state->'requests','[]'::jsonb)||jsonb_build_array(v_request),true);

  UPDATE public.app_state SET state=v_state,revision=revision+1,updated_by=(SELECT auth.uid()),updated_at=now()
  WHERE id=1 AND revision=p_expected_revision RETURNING revision INTO v_new_revision;
  IF v_new_revision IS NULL THEN RAISE EXCEPTION 'WORKSPACE_CONFLICT' USING ERRCODE='40001'; END IF;
  RETURN v_new_revision;
END;
$$;
REVOKE ALL ON FUNCTION public.create_foreman_material_request(bigint,text,text,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_foreman_material_request(bigint,text,text,text,jsonb,text) TO authenticated;
