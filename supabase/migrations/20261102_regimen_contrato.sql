-- Regímenes especiales por contrato. Solo agrega columnas opcionales: los contratos existentes
-- quedan sin régimen (= servicio en todo el período, como hasta ahora).
alter table public.plans
  add column if not exists regimen text check (regimen in ('periodo', 'intervalos', 'manual')),
  add column if not exists intervalos jsonb,              -- [{ "desde": "YYYY-MM-DD", "hasta": "YYYY-MM-DD" }, ...]
  add column if not exists cantidad_solicitada integer check (cantidad_solicitada >= 0); -- total de viandas pedido (incluye créditos)
