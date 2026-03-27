import type { DayOfWeek, DeliveryType, Plan } from '@/types';

export interface BusinessConfig {
  precioBaseRetiro: number;
  precioBaseEnvio: number;
  whatsappNegocio: string;
  feriados: string[];
}

// Lista base de feriados 2026 — SIN 23/3 ni 24/3
// Podés editarlos desde el panel admin en Configuración
export const FERIADOS_ARGENTINA_2026: string[] = [
  '2026-01-01',
  '2026-02-16',
  '2026-02-17',
  '2026-04-02',
  '2026-04-03',
  '2026-05-01',
  '2026-05-25',
  '2026-06-15',
  '2026-07-09',
  '2026-08-17',
  '2026-10-12',
  '2026-11-23',
  '2026-12-08',
  '2026-12-25',
];

const DEFAULT_CONFIG: BusinessConfig = {
  precioBaseRetiro: 4500,
  precioBaseEnvio: 5200,
  whatsappNegocio: '542006060776',
  feriados: FERIADOS_ARGENTINA_2026,
};

export function getBusinessConfig(): BusinessConfig {
  const raw = localStorage.getItem('mp_business_config');
  if (!raw) {
    localStorage.setItem('mp_business_config', JSON.stringify(DEFAULT_CONFIG));
    return DEFAULT_CONFIG;
  }
  try {
    const parsed = JSON.parse(raw) as BusinessConfig;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      // Usamos exactamente los feriados guardados, sin forzar ninguno
      feriados: Array.isArray(parsed.feriados) ? parsed.feriados : FERIADOS_ARGENTINA_2026,
    };
  } catch {
    localStorage.setItem('mp_business_config', JSON.stringify(DEFAULT_CONFIG));
    return DEFAULT_CONFIG;
  }
}

export function saveBusinessConfig(config: BusinessConfig): void {
  localStorage.setItem('mp_business_config', JSON.stringify(config));
}

export function formatDateAR(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export function formatCurrencyAR(value?: number | null): string {
  const safeValue = Number(value ?? 0);
  return '$ ' + safeValue.toLocaleString('es-AR');
}

export function calcularTotalContrato(cantidadContratada: number, precioUnitario: number): number {
  return Number(cantidadContratada || 0) * Number(precioUnitario || 0);
}

export function getSuggestedPrice(tipoEntrega: DeliveryType): number {
  const config = getBusinessConfig();
  return tipoEntrega === 'envio' ? config.precioBaseEnvio : config.precioBaseRetiro;
}

function toDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDayNameFromDate(dateStr: string): DayOfWeek | null {
  const date = toDateOnly(dateStr);
  const day = date.getDay();
  const map: Record<number, DayOfWeek> = { 1: 'lunes', 2: 'martes', 3: 'miercoles', 4: 'jueves', 5: 'viernes' };
  return map[day] || null;
}

export function isHoliday(dateStr: string): boolean {
  const config = getBusinessConfig();
  return config.feriados.includes(dateStr);
}

export function isExcludedForClient(dateStr: string, fechasExcluidas?: string[]): boolean {
  return !!fechasExcluidas?.includes(dateStr);
}

export function calcularDiasContratadosEstimados(cantidadContratada: number, unidadesPorRetiro: number): number {
  const cantidad = Number(cantidadContratada || 0);
  const porRetiro = Number(unidadesPorRetiro || 1);
  if (cantidad <= 0 || porRetiro <= 0) return 0;
  return Math.ceil(cantidad / porRetiro);
}

export function calculateFixedPlanEstimatedEndDate(
  fechaInicio: string,
  diasContratados: number,
  diasFijos: DayOfWeek[],
  fechasExcluidas: string[] = []
): string {
  if (!fechaInicio || diasContratados <= 0 || diasFijos.length === 0) return '';

  let current = toDateOnly(fechaInicio);
  let diasContados = 0;
  let ultimaFechaValida = fechaInicio;
  let guard = 0;

  while (diasContados < diasContratados && guard < 2000) {
    const currentStr = formatDateISO(current);
    const dayName = getDayNameFromDate(currentStr);
    const cuenta = !!dayName && diasFijos.includes(dayName) && !isHoliday(currentStr) && !isExcludedForClient(currentStr, fechasExcluidas);
    if (cuenta) { diasContados += 1; ultimaFechaValida = currentStr; }
    current.setDate(current.getDate() + 1);
    guard += 1;
  }

  return ultimaFechaValida;
}

export function getDiasEstimadosFromPlan(plan?: Plan | null): number {
  if (!plan) return 0;
  return calcularDiasContratadosEstimados(plan.cantidadContratada, plan.unidadesPorRetiro || 1);
}