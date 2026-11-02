// Resumen de un contrato: cobertura de viandas, estado de pago y texto para WhatsApp (lógica pura).
import { formatCurrencyAR, formatDateAR } from '@/lib/business';
import { LUNES_A_VIERNES, contarEnTramos, tramosDelContrato, viandasNecesarias } from '@/lib/habiles';
import type { Intervalo, Plan } from '@/types';

/**
 * Días de servicio del contrato (en sus tramos o todo el período) y viandas pedidas.
 * - sugeridas: días de servicio × viandas por día.
 * - necesarias: el total pedido (cantidadSolicitada si se cargó; si no, las sugeridas).
 * - creditos: viandas a favor que cubren parte del pedido (saldo trasladado + ajustes).
 * - nuevas: max(0, necesarias − créditos). Si sobra crédito, queda para otro período.
 */
export function necesidadDelContrato(plan: Plan, feriados: Set<string>) {
  const tramos = tramosDelContrato(plan);
  const servicio = contarEnTramos(tramos, {
    diasFijos: plan.modalidad === 'fijo' ? plan.diasFijos : LUNES_A_VIERNES, feriados, excluidas: plan.fechasExcluidas || [],
  });
  const sugeridas = viandasNecesarias(servicio.habiles, plan.unidadesPorRetiro || 1);
  const necesarias = plan.cantidadSolicitada ?? sugeridas;
  const creditos = (plan.saldoAnteriorAplicado || 0) + (plan.ajusteManualFavor || 0);
  return { servicio, tramos, sugeridas, necesarias, creditos, nuevas: Math.max(necesarias - creditos, 0), creditoSobrante: Math.max(creditos - necesarias, 0) };
}

/** Texto de los tramos: "10/11 al 16/11 y 24/11 al 30/11". */
export function textoTramos(tramos: Intervalo[]): string {
  const partes = tramos.map(t => `${formatDateAR(t.desde).slice(0, 5)} al ${formatDateAR(t.hasta).slice(0, 5)}`);
  return partes.length <= 1 ? partes.join('') : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
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
  const porDia = Math.max(plan.unidadesPorRetiro || 1, 1);
  // Solo los días de servicio que faltan (dentro de los tramos, sin feriados ni excluidos)
  const fechas = contarEnTramos(tramosDelContrato(plan), { diasFijos: plan.diasFijos, feriados, excluidas: plan.fechasExcluidas || [] })
    .fechas.filter(d => d >= desde);
  let quedan = Math.max(disponible, 0);
  let hasta = '';
  let diasRestantes = 0;
  let sinCubrir = 0;
  for (const d of fechas) {
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
  ];
  if (plan.regimen === 'intervalos' && (plan.intervalos?.length || 0) > 0) lineas.push(`Fechas de servicio: ${textoTramos(tramosDelContrato(plan))}`);
  lineas.push(plan.regimen === 'manual'
    ? `Viandas pedidas: ${p.necesarias}`
    : `Días de servicio: ${p.diasServicio} (${plan.unidadesPorRetiro || 1} vianda${(plan.unidadesPorRetiro || 1) > 1 ? 's' : ''} por día) = ${p.necesarias} viandas`);
  if ((plan.saldoAnteriorAplicado || 0) > 0) lineas.push(`Saldo a favor aplicado: ${plan.saldoAnteriorAplicado} viandas`);
  if ((plan.ajusteManualFavor || 0) > 0) lineas.push(`Viandas a favor por ajustes: ${plan.ajusteManualFavor}`);
  lineas.push(`Viandas nuevas: ${plan.cantidadContratada} x ${formatCurrencyAR(plan.precioUnitario)} = ${formatCurrencyAR(plan.totalCalculado)}`);
  if (p.envio > 0) lineas.push(`Envío: ${formatCurrencyAR(p.envio)}`);
  if (p.ajustesDinero > 0) lineas.push(`Descuentos a favor: -${formatCurrencyAR(p.ajustesDinero)}`);
  if (pago.pagado > 0) lineas.push(`Ya abonado: ${formatCurrencyAR(pago.pagado)}`);
  lineas.push('', `Total a abonar: ${formatCurrencyAR(pago.pendiente)}`);
  return lineas.join('\n');
}

export interface PropuestaRegimen {
  servicio: ReturnType<typeof contarEnTramos>;
  sugeridas: number;
  /** Total pedido para el período (incluye lo que cubren los créditos). */
  solicitadas: number;
  /** Créditos en viandas que se usan (nunca más que lo pedido). */
  aplicados: number;
  /** Crédito que sobra: queda para otro período. */
  sobrante: number;
  /** Viandas nuevas a pagar = max(0, solicitadas − créditos). */
  nuevas: number;
  importe: number;
}

/**
 * Cálculo de un contrato según su régimen. Los créditos en viandas se descuentan de la cantidad
 * (no además en dinero). `total` = cantidad pedida a mano; null = la calculada por días.
 */
export function propuestaRegimen(i: {
  tramos: Intervalo[];
  diasFijos?: Plan['diasFijos'];
  unidadesPorRetiro: number;
  feriados: Set<string>;
  excluidas: string[];
  total: number | null;
  creditos: number;
  precioUnitario: number;
}): PropuestaRegimen {
  const servicio = contarEnTramos(i.tramos, { diasFijos: i.diasFijos, feriados: i.feriados, excluidas: i.excluidas });
  const sugeridas = viandasNecesarias(servicio.habiles, i.unidadesPorRetiro);
  const solicitadas = i.total === null ? sugeridas : Math.max(Math.floor(i.total || 0), 0);
  const creditos = Math.max(Math.floor(i.creditos || 0), 0);
  const nuevas = Math.max(solicitadas - creditos, 0);
  return {
    servicio, sugeridas, solicitadas,
    aplicados: Math.min(creditos, solicitadas),
    sobrante: Math.max(creditos - solicitadas, 0),
    nuevas,
    importe: nuevas * (Number(i.precioUnitario) || 0),
  };
}

/** Advertencias al cambiar un contrato que ya tiene consumos o pagos. No bloquean: se muestran antes de guardar. */
export function advertenciasCambio(p: {
  tramos: Intervalo[];
  consumosDelContrato: { fecha: string; cantidad: number; status: string }[];
  consumidas: number;
  utilizables: number;
  importe: number;
  pagado: number;
}): string[] {
  const fuera = Array.from(new Set(p.consumosDelContrato
    .filter(c => !p.tramos.some(t => t.desde <= c.fecha && c.fecha <= t.hasta))
    .map(c => c.fecha))).sort();
  const avisos: string[] = [];
  if (fuera.length > 0) avisos.push(`Hay ${fuera.length} día(s) con registros fuera de las fechas elegidas (${fuera.map(d => formatDateAR(d).slice(0, 5)).join(', ')}). Se conservan, pero quedan fuera del servicio programado.`);
  if (p.consumidas > p.utilizables) avisos.push(`Ya se consumieron ${p.consumidas} viandas y con este cambio habría ${p.utilizables} para usar.`);
  if (p.pagado > p.importe) avisos.push(`Los pagos registrados (${formatCurrencyAR(p.pagado)}) superan el nuevo importe (${formatCurrencyAR(p.importe)}).`);
  return avisos;
}
