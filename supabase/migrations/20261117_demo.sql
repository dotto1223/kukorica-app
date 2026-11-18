-- Demó nézet: elkülönített, KITALÁLT bemutató adatkészlet (demo séma) és az éles statisztikai függvények demó-másolatai.
-- A demo séma nincs kitéve az API-nak; kívülről csak a demo_* függvények hívhatók (anon is), ezek csak a demo táblákat olvassák.
create schema if not exists demo;
revoke all on schema demo from public, anon, authenticated;
create table if not exists demo.fields(id text primary key, owner uuid not null, code text, nickname text, settlement text, county text, district text, area_ha numeric, deleted_at timestamptz);
create table if not exists demo.parts(field_id text references demo.fields(id) on delete cascade, owner uuid, year int, part_id text, label text, area_ha numeric, crop text, hybrid text, hybrid_norm text, fao int, sowing date, density numeric, density_unit text, seeds_m2 numeric, tkm numeric, harvest date, moisture numeric, yield_std numeric, yield_src text, primary key(field_id,year,part_id));
alter table demo.fields enable row level security;
alter table demo.parts enable row level security;

-- a függvények az élő változatból készülnek (ugyanaz a számítás, csak a demo táblákon, auth- és admin-ág nélkül)
do $$
declare r record; d text;
begin
  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname in ('_gxe_rows','get_stats','gxe_stats','gxe_field') loop
    d := pg_get_functiondef(r.oid);
    d := replace(d, 'public._gxe_rows(', 'public.demo__gxe_rows(');
    d := replace(d, 'FUNCTION public.get_stats(', 'FUNCTION public.demo_get_stats(');
    d := replace(d, 'FUNCTION public.gxe_stats(', 'FUNCTION public.demo_gxe_stats(');
    d := replace(d, 'FUNCTION public.gxe_field(', 'FUNCTION public.demo_gxe_field(');
    d := replace(d, 'public.fields', 'demo.fields');
    d := replace(d, 'public.parts', 'demo.parts');
    d := replace(d, 'public.is_admin()', 'false');
    d := regexp_replace(d, 'if auth\.uid\(\) is null then raise exception ''not authenticated''; end if;', '', 'g');
    d := regexp_replace(d, 'if v_owner <> auth\.uid\(\) and not false then raise exception ''not allowed''; end if;', '', 'g');
    if d ~ 'public\.(fields|parts)|auth\.uid' then raise exception 'unreplaced reference in %', r.proname; end if;
    execute d;
  end loop;
end $$;
revoke execute on function public.demo__gxe_rows(text) from public, anon, authenticated;
revoke execute on function public.demo_get_stats(boolean) from public;
revoke execute on function public.demo_gxe_stats(text, boolean) from public;
revoke execute on function public.demo_gxe_field(text, text) from public;
grant execute on function public.demo_get_stats(boolean) to anon, authenticated;
grant execute on function public.demo_gxe_stats(text, boolean) to anon, authenticated;
grant execute on function public.demo_gxe_field(text, text) to anon, authenticated;
-- adatok: supabase/seed/demo_data.sql (generátor: scripts/demo_gen.py)
