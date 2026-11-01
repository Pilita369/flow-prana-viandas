-- Ajustes y saldos a favor: antes se guardaban solo en el navegador (localStorage 'mp_credit_notes').
-- Tabla nueva; no modifica datos existentes.
-- legacy_id guarda el id que tenía el ajuste en el navegador, para que la copia
-- desde cualquier dispositivo no genere duplicados (unique + upsert ignorando conflictos).
create table if not exists public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  client_id uuid not null references public.clients(id) on delete cascade,
  tipo text not null,
  descripcion text not null,
  monto numeric null,
  cantidad integer null,
  fecha timestamptz not null default now(),
  aplicado boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists credit_notes_client_idx on public.credit_notes (client_id);

-- Mismo esquema de acceso que clients/plans/consumptions (la app usa la clave pública sin login).
alter table public.credit_notes disable row level security;
grant select, insert, update, delete on public.credit_notes to anon, authenticated;
