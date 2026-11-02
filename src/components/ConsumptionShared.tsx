/* eslint-disable react-refresh/only-export-components */
// Piezas comunes de la planilla general y del calendario de la ficha del cliente,
// para que ambas vistas muestren y calculen cada día exactamente igual.
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { getDayNameFromDate } from '@/lib/business';
import { dayTotal, formatTimeAR } from '@/lib/consumo';
import type { CellState } from '@/hooks/useConsumptionSaver';
import type { Consumption, Plan } from '@/types';

export interface DayInfo {
  savedTotal: number | null;
  /** Lo que se muestra: el valor guardándose / con error, o el guardado. */
  shown: number | null;
  future: boolean;
  feriado: boolean;
  excluida: boolean;
  habitualDay: boolean;
  hasNotes: boolean;
  notes: string;
  multiple: boolean;
}

export function describeDay(params: {
  fecha: string;
  rows: Consumption[];
  plan?: Plan;
  feriados: Set<string>;
  today: string;
  pending?: CellState;
}): DayInfo {
  const { fecha, rows, plan, feriados, today, pending } = params;
  const savedTotal = dayTotal(rows);
  const shown = pending && pending.status !== 'saved' ? pending.cantidad : savedTotal;
  const feriado = feriados.has(fecha);
  const excluida = !!plan?.fechasExcluidas?.includes(fecha);
  const dayName = getDayNameFromDate(fecha);
  const habitualDay = plan?.modalidad === 'fijo' && !!dayName && !!plan.diasFijos?.includes(dayName) && !feriado && !excluida
    && plan.fechaInicio <= fecha && fecha <= plan.fechaFin;
  const notes = rows.map(x => x.notas?.trim()).filter(Boolean).join(' | ');
  return {
    savedTotal, shown, future: fecha > today, feriado, excluida, habitualDay,
    hasNotes: !!notes, notes, multiple: rows.length > 1,
  };
}

/**
 * Colores de la casilla, iguales en tema claro y oscuro:
 * sin registro = solo borde; 0 = gris lleno; N viandas = verde con borde verde.
 */
export function dayToneClass(d: DayInfo): string {
  if (d.shown === 0) return 'border-2 border-transparent bg-muted text-foreground';
  if (d.shown !== null && d.shown > 0) return 'border-2 border-primary bg-primary/25 text-foreground font-bold';
  const borde = d.habitualDay && !d.future ? 'border-dashed border-muted-foreground/70' : 'border-border';
  return `border-2 ${borde} text-muted-foreground ${d.excluida || d.feriado ? 'bg-warning/10' : ''}`;
}

/** Marca del día actual: contorno ámbar, distinto del verde de "con consumo". */
export const TODAY_CLASS = 'outline outline-[3px] outline-secondary outline-offset-2';

export function dayStatusClass(st?: CellState): string {
  if (st?.status === 'saving') return 'animate-pulse';
  if (st?.status === 'saved') return 'ring-2 ring-[hsl(var(--success))]';
  if (st?.status === 'error') return 'ring-2 ring-destructive';
  return '';
}

/** Marcas de la casilla: feriado/excluida, notas o varios registros, error. */
export function DayMarks({ d, st }: { d: DayInfo; st?: CellState }) {
  return (
    <>
      {(d.excluida || d.feriado) && <span className="absolute bottom-1 left-1 w-2 h-2 rounded-full bg-warning" />}
      {(d.hasNotes || d.multiple) && <span className="absolute top-0 right-0 w-0 h-0 border-t-[9px] border-l-[9px] border-t-secondary border-l-transparent rounded-tr-md" />}
      {st?.status === 'error' && <AlertCircle className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 text-destructive bg-card rounded-full" />}
    </>
  );
}

export function dayTitle(d: DayInfo, rowsCount: number): string | undefined {
  return [
    d.feriado && 'Feriado', d.excluida && 'Fecha excluida', rowsCount > 1 && `${rowsCount} registros`, d.hasNotes && d.notes,
  ].filter(Boolean).join(' · ') || undefined;
}

export function SaveIndicator({ saving, errors, lastSavedAt, onRetryAll }: { saving: number; errors: number; lastSavedAt: Date | null; onRetryAll: () => void }) {
  if (errors > 0) {
    return (
      <button onClick={onRetryAll} className="inline-flex items-center gap-1.5 text-sm text-destructive rounded-full border border-destructive/40 bg-destructive/5 px-3 py-1.5">
        <AlertCircle className="w-4 h-4" />{errors} sin guardar · Reintentar
      </button>
    );
  }
  if (saving > 0) {
    return <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Guardando…</span>;
  }
  if (lastSavedAt) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <Check className="w-4 h-4 text-[hsl(var(--success))]" />Guardado {formatTimeAR(lastSavedAt)}
      </span>
    );
  }
  return null;
}

export function ConsumptionLegend({ keyboardHint = true }: { keyboardHint?: boolean }) {
  const item = (box: React.ReactNode, label: string) => (
    <span className="inline-flex items-center gap-2">{box}<span>{label}</span></span>
  );
  const box = 'relative inline-flex h-7 w-7 items-center justify-center rounded-md text-sm tabular-nums';
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground mb-3">
      {item(<span className={`${box} border-2 border-border`}>–</span>, 'Sin registro')}
      {item(<span className={`${box} bg-muted text-foreground`}>0</span>, 'Sin consumo')}
      {item(<span className={`${box} border-2 border-primary bg-primary/25 text-foreground font-bold`}>2</span>, 'Con consumo')}
      {item(<span className={`${box} border-2 border-border ${TODAY_CLASS}`} />, 'Hoy')}
      {item(<span className={`${box} border-2 border-dashed border-muted-foreground/70`} />, 'Día habitual sin registro')}
      {item(<span className={`${box} border-2 border-border bg-warning/10`}><span className="absolute bottom-1 left-1 w-2 h-2 rounded-full bg-warning" /></span>, 'Feriado o fecha excluida')}
      {keyboardHint && <span className="hidden md:inline">Con el teclado: número para guardar, Supr para quitar, flechas para moverte.</span>}
    </div>
  );
}
