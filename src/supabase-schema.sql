-- ================================================================
-- WEEKLY DESIGN APP — Schema Supabase
-- Cole este SQL no Editor SQL do seu projeto Supabase
-- ================================================================

-- 1. Tabela de designers
create table if not exists public.designers (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  sort_order  int  not null default 0,
  created_at  timestamptz default now()
);

-- 2. Tabela de clientes
create table if not exists public.clients (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  sort_order  int  not null default 0,
  created_at  timestamptz default now()
);

-- 3. Tabela principal de lançamentos semanais
--    Uma linha por (semana, designer)
--    demands é um array JSON com toda a estrutura de demandas
create table if not exists public.weekly_entries (
  id              bigint generated always as identity primary key,
  week_key        date    not null,          -- ex: 2025-01-06 (segunda-feira da semana)
  designer_name   text    not null,
  demands         jsonb   not null default '[]',
  updated_at      timestamptz default now(),
  constraint weekly_entries_week_designer unique (week_key, designer_name)
);

-- Index para buscas por data
create index if not exists idx_weekly_entries_week_key on public.weekly_entries(week_key);
create index if not exists idx_weekly_entries_designer  on public.weekly_entries(designer_name);

-- Trigger para atualizar updated_at automaticamente
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger weekly_entries_updated_at
  before update on public.weekly_entries
  for each row execute function public.set_updated_at();

-- ================================================================
-- RLS (Row Level Security) — acesso público de leitura e escrita
-- Ajuste conforme necessário se quiser autenticação por usuário
-- ================================================================
alter table public.designers     enable row level security;
alter table public.clients       enable row level security;
alter table public.weekly_entries enable row level security;

-- Políticas: qualquer pessoa autenticada (ou anon) pode ler e escrever
create policy "allow_all_designers"      on public.designers      for all using (true) with check (true);
create policy "allow_all_clients"        on public.clients        for all using (true) with check (true);
create policy "allow_all_weekly_entries" on public.weekly_entries for all using (true) with check (true);

-- ================================================================
-- Dados iniciais (opcional — edite conforme seu time)
-- ================================================================
insert into public.designers (name, sort_order) values
  ('Ana Lima',      0),
  ('Bruno Melo',    1),
  ('Carla Souza',   2),
  ('Diego Nunes',   3),
  ('Elisa Ramos',   4),
  ('Felipe Dias',   5),
  ('Gabi Torres',   6),
  ('Hugo Alves',    7),
  ('Isabela Cunha', 8),
  ('João Freitas',  9),
  ('Marina Costa',  10)
on conflict (name) do nothing;

insert into public.clients (name, sort_order) values
  ('Wosi',     0),
  ('Claro',    1),
  ('Vivo',     2),
  ('Tim',      3),
  ('Oi',       4),
  ('Interno',  5),
  ('Outros',   6)
on conflict (name) do nothing;
