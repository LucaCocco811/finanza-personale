-- Finanza Personale – database su Supabase
-- Stessa struttura dei dati di oggi: un documento JSON per "settings", "prices" e ogni mese ("m-AAAA-MM").
-- Ogni utente vede e modifica solo i propri documenti (Row Level Security).

create table if not exists public.docs (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  id         text        not null check (id ~ '^(settings|prices|m-\d{4}-\d{2}|bk-[\w-]{1,40}|settings-pre-[\w-]{1,20})$'),
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.docs enable row level security;

drop policy if exists "leggo i miei documenti" on public.docs;
create policy "leggo i miei documenti" on public.docs
  for select using (auth.uid() = user_id);

drop policy if exists "creo i miei documenti" on public.docs;
create policy "creo i miei documenti" on public.docs
  for insert with check (auth.uid() = user_id);

drop policy if exists "modifico i miei documenti" on public.docs;
create policy "modifico i miei documenti" on public.docs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "cancello i miei documenti" on public.docs;
create policy "cancello i miei documenti" on public.docs
  for delete using (auth.uid() = user_id);

-- data di modifica aggiornata da sola
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before update on public.docs
  for each row execute function public.touch_updated_at();

-- aggiornamento in tempo reale tra telefono e PC
alter table public.docs replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;

-- Prezzi di mercato condivisi (fondi, ETF, crypto): li scrive solo l'aggiornamento automatico
-- su Cloudflare (con la chiave di servizio), tutti gli utenti connessi li possono leggere.
create table if not exists public.market_prices (
  key        text        primary key,          -- ISIN (es. LU0168343274) o simbolo crypto (es. BTC)
  price      numeric     not null,
  currency   text        not null default 'EUR',
  price_date date        not null,
  source     text,
  updated_at timestamptz not null default now()
);

alter table public.market_prices enable row level security;

drop policy if exists "prezzi leggibili da chi è connesso" on public.market_prices;
create policy "prezzi leggibili da chi è connesso" on public.market_prices
  for select to authenticated using (true);
