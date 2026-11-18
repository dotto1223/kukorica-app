-- Rövid táblakódok: településenként 2–3 betűs, egyedi rövidítés + sorszám (pl. KKF-003 = Kiskunfélegyháza 3. táblája).
-- A rövidítést a szerver osztja ki és rögzíti (region_codes), így két település sosem kapja ugyanazt.

create table if not exists public.region_codes(
  settlement text primary key,
  code text not null unique,
  created_at timestamptz not null default now());
alter table public.region_codes enable row level security;
drop policy if exists region_codes_read on public.region_codes;
create policy region_codes_read on public.region_codes for select to authenticated using (true);

-- ékezet nélküli kisbetűs alak (magyar és a környező nyelvek betűi)
create or replace function public.ascii_low(s text) returns text language sql immutable as $$
  select regexp_replace(translate(lower(coalesce(s,'')),
    'áàâäãåéèêëěíìîïóòôöõőøúùûüűůýÿčćçďđğłľĺńňñřŕšśşșťțžźżăą',
    'aaaaaaeeeeeiiiiooooooouuuuuuyycccddglllnnnrrssssttzzzaa'),'[^a-z]','','g') $$;

-- első betűegység (magyar kettős betűk egyben: cs, sz, zs, gy, ny, ty, ly, dz)
create or replace function public.first_unit(s text) returns text language sql immutable as $$
  select case when s ~ '^(cs|sz|zs|gy|ny|ty|ly|dz)' then left(s,2) else left(s,1) end $$;

-- jelöltek sorrendben: elöl a legolvashatóbb
create or replace function public.region_cands(p_settlement text) returns text[] language plpgsql immutable as $$
declare s text := public.ascii_low(p_settlement); ini text := ''; p text; hit boolean; out text[] := '{}'; c text; i int; base text;
  pre text[] := array['kiskun','kis','nagy','kun','bacska','bacs','szent','duna','tisza','hajdu','mezo','balaton','jasz','felso','also','kozep','oreg','uj','puszta','zala','vas','pilis'];
  f text := public.ascii_low(p_settlement);
begin
  if s = '' then return array['tbl']; end if;
  loop hit := false;
    foreach p in array pre loop
      if left(s,length(p)) = p and length(s)-length(p) >= 4 then
        ini := ini || (case when p='kiskun' then 'kk' else left(p,1) end); s := substr(s,length(p)+1); hit := true; exit; end if;
    end loop;
    exit when not hit;
  end loop;
  if ini <> '' then
    base := left(ini || public.first_unit(s) || substr(s,length(public.first_unit(s))+1), 3);
    out := out || base;
    -- további változatok: az előtagbetűk + a maradék egy-egy későbbi mássalhangzója
    for i in 2..length(s) loop c := substr(s,i,1);
      if c !~ '[aeiou]' and length(ini) < 2 then out := out || left(ini || left(s,1) || c, 3); end if; end loop;
  end if;
  -- a teljes névből: első három betű, majd az első két betű + egy későbbi mássalhangzó, végül két betű
  out := out || left(f,3);
  for i in 3..length(f) loop c := substr(f,i,1); if c !~ '[aeiou]' then out := out || (left(f,2)||c); end if; end loop;
  for i in 2..length(f) loop c := substr(f,i,1); if c !~ '[aeiou]' then out := out || (left(f,1)||c||substr(f,i+1,1)); end if; end loop;
  out := out || left(f,2);
  return out;
end $$;

-- a település rövidítése (első alkalommal kiosztja)
create or replace function public.region_code(p_settlement text) returns text language plpgsql security definer set search_path to 'public' as $$
declare k text := public.ascii_low(p_settlement); r text; c text; l text;
begin
  if k = '' then return 'TBL'; end if;
  select code into r from public.region_codes where settlement = k; if r is not null then return r; end if;
  perform pg_advisory_xact_lock(hashtext('region_codes'));
  select code into r from public.region_codes where settlement = k; if r is not null then return r; end if;
  foreach c in array public.region_cands(p_settlement) loop
    c := upper(c);
    if length(c) >= 2 and c <> 'TBL' and not exists(select 1 from public.region_codes where code = c) then
      insert into public.region_codes(settlement,code) values (k,c); return c; end if;
  end loop;
  foreach l in array string_to_array('A B C D E F G H I J K L M N O P Q R S T U V W X Y Z',' ') loop
    c := upper(left(k,2)) || l;
    if not exists(select 1 from public.region_codes where code = c) then insert into public.region_codes(settlement,code) values (k,c); return c; end if;
  end loop;
  raise exception 'no region code for %', p_settlement;
end $$;

