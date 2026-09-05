-- =====================================================================
--  NOLEGGIO BICI — schema database Supabase
--  Esegui tutto questo blocco in: Supabase -> SQL Editor -> New query -> Run
-- =====================================================================

-- Estensione per generare gli id (di solito già attiva su Supabase)
create extension if not exists "pgcrypto";

-- Tabella unica: ogni riga è un noleggio.
--   end_at NULL  -> noleggio in corso (bici fuori)
--   end_at valorizzato -> noleggio concluso (storico)
create table if not exists public.rentals (
  id         uuid primary key default gen_random_uuid(),
  bike       smallint    not null check (bike between 1 and 10),
  room       text        not null,
  start_at   timestamptz not null default now(),
  end_at     timestamptz,
  damaged    boolean     not null default false,
  note       text        not null default '',
  created_at timestamptz not null default now()
);

-- Una bici può avere UN SOLO noleggio attivo per volta.
-- Impedisce di noleggiare due volte la stessa bici da dispositivi diversi.
create unique index if not exists rentals_one_active_per_bike
  on public.rentals (bike)
  where end_at is null;

-- Indice per velocizzare il caricamento dello storico
create index if not exists rentals_end_at_idx on public.rentals (end_at);

-- ------------------------------------------------------------------
--  Sicurezza (RLS)
--  Attiviamo RLS e diamo accesso completo alla chiave pubblica "anon".
--  Va bene per uno strumento interno all'hotel. Vedi il README per
--  come proteggerlo ulteriormente in futuro (Supabase Auth).
-- ------------------------------------------------------------------
alter table public.rentals enable row level security;

drop policy if exists "accesso completo anon" on public.rentals;
create policy "accesso completo anon"
  on public.rentals
  for all
  to anon
  using (true)
  with check (true);

-- ------------------------------------------------------------------
--  Realtime: fa aggiornare in automatico tutti i dispositivi aperti.
--  Se dà l'errore "is already member", ignoralo: è già attivo.
-- ------------------------------------------------------------------
alter publication supabase_realtime add table public.rentals;
