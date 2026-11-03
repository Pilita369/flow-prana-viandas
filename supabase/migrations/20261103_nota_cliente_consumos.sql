-- Nota de un consumo visible para el cliente (las notas internas siguen en "notas"). Opcional: no cambia registros existentes.
alter table public.consumptions add column if not exists nota_cliente text;
