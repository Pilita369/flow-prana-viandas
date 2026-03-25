// src/lib/business.ts
// ======================================================
// CONFIGURACIÓN GENERAL DEL NEGOCIO — MUNDO PRANA
// Los datos se guardan en localStorage.
// ======================================================

import type { DayOfWeek, DeliveryType } from '@/types';

export interface BusinessConfig {
  precioBaseRetiro: number;
  precioBaseEnvio: number;
  whatsappNegocio: string;
  feriados: string[]; // formato YYYY-MM-DD
}

// ======================================================
// FERIADOS NACIONALES ARGENTINA 2025 Y 2026
// Incluidos automáticamente — no hace falta cargarlos a mano.
// Fuente: Decreto PEN Argentina (actualizados a enero 2026).
// ======================================================
export const FERIADOS_ARGENTINA: string[] = [
  // --- 2025 ---
  '2025-01-01', // Año Nuevo
  '2025-03-03', // Carnaval
  '2025-03-04', // Carnaval
  '2025-03-24', // Día de la Memoria
  '2025-04-02', // Día del Veterano y los Caídos en Malvinas
  '2025-04-17', // Jueves Santo
  '2025-04-18', // Viernes Santo
  '2025-05-01', // Día del Trabajador
  '2025-05-25', // Revolución de Mayo
  '2025-06-16', // Paso a la Inmortalidad del Gral. Belgrano
  '2025-07-09', // Día de la Independencia
  '2025-08-17', // Paso a la Inmortalidad del Gral. San Martín
  '2025-10-12', // Día del Respeto a la Diversidad Cultural
  '2025-11-20', // Día de la Soberanía Nacional
  '2025-12-08', // Inmaculada Concepción
  '2025-12-25', // Navidad

  // --- 2026 ---
  '2026-01-01', // Año Nuevo
  '2026-02-16', // Carnaval
  '2026-02-17', // Carnaval
  '2026-03-23', // Día de la Memoria (lunes trasladado)
  '2026-03-24', // Día de la Memoria
  '2026-04-02', // Día del Veterano y los Caídos en Malvinas
  '2026-04-02', // Jueves Santo (coincide)
  '2026-04-03', // Viernes Santo
  '2026-05-01', // Día del Trabajador
  '2026-05-25', // Revolución de Mayo
  '2026-06-15', // Paso a la Inmortalidad del Gral. Belgrano (lunes trasladado)
  '2026-07-09', // Día de la Independencia
  '2026-08-17', // Paso a la Inmortalidad del Gral. San Martín
  '2026-10-12', // Día del Respeto a la Diversidad Cultural
  '2026-11-23', // Día de la Soberanía Nacional (lunes trasladado)
  '2026-12-08', // Inmaculada Concepción
  '2026-12-25', // Navidad
];

// ======================================================
// CONFIG POR DEFECTO
// Incluye los feriados nacionales automáticamente.
// ======================================================
const DEFAULT_CONFIG: BusinessConfig = {
  precioBaseRetiro: 4500,
  precioBaseEnvio: 5200,
  whatsappNegocio: '542006060776',
  feriados: FERIADOS_ARGENTINA,
};

// ======================================================
// LEER Y GUARDAR LA CONFIG EN LOCALSTORAGE
// ======================================================

export function getBusinessConfig(): BusinessConfig {
  const raw = localStorage.getItem('mp_business_config');

  if (!raw) {
    // Primera vez: guardar la config con feriados completos
    localStorage.setItem('mp_business_config', JSON.stringify(DEFAULT_CONFIG));
    return DEFAULT_CONFIG;
  }

  try {
    const saved = JSON.parse(raw) as BusinessConfig;

    // Si los feriados guardados tienen menos que los nacionales,
    // significa que es una instalación vieja → actualizamos automáticamente
    // sin perder feriados extra que el admin haya agregado manualmente.
    const feriadosNacionales = new Set(FERIADOS_ARGENTINA);
    const feriadosGuardados = new Set(saved.feriados);

    // Unir los nacionales + los que el admin haya agregado a mano
    const feriadosMergeados = Array.from(
      new Set([...FERIADOS_ARGENTINA, ...saved.feriados])
    ).sort();

    const configActualizada: BusinessConfig = {
      ...saved,
      feriados: feriadosMergeados,
    };

    return configActualizada;
  } catch {
    localStorage.setItem('mp_business_config', JSON.stringify(DEFAULT_CONFIG));
    return DEFAULT_CONFIG;
  }
}

