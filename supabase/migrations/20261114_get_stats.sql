-- Közös, anonim statisztika: csak összesített számok, küszöbbel (≥5 tábla és ≥3 termelő csoportonként).
-- Admin küszöb nélkül látja (p_public=true esetén a partner-nézetet kapja).
drop function if exists public.get_stats();
create or replace function public.get_stats(p_public boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_admin boolean := public.is_admin();
  v_raw boolean := public.is_admin() and not coalesce(p_public,false);
  k_fields int; k_owners int; v jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  k_fields := case when v_raw then 1 else 5 end;
  k_owners := case when v_raw then 1 else 3 end;
  with base as (
    select p.year, coalesce(nullif(p.crop,''),'Nincs megadva') crop,
           coalesce(nullif(f.county,''),'Ismeretlen') county, coalesce(nullif(f.settlement,''),'Ismeretlen') settlement,
           p.field_id, p.owner, p.area_ha,
           case when p.yield_std > 0 and p.yield_std < 100 and coalesce(p.yield_src,'') <> 'becsles' then p.yield_std end y
    from public.parts p join public.fields f on f.id = p.field_id
    where f.deleted_at is null and p.area_ha > 0
  ),
  lv as (
    select 'all'::text lvl, 'Összes'::text region, b.* from base b
    union all select 'county', b.county, b.* from base b
    union all select 'settlement', b.settlement, b.* from base b
  ),
  agg as (
    select lvl, region, year, crop, sum(area_ha) ha, count(distinct field_id) nf, count(distinct owner) no, count(y) ny,
      sum(y*area_ha) filter (where y is not null) / nullif(sum(area_ha) filter (where y is not null),0) y_mean,
      percentile_cont(0.5) within group (order by y) y_med,
      percentile_cont(0.25) within group (order by y) y_p25,
      percentile_cont(0.75) within group (order by y) y_p75
    from lv group by lvl, region, year, crop
  ),
  yt as (select lvl, region, year, sum(area_ha) ha, count(distinct field_id) nf, count(distinct owner) no from lv group by lvl, region, year),
  tot as (select count(*) nf, count(distinct owner) no, coalesce(sum(area_ha),0) ha, count(distinct settlement) ns from public.fields where deleted_at is null)
  select jsonb_build_object(
    'admin', v_admin, 'raw', v_raw, 'k_fields', k_fields, 'k_owners', k_owners,
    'totals', (select case when no >= k_owners then jsonb_build_object('fields',nf,'owners',no,'ha',round(ha::numeric,1),'settlements',ns,'ok',true)
                           else jsonb_build_object('ok',false) end from tot),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'lvl',lvl,'region',region,'year',year,'crop',crop,'ok',true,'ha',round(ha::numeric,1),'nf',nf,'no',no,'ny',ny,
        'y_mean', case when ny >= least(k_fields,3) then round(y_mean::numeric,2) end,
        'y_med',  case when ny >= least(k_fields,3) then round(y_med::numeric,2) end,
        'y_p25',  case when ny >= least(k_fields,3) then round(y_p25::numeric,2) end,
        'y_p75',  case when ny >= least(k_fields,3) then round(y_p75::numeric,2) end)
        order by lvl, region, year desc, ha desc)
      from agg where nf >= k_fields and no >= k_owners), '[]'::jsonb),
    'hidden', coalesce((select jsonb_agg(jsonb_build_object('lvl',lvl,'region',region,'year',year,'n',cnt)) from
        (select lvl, region, year, count(*) cnt from agg where not (nf >= k_fields and no >= k_owners) group by lvl, region, year) h), '[]'::jsonb),
    'year_totals', coalesce((select jsonb_agg(jsonb_build_object('lvl',lvl,'region',region,'year',year,
        'ok', (nf >= k_fields and no >= k_owners),
        'ha', case when nf >= k_fields and no >= k_owners then round(ha::numeric,1) end,
        'nf', case when nf >= k_fields and no >= k_owners then nf end) order by lvl, region, year desc) from yt), '[]'::jsonb)
  ) into v;
  return v;
end $$;
revoke all on function public.get_stats(boolean) from public, anon;
grant execute on function public.get_stats(boolean) to authenticated;
