// Días hábiles de un período y cálculo de viandas a partir de ellos (lógica pura, testeable).
import { calcularTotalContrato, getDayNameFromDate } from '@/lib/business';
import { addDaysISO, resolvePlanForDate } from '@/lib/consumo';
import type { DayOfWeek, Plan } from '@/types';

export const LUNES_A_VIERNES: DayOfWeek[] = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];

export interface DiasHabiles {
  /** Días de retiro del período que quedan después de descontar feriados y excluidos. */
  habiles: number;
  /** Lunes a viernes (o los días del contrato) del período, antes de descontar. */
  diasDelPeriodo: number;
  /** Feriados que caen en un día de retiro del período. */
  feriados: string[];
  /** Días excluidos del cliente que caen en un día de retiro y no son feriado (para no descontarlos dos veces). */
  excluidas: string[];
}

/**
 * Cuenta los días de retiro entre `inicio` y `fin` (ambos incluidos).
 * Un día que es feriado y además está excluido se descuenta una sola vez.
 */
export function contarDiasHabiles(
  inicio: string,
  fin: string,
  opts: { diasFijos?: DayOfWeek[]; feriados: Set<string> | string[]; excluidas?: string[] },
): DiasHabiles {
  const result: DiasHabiles = { habiles: 0, diasDelPeriodo: 0, feriados: [], excluidas: [] };
  if (!inicio || !fin || inicio > fin) return result;
  const dias = opts.diasFijos && opts.diasFijos.length > 0 ? opts.diasFijos : LUNES_A_VIERNES;
  const feriados = opts.feriados instanceof Set ? opts.feriados : new Set(opts.feriados);
  const excluidas = new Set(opts.excluidas || []);
  let d = inicio;
  for (let guard = 0; d <= fin && guard < 3700; guard++, d = addDaysISO(d, 1)) {
    const name = getDayNameFromDate(d);
    if (!name || !dias.includes(name)) continue;
    result.diasDelPeriodo += 1;
    if (feriados.has(d)) result.feriados.push(d);
    else if (excluidas.has(d)) result.excluidas.push(d);
    else result.habiles += 1;
  }
  return result;
}

/** Viandas que necesita el período: días hábiles × viandas por retiro. */
export function viandasNecesarias(habiles: number, unidadesPorRetiro: number): number {
  return Math.max(Math.floor(habiles || 0), 0) * Math.max(Math.floor(unidadesPorRetiro || 1), 1);
}

/** Días hábiles de un contrato fijo con los feriados y exclusiones indicados. */
export function habilesDelContrato(plan: Plan, feriados: Set<string>, excluidas: string[] = plan.fechasExcluidas || []): number {
  return contarDiasHabiles(plan.fechaInicio, plan.fechaFin, { diasFijos: plan.diasFijos, feriados, excluidas }).habiles;
}

export interface RecalculoContrato {
  plan: Plan;
  habilesAntes: number;
  habilesDespues: number;
  cantidadAntes: number;
  cantidadDespues: number;
  totalAntes: number;
  totalDespues: number;
}

/**
 * Propuesta de nuevas cantidades para un contrato ya confirmado cuando cambian sus feriados o exclusiones.
 * Mueve las viandas compradas solo por la diferencia de días hábiles (respeta lo acordado al contratar).
 * Devuelve null si el contrato no es fijo o si el cambio no afecta sus días hábiles.
 */
export function recalcularContrato(
  plan: Plan,
  antes: { feriados: Set<string>; excluidas: string[] },
  despues: { feriados: Set<string>; excluidas: string[] },
): RecalculoContrato | null {
  if (plan.modalidad !== 'fijo') return null;
  const habilesAntes = habilesDelContrato(plan, antes.feriados, antes.excluidas);
  const habilesDespues = habilesDelContrato(plan, despues.feriados, despues.excluidas);
  if (habilesAntes === habilesDespues) return null;
  const unidades = Math.max(plan.unidadesPorRetiro || 1, 1);
  const cantidadAntes = plan.cantidadContratada || 0;
  const cantidadDespues = Math.max(cantidadAntes + (habilesDespues - habilesAntes) * unidades, 0);
  return {
    plan,
    habilesAntes,
    habilesDespues,
    cantidadAntes,
    cantidadDespues,
    totalAntes: plan.totalCalculado,
    totalDespues: calcularTotalContrato(cantidadDespues, plan.precioUnitario),
  };
}

/** El día está excluido para el cliente según el contrato al que corresponde esa fecha. */
export function isExcluidaCliente(plans: Plan[], fecha: string): boolean {
  return !!resolvePlanForDate(plans, fecha)?.fechasExcluidas?.includes(fecha);
}
