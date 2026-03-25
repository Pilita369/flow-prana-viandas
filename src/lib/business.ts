// src/lib/business.ts
// ======================================================
// CONFIGURACIÓN GENERAL DEL NEGOCIO
// Por ahora queda en localStorage.
// Más adelante lo migramos a Supabase.
// ======================================================

import type { DayOfWeek, DeliveryType } from '@/types';

export interface BusinessConfig {
  precioBaseRetiro: number;
  precioBaseEnvio: number;
  whatsappNegocio: string;
  feriados: string[]; // formato YYYY-MM-DD
}

const DEFAULT_CONFIG: BusinessConfig = {
  precioBaseRetiro: 4500,
  precioBaseEnvio: 5200,
  whatsappNegocio: '542006060776',
  feriados: ['2026-03-23', '2026-03-24'],
};

export function getBusinessConfig(): BusinessConfig {
  const raw = localStorage.getItem('mp_business_config');

  if (!raw) {
    localStorage.setItem('mp_business_config', JSON.stringify(DEFAULT_CONFIG));
    return DEFAULT_CONFIG;
  }

  try {
    return JSON.parse(raw) as BusinessConfig;
  } catch {
    localStorage.setItem('mp_business_config', JSON.stringify(DEFAULT_CONFIG));
    return DEFAULT_CONFIG;
  }
}

export function saveBusinessConfig(config: BusinessConfig): void {
  localStorage.setItem('mp_business_config', JSON.stringify(config));
}

export function addHoliday(date: string): void {
  const config = getBusinessConfig();

  if (!config.feriados.includes(date)) {
    config.feriados.push(date);
    config.feriados.sort();
    saveBusinessConfig(config);
  }
}

export function removeHoliday(date: string): void {
  const config = getBusinessConfig();
  config.feriados = config.feriados.filter((d) => d !== date);
  saveBusinessConfig(config);
}

// ======================================================
// HELPERS DE FECHAS
// ======================================================

function toDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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
// CÁLCULO AUTOMÁTICO DE FECHA FIN
// ======================================================
// Solo para plan fijo:
// - cuenta únicamente días elegidos
// - saltea fines de semana
// - saltea feriados
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

  // Seguridad para no quedar en un while infinito
  let guard = 0;

  while (consumosContados < cantidadContratada && guard < 1500) {
    const currentStr = formatDate(current);
    const dayName = getDayNameFromDate(currentStr);

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
// PRECIOS SUGERIDOS SEGÚN ENTREGA
// ======================================================

export function getSuggestedPrice(tipoEntrega: DeliveryType): number {
  const config = getBusinessConfig();
  return tipoEntrega === 'envio' ? config.precioBaseEnvio : config.precioBaseRetiro;
}