-- Járás oszlop (a kliens tölti a KSH Helységnévtár alapján: public/settlements.json),
-- save_field kiegészítése, get_stats járás-szinttel, admin_quality (csak admin).
-- A pontos, élesen futó definíciók: select pg_get_functiondef('public.get_stats(boolean)'::regprocedure) stb.
alter table public.fields add column if not exists district text;
-- (a függvények teljes szövege a Supabase migrációs előzményében: district_and_quality)
