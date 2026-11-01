// Lógica pura de consumos y saldos (sin acceso a la base, para poder testearla).
import type { Consumption, ConsumptionStatus, Plan } from '@/types';

// ------------------------------------------------------
// Fechas
// "Hoy" y la hora siempre se calculan en hora de Argentina, sin importar la zona
// horaria del dispositivo. Las fechas de consumo son 'YYYY-MM-DD' sin hora.
// ------------------------------------------------------

export const APP_TIME_ZONE = 'America/Argentina/Buenos_Aires';

/** Convierte un Date armado con año/mes/día locales (sin hora) a 'YYYY-MM-DD'. */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Fecha, hora y minutos de un instante en hora de Argentina. */
export function partsInAR(instant: Date = new Date()): { iso: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
  return { iso: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')), minute: Number(get('minute')) };
}

/** Hoy en Argentina, 'YYYY-MM-DD'. */
export function todayISO(now: Date = new Date()): string {
  return partsInAR(now).iso;
}

/** Suma días a una fecha 'YYYY-MM-DD' (aritmética de calendario, sin zona horaria). */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Suma meses a una fecha 'YYYY-MM-DD' (31/01 + 1 mes = 03/03, igual que Date.setMonth). */
export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  return dt.toISOString().slice(0, 10);
}

/** 'DD/MM/YYYY' de hoy en Argentina. */
export function todayLabelAR(now: Date = new Date()): string {
  return todayISO(now).split('-').reverse().join('/');
}

/** Fecha de un timestamp (ej: created_at) mostrada en hora de Argentina, 'DD/MM/YYYY'. */
export function formatTimestampDateAR(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return todayISO(date).split('-').reverse().join('/');
}

