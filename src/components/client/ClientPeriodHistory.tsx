import { CheckCircle2, Circle, ChevronDown, Lock, PlayCircle } from 'lucide-react';
import { formatCurrencyAR, formatDateAR } from '@/lib/business';
import { capFirst, computePlanBalance, isConsumed, monthKey, parseISODate, todayISO } from '@/lib/consumo';
import type { Consumption, CreditNote, Plan } from '@/types';

/**
 * Historial del cliente organizado por período, del más reciente al más antiguo.
 * Mismos cálculos que administración; no muestra observaciones internas ni notas técnicas.
 */
export default function ClientPeriodHistory({ plans, consumptions, creditNotes }: { plans: Plan[]; consumptions: Consumption[]; creditNotes: CreditNote[] }) {
  const today = todayISO();
  const ordenados = [...plans].sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio));
  const consumidasTotal = consumptions.filter(c => isConsumed(c.status)).reduce((a, c) => a + (c.cantidad || 0), 0);
  const primero = consumptions.map(c => c.fecha).sort()[0];

  if (plans.length === 0) {
    return <div className="glass-card p-6 text-center text-muted-foreground">Todavía no hay períodos registrados.</div>;
  }

  return (
    <div className="space-y-4">
      {primero && (
        <p className="text-sm text-muted-foreground" data-testid="hist-total">
          Desde el {formatDateAR(primero)}: <strong className="text-foreground">{consumidasTotal}</strong> viandas consumidas en {plans.length} período{plans.length > 1 ? 's' : ''}.
        </p>
      )}
      {ordenados.map((p, i) => {
        const b = computePlanBalance(p, consumptions, plans, today);
        const cons = consumptions.filter(c => c.planId === p.id);
        const ultimoRegistro = cons.map(c => c.fecha).sort().pop();
        const destinos = plans.filter(x => x.saldoOrigenPlanId === p.id && (x.saldoAnteriorAplicado || 0) > 0);
        const ajustes = creditNotes.filter(n => n.tipo === 'vianda_favor' && n.planId === p.id && !n.anulado);
        const meses = Array.from(new Set(cons.map(c => monthKey(c.fecha)))).sort().reverse();
        const paraUsar = b.compradas + b.saldoAnteriorAplicado + b.ajusteManual - b.ajusteInicial;
        const saldoCierre = b.restante;

        return (
          <section key={p.id} className="glass-card p-4 space-y-3" data-testid="hist-periodo">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-lg">{formatDateAR(p.fechaInicio)} al {formatDateAR(p.fechaFin)}</h3>
              {b.cerrado
                ? <span className="inline-flex items-center gap-1 text-sm font-semibold rounded-full border-2 border-border px-2.5 py-0.5"><Lock className="w-4 h-4" />Cerrado</span>
                : <span className="inline-flex items-center gap-1 text-sm font-semibold rounded-full border-2 border-primary bg-primary/15 px-2.5 py-0.5"><PlayCircle className="w-4 h-4" />En curso</span>}
            </div>

            {b.cerrado ? (
              <div className="text-sm space-y-1.5" data-testid="hist-cierre">
                <p>
                  {b.compradas} compradas{b.saldoAnteriorAplicado > 0 && ` + ${b.saldoAnteriorAplicado} recibidas`}
                  {' '}− {b.consumidas} consumidas{b.ajusteManual > 0 && ` + ${b.ajusteManual} de ajuste${ajustes[0]?.descripcion ? ` (${ajustes.map(a => a.descripcion).filter(Boolean).join(', ')})` : ''}`}
                  {' '}= <strong>{Math.max(saldoCierre, 0)} a favor al cierre</strong>.
                </p>
                {destinos.map(d => (
                  <p key={d.id}>Se trasladaron <strong>{d.saldoAnteriorAplicado}</strong> al período {formatDateAR(d.fechaInicio)} al {formatDateAR(d.fechaFin)}.</p>
                ))}
                <p className="text-muted-foreground">Pendiente de trasladar: {b.aFavorSinAplicar}.</p>
                {b.excedido > 0 && <p>Se consumieron {b.excedido} más de las disponibles.</p>}
              </div>
            ) : (
              <p className="text-sm" data-testid="hist-en-curso">
                {[b.saldoAnteriorAplicado > 0 && `${b.saldoAnteriorAplicado} trasladadas`, `${b.compradas} nuevas`, b.ajusteManual > 0 && `${b.ajusteManual} a favor`].filter(Boolean).join(' + ')}
                {' '}= {paraUsar} para usar · {b.consumidas} consumidas · <strong>{Math.max(b.disponible, 0)} disponibles</strong>.
              </p>
            )}
            <p className="text-sm text-muted-foreground">Importe del período: {formatCurrencyAR(p.totalCalculado)} ({b.compradas} × {formatCurrencyAR(p.precioUnitario)})</p>

            <p className="text-sm" data-testid="hist-registros">
              {ultimoRegistro
                ? <>Consumos registrados hasta el <strong>{formatDateAR(ultimoRegistro)}</strong>.</>
                : 'Todavía no hay consumos registrados en este período.'}
            </p>

            {meses.map(m => {
              const delMes = cons.filter(c => monthKey(c.fecha) === m);
              const porDia = new Map<string, { total: number; registrado: boolean; notas: string[] }>();
              for (const c of delMes) {
                const d = porDia.get(c.fecha) || { total: 0, registrado: true, notas: [] };
                if (isConsumed(c.status)) d.total += c.cantidad || 0;
                if (c.notaCliente?.trim()) d.notas.push(c.notaCliente.trim()); // solo la nota para el cliente, nunca la interna
                porDia.set(c.fecha, d);
              }
              const dias = Array.from(porDia.entries()).sort((a, b) => b[0].localeCompare(a[0]));
              const total = dias.reduce((a, [, d]) => a + d.total, 0);
              const [y, mo] = m.split('-').map(Number);
              return (
                <details key={m} className="group rounded-lg border-2 border-border" open={i === 0 && m === meses[0]}>
                  <summary className="cursor-pointer list-none flex items-center justify-between gap-2 px-3 min-h-[3rem]">
                    <span className="font-medium inline-flex items-center gap-1.5">
                      <ChevronDown className="w-4 h-4 group-open:rotate-180 transition-transform" />
                      {capFirst(new Date(y, mo - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }))}
                    </span>
                    <span className="text-sm">{total} consumidas</span>
                  </summary>
                  <ul className="border-t-2 border-border divide-y divide-border">
                    {dias.map(([fecha, d]) => (
                      <li key={fecha} className="flex items-start justify-between gap-3 px-3 py-2.5">
                        <span>
                          <span className="capitalize">{parseISODate(fecha).toLocaleDateString('es-AR', { weekday: 'short' })}</span>{' '}
                          <span className="tabular-nums">{formatDateAR(fecha)}</span>
                          {d.notas.length > 0 && <span className="block text-sm text-muted-foreground">{d.notas.join(' · ')}</span>}
                        </span>
                        {d.total > 0
                          ? <span className="inline-flex items-center gap-1 font-semibold shrink-0"><CheckCircle2 className="w-4 h-4 text-primary" aria-hidden />{d.total} vianda{d.total > 1 ? 's' : ''}</span>
                          : <span className="inline-flex items-center gap-1 text-muted-foreground shrink-0"><Circle className="w-4 h-4" aria-hidden />Sin consumo</span>}
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
