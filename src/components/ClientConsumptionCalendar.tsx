import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { ChevronLeft, ChevronRight, Table2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent } from '@/components/ui/popover';
import ConsumptionCellEditor from '@/components/ConsumptionCellEditor';
import { ConsumptionLegend, DayMarks, SaveIndicator, dayStatusClass, dayTitle, dayToneClass, describeDay } from '@/components/ConsumptionShared';
import { cellKey, useConsumptionSaver } from '@/hooks/useConsumptionSaver';
import { formatDateAR, getBusinessConfig } from '@/lib/business';
import {
  capFirst, computePlanBalance, isConsumed, monthDays, parseISODate, planForMonth, resolvePlanForDate, todayISO,
} from '@/lib/consumo';
import type { Client, Consumption, Plan } from '@/types';

const WEEKDAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

interface Props {
  client: Client;
  /** Contratos del cliente. */
  plans: Plan[];
  /** Consumos del cliente (los mismos registros que usa la planilla general). */
  consumptions: Consumption[];
  /** Se llama con la lista completa del cliente después de cada guardado confirmado. */
  onConsumptionsChange: (next: Consumption[]) => void;
}

function shiftMonth(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Cuadro mensual editable de un cliente: se toca cada fecha y se elige 0, 1, 2 o más viandas.
 * Guarda con la misma función que la planilla general (total del día, sin duplicar).
 */
export default function ClientConsumptionCalendar({ client, plans, consumptions, onConsumptionsChange }: Props) {
  const today = todayISO();
  const [mes, setMes] = useState(today.slice(0, 7));
  const year = Number(mes.slice(0, 4));
  const month0 = Number(mes.slice(5, 7)) - 1;
  const days = useMemo(() => monthDays(year, month0), [year, month0]);
  const feriados = useMemo(() => new Set(getBusinessConfig().feriados), []);
  const [editing, setEditing] = useState<string | null>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const consRef = useRef(consumptions);
  consRef.current = consumptions;

  const saver = useConsumptionSaver({
    onSaved: ({ fecha, rows, latest, cantidad, planId }) => {
      const next = [...consRef.current.filter(c => c.fecha !== fecha), ...rows]
        .sort((a, b) => b.fecha.localeCompare(a.fecha));
      consRef.current = next;
      onConsumptionsChange(next);
      if (!latest || cantidad === null || cantidad <= 0) return;
      const plan = plans.find(p => p.id === (rows[0]?.planId || planId));
      if (plan) {
        const b = computePlanBalance(plan, next, plans, today);
        if (b.disponible < 0) toast.warning(`Supera el saldo del contrato por ${-b.disponible} vianda(s). No se modificaron pagos ni contratos.`);
      }
    },
    onFailed: ({ fecha }) => toast.error(`No se guardó el ${formatDateAR(fecha)}. Tocá la fecha para reintentar.`),
  });

  const rowsFor = (fecha: string) => consumptions.filter(c => c.fecha === fecha);

  const save = (fecha: string, cantidad: number | null, notas?: string | null) => {
    const existing = consRef.current.filter(c => c.fecha === fecha);
    const planId = existing[0]?.planId || resolvePlanForDate(plans, fecha)?.id;
    if (!planId) { toast.error('El cliente no tiene contrato cargado'); return; }
    saver.save({ clientId: client.id, planId, fecha, cantidad, notas });
  };

  // Resumen del mes
  const plan = planForMonth(plans, year, month0);
  const balance = plan ? computePlanBalance(plan, consumptions, plans, today) : undefined;
  const inMonth = consumptions.filter(c => c.fecha.startsWith(mes));
  const consumidasMes = inMonth.filter(c => isConsumed(c.status)).reduce((a, c) => a + (c.cantidad || 0), 0);

  // Lunes = primera columna
  const leading = (parseISODate(days[0]).getDay() + 6) % 7;
  const monthLabel = capFirst(new Date(year, month0, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }));

  const focusDay = (index: number) => {
    if (index < 0 || index >= days.length) return;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${index}"]`)?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number, fecha: string, savedTotal: number | null, hasNotes: boolean) => {
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); save(fecha, Number(e.key)); return; }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      if (savedTotal === null) return;
      if (hasNotes) { anchorRef.current = e.currentTarget; setEditing(fecha); return; }
      save(fecha, null);
      return;
    }
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 };
    if (moves[e.key]) { e.preventDefault(); focusDay(index + moves[e.key]); }
  };

  const editingRows = editing ? rowsFor(editing) : [];
  const editingPlan = editing ? plans.find(p => p.id === editingRows[0]?.planId) || resolvePlanForDate(plans, editing) : undefined;

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">Cargar consumos</h3>
          <p className="text-xs text-muted-foreground">Tocá una fecha y elegí cuántas viandas consumió. Se guarda solo.</p>
        </div>
        <SaveIndicator saving={saver.savingCount} errors={saver.errorCount} lastSavedAt={saver.lastSavedAt} onRetryAll={saver.retryAll} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => setMes(m => shiftMonth(m, -1))} aria-label="Mes anterior">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="min-w-[9.5rem] text-center font-semibold">{monthLabel}</span>
        <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => setMes(m => shiftMonth(m, 1))} aria-label="Mes siguiente">
          <ChevronRight className="w-4 h-4" />
        </Button>
        {mes !== today.slice(0, 7) && (
          <Button variant="outline" className="h-10" onClick={() => setMes(today.slice(0, 7))}>Hoy</Button>
        )}
        <Button asChild variant="ghost" size="sm" className="ml-auto h-10 text-xs">
          <Link to={`/admin/consumos?mes=${mes}`}><Table2 className="w-4 h-4 mr-1.5" />Ver en planilla general</Link>
        </Button>
      </div>

      {plans.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">El cliente no tiene contratos: cargá un contrato para registrar consumos.</p>
      ) : (
        <>
          <div ref={gridRef} className="grid grid-cols-7 gap-1 sm:gap-1.5" role="grid" aria-label={`Consumos de ${monthLabel}`}>
            {WEEKDAYS.map(w => (
              <div key={w} className={`text-center text-[11px] uppercase text-muted-foreground pb-0.5 ${w === 'Sá' || w === 'Do' ? 'opacity-70' : ''}`}>{w}</div>
            ))}
            {Array.from({ length: leading }, (_, i) => <div key={`e${i}`} />)}
            {days.map((d, index) => {
              const rows = rowsFor(d);
              const st = saver.cells[cellKey(client.id, d)];
              const info = describeDay({ fecha: d, rows, plan: resolvePlanForDate(plans, d), feriados, today, pending: st });
              const isToday = d === today;
              const dayNum = parseISODate(d).getDate();
              return (
                <button
                  key={d}
                  type="button"
                  data-day={index}
                  disabled={info.future}
                  onClick={e => { anchorRef.current = e.currentTarget; setEditing(d); }}
                  onKeyDown={e => onKeyDown(e, index, d, info.savedTotal, info.hasNotes)}
                  aria-label={`${formatDateAR(d)}: ${info.shown === null ? 'sin registro' : info.shown === 0 ? 'sin consumo' : `${info.shown} viandas`}`}
                  title={dayTitle(info, rows.length)}
                  className={`relative h-14 sm:h-16 rounded-lg text-base tabular-nums transition-colors outline-none flex flex-col items-center justify-center
                    focus-visible:ring-2 focus-visible:ring-ring
                    ${info.future ? 'cursor-default opacity-40' : 'hover:ring-1 hover:ring-primary/40'}
                    ${dayToneClass(info)}
                    ${isToday ? 'outline outline-2 outline-primary outline-offset-1' : ''}
                    ${dayStatusClass(st)}`}
                >
                  <span className={`absolute top-1 left-1.5 text-[10px] leading-none ${isToday ? 'text-primary font-bold' : 'text-muted-foreground font-normal'}`}>{dayNum}</span>
                  <span className="mt-2">{info.future ? '' : info.shown === null ? '–' : info.shown}</span>
                  <DayMarks d={info} st={st} />
                </button>
              );
            })}
          </div>

          <ConsumptionLegend keyboardHint={false} />

          {plan && balance ? (
            <div className="grid grid-cols-4 gap-1.5 text-center text-sm">
              <MiniStat label="Compradas" value={balance.compradas} />
              <MiniStat label="Saldo anterior" value={balance.saldoAnteriorAplicado} />
              <MiniStat label="Consumidas (mes)" value={consumidasMes} cls="bg-green-500/10 text-green-700" />
              <MiniStat label="Disponible" value={balance.disponible} cls={balance.disponible < 0 ? 'bg-destructive/10 text-destructive' : 'bg-blue-500/10 text-blue-700'} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Sin contrato en este mes · {consumidasMes} consumidas</p>
          )}
          {balance && balance.excedido > 0 && (
            <p className="text-xs rounded bg-destructive/10 text-destructive px-2 py-1.5">
              Se registraron {balance.excedido} vianda(s) más de las disponibles. No se modificaron pagos ni contratos.
            </p>
          )}
        </>
      )}

      <Popover open={!!editing} onOpenChange={open => { if (!open) setEditing(null); }}>
        <PopoverPrimitive.Anchor virtualRef={anchorRef as React.RefObject<HTMLElement>} />
        <PopoverContent className="w-[19rem] p-3" collisionPadding={12} onOpenAutoFocus={e => e.preventDefault()}>
          {editing && (
            <ConsumptionCellEditor
              clientName={`${client.nombre} ${client.apellido}`.trim()}
              fecha={editing}
              rows={editingRows}
              savedTotal={describeDay({ fecha: editing, rows: editingRows, feriados, today }).savedTotal}
              pending={saver.cells[cellKey(client.id, editing)]}
              habitual={editingPlan?.unidadesPorRetiro || 1}
              disponible={editingPlan ? computePlanBalance(editingPlan, consumptions, plans, today).disponible : null}
              feriado={feriados.has(editing)}
              excluida={!!editingPlan?.fechasExcluidas?.includes(editing)}
              onSave={(cant, notas) => save(editing, cant, notas)}
              onRetry={() => saver.retry(client.id, editing)}
              onClose={() => { setEditing(null); anchorRef.current?.focus(); }}
            />
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function MiniStat({ label, value, cls = 'bg-muted/50' }: { label: string; value: number; cls?: string }) {
  return (
    <div className={`rounded p-1.5 ${cls}`}>
      <p className="text-[10px] leading-tight text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
}
