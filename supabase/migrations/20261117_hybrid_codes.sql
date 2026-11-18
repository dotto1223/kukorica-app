-- Hibrid-kódnevek a közös statisztikában.
-- A közös (térségi) statisztikában a hibridek/fajták nem névvel, hanem állandó kódnévvel szerepelnek
-- (pl. K-417), érési jellemzővel (kukoricánál FAO-sáv, más kultúránál a kultúrán belüli korai/közepes/kései harmad)
-- és reakciótípussal. A pontos FAO-szám nem jelenik meg. A termelő a saját hibridjeit névvel is látja.
-- A kódok véletlenszerűek, a névből nem számolhatók vissza; a hozzárendelés csak a szerveren van.

create table if not exists public.hybrid_codes(
  crop text not null, hyb text not null, code text not null, created_at timestamptz not null default now(),
  primary key (crop, hyb), unique (crop, code));
alter table public.hybrid_codes enable row level security;
revoke all on public.hybrid_codes from anon, authenticated;

CREATE OR REPLACE FUNCTION public.hyb_code(p_crop text, p_hyb text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
declare v text; pre text; i int := 0;
begin
  if p_hyb is null then return null; end if;
  select code into v from public.hybrid_codes where crop = p_crop and hyb = p_hyb;
  if v is not null then return v; end if;
  pre := case p_crop when 'Kukorica' then 'K' when 'Napraforgó' then 'N' when 'Őszi káposztarepce' then 'R'
                     when 'Őszi búza' then 'B' when 'Őszi árpa' then 'Á' when 'Szója' then 'S'
                     else upper(left(coalesce(p_crop,'H'),1)) end;
  loop
    i := i + 1;
    v := pre || '-' || (100 + floor(random() * (case when i < 50 then 900 else 9000 end)))::int;
    begin
      insert into public.hybrid_codes(crop, hyb, code) values (p_crop, p_hyb, v);
      return v;
    exception when unique_violation then
      select code into v from public.hybrid_codes where crop = p_crop and hyb = p_hyb;
      if v is not null then return v; end if;
    end;
  end loop;
end $$;
revoke execute on function public.hyb_code(text, text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.gxe_stats(p_crop text, p_public boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
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
                  avg(rel) rel, avg(y) y, regr_slope(y, e) b, count(distinct env) ne,
                  bool_or(r.owner = auth.uid()) own
           from r where hyb is not null group by hyb),
  -- érési jellemző: a hibrid leggyakoribb FAO-száma; kukoricánál abszolút sáv, más kultúránál a kultúrán belüli harmad
  hf as (select coalesce(nullif(p.hybrid_norm,''), upper(nullif(p.hybrid,''))) hyb, mode() within group (order by p.fao) fao
         from public.parts p where p.crop = p_crop and p.fao > 0 group by 1),
  hfc as (select percentile_cont(1.0/3) within group (order by fao) c1, percentile_cont(2.0/3) within group (order by fao) c2 from hf),
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
        'code', public.hyb_code(p_crop, h.hyb), 'own', coalesce(h.own,false),
        'name', case when v_raw or h.own then coalesce(h.nm, h.hyb) end,
        'mat', (select case when hf.fao is null then null
                            when p_crop = 'Kukorica' then jsonb_build_object('scale','fao','g', case when hf.fao < 300 then 1 when hf.fao < 400 then 2 when hf.fao < 500 then 3 else 4 end)
                            else jsonb_build_object('scale','rel','g', case when hf.fao <= hfc.c1 then 1 when hf.fao <= hfc.c2 then 2 else 3 end) end
                from hf, hfc where hf.hyb = h.hyb),
        'n', h.n, 'nf', h.nf, 'no', h.no,
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


revoke execute on function public.gxe_stats(text, boolean) from public, anon;
grant execute on function public.gxe_stats(text, boolean) to authenticated;

-- demó másolat újragenerálása ugyanazzal a szöveghelyettesítéssel; a demóban a „saját” a minta-táblák (demo-m*) hibridje
do $$
declare d text;
begin
  select pg_get_functiondef('public.gxe_stats(text, boolean)'::regprocedure) into d;
  d := replace(d, 'public._gxe_rows(', 'public.demo__gxe_rows(');
  d := replace(d, 'FUNCTION public.gxe_stats(', 'FUNCTION public.demo_gxe_stats(');
  d := replace(d, 'public.fields', 'demo.fields');
  d := replace(d, 'public.parts', 'demo.parts');
  d := replace(d, 'public.is_admin()', 'false');
  d := replace(d, 'r.owner = auth.uid()', 'r.field_id like ''demo-m%''');
  d := regexp_replace(d, 'if auth\.uid\(\) is null then raise exception ''not authenticated''; end if;', '', 'g');
  if d ~ 'public\.(fields|parts)|auth\.uid' then raise exception 'unreplaced reference in demo_gxe_stats'; end if;
  execute d;
end $$;
revoke execute on function public.demo_gxe_stats(text, boolean) from public;
grant execute on function public.demo_gxe_stats(text, boolean) to anon, authenticated;
