// Días hábiles de un período y cálculo de viandas a partir de ellos (lógica pura, testeable).
import { calcularTotalContrato, getDayNameFromDate } from '@/lib/business';
import { addDaysISO, planForMonth, resolvePlanForDate } from '@/lib/consumo';
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

/** Último día de un mes 'YYYY-MM'. */
export function ultimoDiaDelMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${mes}-${String(last).padStart(2, '0')}`;
}

/**
 * Fechas propuestas para contratar el mes seleccionado:
 * desde el 1 del mes (o el día siguiente al fin del contrato vigente, si es posterior) hasta el último día del mes.
 */
export function fechasPropuestas(mes: string, contratoVigente?: Plan | null): { inicio: string; fin: string } {
  let inicio = `${mes}-01`;
  if (contratoVigente?.fechaFin) {
    const siguiente = addDaysISO(contratoVigente.fechaFin, 1);
    if (siguiente > inicio) inicio = siguiente;
  }
  let fin = ultimoDiaDelMes(mes);
  if (fin < inicio) fin = ultimoDiaDelMes(inicio.slice(0, 7));
  return { inicio, fin };
}

export interface PropuestaContrato {
  servicio: DiasHabiles;
  necesarias: number;
  /** Máximo de saldo a favor que se puede aplicar (no más que lo disponible ni que lo necesario). */
  maxAplicar: number;
  aplicar: number;
  ajustes: number;
  comprar: number;
  importe: number;
}

/**
 * Propuesta de contratación para un período. Solo calcula: no guarda nada.
 * necesarias = días de servicio × viandas por día (o la cantidad escrita a mano);
 * comprar = necesarias − saldo aplicado − ajustes pendientes que se suman.
 */
export function calcularPropuesta(i: {
  inicio: string;
  fin: string;
  diasFijos?: DayOfWeek[];
  unidadesPorRetiro: number;
  precioUnitario: number;
  feriados: Set<string>;
  excluidas: string[];
  saldoDisponible: number;
  /** null = aplicar todo lo posible. */
  aplicarElegido: number | null;
  ajustesPendientes: number;
  /** null = calcular por días de servicio. */
  necesariasManual: number | null;
}): PropuestaContrato {
  const servicio = contarDiasHabiles(i.inicio, i.fin, { diasFijos: i.diasFijos, feriados: i.feriados, excluidas: i.excluidas });
  const necesarias = i.necesariasManual !== null ? Math.max(Math.floor(i.necesariasManual || 0), 0) : viandasNecesarias(servicio.habiles, i.unidadesPorRetiro);
  const maxAplicar = Math.max(Math.min(Math.floor(i.saldoDisponible || 0), necesarias), 0);
  const aplicar = i.aplicarElegido === null ? maxAplicar : Math.min(Math.max(Math.floor(i.aplicarElegido || 0), 0), maxAplicar);
  const ajustes = Math.max(Math.floor(i.ajustesPendientes || 0), 0);
  const comprar = Math.max(necesarias - aplicar - ajustes, 0);
  return { servicio, necesarias, maxAplicar, aplicar, ajustes, comprar, importe: calcularTotalContrato(comprar, i.precioUnitario) };
}

/** Días excluidos del cliente dentro de un período (según el contrato al que corresponde cada fecha). */
export function excluidasEnPeriodo(plans: Plan[], inicio: string, fin: string): string[] {
  if (!inicio || !fin || inicio > fin) return [];
  const fechas = new Set(plans.flatMap(p => p.fechasExcluidas || []));
  return Array.from(fechas).filter(d => d >= inicio && d <= fin && isExcluidaCliente(plans, d)).sort();
}

/** Contratos que tienen al menos un día dentro del mes 'YYYY-MM', ordenados por inicio. */
export function contratosDelMes(plans: Plan[], mes: string): Plan[] {
  const desde = `${mes}-01`;
  const hasta = ultimoDiaDelMes(mes);
  return plans
    .filter(p => p.fechaInicio <= hasta && p.fechaFin >= desde)
    .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
}

/**
 * Contrato que se muestra para un mes: el que cubre hoy (si el mes es el actual),
 * si no el de mayor superposición con el mes; si ninguno lo toca, el vigente que ya había empezado.
 */
export function contratoDelPeriodo(plans: Plan[], mes: string, today: string): Plan | undefined {
  const delMes = contratosDelMes(plans, mes);
  if (delMes.length === 0) {
    const vigente = plans.find(p => p.activo);
    return vigente && vigente.fechaInicio <= ultimoDiaDelMes(mes) ? vigente : undefined;
  }
  if (today.slice(0, 7) === mes) {
    const hoy = delMes.filter(p => p.fechaInicio <= today && today <= p.fechaFin);
    if (hoy.length > 0) return hoy[hoy.length - 1];
  }
  const [y, m] = mes.split('-').map(Number);
  return planForMonth(delMes, y, m - 1) || delMes[delMes.length - 1];
}
