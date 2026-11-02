-- Pagos de cada contrato de viandas. Tabla nueva: no modifica datos existentes.
-- Los pagos no se borran: se anulan con motivo y quedan en el historial.
create table if not exists public.pagos_contrato (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  fecha date not null,
  monto numeric not null check (monto > 0),
  medio text,
  nota text,
  anulado boolean not null default false,
  anulado_motivo text,
  anulado_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists pagos_contrato_plan_id_idx on public.pagos_contrato(plan_id);
create index if not exists pagos_contrato_client_id_idx on public.pagos_contrato(client_id);
