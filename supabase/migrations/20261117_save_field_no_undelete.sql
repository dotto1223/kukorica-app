-- save_field: máshol törölt táblát egy régi helyi másolat nem hozhat vissza ({ok:false, deleted:true} választ ad).
do $$
declare d text;
begin
  d := pg_get_functiondef('public.save_field(jsonb,jsonb)'::regprocedure);
  d := replace(d, 'declare v_owner uuid; v_id text := p_field->>''id'';', 'declare v_owner uuid; v_del timestamptz; v_id text := p_field->>''id'';');
  d := replace(d, 'select owner into v_owner from public.fields where id = v_id;',
    'select owner, deleted_at into v_owner, v_del from public.fields where id = v_id;
  if v_del is not null then return jsonb_build_object(''ok'',false,''deleted'',true,''id'',v_id); end if;');
  if d !~ 'v_del is not null' then raise exception 'patch failed'; end if;
  execute d;
end $$;
