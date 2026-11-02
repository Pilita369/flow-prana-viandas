import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { CalendarOff, ChevronLeft, ChevronRight, Table2, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent } from '@/components/ui/popover';
import ConsumptionCellEditor from '@/components/ConsumptionCellEditor';
import ContractRecalcDialog, { type RecalcItem } from '@/components/ContractRecalcDialog';
import { ConsumptionLegend, DayMarks, SaveIndicator, TODAY_CLASS, dayStatusClass, dayTitle, dayToneClass, describeDay } from '@/components/ConsumptionShared';
import { cellKey, useConsumptionSaver, useRefreshOnReturn } from '@/hooks/useConsumptionSaver';
import { formatCurrencyAR, formatDateAR } from '@/lib/business';
import {
  capFirst, computePlanBalance, dayTotal, isConsumed, monthDays, parseISODate, planForMonth, resolvePlanForDate, todayISO, todayLabelAR,
} from '@/lib/consumo';
import { getFeriadosActuales, loadFeriados, setFeriado, useFeriados } from '@/lib/feriados';
import { recalcularContrato } from '@/lib/habiles';
import { loadClients, loadPlans, updatePlan } from '@/lib/store';
import type { Client, Consumption, Plan } from '@/types';

const WEEKDAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

type Modo = 'consumos' | 'feriados';
type TipoMarca = 'feriado' | 'excluida';

interface Props {
  client: Client;
  /** Contratos del cliente. */
  plans: Plan[];
  /** Consumos del cliente (los mismos registros que usa la planilla general). */
  consumptions: Consumption[];
  /** Se llama con la lista completa del cliente después de cada guardado confirmado. */
  onConsumptionsChange: (next: Consumption[]) => void;
  /** Releer contratos después de marcar días excluidos o recalcular un contrato. */
  onPlansChange?: () => void | Promise<void>;
  /** Viandas a favor cargadas a mano que todavía no suman a ningún contrato. */
  viandasPendientes?: number;
  /** Mes que se ve ('YYYY-MM'). Si se pasa, lo controla la ficha (la tarjeta de días hábiles lo sigue). */
  mes?: string;
  onMesChange?: (mes: string) => void;
  /** Contrato del período seleccionado (lo elige la ficha). null = el mes no tiene contrato. */
  planPeriodo?: Plan | null;
}

