-- Térségi gyakorlat és évjárat: mi a jellemző tőszám, vetésidő, FAO-csoport, és mi vált be gyenge / átlagos / jó évben.
-- Kifelé csak összesítés, csoportonként küszöbbel (≥5 tábla, ≥3 termelő; admin nyers nézetben 1/1).
create or replace function public.crop_profile(p_crop text, p_public boolean default false)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_raw boolean := public.is_admin() and not coalesce(p_public,false);
  kf int; ko int; v jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  kf := case when v_raw then 1 else 5 end;
  ko := case when v_raw then 1 else 3 end;
  with b as (
    select p.field_id, p.owner, p.year, p.area_ha a, p.fao, p.sowing,
      case when p.density_unit='mag/ha' then p.density/1000 when p.density_unit='mag/m²' then p.density
           when p.seeds_m2 is not null then p.seeds_m2 else p.density end dn,
      case when p.density is null then null when p.density_unit='mag/ha' then 'ezer mag/ha'
           when p.density_unit='mag/m²' or p.seeds_m2 is not null then 'mag/m²' else coalesce(p.density_unit,'kg/ha') end du,
      case when p.yield_std>0 and p.yield_std<100 and coalesce(p.yield_src,'')<>'becsles' then p.yield_std end y
    from public.parts p join public.fields f on f.id=p.field_id
    where f.deleted_at is null and p.area_ha>0 and p.crop=p_crop),
  ym as (select year, avg(y) m, count(y) n from b where y is not null group by year having count(y)>=5),
  yc as (select year, m, ntile(3) over (order by m) cls from ym),
  r as (select b.*, b.y/nullif(ym.m,0) rel, yc.cls from b left join ym using(year) left join yc using(year)),
  tot as (select count(*) n, count(distinct field_id) nf, count(distinct owner) no, sum(a) ha from r),
  -- FAO-csoportok
  fg as (select r.*, case when fao is null then null when fao<300 then 1 when fao<400 then 2 when fao<500 then 3 else 4 end g from r),
  fga as (select g, count(*) n, count(distinct field_id) nf, count(distinct owner) no, sum(a) ha, avg(rel) rel from fg where g is not null group by g),
  fgc as (select g, cls, count(*) n, count(distinct field_id) nf, count(distinct owner) no, avg(rel) rel from fg where g is not null and cls is not null and rel is not null group by g, cls),
  -- tőszám: leggyakoribb egység, jellemző értékek, leggyakoribb sáv
  du as (select du from r where dn is not null group by du order by count(*) desc limit 1),
  rd as (select r.* from r where dn is not null and du=(select du from du)),
  dw as (select case (select du from du) when 'ezer mag/ha' then 5 when 'mag/m²' then 5 else 20 end w),
  dq as (select percentile_cont(0.25) within group (order by dn) p25, percentile_cont(0.5) within group (order by dn) p50,
                percentile_cont(0.75) within group (order by dn) p75, count(*) n, count(distinct field_id) nf, count(distinct owner) no from rd),
  dm as (select floor(dn/(select w from dw))*(select w from dw) lo, count(*) c from rd group by 1 order by count(*) desc, 1 limit 1),
  rdb as (select rd.*, ntile(4) over (order by dn) band from rd),
  dba as (select band, min(dn) lo, max(dn) hi, count(*) n, count(distinct field_id) nf, count(distinct owner) no, avg(rel) rel from rdb group by band),
  dbc as (select band, cls, count(*) n, count(distinct field_id) nf, count(distinct owner) no, avg(rel) rel from rdb where cls is not null and rel is not null group by band, cls),
  -- vetésidő: az év napjaként (őszi vetésnél a vetés naptári évében)
  sd as (select (sowing - make_date(extract(year from sowing)::int,1,1))::int+1 doy, field_id, owner from r where sowing is not null),
  sq as (select percentile_cont(0.1) within group (order by doy) p10, percentile_cont(0.25) within group (order by doy) p25,
                percentile_cont(0.5) within group (order by doy) p50, percentile_cont(0.75) within group (order by doy) p75,
                percentile_cont(0.9) within group (order by doy) p90, count(*) n, count(distinct field_id) nf, count(distinct owner) no from sd)
  select jsonb_build_object(
    'crop', p_crop, 'raw', v_raw, 'k_fields', kf, 'k_owners', ko,
    'ok', (select nf>=kf and no>=ko from tot),
    'totals', (select jsonb_build_object('n',n,'nf',nf,'no',no) from tot),
    'years', case when (select nf>=kf and no>=ko from tot) then coalesce((select jsonb_agg(jsonb_build_object('year',year,'cls',cls,'m',round(m::numeric,2)) order by year) from yc),'[]'::jsonb) else '[]'::jsonb end,
    'fao', case when (select nf>=kf and no>=ko from tot) then coalesce((select jsonb_agg(jsonb_build_object(
        'g', a.g, 'n', a.n, 'ok', a.nf>=kf and a.no>=ko,
        'share', case when a.nf>=kf and a.no>=ko then round((a.ha/nullif((select sum(ha) from fga),0))::numeric,3) end,
        'rel', case when a.nf>=kf and a.no>=ko then round(a.rel::numeric,3) end,
        'cells', (select jsonb_agg(jsonb_build_object('cls',c.cls,'n',c.n,'ok',c.nf>=kf and c.no>=ko,
                    'rel', case when c.nf>=kf and c.no>=ko then round(c.rel::numeric,3) end) order by c.cls) from fgc c where c.g=a.g))
        order by a.g) from fga a),'[]'::jsonb) else '[]'::jsonb end,
    'density', case when (select nf>=kf and no>=ko from dq) then jsonb_build_object(
        'unit', (select du from du), 'n', (select n from dq),
        'p25', (select round(p25::numeric,1) from dq), 'med', (select round(p50::numeric,1) from dq), 'p75', (select round(p75::numeric,1) from dq),
        'mode_lo', (select lo from dm), 'mode_hi', (select lo+(select w from dw) from dm), 'mode_share', (select round((c::numeric/(select n from dq)),3) from dm),
        'bands', coalesce((select jsonb_agg(jsonb_build_object('band',x.band,'lo',round(x.lo::numeric,1),'hi',round(x.hi::numeric,1),'n',x.n,
                   'ok', x.nf>=kf and x.no>=ko, 'rel', case when x.nf>=kf and x.no>=ko then round(x.rel::numeric,3) end,
                   'cells', (select jsonb_agg(jsonb_build_object('cls',c.cls,'n',c.n,'ok',c.nf>=kf and c.no>=ko,
                               'rel', case when c.nf>=kf and c.no>=ko then round(c.rel::numeric,3) end) order by c.cls) from dbc c where c.band=x.band))
                   order by x.band) from dba x),'[]'::jsonb)) end,
    'sowing', case when (select nf>=kf and no>=ko from sq) then (select jsonb_build_object('n',n,'p10',round(p10),'p25',round(p25),'med',round(p50),'p75',round(p75),'p90',round(p90)) from sq) end
  ) into v;
  return v;
end $$;
revoke execute on function public.crop_profile(text, boolean) from public, anon;
grant execute on function public.crop_profile(text, boolean) to authenticated;

-- demó-másolat (ugyanaz a számítás a kitalált demo adatkészleten)
do $$
declare d text;
begin
  d := pg_get_functiondef('public.crop_profile(text,boolean)'::regprocedure);
  d := replace(d, 'FUNCTION public.crop_profile(', 'FUNCTION public.demo_crop_profile(');
  d := replace(d, 'public.fields', 'demo.fields');
  d := replace(d, 'public.parts', 'demo.parts');
  d := replace(d, 'public.is_admin()', 'false');
  d := regexp_replace(d, 'if auth\.uid\(\) is null then raise exception ''not authenticated''; end if;', '', 'g');
  if d ~ 'public\.(fields|parts)|auth\.uid' then raise exception 'unreplaced reference'; end if;
  execute d;
end $$;
revoke execute on function public.demo_crop_profile(text, boolean) from public;
grant execute on function public.demo_crop_profile(text, boolean) to anon, authenticated;
