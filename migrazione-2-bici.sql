-- =====================================================================
--  MIGRAZIONE — aggiunge 2 bici per bambini
--     id 11 = "Baby Kids"
--     id 12 = "Kids"
--  Esegui UNA VOLTA in: Supabase -> SQL Editor -> New query -> Run
--  I dati esistenti NON vengono toccati.
-- =====================================================================

alter table public.rentals drop constraint if exists rentals_bike_check;
alter table public.rentals add constraint rentals_bike_check check (bike between 1 and 12);