function shiftMonth(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Cuadro mensual editable de un cliente.
 * - Modo "Registrar consumos": se toca cada fecha y se elige 0, 1, 2 o más viandas (misma función que la planilla general).
 * - Modo "Feriados y días excluidos": se toca una fecha para marcarla o desmarcarla. No crea ni borra consumos.
 */
export default function ClientConsumptionCalendar({ client, plans, consumptions, onConsumptionsChange, onPlansChange, viandasPendientes = 0, mes: mesProp, onMesChange, planPeriodo }: Props) {
  const today = todayISO();
  const [mesLocal, setMesLocal] = useState(today.slice(0, 7));
  const mes = mesProp ?? mesLocal;
  const setMes = (next: string | ((prev: string) => string)) => {
    const value = typeof next === 'function' ? next(mes) : next;
    setMesLocal(value);
    onMesChange?.(value);
  };
  const year = Number(mes.slice(0, 4));
  const month0 = Number(mes.slice(5, 7)) - 1;
  const days = useMemo(() => monthDays(year, month0), [year, month0]);
  const { feriados } = useFeriados();
  const [modo, setModo] = useState<Modo>('consumos');
  const [tipoMarca, setTipoMarca] = useState<TipoMarca>('feriado');
  const [marcando, setMarcando] = useState<string | null>(null);
  const [recalc, setRecalc] = useState<{ cambio: string; items: RecalcItem[]; consumoDelDia: number | null } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const consRef = useRef(consumptions);
  consRef.current = consumptions;

  // Los feriados pueden cambiarse desde otro dispositivo: se releen al volver a la pantalla
  useRefreshOnReturn(() => { loadFeriados(true).catch(() => { /* se mantienen los que había */ }); }, true);

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

  /** Marca o desmarca la fecha y, si cambia los días hábiles de un contrato confirmado, propone el nuevo cálculo. */
  const toggleMarca = async (fecha: string) => {
    if (marcando) return;
    setMarcando(fecha);
    const nombre = `${client.nombre} ${client.apellido}`.trim();
    try {
      const feriadosAntes = getFeriadosActuales();
      let cambio = '';
      let items: RecalcItem[] = [];

      if (tipoMarca === 'feriado') {
        const marcar = !feriadosAntes.has(fecha);
        await setFeriado(fecha, marcar);
        const feriadosDespues = new Set(feriadosAntes);
        if (marcar) feriadosDespues.add(fecha); else feriadosDespues.delete(fecha);
        cambio = `${formatDateAR(fecha)} ${marcar ? 'marcado como feriado' : 'ya no es feriado'} (para todos los clientes)`;
        toast.success(capFirst(cambio));
        // Un feriado vale para todos: se revisan los contratos de todos los clientes que cubren esa fecha
        const [allPlans, clients] = await Promise.all([loadPlans(), loadClients()]);
        items = allPlans
          .filter(p => p.fechaInicio <= fecha && fecha <= p.fechaFin && p.fechaFin >= today) // los contratos terminados no se recalculan
          .map(p => {
            const excluidas = p.fechasExcluidas || [];
            const rec = recalcularContrato(p, { feriados: feriadosAntes, excluidas }, { feriados: feriadosDespues, excluidas });
            const c = clients.find(x => x.id === p.clientId);
            return rec ? { rec, clientName: c ? `${c.nombre} ${c.apellido}`.trim() : 'Cliente' } : null;
          })
          .filter((x): x is RecalcItem => !!x)
          .sort((a, b) => (a.rec.plan.clientId === client.id ? -1 : 0) - (b.rec.plan.clientId === client.id ? -1 : 0));
      } else {
        const plan = resolvePlanForDate(plans, fecha);
        if (!plan) { toast.error('El cliente no tiene contrato cargado'); return; }
        const antes = plan.fechasExcluidas || [];
        const marcar = !antes.includes(fecha);
        const despues = marcar ? Array.from(new Set([...antes, fecha])).sort() : antes.filter(d => d !== fecha);
        const updated = await updatePlan(plan.id, { fechasExcluidas: despues });
        if (!updated) throw new Error('No se pudo guardar la fecha excluida');
        cambio = `${formatDateAR(fecha)} ${marcar ? 'excluido' : 'ya no está excluido'} solo para ${nombre}`;
        toast.success(capFirst(cambio));
        const rec = recalcularContrato(plan, { feriados: feriadosAntes, excluidas: antes }, { feriados: feriadosAntes, excluidas: despues });
        items = rec && plan.fechaFin >= today ? [{ rec, clientName: nombre }] : []; // contrato terminado: no se recalcula
      }

      await onPlansChange?.();
      if (items.length > 0) setRecalc({ cambio: capFirst(cambio), items, consumoDelDia: dayTotal(rowsFor(fecha)) });
    } catch (e) {
      console.error(e);
      toast.error(`No se pudo guardar el ${formatDateAR(fecha)}. Probá de nuevo.`);
    } finally {
      setMarcando(null);
    }
  };

  const confirmarRecalculo = async (items: RecalcItem[]) => {
    if (!recalc) return;
    let ok = 0;
    for (const { rec } of items) {
      const nota = `[${todayLabelAR()}] Recalculado por feriados / días excluidos (${recalc.cambio}): ${rec.habilesAntes} → ${rec.habilesDespues} días hábiles, ${rec.cantidadAntes} → ${rec.cantidadDespues} viandas, ${formatCurrencyAR(rec.totalAntes)} → ${formatCurrencyAR(rec.totalDespues)}.`;
      const updated = await updatePlan(rec.plan.id, {
        cantidadContratada: rec.cantidadDespues,
        // El total pedido se mueve lo mismo que las nuevas (los créditos no cambian)
        ...(rec.plan.cantidadSolicitada !== undefined ? { cantidadSolicitada: Math.max(rec.plan.cantidadSolicitada + rec.cantidadDespues - rec.cantidadAntes, 0) } : {}),
        observaciones: [rec.plan.observaciones, nota].filter(Boolean).join('\n'),
      });
      if (updated) ok += 1;
    }
    if (ok === items.length) toast.success(ok === 1 ? 'Contrato actualizado' : `${ok} contratos actualizados`);
    else toast.error(`Se actualizaron ${ok} de ${items.length} contratos. Revisá los que faltan.`);
    setRecalc(null);
    await onPlansChange?.();
  };

  // Resumen del mes (solo consumos) y del contrato del período seleccionado (saldo, con sus fechas)
  const vigente = planPeriodo !== undefined ? planPeriodo : (plans.find(p => p.activo) || planForMonth(plans, year, month0) || null);
  const balanceVigente = vigente ? computePlanBalance(vigente, consumptions, plans, today) : undefined;
  const inMonth = consumptions.filter(c => c.fecha.startsWith(mes));
  const consumidasMes = inMonth.filter(c => isConsumed(c.status)).reduce((a, c) => a + (c.cantidad || 0), 0);
  const diasConConsumo = new Set(inMonth.filter(c => isConsumed(c.status) && (c.cantidad || 0) > 0).map(c => c.fecha)).size;

  // Lunes = primera columna
  const leading = (parseISODate(days[0]).getDay() + 6) % 7;
  const monthLabel = capFirst(new Date(year, month0, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }));
  const mesCorto = capFirst(new Date(year, month0, 1).toLocaleDateString('es-AR', { month: 'long' }));

  const focusDay = (index: number) => {
    if (index < 0 || index >= days.length) return;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${index}"]`)?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number, fecha: string, savedTotal: number | null, hasNotes: boolean) => {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 };
    if (moves[e.key]) { e.preventDefault(); focusDay(index + moves[e.key]); return; }
    if (modo !== 'consumos') return;
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); save(fecha, Number(e.key)); return; }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      if (savedTotal === null) return;
      if (hasNotes) { anchorRef.current = e.currentTarget; setEditing(fecha); return; }
      save(fecha, null);
    }
  };

  const editingRows = editing ? rowsFor(editing) : [];
  const editingPlan = editing ? plans.find(p => p.id === editingRows[0]?.planId) || resolvePlanForDate(plans, editing) : undefined;
  const marcandoFeriados = modo === 'feriados';

  return (
    <div className={`glass-card p-4 sm:p-5 space-y-4 ${marcandoFeriados ? 'border-warning border-2' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">{marcandoFeriados ? 'Feriados y días excluidos' : 'Cargar consumos'}</h3>
          <p className="text-sm text-muted-foreground">
            {marcandoFeriados
              ? 'Tocá una fecha para marcarla o desmarcarla. No se cargan ni se borran consumos.'
              : 'Tocá una fecha y elegí cuántas viandas consumió. Se guarda solo.'}
          </p>
        </div>
        <SaveIndicator saving={saver.savingCount} errors={saver.errorCount} lastSavedAt={saver.lastSavedAt} onRetryAll={saver.retryAll} />
      </div>

      {/* Qué hace tocar una fecha: registrar consumos o marcar feriados */}
      <div className="grid grid-cols-2 gap-1.5 rounded-xl border-2 border-border bg-card p-1.5" role="radiogroup" aria-label="Qué hacer al tocar una fecha">
        <button type="button" role="radio" aria-checked={!marcandoFeriados} onClick={() => setModo('consumos')}
          className={`h-12 rounded-lg text-sm sm:text-base font-medium inline-flex items-center justify-center gap-2 px-2 ${!marcandoFeriados ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
          <UtensilsCrossed className="w-4 h-4 shrink-0" />Registrar consumos
        </button>
        <button type="button" role="radio" aria-checked={marcandoFeriados} onClick={() => { setModo('feriados'); setEditing(null); }}
          className={`h-12 rounded-lg text-sm sm:text-base font-medium inline-flex items-center justify-center gap-2 px-2 ${marcandoFeriados ? 'bg-warning text-warning-foreground' : 'hover:bg-muted'}`}>
          <CalendarOff className="w-4 h-4 shrink-0" />Marcar feriados
        </button>
      </div>

      {marcandoFeriados && (
        <div className="space-y-2 rounded-lg border-2 border-warning/70 bg-warning/10 p-3">
          <p className="text-sm font-medium">Al tocar una fecha se marca como:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de fecha">
            <TipoBtn activo={tipoMarca === 'feriado'} onClick={() => setTipoMarca('feriado')} titulo="Feriado" detalle="Para todos los clientes" />
            <TipoBtn activo={tipoMarca === 'excluida'} onClick={() => setTipoMarca('excluida')} titulo="Día excluido" detalle={`Solo para ${client.nombre}`} punteado />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setMes(m => shiftMonth(m, -1))} aria-label="Mes anterior">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <span className="min-w-[10rem] text-center text-lg font-semibold">{monthLabel}</span>
        <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setMes(m => shiftMonth(m, 1))} aria-label="Mes siguiente">
          <ChevronRight className="w-5 h-5" />
        </Button>
        {mes !== today.slice(0, 7) && (
          <Button variant="outline" className="h-11" onClick={() => setMes(today.slice(0, 7))}>Hoy</Button>
        )}
        <Button asChild variant="outline" size="sm" className="ml-auto h-11 text-sm">
          <Link to={`/admin/consumos?mes=${mes}`}><Table2 className="w-4 h-4 mr-1.5" />Ver en planilla general</Link>
        </Button>
      </div>

      {plans.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">El cliente no tiene contratos: cargá un contrato para registrar consumos.</p>
      ) : (
        <>
          <div ref={gridRef} className="grid grid-cols-7 gap-1.5 sm:gap-2" role="grid" aria-label={`${marcandoFeriados ? 'Feriados' : 'Consumos'} de ${monthLabel}`}>
            {WEEKDAYS.map(w => (
              <div key={w} className={`text-center text-xs font-semibold uppercase pb-0.5 ${w === 'Sá' || w === 'Do' ? 'text-muted-foreground' : 'text-foreground/90'}`}>{w}</div>
            ))}
            {Array.from({ length: leading }, (_, i) => <div key={`e${i}`} />)}
            {days.map((d, index) => {
              const rows = rowsFor(d);
              const st = saver.cells[cellKey(client.id, d)];
              const info = describeDay({ fecha: d, rows, plan: resolvePlanForDate(plans, d), feriados, today, pending: st });
              const isToday = d === today;
              const dayNum = parseISODate(d).getDate();
              const marca = info.feriado ? 'Feriado' : info.excluida ? 'Excluido' : '';
              const label = `${formatDateAR(d)}: ${info.shown === null ? 'sin registro' : info.shown === 0 ? 'sin consumo' : `${info.shown} viandas`}${marca ? ` · ${marca}` : ''}${info.habitualDay ? ' · día programado' : ''}`;
              const tono = marcandoFeriados
                ? info.feriado
                  ? 'border-2 border-warning bg-warning/35 text-foreground font-bold'
                  : info.excluida
                    ? 'border-2 border-dashed border-warning bg-warning/15 text-foreground font-bold'
                    : 'border-2 border-border text-muted-foreground'
                : dayToneClass(info);
              return (
                <button
                  key={d}
                  type="button"
                  data-day={index}
                  disabled={(!marcandoFeriados && info.future) || marcando === d}
                  onClick={e => {
                    if (marcandoFeriados) { void toggleMarca(d); return; }
                    anchorRef.current = e.currentTarget; setEditing(d);
                  }}
                  onKeyDown={e => onKeyDown(e, index, d, info.savedTotal, info.hasNotes)}
                  aria-label={marcandoFeriados ? `${formatDateAR(d)}: ${marca || 'día normal'}. Tocá para ${tipoMarca === 'feriado' ? (info.feriado ? 'quitar el feriado' : 'marcar feriado') : (info.excluida ? 'quitar la exclusión' : 'excluir')}` : label}
                  aria-pressed={marcandoFeriados ? (tipoMarca === 'feriado' ? info.feriado : info.excluida) : undefined}
                  title={dayTitle(info, rows.length)}
                  className={`relative h-14 sm:h-[4.5rem] rounded-lg text-lg sm:text-xl tabular-nums transition-colors outline-none flex flex-col items-center justify-center
                    focus-visible:ring-2 focus-visible:ring-ring
                    ${!marcandoFeriados && info.future ? (info.habitualDay ? 'cursor-default opacity-75' : 'cursor-default opacity-35') : marcandoFeriados ? 'hover:bg-warning/20' : 'hover:bg-primary/10'}
                    ${marcando === d ? 'animate-pulse' : ''}
                    ${tono}
                    ${isToday ? TODAY_CLASS : ''}
                    ${dayStatusClass(st)}`}
                >
                  <span className={`absolute top-1 left-1.5 text-xs leading-none ${isToday ? 'text-secondary font-bold' : 'text-muted-foreground font-medium'}`}>{dayNum}{isToday && <span className="hidden sm:inline"> hoy</span>}</span>
                  <span className="mt-2">{info.future ? '' : info.shown === null ? '–' : info.shown}</span>
                  {marca && <span className={`absolute bottom-0.5 inset-x-0 text-center text-[9px] sm:text-[10px] font-semibold uppercase leading-none ${marcandoFeriados ? 'text-foreground' : 'text-warning'}`}>{marca}</span>}
                  <DayMarks d={{ ...info, feriado: false, excluida: false }} st={st} />
                </button>
              );
            })}
          </div>

          {marcandoFeriados ? <FeriadosLegend /> : <ConsumptionLegend keyboardHint={false} />}

          {/* Resumen: consumos del MES por un lado y saldo del CONTRATO VIGENTE (con su período) por otro */}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div className="rounded-lg border-2 border-border p-3">
              <p className="text-sm font-semibold">Consumos de {mesCorto.toLowerCase()}</p>
              <p className="text-3xl font-bold tabular-nums" data-testid="consumidas-mes">{consumidasMes}</p>
              <p className="text-sm text-muted-foreground">{diasConConsumo} día(s) con consumo</p>
            </div>
            {vigente && balanceVigente ? (
              <div className="rounded-lg border-2 border-primary/50 p-3 space-y-2">
                <p className="text-sm" data-testid="resumen-contrato">
                  <span className="font-semibold">{vigente.activo ? 'Contrato vigente' : 'Contrato del período'}</span>{' '}
                  <span className="tabular-nums">{formatDateAR(vigente.fechaInicio)} al {formatDateAR(vigente.fechaFin)}</span>
                  {balanceVigente.cerrado && <span className="text-muted-foreground"> · cerrado</span>}
                </p>
                {balanceVigente.cerrado ? (
                  /* Contrato cerrado: su cierre, sin mezclar con el contrato siguiente */
                  <div className="grid grid-cols-3 2xl:grid-cols-5 gap-2 text-center">
                    <MiniStat label="Compradas" value={balanceVigente.compradas} />
                    {balanceVigente.saldoAnteriorAplicado > 0 && <MiniStat label="Recibido" value={balanceVigente.saldoAnteriorAplicado} />}
                    <MiniStat label="Ajustes a favor" value={balanceVigente.ajusteManual} />
                    <MiniStat label="Consumidas" value={balanceVigente.consumidas} />
                    <MiniStat label="Saldo al cierre" value={Math.max(balanceVigente.restante, 0)} cls="bg-blue-500/10 text-blue-700" />
                    <MiniStat label="Trasladado" value={balanceVigente.trasladado} />
                    <MiniStat label="Pendiente de trasladar" value={balanceVigente.aFavorSinAplicar} />
                  </div>
                ) : (
                  <div className="grid grid-cols-3 2xl:grid-cols-5 gap-2 text-center">
                    <MiniStat label="Compradas" value={balanceVigente.compradas} />
                    <MiniStat label="Trasladado" value={balanceVigente.saldoAnteriorAplicado} />
                    <MiniStat label="Ajustes a favor" value={balanceVigente.ajusteManual} />
                    <MiniStat label="Consumidas" value={balanceVigente.consumidas} />
                    <MiniStat label="Disponible" value={balanceVigente.disponible} cls={balanceVigente.disponible < 0 ? 'bg-destructive/10 text-destructive' : 'bg-blue-500/10 text-blue-700'} />
                  </div>
                )}
              </div>
            ) : (
              <p className="rounded-lg border-2 border-border p-3 text-sm text-muted-foreground">Sin contrato en este mes.</p>
            )}
          </div>
          {viandasPendientes > 0 && (
            <p className="text-sm rounded-lg border-2 border-warning/60 bg-warning/10 px-3 py-2">
              Hay <strong>{viandasPendientes} vianda(s) a favor pendientes de aplicar</strong> que todavía no suman al disponible.
              Sumalas al contrato desde <strong>Ajustes y saldo a favor</strong> (abajo) o al renovar.
            </p>
          )}
          {balanceVigente && balanceVigente.excedido > 0 && (
            <p className="text-sm rounded bg-destructive/10 text-destructive px-3 py-2">
              Se registraron {balanceVigente.excedido} vianda(s) más de las disponibles. No se modificaron pagos ni contratos.
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

      <ContractRecalcDialog
        cambio={recalc?.cambio ?? null}
        items={recalc?.items ?? []}
        consumoDelDia={recalc?.consumoDelDia}
        onConfirm={confirmarRecalculo}
        onClose={() => setRecalc(null)}
      />
    </div>
  );
}

function TipoBtn({ activo, onClick, titulo, detalle, punteado }: { activo: boolean; onClick: () => void; titulo: string; detalle: string; punteado?: boolean }) {
  return (
    <button type="button" role="radio" aria-checked={activo} onClick={onClick}
      className={`min-h-[3rem] rounded-lg border-2 px-3 py-2 text-left flex items-center gap-3 ${activo ? 'border-warning bg-warning/25' : 'border-border bg-card hover:bg-muted'}`}>
      <span className={`h-5 w-5 shrink-0 rounded-full border-2 ${activo ? 'border-warning bg-warning' : 'border-muted-foreground'}`} />
      <span>
        <span className={`block font-semibold ${punteado ? 'underline decoration-dashed underline-offset-4' : ''}`}>{titulo}</span>
        <span className="block text-xs text-muted-foreground">{detalle}</span>
      </span>
    </button>
  );
}

function FeriadosLegend() {
  const box = 'relative inline-flex h-7 w-7 items-center justify-center rounded-md';
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
      <span className="inline-flex items-center gap-2"><span className={`${box} border-2 border-warning bg-warning/35`} />Feriado (todos)</span>
      <span className="inline-flex items-center gap-2"><span className={`${box} border-2 border-dashed border-warning bg-warning/15`} />Día excluido (este cliente)</span>
      <span className="inline-flex items-center gap-2"><span className={`${box} border-2 border-border`} />Día normal</span>
    </div>
  );
}

function MiniStat({ label, value, cls = 'bg-muted/50' }: { label: string; value: number; cls?: string }) {
  return (
    <div className={`rounded-lg border border-border p-2 ${cls}`}>
      <p className="text-xs leading-tight text-muted-foreground">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}
