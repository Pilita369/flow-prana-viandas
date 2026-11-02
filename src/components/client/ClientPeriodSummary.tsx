import { formatCurrencyAR, formatDateAR } from '@/lib/business';
import { computePlanBalance, todayISO } from '@/lib/consumo';
import type { Consumption, CreditNote, Plan } from '@/types';

/**
 * Un solo resumen del contrato registrado: de dónde salen las viandas para usar,
 * cuántas se consumieron, cuántas quedan y el importe. Mismos cálculos que administración.
 */
export default function ClientPeriodSummary({ plan, plans, consumptions, creditNotes }: {
  plan: Plan; plans: Plan[]; consumptions: Consumption[]; creditNotes: CreditNote[];
}) {
  const b = computePlanBalance(plan, consumptions, plans, todayISO());
  const paraUsar = b.compradas + b.saldoAnteriorAplicado + b.ajusteManual - b.ajusteInicial;
  const disponibles = Math.max(b.disponible, 0);
  const pct = paraUsar > 0 ? Math.min(Math.round((b.consumidas / paraUsar) * 100), 100) : 0;

  // Importe: viandas nuevas + envío − descuentos en dinero pendientes (igual que antes)
  const envio = plan.tipoEntrega === 'envio' ? plan.costoEnvio || 0 : 0;
  const descuentos = creditNotes
    .filter(n => !n.aplicado && !n.anulado && (n.tipo === 'saldo_envio' || n.tipo === 'descuento'))
    .reduce((a, n) => a + (n.monto || 0), 0);
  const total = plan.totalCalculado + envio - descuentos;

  const partes = [
    b.saldoAnteriorAplicado > 0 && `${b.saldoAnteriorAplicado} trasladadas`,
    `${b.compradas} nuevas`,
    b.ajusteManual > 0 && `${b.ajusteManual} a favor`,
  ].filter(Boolean) as string[];

  return (
    <section className="glass-card p-4 space-y-3" aria-label="Tu período">
      <div>
        <h3 className="font-semibold text-lg">Tu período</h3>
        <p className="tabular-nums font-medium">{formatDateAR(plan.fechaInicio)} al {formatDateAR(plan.fechaFin)}</p>
      </div>

      <dl className="space-y-2 text-base">
        <div className="rounded-lg border-2 border-border px-3 py-2">
          <dt className="text-sm text-muted-foreground">Viandas para usar en el período</dt>
          <dd data-testid="cliente-para-usar">{partes.join(' + ')} = <strong className="text-xl tabular-nums">{paraUsar}</strong></dd>
        </div>
        <div className="rounded-lg border-2 border-border px-3 py-2">
          <dt className="text-sm text-muted-foreground">Disponibles ahora</dt>
          <dd data-testid="cliente-disponibles">{b.consumidas} consumidas → <strong className="text-xl tabular-nums">{disponibles}</strong> disponibles</dd>
        </div>
      </dl>

      <div>
        <div className="flex justify-between text-sm mb-1">
          <span>{b.consumidas} de {paraUsar} usadas</span>
          <span className="font-semibold">{pct}%</span>
        </div>
        <div className="w-full bg-muted rounded-full h-3 border border-border" role="progressbar" aria-valuemin={0} aria-valuemax={paraUsar} aria-valuenow={b.consumidas} aria-label="Viandas usadas">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="border-t-2 border-border pt-3 space-y-1 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Importe por las {b.compradas} nuevas ({formatCurrencyAR(plan.precioUnitario)} c/u)</span>
          <strong className="tabular-nums" data-testid="cliente-importe">{formatCurrencyAR(plan.totalCalculado)}</strong>
        </div>
        {envio > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Envío</span><span className="tabular-nums">{formatCurrencyAR(envio)}</span></div>}
        {descuentos > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Descuentos a favor</span><span className="tabular-nums">− {formatCurrencyAR(descuentos)}</span></div>}
        {(envio > 0 || descuentos > 0) && (
          <div className="flex justify-between font-bold border-t border-border pt-1"><span>Total del período</span><span className="tabular-nums">{formatCurrencyAR(total)}</span></div>
        )}
        {b.saldoAnteriorAplicado > 0 && <p className="text-xs text-muted-foreground">Las {b.saldoAnteriorAplicado} trasladadas son saldo a favor de tu período anterior: no se cobran de nuevo.</p>}
      </div>

      <p className="text-xs text-muted-foreground">Así figura tu contrato registrado. Si querés cambiar algo, escribinos.</p>
    </section>
  );
}
