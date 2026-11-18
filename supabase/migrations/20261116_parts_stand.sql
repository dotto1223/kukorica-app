-- Kelt tőszám (tő/ha) a parts táblában; save_field kiegészítve a 'stand' mezővel.
alter table public.parts add column if not exists stand numeric;
-- (a save_field teljes szövege a Supabase migrációs előzményében: parts_stand_count)
alter table public.parts add column if not exists density_unit text; -- save_field kiegészítve (migráció: parts_density_unit)
