import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatCurrencyAR, formatDateAR } from '@/lib/business';
import { capFirst, computePlanBalance, isConsumed, monthKey, parseISODate, todayISO } from '@/lib/consumo';
import type { Consumption, Plan } from '@/types';

/**
 * Historial completo del cliente en una sola vista:
 * resumen histórico → un bloque por contrato (su resumen) → sus meses → cada día (fecha, cantidad, notas).
 * Cada registro aparece una sola vez: bajo el contrato al que pertenece.
 * Solo muestra datos; no recalcula ni modifica nada.
 */

interface Props {
  consumptions: Consumption[];
  plans: Plan[];
}

interface DayRow { fecha: string; total: number; notas: string[]; registros: number }

function groupDays(list: Consumption[]): DayRow[] {
  const byDay = new Map<string, DayRow>();
  for (const c of list) {
    const d = byDay.get(c.fecha) || { fecha: c.fecha, total: 0, notas: [], registros: 0 };
    if (isConsumed(c.status)) d.total += c.cantidad || 0;
    if (c.notas?.trim()) d.notas.push(c.notas.trim());
    d.registros += 1;
    byDay.set(c.fecha, d);
  }
  return Array.from(byDay.values()).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

const monthLabel = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return capFirst(new Date(y, mo - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }));
};

const consumed = (list: Consumption[]) => list.filter(c => isConsumed(c.status)).reduce((a, c) => a + (c.cantidad || 0), 0);

