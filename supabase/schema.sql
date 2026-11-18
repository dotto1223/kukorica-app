-- =====================================================================
-- Táblatörténet – Supabase adatbázis (1. ütem)
-- Futtatás: Supabase → SQL Editor → New query → bemásol → Run
-- Többször is futtatható (idempotens).
-- =====================================================================

-- ---------- Profilok ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  farm_name text,
  phone text,
  role text not null default 'farmer' check (role in ('farmer','admin')),
  consent_version text,
  consent_at timestamptz,
  research_consent boolean not null default false,   -- anonim statisztikába / kutatásba bevonható
  created_at timestamptz not null default now()
);

-- új felhasználónál automatikusan profil
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id,email,full_name,farm_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name',''), coalesce(new.raw_user_meta_data->>'farm_name',''))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------- Táblák ----------
create table if not exists public.fields (
  id text primary key,                       -- az app saját azonosítója
  owner uuid not null references auth.users(id) on delete cascade default auth.uid(),
  code text unique,                          -- pl. SOLT-0012 (automatikus)
  nickname text,                             -- termelő által adott név
  settlement text,                           -- település
  county text,
  hrsz text,                                 -- helyrajzi szám (kézi)
  area_ha numeric,
  lat double precision,
  lng double precision,
  data jsonb not null,                       -- a teljes tábla (évek, műveletek, talaj…)
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  deleted_at timestamptz
);
create index if not exists fields_owner_idx on public.fields(owner);
create index if not exists fields_settlement_idx on public.fields(settlement);

-- ---------- Évenkénti részek (statisztikához laposítva) ----------
create table if not exists public.parts (
  field_id text not null references public.fields(id) on delete cascade,
  owner uuid not null references auth.users(id) on delete cascade default auth.uid(),
  year int not null,
  part_id text not null,
  label text,
  area_ha numeric,
  crop text,
  hybrid text,
  hybrid_norm text,                          -- egységesített hibridnév (pl. DKC5092)
  fao int,
  sowing date,
  density numeric,
  harvest date,
  moisture numeric,
  yield_std numeric,                         -- t/ha szabvány nedvességen
  irrigated boolean,
  n_kg numeric, p_kg numeric, k_kg numeric,
  yield_src text,
  quality_score int,                         -- 0–100, az ellenőrzés eredménye (2. ütem)
  quality_flags jsonb,
  primary key (field_id, year, part_id)
);
create index if not exists parts_crop_year_idx on public.parts(crop, year);
create index if not exists parts_hybrid_idx on public.parts(hybrid_norm);

-- ---------- Táblakódok sorszáma településenként ----------
create table if not exists public.code_counters (prefix text primary key, last int not null default 0);

create or replace function public.next_field_code(p_prefix text) returns text
language plpgsql security definer set search_path = public as $$
declare n int; pfx text := upper(regexp_replace(coalesce(p_prefix,'TABLA'),'[^A-Za-z0-9]','','g'));
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if pfx = '' then pfx := 'TABLA'; end if;
  pfx := left(pfx, 8);
  insert into public.code_counters(prefix,last) values (pfx,1)
    on conflict (prefix) do update set last = public.code_counters.last + 1
    returning last into n;
  return pfx || '-' || lpad(n::text, 4, '0');
end $$;

-- ---------- Napló (ki, mikor, mit) ----------
create table if not exists public.audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid,
  field_id text,
  action text,
  detail jsonb
);
create index if not exists audit_field_idx on public.audit_log(field_id);

create or replace function public.log_field_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log(user_id,field_id,action,detail) values (auth.uid(), new.id, 'létrehozás', jsonb_build_object('code',new.code,'nickname',new.nickname));
  elsif tg_op = 'UPDATE' then
    insert into public.audit_log(user_id,field_id,action,detail) values (auth.uid(), new.id,
      case when new.deleted_at is not null and old.deleted_at is null then 'törlés' else 'módosítás' end,
      jsonb_build_object('area_before',old.area_ha,'area_after',new.area_ha,
        'geometry_changed', (old.data->'geometry') is distinct from (new.data->'geometry'),
        'years', (select jsonb_agg(k) from jsonb_object_keys(coalesce(new.data->'seasons','{}'::jsonb)) k)));
  end if;
  return new;
end $$;
drop trigger if exists fields_audit on public.fields;
create trigger fields_audit after insert or update on public.fields
  for each row execute function public.log_field_change();

-- ---------- Jogosultságok (Row Level Security) ----------
alter table public.profiles enable row level security;
alter table public.fields enable row level security;
alter table public.parts enable row level security;
alter table public.audit_log enable row level security;
alter table public.code_counters enable row level security;

drop policy if exists profiles_sel on public.profiles;
create policy profiles_sel on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_upd on public.profiles;
create policy profiles_upd on public.profiles for update using (id = auth.uid() or public.is_admin());
-- a saját szerepkörét senki ne emelhesse admin-ra
create or replace function public.protect_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- SQL-szerkesztőből (nincs bejelentkezett felhasználó) szabad; appból csak admin módosíthat szerepkört
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then new.role := old.role; end if;
  return new;
