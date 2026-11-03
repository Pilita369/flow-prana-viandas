import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { describeDay, TODAY_CLASS } from '@/components/ConsumptionShared';
import { formatDateAR, getBusinessConfig } from '@/lib/business';
import { capFirst, computePlanBalance, destinoDelConsumo, isConsumed, monthDays, parseISODate, todayISO } from '@/lib/consumo';
import { contratoDelPeriodo } from '@/lib/habiles';
import type { Client, Consumption, Plan } from '@/types';

const WEEKDAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

function shiftMonth(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Calendario del cliente: SOLO CONSULTA. Usa los mismos registros y cálculos que administración
 * (no estima consumos a partir de los días contratados). Muestra solo la nota para el cliente, nunca la interna.
 */
export default function ClientConsumptionView({ client, plans, consumptions, feriados }: {
  client: Client; plans: Plan[]; consumptions: Consumption[]; feriados: Set<string>;
}) {
  const today = todayISO();
  const mesActual = today.slice(0, 7);
  const [mes, setMes] = useState(mesActual);
  const [sel, setSel] = useState<string | null>(null);
  const year = Number(mes.slice(0, 4));
  const month0 = Number(mes.slice(5, 7)) - 1;
  const days = useMemo(() => monthDays(year, month0), [year, month0]);
  const leading = (parseISODate(days[0]).getDay() + 6) % 7;
  const monthLabel = capFirst(new Date(year, month0, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }));
  const mesNombre = new Date(year, month0, 1).toLocaleDateString('es-AR', { month: 'long' });
  // No se navega antes del primer contrato ni después del mes actual
  const primerMes = plans.map(p => p.fechaInicio.slice(0, 7)).sort()[0] || mesActual;

  const rowsFor = (fecha: string) => consumptions.filter(c => c.fecha === fecha);
  const infoDe = (fecha: string) => {
    const rows = rowsFor(fecha);
    const plan = destinoDelConsumo(plans, fecha, rows).plan;
    return { rows, plan, info: describeDay({ fecha, rows, plan, feriados, today }) };
  };

  // Resumen del mes elegido: sus consumos y el contrato de ese período (sin mezclar con el siguiente)
  const delMes = consumptions.filter(c => c.fecha.startsWith(mes));
  const consumidasMes = delMes.filter(c => isConsumed(c.status)).reduce((a, c) => a + (c.cantidad || 0), 0);
  const diasConConsumo = new Set(delMes.filter(c => isConsumed(c.status) && (c.cantidad || 0) > 0).map(c => c.fecha)).size;
  const contrato = contratoDelPeriodo(plans, mes, today) || null;
  const b = contrato ? computePlanBalance(contrato, consumptions, plans, today) : null;

  const cambiarMes = (delta: number) => { setMes(m => shiftMonth(m, delta)); setSel(null); };

  const detalle = sel ? infoDe(sel) : null;
  const estadoTexto = (shown: number | null, future: boolean) =>
    future ? 'Fecha futura: todavía no hay registro' : shown === null ? 'Sin registro' : shown === 0 ? 'Registrado: 0, sin consumo' : `Registrado: ${plural(shown, 'vianda consumida', 'viandas consumidas')}`;

  const consultar = () => {
    if (!sel || !detalle) return;
    const fechaLarga = parseISODate(sel).toLocaleDateString('es-AR', { weekday: 'long' });
    const figura = detalle.info.shown === null ? 'sin registro' : `${detalle.info.shown} vianda(s)`;
    const msg = `Hola! Soy ${client.nombre} ${client.apellido}. Quiero consultar el registro del ${fechaLarga} ${formatDateAR(sel)} (en mi calendario figura: ${figura}).`;
    // Solo abre WhatsApp con el texto escrito: el cliente decide si lo envía
    window.open(`https://wa.me/${getBusinessConfig().whatsappNegocio}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  };

  return (
    <section className="glass-card p-4 space-y-3" aria-label="Tus consumos">
      <div>
        <h3 className="font-semibold text-lg flex items-center gap-2"><CalendarDays className="w-5 h-5" />Tus consumos</h3>
        <p className="text-sm text-muted-foreground">Solo para consultar. Si ves algo distinto, escribinos y lo corregimos.</p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="icon" className="h-12 w-12" onClick={() => cambiarMes(-1)} disabled={mes <= primerMes} aria-label="Mes anterior">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <span className="text-lg font-semibold text-center" data-testid="cliente-cal-mes">{monthLabel}</span>
        <Button variant="outline" size="icon" className="h-12 w-12" onClick={() => cambiarMes(1)} disabled={mes >= mesActual} aria-label="Mes siguiente">
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>
      {mes !== mesActual && (
        <Button variant="outline" className="w-full h-11" onClick={() => { setMes(mesActual); setSel(null); }}>Volver al mes actual</Button>
      )}

      <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`Consumos de ${monthLabel}`}>
        {WEEKDAYS.map(w => (
          <div key={w} className="text-center text-xs font-semibold uppercase text-muted-foreground" role="columnheader">{w}</div>
        ))}
        {Array.from({ length: leading }, (_, i) => <div key={`e${i}`} />)}
        {days.map(d => {
          const { info } = infoDe(d);
          const isToday = d === today;
          const n = parseISODate(d).getDate();
          const marca = info.feriado ? 'Feriado' : info.excluida ? 'Excluido' : '';
          const valor = info.future ? '' : info.shown === null ? '–' : String(info.shown);
          const tono = info.future
            ? `border-2 ${info.habitualDay ? 'border-dashed border-muted-foreground/70' : 'border-border opacity-50'}`
            : info.shown === 0
              ? 'border-2 border-transparent bg-muted'
              : info.shown !== null && info.shown > 0
                ? 'border-2 border-primary bg-primary/25 font-bold'
                : `border-2 ${info.habitualDay ? 'border-dashed border-muted-foreground/70' : 'border-border'} ${marca ? 'bg-warning/10' : ''}`;
          const label = `${formatDateAR(d)}: ${info.future ? 'fecha futura' : info.shown === null ? 'sin registro' : info.shown === 0 ? 'sin consumo' : plural(info.shown, 'vianda', 'viandas')}${marca ? ` · ${marca}` : ''}${info.habitualDay ? ' · día programado' : ''}${isToday ? ' · hoy' : ''}`;
          return (
            <button key={d} type="button" onClick={() => setSel(d)} aria-label={label} aria-pressed={sel === d}
              data-fecha={d}
              className={`relative h-14 rounded-lg text-lg tabular-nums flex flex-col items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring
                ${tono} ${isToday ? TODAY_CLASS : ''} ${sel === d ? 'ring-2 ring-foreground' : ''}`}>
              <span className={`absolute top-0.5 left-1 text-[11px] leading-none ${isToday ? 'font-bold' : 'text-muted-foreground'}`}>{n}</span>
              <span className="mt-2 leading-none">{valor}</span>
              {marca
                ? <span className="absolute bottom-0.5 inset-x-0 text-center text-[8.5px] font-semibold uppercase leading-none">{marca === 'Feriado' ? 'Feriado' : 'Excl.'}</span>
                : isToday
                  ? <span className="absolute bottom-0.5 inset-x-0 text-center text-[9px] font-bold uppercase leading-none">Hoy</span>
                  : info.future && info.habitualDay
                    ? <span className="absolute bottom-0.5 inset-x-0 text-center text-[8.5px] uppercase leading-none text-muted-foreground">Prog.</span>
                    : null}
              {rowsFor(d).some(r => r.notaCliente?.trim()) && <span className="absolute top-0 right-0 w-0 h-0 border-t-[9px] border-l-[9px] border-t-secondary border-l-transparent rounded-tr-md" aria-hidden />}
            </button>
          );
        })}
      </div>

      {/* Referencias con texto, no solo colores */}
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-muted-foreground" aria-label="Referencias">
        <li className="flex items-center gap-2"><span className="inline-flex h-6 w-6 items-center justify-center rounded border-2 border-border">–</span>Sin registro</li>
        <li className="flex items-center gap-2"><span className="inline-flex h-6 w-6 items-center justify-center rounded bg-muted text-foreground">0</span>Sin consumo</li>
        <li className="flex items-center gap-2"><span className="inline-flex h-6 w-6 items-center justify-center rounded border-2 border-primary bg-primary/25 font-bold text-foreground">1</span>Viandas consumidas</li>
        <li className="flex items-center gap-2"><span className="inline-flex h-6 w-6 items-center justify-center rounded border-2 border-dashed border-muted-foreground/70" />Día programado</li>
        <li className="flex items-center gap-2"><span className="inline-flex h-6 w-6 items-center justify-center rounded border-2 border-border bg-warning/10 text-[8px] font-semibold">FER</span>Feriado o excluido</li>
        <li className="flex items-center gap-2"><span className={`inline-flex h-6 w-6 rounded border-2 border-border ${TODAY_CLASS}`} />Hoy</li>
      </ul>

      {/* Detalle de la fecha tocada */}
      {sel && detalle && (
        <div className="rounded-xl border-2 border-primary/60 p-3 space-y-2" aria-live="polite" data-testid="cliente-cal-detalle">
          <p className="font-semibold">{capFirst(parseISODate(sel).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</p>
          <p className="text-base" data-testid="cliente-cal-estado">{estadoTexto(detalle.info.shown, detalle.info.future)}</p>
          <ul className="text-sm text-muted-foreground space-y-0.5">
            {detalle.info.feriado && <li>Feriado: no hay servicio.</li>}
            {detalle.info.excluida && <li>Día excluido de tu plan.</li>}
            {detalle.info.habitualDay && <li>{detalle.info.future ? 'Día de servicio programado (no es un consumo).' : 'Día de servicio programado.'}</li>}
            {detalle.plan && <li>Contrato del {formatDateAR(detalle.plan.fechaInicio)} al {formatDateAR(detalle.plan.fechaFin)}.</li>}
          </ul>
          {detalle.rows.map(r => r.notaCliente?.trim()).filter(Boolean).map((n, i) => (
            <p key={i} className="text-sm rounded-lg bg-muted px-3 py-2" data-testid="cliente-cal-nota">Nota: {n}</p>
          ))}
          {!detalle.info.future && (
            <Button className="w-full h-12" onClick={consultar}>
              <MessageCircle className="w-4 h-4 mr-2" />Consultar este día por WhatsApp
            </Button>
          )}
        </div>
      )}

      {/* Resumen del mes elegido */}
      <div className="rounded-xl border-2 border-border p-3 space-y-2" data-testid="cliente-cal-resumen">
        <p className="text-sm"><strong>En {mesNombre}:</strong> {plural(consumidasMes, 'vianda consumida', 'viandas consumidas')} en {plural(diasConConsumo, 'día', 'días')}.</p>
        {contrato && b ? (
          <div className="text-sm space-y-0.5">
            <p className="font-medium">Contrato del {formatDateAR(contrato.fechaInicio)} al {formatDateAR(contrato.fechaFin)}{b.cerrado ? ' (terminado)' : ''}</p>
            <p data-testid="cliente-cal-cuenta">
              {b.compradas} compradas{b.saldoAnteriorAplicado > 0 ? ` + ${b.saldoAnteriorAplicado} recibidas` : ''}{b.ajusteManual > 0 ? ` + ${b.ajusteManual} a favor` : ''}
              {' '}− {b.consumidas} consumidas{b.ajusteInicial > 0 ? ` − ${b.ajusteInicial} de ajuste inicial` : ''} ={' '}
              <strong>{b.cerrado ? Math.max(b.restante, 0) : Math.max(b.disponible, 0)}</strong> {b.cerrado ? 'a favor al cierre' : 'disponibles'}
            </p>
            {b.trasladado > 0 && <p>Se pasaron {plural(b.trasladado, 'vianda', 'viandas')} al contrato siguiente.</p>}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No hay contrato en este mes.</p>
        )}
      </div>
    </section>
  );
}
