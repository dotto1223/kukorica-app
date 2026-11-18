-- G×E×M összehasonlító statisztika
-- _gxe_rows: belső (kívülről nem hívható) soros számítás: relatív hozam, környezeti index, környezeti tercilis,
--            normalizált tőszám, vetésidő-eltérés.
-- gxe_stats: kifelé csak összesítés, cellánként küszöbbel (≥5 tábla, ≥3 termelő; admin nyers nézetben 1/1).
-- gxe_field: a saját tábla jellemző környezeti besorolása (kategória), a hasonló táblák ajánlásához.

alter table public.parts add column if not exists tkm numeric;
alter table public.parts add column if not exists seeds_m2 numeric;

CREATE OR REPLACE FUNCTION public._gxe_rows(p_crop text)
RETURNS TABLE(field_id text, owner uuid, year int, county text, hyb text, hyb_disp text, area numeric,
              y numeric, rel numeric, e numeric, env int, dn numeric, dunit text, sow_delta int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  with allp as (
    select p.field_id, p.owner, p.year, p.crop, coalesce(nullif(f.county,''),'?') county, p.area_ha,
           case when p.yield_std > 0 and p.yield_std < 100 and coalesce(p.yield_src,'') <> 'becsles' then p.yield_std end y,
           coalesce(nullif(p.hybrid_norm,''), upper(nullif(p.hybrid,''))) hyb, nullif(p.hybrid,'') hybrid,
           p.density, p.density_unit, p.seeds_m2, p.sowing
    from public.parts p join public.fields f on f.id = p.field_id
    where f.deleted_at is null and p.area_ha > 0 and p.crop is not null),
  rm as (select crop, year, county, avg(y) m, count(y) n from allp where y is not null group by 1,2,3),
  ym as (select crop, year, avg(y) m from allp where y is not null group by 1,2),
  relall as (
    select a.*, case when rm.n >= 5 then rm.m else ym.m end rmean,
           a.y / nullif(case when rm.n >= 5 then rm.m else ym.m end, 0) rel
    from allp a
    left join rm on rm.crop = a.crop and rm.year = a.year and rm.county = a.county
    left join ym on ym.crop = a.crop and ym.year = a.year
    where a.y is not null),
  ffy as (select r.field_id, r.year, avg(r.rel) r, count(*) c from relall r group by 1,2),
  fft as (select f2.field_id, sum(f2.r) s, count(*) c from ffy f2 group by 1),
  cr as (
    select r.*, coalesce((fft.s - ffy.r) / nullif(fft.c - 1, 0), 1) ff
    from relall r join ffy on ffy.field_id = r.field_id and ffy.year = r.year
    join fft on fft.field_id = r.field_id
    where r.crop = p_crop),
  sm as (select c.year, c.county, percentile_cont(0.5) within group (order by (c.sowing - make_date(c.year,1,1))) md, count(*) n
         from cr c where c.sowing is not null group by 1,2),
  smy as (select c.year, percentile_cont(0.5) within group (order by (c.sowing - make_date(c.year,1,1))) md
          from cr c where c.sowing is not null group by 1)
  select c.field_id, c.owner, c.year, c.county, c.hyb, c.hybrid, c.area_ha, c.y, c.rel, c.rmean * c.ff e,
         ntile(3) over (order by c.rmean * c.ff) env,
         case when c.density_unit = 'mag/ha' then c.density / 1000
              when c.density_unit = 'mag/m²' then c.density
              when c.seeds_m2 is not null then c.seeds_m2
              else c.density end dn,
         case when c.density is null then null
              when c.density_unit = 'mag/ha' then 'ezer mag/ha'
              when c.density_unit = 'mag/m²' or c.seeds_m2 is not null then 'mag/m²'
              else coalesce(c.density_unit, 'kg/ha') end dunit,
         case when c.sowing is null then null
              else ((c.sowing - make_date(c.year,1,1)) - coalesce(case when sm.n >= 5 then sm.md end, smy.md))::int end sow_delta
  from cr c
  left join sm on sm.year = c.year and sm.county = c.county
  left join smy on smy.year = c.year;
$$;
revoke execute on function public._gxe_rows(text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.gxe_stats(p_crop text, p_public boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
declare
  v_raw boolean := public.is_admin() and not coalesce(p_public,false);
  kf int; ko int; v jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  kf := case when v_raw then 1 else 5 end;
  ko := case when v_raw then 1 else 3 end;
  with r as (select * from public._gxe_rows(p_crop)),
  envs as (select env, count(*) n, min(e) lo, max(e) hi, avg(y) ym from r group by env),
  base_slope as (select regr_slope(y, e) b from r),
  -- hibridprofil
  hall as (select hyb, mode() within group (order by hyb_disp) nm, count(*) n, count(distinct field_id) nf, count(distinct owner) no,
                  avg(rel) rel, avg(y) y, regr_slope(y, e) b, count(distinct env) ne
           from r where hyb is not null group by hyb),
  hcell as (select hyb, env, count(*) n, count(distinct field_id) nf, count(distinct owner) no, avg(rel) rel, avg(y) y,
                   percentile_cont(0.9) within group (order by y) p90
            from r where hyb is not null group by hyb, env),
  -- tőszám: a leggyakoribb egység, 5 sáv (kvintilis)
  du as (select dunit from r where dn is not null group by dunit order by count(*) desc limit 1),
  rd as (select r.*, ntile(5) over (order by dn) band from r where dn is not null and dunit = (select dunit from du)),
  dband as (select band, min(dn) lo, max(dn) hi, count(*) n, count(distinct field_id) nf, count(distinct owner) no, avg(rel) rel from rd group by band),
  dcell as (select band, env, count(*) n, count(distinct field_id) nf, count(distinct owner) no, avg(rel) rel from rd group by band, env),
  -- vetésidő: eltérés a térség/év mediánjától
  rs as (select r.*, case when sow_delta <= -10 then 1 when sow_delta <= -4 then 2 when sow_delta <= 3 then 3 when sow_delta <= 9 then 4 else 5 end sband
         from r where sow_delta is not null),
  sband as (select sband, count(*) n, count(distinct field_id) nf, count(distinct owner) no, avg(rel) rel from rs group by sband),
  scell as (select sband, env, count(*) n, count(distinct field_id) nf, count(distinct owner) no, avg(rel) rel from rs group by sband, env),
  tot as (select count(*) n, count(distinct field_id) nf, count(distinct owner) no, count(distinct year) ny from r)
  select jsonb_build_object(
    'crop', p_crop, 'raw', v_raw, 'k_fields', kf, 'k_owners', ko,
    'totals', (select jsonb_build_object('n', n, 'nf', nf, 'no', no, 'years', ny, 'ok', nf >= kf and no >= ko) from tot),
    'envs', coalesce((select jsonb_agg(jsonb_build_object('env', env, 'n', n, 'lo', round(lo::numeric,2), 'hi', round(hi::numeric,2), 'y', round(ym::numeric,2)) order by env)
                      from envs where (select nf >= kf and no >= ko from tot)), '[]'::jsonb),
    'hybrids', coalesce((select jsonb_agg(jsonb_build_object(
        'hyb', h.hyb, 'name', coalesce(h.nm, h.hyb), 'n', h.n, 'nf', h.nf, 'no', h.no,
        'rel', round(h.rel::numeric,3), 'y', round(h.y::numeric,2),
        'slope', case when h.n >= greatest(kf,8) and h.no >= ko and h.ne >= 2 and (select b from base_slope) > 0
                      then round((h.b / (select b from base_slope))::numeric,2) end,
        'cells', (select jsonb_agg(jsonb_build_object('env', c.env, 'n', c.n, 'ok', c.nf >= kf and c.no >= ko,
                    'rel', case when c.nf >= kf and c.no >= ko then round(c.rel::numeric,3) end,
                    'y', case when c.nf >= kf and c.no >= ko then round(c.y::numeric,2) end,
                    'p90', case when c.nf >= kf and c.no >= ko and c.n >= 5 then round(c.p90::numeric,2) end) order by c.env)
                  from hcell c where c.hyb = h.hyb))
        order by h.rel desc)
      from hall h where h.nf >= kf and h.no >= ko), '[]'::jsonb),
    'hybrids_hidden', (select count(*) from hall h where not (h.nf >= kf and h.no >= ko)),
    'density', jsonb_build_object('unit', (select dunit from du),
       'bands', coalesce((select jsonb_agg(jsonb_build_object('band', b.band, 'lo', round(b.lo::numeric,1), 'hi', round(b.hi::numeric,1), 'n', b.n,
                  'ok', b.nf >= kf and b.no >= ko, 'rel', case when b.nf >= kf and b.no >= ko then round(b.rel::numeric,3) end,
                  'cells', (select jsonb_agg(jsonb_build_object('env', c.env, 'n', c.n, 'ok', c.nf >= kf and c.no >= ko,
                              'rel', case when c.nf >= kf and c.no >= ko then round(c.rel::numeric,3) end) order by c.env)
                            from dcell c where c.band = b.band)) order by b.band) from dband b), '[]'::jsonb)),
    'sowing', coalesce((select jsonb_agg(jsonb_build_object('band', s.sband, 'n', s.n, 'ok', s.nf >= kf and s.no >= ko,
                  'rel', case when s.nf >= kf and s.no >= ko then round(s.rel::numeric,3) end,
                  'cells', (select jsonb_agg(jsonb_build_object('env', c.env, 'n', c.n, 'ok', c.nf >= kf and c.no >= ko,
                              'rel', case when c.nf >= kf and c.no >= ko then round(c.rel::numeric,3) end) order by c.env)
                            from scell c where c.sband = s.sband)) order by s.sband) from sband s), '[]'::jsonb)
  ) into v;
  return v;
end $$;

CREATE OR REPLACE FUNCTION public.gxe_field(p_field text, p_crop text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
declare v_owner uuid; v_county text; v_ff numeric; v_rm numeric; v_e numeric; v_env int; v_cut1 numeric; v_cut2 numeric; v_n int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select owner, coalesce(nullif(county,''),'?') into v_owner, v_county from public.fields where id = p_field and deleted_at is null;
  if v_owner is null then return jsonb_build_object('ok', false, 'reason', 'nincs tábla'); end if;
  if v_owner <> auth.uid() and not public.is_admin() then raise exception 'not allowed'; end if;
  -- a tábla tartós termőképessége: saját relatív hozamainak átlaga (minden év, minden kultúra)
  with allp as (
    select p.field_id, p.year, p.crop, coalesce(nullif(f.county,''),'?') county,
           case when p.yield_std > 0 and p.yield_std < 100 and coalesce(p.yield_src,'') <> 'becsles' then p.yield_std end y
    from public.parts p join public.fields f on f.id = p.field_id where f.deleted_at is null and p.area_ha > 0 and p.crop is not null),
  rm as (select crop, year, county, avg(y) m, count(y) n from allp where y is not null group by 1,2,3),
  ym as (select crop, year, avg(y) m from allp where y is not null group by 1,2)
  select avg(a.y / nullif(case when rm.n >= 5 then rm.m else ym.m end, 0)) into v_ff
  from allp a left join rm on rm.crop=a.crop and rm.year=a.year and rm.county=a.county left join ym on ym.crop=a.crop and ym.year=a.year
  where a.field_id = p_field and a.y is not null;
  -- a térség jellemző átlaghozama az adott kultúrára (évek átlaga)
  select avg(m) into v_rm from (
    select avg(p.yield_std) m from public.parts p join public.fields f on f.id = p.field_id
    where f.deleted_at is null and p.crop = p_crop and p.yield_std > 0 and p.yield_std < 100 and coalesce(p.yield_src,'') <> 'becsles'
      and coalesce(nullif(f.county,''),'?') = v_county group by p.year having count(*) >= 5) q;
  if v_rm is null then
    select avg(m) into v_rm from (select avg(p.yield_std) m from public.parts p join public.fields f on f.id = p.field_id
      where f.deleted_at is null and p.crop = p_crop and p.yield_std > 0 and p.yield_std < 100 and coalesce(p.yield_src,'') <> 'becsles' group by p.year) q;
  end if;
  select max(e) filter (where env = 1), max(e) filter (where env = 2), count(*) into v_cut1, v_cut2, v_n from public._gxe_rows(p_crop);
  if v_rm is null or v_n < 3 then return jsonb_build_object('ok', false, 'reason', 'kevés adat', 'ff', round(coalesce(v_ff,1)::numeric,3)); end if;
  v_e := v_rm * coalesce(v_ff, 1);
  v_env := case when v_e <= v_cut1 then 1 when v_e <= v_cut2 then 2 else 3 end;
  return jsonb_build_object('ok', true, 'env', v_env, 'ff', round(coalesce(v_ff,1)::numeric,3), 'own_history', v_ff is not null);
end $$;

grant execute on function public.gxe_stats(text, boolean) to authenticated;
grant execute on function public.gxe_field(text, text) to authenticated;

CREATE OR REPLACE FUNCTION public.save_field(p_field jsonb, p_parts jsonb)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public' AS $function$
declare v_owner uuid; v_id text := p_field->>'id';
begin
  select owner into v_owner from public.fields where id = v_id;
  if v_owner is null then v_owner := auth.uid(); end if;
  insert into public.fields(id,owner,code,nickname,settlement,county,district,hrsz,area_ha,lat,lng,data,updated_at,updated_by,deleted_at)
  values (v_id, v_owner, p_field->>'code', p_field->>'nickname', p_field->>'settlement', p_field->>'county', nullif(p_field->>'district',''), p_field->>'hrsz',
          (p_field->>'area_ha')::numeric, (p_field->>'lat')::float8, (p_field->>'lng')::float8, p_field->'data', now(), auth.uid(), null)
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
  return jsonb_build_object('ok',true,'id',v_id,'updated_at',now());
end $function$;

revoke execute on function public.gxe_stats(text, boolean) from public, anon;
revoke execute on function public.gxe_field(text, text) from public, anon;