/** Hora 'HH:MM' de un instante en Argentina. */
export function formatTimeAR(instant: Date): string {
  const { hour, minute } = partsInAR(instant);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function parseISODate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Mes en formato 'YYYY-MM'. */
export function capFirst(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

export function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export function monthDays(year: number, month0: number): string[] {
  const last = new Date(year, month0 + 1, 0).getDate();
  return Array.from({ length: last }, (_, i) => toISODate(new Date(year, month0, i + 1)));
}

// ------------------------------------------------------
// Estados
// ------------------------------------------------------

export function isConsumed(status: ConsumptionStatus | string): boolean {
  return status === 'retirado' || status === 'consumido';
}

/** Total consumido de un conjunto de registros del mismo día. null = sin registro. */
export function dayTotal(rows: Consumption[]): number | null {
  if (rows.length === 0) return null;
  return rows.filter(r => isConsumed(r.status)).reduce((acc, r) => acc + (r.cantidad || 0), 0);
}

// ------------------------------------------------------
// Contrato que corresponde a una fecha / a un mes
// ------------------------------------------------------

function byInicio(a: Plan, b: Plan) {
  return a.fechaInicio.localeCompare(b.fechaInicio);
}

/**
 * Contrato al que se imputa un consumo nuevo:
 * 1) el que cubre la fecha, 2) el último que empezó antes, 3) el activo, 4) el primero.
 */
export function resolvePlanForDate(clientPlans: Plan[], fecha: string): Plan | undefined {
  if (clientPlans.length === 0) return undefined;
  const sorted = clientPlans.slice().sort(byInicio);
  const covering = sorted.filter(p => p.fechaInicio <= fecha && fecha <= p.fechaFin);
  if (covering.length > 0) return covering[covering.length - 1];
  const started = sorted.filter(p => p.fechaInicio <= fecha);
  if (started.length > 0) return started[started.length - 1];
  return sorted.find(p => p.activo) || sorted[0];
}

/** Contrato principal de un mes: el de mayor superposición; si no hay, el vigente al fin de mes. */
export function planForMonth(clientPlans: Plan[], year: number, month0: number): Plan | undefined {
  const days = monthDays(year, month0);
  const first = days[0];
  const last = days[days.length - 1];
  let best: Plan | undefined;
  let bestOverlap = 0;
  for (const p of clientPlans.slice().sort(byInicio)) {
    const start = p.fechaInicio > first ? p.fechaInicio : first;
    const end = p.fechaFin < last ? p.fechaFin : last;
    if (start > end) continue;
    const overlap = (parseISODate(end).getTime() - parseISODate(start).getTime()) / 86400000 + 1;
    if (overlap >= bestOverlap) { best = p; bestOverlap = overlap; }
  }
  if (best) return best;
  // Sin superposición: solo el contrato activo que ya había empezado (el cliente sigue consumiendo de él)
  const candidate = resolvePlanForDate(clientPlans, last);
  return candidate && candidate.activo && candidate.fechaInicio <= last ? candidate : undefined;
}

export function getNextPlan(clientPlans: Plan[], plan: Plan): Plan | undefined {
  return clientPlans
    .filter(p => p.id !== plan.id && p.fechaInicio > plan.fechaInicio)
    .sort(byInicio)[0];
}

// ------------------------------------------------------
// Saldos
// ------------------------------------------------------

export interface PlanBalance {
  compradas: number;
  /** Saldo de un contrato anterior aplicado a este. */
  saldoAnteriorAplicado: number;
  ajusteInicial: number;
  consumidas: number;
  /** compradas + aplicado − ajuste − consumidas (puede ser negativo). */
  restante: number;
  /** Lo que ya se trasladó desde este contrato al siguiente. */
  trasladado: number;
  /** Saldo disponible real de este contrato: restante − trasladado. */
  disponible: number;
  /** Viandas consumidas por encima de lo disponible. */
  excedido: number;
  /** Viandas que quedaron sin consumir y todavía no se aplicaron a otro contrato. */
  aFavorSinAplicar: number;
  /** Se trasladó más de lo que realmente sobró (por una corrección posterior). */
  trasladadoDeMas: number;
  cerrado: boolean;
}

export function computePlanBalance(
  plan: Plan,
  clientConsumptions: Consumption[],
  clientPlans: Plan[],
  today: string = todayISO(),
): PlanBalance {
  const compradas = plan.cantidadContratada || 0;
  const saldoAnteriorAplicado = plan.saldoAnteriorAplicado || 0;
  const ajusteInicial = plan.ajusteInicialUsadas || 0;
  const consumidas = clientConsumptions
    .filter(c => c.planId === plan.id && isConsumed(c.status))
    .reduce((acc, c) => acc + (c.cantidad || 0), 0);
  const restante = compradas + saldoAnteriorAplicado - ajusteInicial - consumidas;
  const trasladado = clientPlans
    .filter(p => p.saldoOrigenPlanId === plan.id)
    .reduce((acc, p) => acc + (p.saldoAnteriorAplicado || 0), 0);
  const sobrante = Math.max(restante, 0);
  const cerrado = plan.fechaFin < today || !!getNextPlan(clientPlans, plan);

  return {
    compradas,
    saldoAnteriorAplicado,
    ajusteInicial,
    consumidas,
    restante,
    trasladado,
    disponible: restante - trasladado,
    excedido: restante < 0 ? -restante : 0,
    aFavorSinAplicar: Math.max(sobrante - trasladado, 0),
    trasladadoDeMas: Math.max(trasladado - sobrante, 0),
    cerrado,
  };
}

/** Ejemplo: necesita 20 y tiene 2 a favor → aplica 2 y compra 18. */
export function splitCarryOver(necesita: number, saldoAFavor: number): { aplicar: number; comprar: number } {
  const n = Math.max(Math.floor(necesita || 0), 0);
  const aplicar = Math.min(Math.max(Math.floor(saldoAFavor || 0), 0), n);
  return { aplicar, comprar: n - aplicar };
}

// ------------------------------------------------------
// Guardado de una casilla (total del día)
// ------------------------------------------------------

export interface DailySaveOps {
  insert?: { cantidad: number; status: ConsumptionStatus; notas: string | null };
  update?: { id: string; cantidad: number; status: ConsumptionStatus; notas: string | null };
  deleteIds: string[];
  /** Diferencia de viandas consumidas respecto de lo que había (para puntos). */
  delta: number;
}

function joinNotes(rows: Consumption[]): string | null {
  const notes = Array.from(new Set(rows.map(r => (r.notas || '').trim()).filter(Boolean)));
  return notes.length ? notes.join(' | ') : null;
}

/**
 * Calcula las operaciones para que el día quede con un único registro cuyo total sea `cantidad`.
 * `cantidad = null` quita el registro del día. `notas = undefined` conserva las notas existentes.
 * Es idempotente: aplicar el mismo valor dos veces no genera cambios ni duplicados.
 */
export function planDailySave(
  rows: Consumption[],
  cantidad: number | null,
  notas?: string | null,
): DailySaveOps {
  const prev = dayTotal(rows) ?? 0;

  if (cantidad === null) {
    return { deleteIds: rows.map(r => r.id), delta: -prev };
  }

  if (!Number.isInteger(cantidad) || cantidad < 0) {
    throw new Error('La cantidad debe ser un número entero igual o mayor que cero');
  }

  const status: ConsumptionStatus = cantidad > 0 ? 'retirado' : 'no_retirado';
  const nextNotes = notas === undefined ? joinNotes(rows) : (notas?.trim() || null);

  if (rows.length === 0) {
    return { insert: { cantidad, status, notas: nextNotes }, deleteIds: [], delta: cantidad };
  }

  const sorted = rows.slice().sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  const keep = sorted[0];
  const deleteIds = sorted.slice(1).map(r => r.id);
  const unchanged =
    deleteIds.length === 0 &&
    keep.cantidad === cantidad &&
    isConsumed(keep.status) === isConsumed(status) &&
    (keep.notas || null) === nextNotes;

  return {
    update: unchanged ? undefined : { id: keep.id, cantidad, status, notas: nextNotes },
    deleteIds,
    delta: cantidad - prev,
  };
}