end $$;
drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.protect_role();

drop policy if exists fields_sel on public.fields;
create policy fields_sel on public.fields for select using (owner = auth.uid() or public.is_admin());
drop policy if exists fields_ins on public.fields;
create policy fields_ins on public.fields for insert with check (owner = auth.uid() or public.is_admin());
drop policy if exists fields_upd on public.fields;
create policy fields_upd on public.fields for update using (owner = auth.uid() or public.is_admin())
  with check (owner = auth.uid() or public.is_admin());
drop policy if exists fields_del on public.fields;
create policy fields_del on public.fields for delete using (owner = auth.uid() or public.is_admin());

drop policy if exists parts_sel on public.parts;
create policy parts_sel on public.parts for select using (owner = auth.uid() or public.is_admin());
drop policy if exists parts_ins on public.parts;
create policy parts_ins on public.parts for insert with check (owner = auth.uid() or public.is_admin());
drop policy if exists parts_upd on public.parts;
create policy parts_upd on public.parts for update using (owner = auth.uid() or public.is_admin());
drop policy if exists parts_del on public.parts;
create policy parts_del on public.parts for delete using (owner = auth.uid() or public.is_admin());

drop policy if exists audit_sel on public.audit_log;
create policy audit_sel on public.audit_log for select using (
  public.is_admin() or field_id in (select id from public.fields where owner = auth.uid()));
-- code_counters: közvetlenül senki, csak a next_field_code függvényen át

-- ---------- Táblák mentése egy hívásban (tábla + részek) ----------
create or replace function public.save_field(p_field jsonb, p_parts jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare v_owner uuid; v_id text := p_field->>'id';
begin
  select owner into v_owner from public.fields where id = v_id;
  if v_owner is null then v_owner := auth.uid(); end if;
  insert into public.fields(id,owner,code,nickname,settlement,county,hrsz,area_ha,lat,lng,data,updated_at,updated_by,deleted_at)
  values (v_id, v_owner, p_field->>'code', p_field->>'nickname', p_field->>'settlement', p_field->>'county', p_field->>'hrsz',
          (p_field->>'area_ha')::numeric, (p_field->>'lat')::float8, (p_field->>'lng')::float8, p_field->'data', now(), auth.uid(), null)
  on conflict (id) do update set code=excluded.code, nickname=excluded.nickname, settlement=excluded.settlement, county=excluded.county,
     hrsz=excluded.hrsz, area_ha=excluded.area_ha, lat=excluded.lat, lng=excluded.lng, data=excluded.data,
     updated_at=now(), updated_by=auth.uid(), deleted_at=null;
  delete from public.parts where field_id = v_id;
  insert into public.parts(field_id,owner,year,part_id,label,area_ha,crop,hybrid,hybrid_norm,fao,sowing,density,harvest,moisture,yield_std,irrigated,n_kg,p_kg,k_kg,yield_src)
  select v_id, v_owner, (x->>'year')::int, x->>'part_id', x->>'label', nullif(x->>'area_ha','')::numeric, nullif(x->>'crop',''), nullif(x->>'hybrid',''),
         nullif(x->>'hybrid_norm',''), nullif(x->>'fao','')::int, nullif(x->>'sowing','')::date, nullif(x->>'density','')::numeric,
         nullif(x->>'harvest','')::date, nullif(x->>'moisture','')::numeric, nullif(x->>'yield_std','')::numeric,
         (x->>'irrigated')::boolean, nullif(x->>'n_kg','')::numeric, nullif(x->>'p_kg','')::numeric, nullif(x->>'k_kg','')::numeric, nullif(x->>'yield_src','')
  from jsonb_array_elements(coalesce(p_parts,'[]'::jsonb)) x;
  return jsonb_build_object('ok',true,'id',v_id,'updated_at',now());
end $$;

-- ---------- GDPR: saját adatok törlése (fiókkal együtt) ----------
create or replace function public.delete_my_data() returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  delete from public.parts where owner = uid;
  delete from public.audit_log where field_id in (select id from public.fields where owner = uid);
  delete from public.fields where owner = uid;
  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;
  return jsonb_build_object('ok',true);
end $$;

-- ---------- Ébren tartás (ingyenes csomag 1 hét tétlenség után szünetel) ----------
create or replace function public.ping() returns text language sql stable as $$ select 'ok'::text $$;

revoke execute on function public.next_field_code(text) from public, anon;
revoke execute on function public.save_field(jsonb,jsonb) from public, anon;
revoke execute on function public.delete_my_data() from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.log_field_change() from public, anon, authenticated;
revoke execute on function public.protect_role() from public, anon, authenticated;
grant execute on function public.next_field_code(text) to authenticated;
grant execute on function public.save_field(jsonb,jsonb) to authenticated;
grant execute on function public.delete_my_data() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.ping() to anon, authenticated;

-- =====================================================================
-- Admin beállítása (egyszer, miután regisztrált az appban):
--   update public.profiles set role='admin' where email='doagronomi@gmail.com';
-- =====================================================================
