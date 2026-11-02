-- Respaldo de registros antes de correcciones manuales, y feriados compartidos entre dispositivos.
-- Solo agrega tablas nuevas: no modifica ni borra datos existentes.

create table if not exists public.respaldos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  motivo text not null,
  tabla text not null,
  registro_id text,
  datos jsonb not null
);

-- Feriados del negocio (valen para todos los clientes). Antes se guardaban solo en cada navegador.
create table if not exists public.feriados (
  fecha date primary key,
  descripcion text,
  created_at timestamptz not null default now()
);