-- új táblakód; ha a tábla már létezik a felhőben, annak a kódját adja vissza
drop function if exists public.next_field_code(text);
create or replace function public.next_field_code(p_prefix text, p_field text default null, p_settlement text default null)
returns text language plpgsql security definer set search_path to 'public' as $$
declare n int; rc text; old text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_field is not null then
    select code into old from public.fields where id = p_field and (owner = auth.uid() or public.is_admin()) and code ~ '^[A-Z]{2,3}-[0-9]{3,}$';
    if old is not null then return old; end if;
  end if;
  rc := public.region_code(coalesce(p_settlement, p_prefix));
  insert into public.code_counters(prefix,last) values (rc,1)
    on conflict (prefix) do update set last = public.code_counters.last + 1 returning last into n;
  return rc || '-' || lpad(n::text, 3, '0');
end $$;
grant execute on function public.next_field_code(text,text,text) to authenticated;
revoke execute on function public.region_code(text) from public, anon;

-- a felhőben lévő kód az irányadó: egy régi helyi másolat nem írhatja vissza a régi hosszú kódot
create or replace function public.save_field(p_field jsonb, p_parts jsonb)
 returns jsonb language plpgsql set search_path to 'public' as $function$
declare v_owner uuid; v_del timestamptz; v_id text := p_field->>'id'; v_code text;
begin
  select owner, deleted_at, code into v_owner, v_del, v_code from public.fields where id = v_id;
  if v_del is not null then return jsonb_build_object('ok',false,'deleted',true,'id',v_id); end if;
  if v_owner is null then v_owner := auth.uid(); end if;
  if v_code is null or v_code !~ '^[A-Z]{2,3}-[0-9]{3,}$' then v_code := p_field->>'code'; end if;
  insert into public.fields(id,owner,code,nickname,settlement,county,district,hrsz,area_ha,lat,lng,data,updated_at,updated_by,deleted_at)
  values (v_id, v_owner, v_code, p_field->>'nickname', p_field->>'settlement', p_field->>'county', nullif(p_field->>'district',''), p_field->>'hrsz',
          (p_field->>'area_ha')::numeric, (p_field->>'lat')::float8, (p_field->>'lng')::float8, jsonb_set(p_field->'data','{code}',to_jsonb(v_code)), now(), auth.uid(), null)
  on conflict (id) do update set code=excluded.code, nickname=excluded.nickname, settlement=excluded.settlement, county=excluded.county,
     district=coalesce(excluded.district, public.fields.district),
     hrsz=excluded.hrsz, area_ha=excluded.area_ha, lat=excluded.lat, lng=excluded.lng, data=excluded.data,
     updated_at=now(), updated_by=auth.uid(), deleted_at=null;
  delete from public.parts where field_id = v_id;
  insert into public.parts(field_id,owner,year,part_id,label,area_ha,crop,hybrid,hybrid_norm,fao,sowing,density,density_unit,stand,tkm,seeds_m2,harvest,moisture,yield_std,irrigated,n_kg,p_kg,k_kg,yield_src)
  select v_id, v_owner, (x->>'year')::int, x->>'part_id', x->>'label', nullif(x->>'area_ha','')::numeric, nullif(x->>'crop',''), nullif(x->>'hybrid',''),
         nullif(x->>'hybrid_norm',''), nullif(x->>'fao','')::int, nullif(x->>'sowing','')::date, nullif(x->>'density','')::numeric,
         nullif(x->>'density_unit',''), nullif(x->>'stand','')::numeric, nullif(x->>'tkm','')::numeric, nullif(x->>'seeds_m2','')::numeric,
         nullif(x->>'harvest','')::date, nullif(x->>'moisture','')::numeric, nullif(x->>'yield_std','')::numeric,
         (x->>'irrigated')::boolean, nullif(x->>'n_kg','')::numeric, nullif(x->>'p_kg','')::numeric, nullif(x->>'k_kg','')::numeric, nullif(x->>'yield_src','')
  from jsonb_array_elements(coalesce(p_parts,'[]'::jsonb)) x;
  return jsonb_build_object('ok',true,'id',v_id,'code',v_code,'updated_at',now());
end $function$;

-- meglévő táblák átkódolása: településenként a régi sorszám sorrendjében 001-től; a legtöbb táblájú település kapja a legrövidebb kódot
do $$
declare r record; f record; rc text; n int;
begin
  for r in select coalesce(nullif(settlement,''),'') s, count(*) c from public.fields where code !~ '^[A-Z]{2,3}-[0-9]{3,}$' group by 1 order by (coalesce(nullif(settlement,''),'')='') , 2 desc, 1 loop
    rc := public.region_code(r.s); n := coalesce((select last from public.code_counters where prefix = rc),0);
    for f in select id from public.fields where coalesce(nullif(settlement,''),'') = r.s and code !~ '^[A-Z]{2,3}-[0-9]{3,}$'
             order by (case when code ~ '-[0-9]+$' then regexp_replace(code,'^.*-','')::int end) nulls last, id loop
      n := n + 1;
      update public.fields set code = rc || '-' || lpad(n::text,3,'0'), data = jsonb_set(data,'{code}',to_jsonb(rc || '-' || lpad(n::text,3,'0'))) where id = f.id;
    end loop;
    insert into public.code_counters(prefix,last) values (rc,n) on conflict (prefix) do update set last = greatest(public.code_counters.last, excluded.last);
  end loop;
end $$;
