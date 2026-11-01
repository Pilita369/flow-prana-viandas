import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatDateAR } from '@/lib/business';
import { capFirst, isConsumed, monthKey, parseISODate, planForMonth, todayISO } from '@/lib/consumo';
import type { Consumption, Plan } from '@/types';

interface Props {
  consumptions: Consumption[];
  plans: Plan[];
}

interface DayRow { fecha: string; total: number; notas: string[]; registros: number }

export default function ClientMonthlyHistory({ consumptions, plans }: Props) {
  const currentMonth = monthKey(todayISO());
  const months = Array.from(new Set(consumptions.map(c => monthKey(c.fecha)))).sort().reverse();
  const [open, setOpen] = useState<string | null>(months.includes(currentMonth) ? currentMonth : months[0] ?? null);

  if (months.length === 0) {
    return <div className="glass-card p-4 text-sm text-muted-foreground">Todavía no hay consumos registrados.</div>;
  }

  return (
    <div className="space-y-2">
      {months.map(m => {
        const [y, mo] = m.split('-').map(Number);
        const label = capFirst(new Date(y, mo - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }));
        const inMonth = consumptions.filter(c => monthKey(c.fecha) === m);

        const byDay = new Map<string, DayRow>();
        for (const c of inMonth) {
          const d = byDay.get(c.fecha) || { fecha: c.fecha, total: 0, notas: [], registros: 0 };
          if (isConsumed(c.status)) d.total += c.cantidad || 0;
          if (c.notas?.trim()) d.notas.push(c.notas.trim());
          d.registros += 1;
          byDay.set(c.fecha, d);
        }
        const dayRows = Array.from(byDay.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
        const consumidas = dayRows.reduce((a, d) => a + d.total, 0);
        const diasConConsumo = dayRows.filter(d => d.total > 0).length;
        const diasSinConsumo = dayRows.filter(d => d.total === 0).length;
        const plan = planForMonth(plans, y, mo - 1);
        const isOpen = open === m;

        return (
          <div key={m} className="glass-card p-4">
            <button className="w-full flex flex-wrap items-center justify-between gap-2 text-left" onClick={() => setOpen(isOpen ? null : m)}>
              <span className="font-medium flex items-center gap-1.5">
                {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}{label}
              </span>
              <span className="text-xs text-muted-foreground">
                <strong className="text-foreground">{consumidas}</strong> consumidas · {diasConConsumo} días con consumo
                {diasSinConsumo > 0 && ` · ${diasSinConsumo} sin consumo`}
              </span>
            </button>

            {isOpen && (
              <div className="mt-3 space-y-3">
                {plan && (
                  <p className="text-xs text-muted-foreground">
                    Contrato {formatDateAR(plan.fechaInicio)} – {formatDateAR(plan.fechaFin)}: {plan.cantidadContratada} compradas
                    {(plan.saldoAnteriorAplicado || 0) > 0 && ` + ${plan.saldoAnteriorAplicado} de saldo anterior`}.
                  </p>
                )}
                <div className="divide-y divide-border border border-border rounded-lg">
                  {dayRows.map(d => (
                    <div key={d.fecha} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <span className="capitalize">{parseISODate(d.fecha).toLocaleDateString('es-AR', { weekday: 'short' })}</span>{' '}
                        <span className="tabular-nums">{formatDateAR(d.fecha)}</span>
                        {d.notas.length > 0 && <p className="text-xs text-muted-foreground mt-0.5">{d.notas.join(' | ')}</p>}
                        {d.registros > 1 && <p className="text-xs text-amber-700 mt-0.5">{d.registros} registros ese día</p>}
                      </div>
                      <span className={`shrink-0 font-semibold tabular-nums ${d.total === 0 ? 'text-muted-foreground font-normal' : ''}`}>
                        {d.total === 0 ? 'Sin consumo' : `${d.total} vianda${d.total > 1 ? 's' : ''}`}
                      </span>
                    </div>
                  ))}
                </div>
                <Link to={`/admin/consumos?mes=${m}`} className="text-xs text-primary hover:underline">Corregir en la planilla de {label}</Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
