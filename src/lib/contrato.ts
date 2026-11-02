// Resumen de un contrato: cobertura de viandas, estado de pago y texto para WhatsApp (lógica pura).
import { formatCurrencyAR, formatDateAR, getDayNameFromDate } from '@/lib/business';
import { addDaysISO } from '@/lib/consumo';
import { LUNES_A_VIERNES, contarDiasHabiles, viandasNecesarias } from '@/lib/habiles';
import type { Plan } from '@/types';

/** Días de servicio y viandas necesarias para todo el período del contrato. */
export function necesidadDelContrato(plan: Plan, feriados: Set<string>) {
  const servicio = contarDiasHabiles(plan.fechaInicio, plan.fechaFin, {
    diasFijos: plan.modalidad === 'fijo' ? plan.diasFijos : LUNES_A_VIERNES, feriados, excluidas: plan.fechasExcluidas || [],
  });
  return { servicio, necesarias: viandasNecesarias(servicio.habiles, plan.unidadesPorRetiro || 1) };
}

export interface Cobertura {
  /** Último día de servicio cubierto por las viandas disponibles (nunca después del fin del contrato). */
  hasta: string;
  /** true = las viandas alcanzan para todo el período. */
  alcanza: boolean;
  /** Días de servicio que quedan desde `desde` hasta el fin del contrato. */
  diasRestantes: number;
  /** Viandas que sobrarían al terminar el período si consume todos los días (provisional). */
  sobrantes: number;
  /** Viandas que faltarían para cubrir el período. */
  faltantes: number;
}

/**
 * Hasta cuándo alcanzan las viandas utilizables (compradas + trasladadas + ajustes − consumidas),
 * contando los días de servicio que faltan desde `desde` (el día siguiente al último consumo registrado,
 * o el inicio del contrato). Nunca pasa la fecha de fin del contrato.
 */
export function estimarCobertura(plan: Plan, disponible: number, desde: string, feriados: Set<string>): Cobertura | null {
  if (plan.modalidad !== 'fijo') return null;
  const dias = plan.diasFijos?.length ? plan.diasFijos : LUNES_A_VIERNES;
  const excluidas = new Set(plan.fechasExcluidas || []);
  const porDia = Math.max(plan.unidadesPorRetiro || 1, 1);
  const inicio = desde > plan.fechaInicio ? desde : plan.fechaInicio;
  let quedan = Math.max(disponible, 0);
  let hasta = '';
  let diasRestantes = 0;
  let sinCubrir = 0;
  for (let d = inicio, guard = 0; d <= plan.fechaFin && guard < 3700; d = addDaysISO(d, 1), guard++) {
    const name = getDayNameFromDate(d);
    if (!name || !dias.includes(name) || feriados.has(d) || excluidas.has(d)) continue;
    diasRestantes += 1;
    if (quedan >= porDia) { quedan -= porDia; hasta = d; } else sinCubrir += 1;
  }
  return {
    hasta: hasta || '',
    alcanza: sinCubrir === 0,
    diasRestantes,
    sobrantes: sinCubrir === 0 ? quedan : 0,
    faltantes: sinCubrir * porDia - (sinCubrir > 0 ? quedan : 0),
  };
}

export interface EstadoPago {
  /** Importe del contrato + envío − ajustes en dinero pendientes. */
  aAbonar: number;
  pagado: number;
  pendiente: number;
  estado: 'sin_pagos' | 'parcial' | 'pagado' | 'pagado_de_mas';
}

export function estadoDePago(aAbonar: number, pagos: { monto: number; anulado: boolean }[]): EstadoPago {
  const pagado = pagos.filter(p => !p.anulado).reduce((a, p) => a + (p.monto || 0), 0);
  const pendiente = Math.max(aAbonar - pagado, 0);
  const estado = pagado <= 0 ? 'sin_pagos' : pagado > aAbonar ? 'pagado_de_mas' : pagado === aAbonar ? 'pagado' : 'parcial';
  return { aAbonar, pagado, pendiente, estado };
}

/** Texto para copiar y pegar en WhatsApp. No se envía solo. */
export function resumenWhatsApp(p: {
  nombre: string;
  plan: Plan;
  diasServicio: number;
  necesarias: number;
  envio: number;
  ajustesDinero: number;
  pago: EstadoPago;
}): string {
  const { plan, pago } = p;
  const lineas = [
    `Hola ${p.nombre}! Te paso el resumen de tu plan de Mundo Prana:`,
    '',
    `Período: ${formatDateAR(plan.fechaInicio)} al ${formatDateAR(plan.fechaFin)}`,
    `Días de servicio: ${p.diasServicio} (${plan.unidadesPorRetiro || 1} vianda${(plan.unidadesPorRetiro || 1) > 1 ? 's' : ''} por día) = ${p.necesarias} viandas`,
  ];
  if ((plan.saldoAnteriorAplicado || 0) > 0) lineas.push(`Saldo a favor aplicado: ${plan.saldoAnteriorAplicado} viandas`);
  if ((plan.ajusteManualFavor || 0) > 0) lineas.push(`Viandas a favor por ajustes: ${plan.ajusteManualFavor}`);
  lineas.push(`Viandas nuevas: ${plan.cantidadContratada} x ${formatCurrencyAR(plan.precioUnitario)} = ${formatCurrencyAR(plan.totalCalculado)}`);
  if (p.envio > 0) lineas.push(`Envío: ${formatCurrencyAR(p.envio)}`);
  if (p.ajustesDinero > 0) lineas.push(`Descuentos a favor: -${formatCurrencyAR(p.ajustesDinero)}`);
  if (pago.pagado > 0) lineas.push(`Ya abonado: ${formatCurrencyAR(pago.pagado)}`);
  lineas.push('', `Total a abonar: ${formatCurrencyAR(pago.pendiente)}`);
  return lineas.join('\n');
}
