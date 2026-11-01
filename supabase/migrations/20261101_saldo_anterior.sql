-- Saldo a favor trasladado entre contratos (aditivo, no modifica datos existentes)
alter table public.plans
  add column if not exists saldo_anterior_aplicado integer not null default 0,
  add column if not exists saldo_origen_plan_id uuid null references public.plans(id) on delete set null;

-- Consultas de la planilla mensual por cliente y fecha
create index if not exists consumptions_client_fecha_idx on public.consumptions (client_id, fecha);