export default function ClientHistory({ consumptions, plans }: Props) {
  const today = todayISO();
  const sortedPlans = [...plans].sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio));
  const planIds = new Set(plans.map(p => p.id));
  const sinContrato = consumptions.filter(c => !planIds.has(c.planId));
  const activeId = plans.find(p => p.activo)?.id;
  // Se pueden abrir varios contratos a la vez; el vigente empieza abierto
  const [openPlans, setOpenPlans] = useState<Set<string>>(() => new Set([activeId ?? sortedPlans[0]?.id].filter(Boolean) as string[]));
  const toggle = (id: string) => setOpenPlans(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  if (consumptions.length === 0 && plans.length === 0) {
    return <div className="glass-card p-5 text-muted-foreground">Todavía no hay contratos ni consumos registrados.</div>;
  }

  const fechas = consumptions.map(c => c.fecha).sort();
  const total = consumed(consumptions);
  const neto = sortedPlans.reduce((acc, p) => acc + consumed(consumptions.filter(c => c.planId === p.id)) * p.precioUnitario, 0);
  const meses = new Set(consumptions.map(c => monthKey(c.fecha))).size;

  return (
    <div className="space-y-4">
      {/* Resumen histórico */}
      <div className="glass-card p-4 sm:p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Viandas consumidas" value={String(total)} big />
        <Tile label="Desde el primer registro" value={fechas[0] ? formatDateAR(fechas[0]) : '-'} />
        <Tile label="Contratos · meses con registros" value={`${plans.length} · ${meses}`} />
        <Tile label="Neto consumido total" value={formatCurrencyAR(neto)} />
      </div>

      {sortedPlans.map((p, idx) => {
        const cons = consumptions.filter(c => c.planId === p.id);
        const b = computePlanBalance(p, consumptions, plans, today);
        const days = groupDays(cons);
        const sinConsumo = days.filter(d => d.total === 0).length;
        const base = b.compradas + b.saldoAnteriorAplicado + b.ajusteManual;
        const pct = base > 0 ? Math.min(Math.round((b.consumidas / base) * 100), 100) : 0;
        const isOpen = openPlans.has(p.id);
        const months = Array.from(new Set(cons.map(c => monthKey(c.fecha)))).sort().reverse();

        return (
          <div key={p.id} className={`glass-card overflow-hidden ${p.activo ? 'border-primary/70 border-2' : ''}`}>
            <button
              type="button"
              onClick={() => toggle(p.id)}
              className="w-full text-left p-4 sm:p-5 space-y-3 hover:bg-muted/30 transition-colors"
              aria-expanded={isOpen}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${p.activo ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                    {p.activo ? 'Contrato vigente' : `Contrato #${sortedPlans.length - idx}`}
                  </span>
                  <span className="font-semibold">{formatDateAR(p.fechaInicio)} → {formatDateAR(p.fechaFin)}</span>
                </div>
                <span className="text-sm text-muted-foreground">{b.consumidas} de {base} consumidas · {pct}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2.5">
                <div className={`h-2.5 rounded-full ${p.activo ? 'bg-primary' : 'bg-muted-foreground/60'}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                <Mini label="Compradas" value={b.compradas} />
                <Mini label="Trasladado" value={b.saldoAnteriorAplicado} />
                <Mini label="Ajustes" value={b.ajusteManual} />
                <Mini label="Consumidas" value={b.consumidas} />
                <Mini label="Disponible" value={b.disponible} />
                <Mini label="Días sin consumo" value={sinConsumo} />
              </div>
            </button>

            {isOpen && (
              <div className="px-4 sm:px-5 pb-5 space-y-3">
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                  <span><span className="text-muted-foreground">Precio por vianda:</span> <strong>{formatCurrencyAR(p.precioUnitario)}</strong></span>
                  <span><span className="text-muted-foreground">Total del contrato:</span> <strong>{formatCurrencyAR(p.totalCalculado)}</strong></span>
                  <span><span className="text-muted-foreground">Neto consumido:</span> <strong>{formatCurrencyAR(b.consumidas * p.precioUnitario)}</strong></span>
                  {b.ajusteInicial > 0 && <span><span className="text-muted-foreground">Ajuste inicial usado:</span> <strong>{b.ajusteInicial}</strong></span>}
                </div>
                {(b.trasladado > 0 || b.excedido > 0 || (b.cerrado && b.aFavorSinAplicar > 0) || b.trasladadoDeMas > 0) && (
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {b.trasladado > 0 && <span className="rounded-full bg-muted px-2.5 py-1">{b.trasladado} trasladadas al contrato siguiente</span>}
                    {b.cerrado && b.aFavorSinAplicar > 0 && <span className="rounded-full bg-amber-500/15 text-amber-800 px-2.5 py-1">{b.aFavorSinAplicar} a favor sin aplicar</span>}
                    {b.excedido > 0 && <span className="rounded-full bg-red-500/10 text-red-600 px-2.5 py-1">{b.excedido} consumidas de más</span>}
                    {b.trasladadoDeMas > 0 && <span className="rounded-full bg-red-500/10 text-red-600 px-2.5 py-1">{b.trasladadoDeMas} trasladadas de más (conciliar)</span>}
                  </div>
                )}
                {p.observaciones && <p className="text-sm text-muted-foreground whitespace-pre-line">{p.observaciones}</p>}

                {months.length === 0
                  ? <p className="text-sm text-muted-foreground">Sin consumos registrados en este contrato.</p>
                  : months.map(m => <MonthBlock key={m} mes={m} list={cons.filter(c => monthKey(c.fecha) === m)} />)}
              </div>
            )}
          </div>
        );
      })}

      {sinContrato.length > 0 && (
        <div className="glass-card p-4 sm:p-5 space-y-3">
          <p className="font-semibold">Registros sin contrato asociado</p>
          {Array.from(new Set(sinContrato.map(c => monthKey(c.fecha)))).sort().reverse()
            .map(m => <MonthBlock key={m} mes={m} list={sinContrato.filter(c => monthKey(c.fecha) === m)} />)}
        </div>
      )}
    </div>
  );
}

function MonthBlock({ mes, list }: { mes: string; list: Consumption[] }) {
  const days = groupDays(list);
  const total = days.reduce((a, d) => a + d.total, 0);
  const label = monthLabel(mes);
  return (
    <details className="group rounded-lg border-2 border-border" open={mes === monthKey(todayISO())}>
      <summary className="cursor-pointer list-none flex flex-wrap items-center justify-between gap-2 px-3 py-3 min-h-[3rem]">
        <span className="font-medium inline-flex items-center gap-1.5">
          <ChevronDown className="w-4 h-4 group-open:rotate-180 transition-transform" />{label}
        </span>
        <span className="text-sm text-muted-foreground">
          <strong className="text-foreground">{total}</strong> consumidas · {days.filter(d => d.total > 0).length} días con consumo
          {days.some(d => d.total === 0) && ` · ${days.filter(d => d.total === 0).length} sin consumo`}
        </span>
      </summary>
      <div className="border-t-2 border-border divide-y divide-border">
        {days.map(d => (
          <div key={d.fecha} className="flex items-start justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <span className="capitalize">{parseISODate(d.fecha).toLocaleDateString('es-AR', { weekday: 'short' })}</span>{' '}
              <span className="tabular-nums">{formatDateAR(d.fecha)}</span>
              {d.notas.length > 0 && <p className="text-sm text-muted-foreground mt-0.5">{d.notas.join(' | ')}</p>}
              {d.registros > 1 && <p className="text-xs text-amber-700 mt-0.5">{d.registros} registros ese día</p>}
            </div>
            <span className={`shrink-0 tabular-nums ${d.total === 0 ? 'text-muted-foreground' : 'font-semibold'}`}>
              {d.total === 0 ? 'Sin consumo' : `${d.total} vianda${d.total > 1 ? 's' : ''}`}
            </span>
          </div>
        ))}
      </div>
      <div className="px-3 py-2 border-t-2 border-border">
        <Link to={`/admin/consumos?mes=${mes}`} className="text-sm text-primary hover:underline">Corregir en la planilla de {label}</Link>
      </div>
    </details>
  );
}

function Tile({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`${big ? 'text-3xl' : 'text-lg'} font-bold tabular-nums`}>{value}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-1.5">
      <p className="text-[11px] leading-tight text-muted-foreground">{label}</p>
      <p className="font-bold tabular-nums">{value}</p>
    </div>
  );
}
