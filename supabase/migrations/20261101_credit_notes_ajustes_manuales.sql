-- Ajustes manuales de viandas a favor: contrato al que suman, anulación e historial.
-- Solo agrega columnas; no modifica filas existentes.
alter table public.credit_notes
  add column if not exists plan_id uuid references public.plans(id) on delete set null,
  add column if not exists anulado boolean not null default false,
  add column if not exists anulado_motivo text,
  add column if not exists anulado_at timestamptz,
  add column if not exists historial jsonb not null default '[]'::jsonb,
  add column if not exists updated_at timestamptz;

create index if not exists credit_notes_plan_id_idx on public.credit_notes(plan_id);