export function saveBusinessConfig(config: BusinessConfig): void {
  localStorage.setItem('mp_business_config', JSON.stringify(config));
}

// Agregar un feriado extra (por ejemplo, feriado provincial o puente)
export function addHoliday(date: string): void {
  const config = getBusinessConfig();

  if (!config.feriados.includes(date)) {
    config.feriados.push(date);
    config.feriados.sort();
    saveBusinessConfig(config);
  }
}

// Eliminar un feriado (solo los agregados manualmente;
// los nacionales se vuelven a cargar igual si se recarga la app)
export function removeHoliday(date: string): void {
  const config = getBusinessConfig();
  config.feriados = config.feriados.filter((d) => d !== date);
  saveBusinessConfig(config);
}

// ======================================================
// HELPERS DE FECHAS
// ======================================================

// Convierte "2026-03-15" a Date sin problemas de zona horaria
function toDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Formatea un Date a "2026-03-15"
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Devuelve el nombre del día de la semana para una fecha
export function getDayNameFromDate(dateStr: string): DayOfWeek | null {
  const date = toDateOnly(dateStr);
  const day = date.getDay();

  const map: Record<number, DayOfWeek> = {
    1: 'lunes',
    2: 'martes',
    3: 'miercoles',
    4: 'jueves',
    5: 'viernes',
  };

  return map[day] || null;
}

export function isWeekend(dateStr: string): boolean {
  const date = toDateOnly(dateStr);
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function isHoliday(dateStr: string): boolean {
  const config = getBusinessConfig();
  return config.feriados.includes(dateStr);
}

export function isBusinessDay(dateStr: string): boolean {
  return !isWeekend(dateStr) && !isHoliday(dateStr);
}

// ======================================================
// CÁLCULO AUTOMÁTICO DE FECHA FIN (plan fijo)
// ======================================================
// Cuenta solo los días elegidos por el cliente,
// saltea fines de semana y feriados nacionales.
// Ejemplo: 38 viandas, lunes a viernes → calcula
// automáticamente cuándo se termina el plan.
// ======================================================

export function calculateFixedPlanEndDate(
  fechaInicio: string,
  cantidadContratada: number,
  diasFijos: DayOfWeek[]
): string {
  if (!fechaInicio || cantidadContratada <= 0 || diasFijos.length === 0) {
    return '';
  }

  let current = toDateOnly(fechaInicio);
  let consumosContados = 0;
  let ultimaFechaValida = fechaInicio;

  // Límite de seguridad para no hacer un loop infinito
  let guard = 0;

  while (consumosContados < cantidadContratada && guard < 2000) {
    const currentStr = formatDate(current);
    const dayName = getDayNameFromDate(currentStr);

    // Solo cuenta si es un día elegido Y no es feriado
    if (dayName && diasFijos.includes(dayName) && !isHoliday(currentStr)) {
      consumosContados += 1;
      ultimaFechaValida = currentStr;
    }

    current.setDate(current.getDate() + 1);
    guard += 1;
  }

  return ultimaFechaValida;
}

// ======================================================
// CÁLCULO DE TOTAL A ABONAR
// ======================================================
// Multiplica la cantidad contratada por el precio unitario.
// Útil para mostrar el total sugerido en el formulario.
// ======================================================

export function calcularTotalSugerido(
  cantidadContratada: number,
  precioUnitario: number
): number {
  if (cantidadContratada <= 0 || precioUnitario <= 0) return 0;
  return cantidadContratada * precioUnitario;
}

// Formatea un número como moneda argentina: $ 38.000
export function formatCurrencyAR(value: number): string {
  return '$ ' + value.toLocaleString('es-AR');
}

// ======================================================
// PRECIOS SUGERIDOS SEGÚN TIPO DE ENTREGA
// ======================================================

export function getSuggestedPrice(tipoEntrega: DeliveryType): number {
  const config = getBusinessConfig();
  return tipoEntrega === 'envio' ? config.precioBaseEnvio : config.precioBaseRetiro;
}