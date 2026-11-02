import { CheckCircle2 } from 'lucide-react';
import { formatCurrencyAR, formatDateAR } from '@/lib/business';
import { computePlanBalance, todayISO } from '@/lib/consumo';
import { estadoDePago, textoTramos } from '@/lib/contrato';
import { tramosDelContrato } from '@/lib/habiles';
import type { PagoContrato } from '@/lib/pagos';
import type { Consumption, CreditNote, Plan } from '@/types';

/**
 * Un solo resumen del contrato registrado. Arriba y destacado, lo que corresponde pagar;
 * debajo, de dónde salen las viandas para usar y cuántas quedan. Mismos cálculos que administración.
 */
export default function ClientPeriodSummary({ plan, plans, consumptions, creditNotes, pagos = [] }: {
  plan: Plan; plans: Plan[]; consumptions: Consumption[]; creditNotes: CreditNote[]; pagos?: PagoContrato[];
}) {
  const b = computePlanBalance(plan, consumptions, plans, todayISO());
  const creditos = b.saldoAnteriorAplicado + b.ajusteManual;
  const paraUsar = b.compradas + creditos - b.ajusteInicial;
  const disponibles = Math.max(b.disponible, 0);
  const pct = paraUsar > 0 ? Math.min(Math.round((b.consumidas / paraUsar) * 100), 100) : 0;

  // Importe: viandas nuevas + envío − descuentos en dinero; pagos registrados de este contrato
  const envio = plan.tipoEntrega === 'envio' ? plan.costoEnvio || 0 : 0;
  const descuentos = creditNotes
    .filter(n => !n.aplicado && !n.anulado && (n.tipo === 'saldo_envio' || n.tipo === 'descuento'))
    .reduce((a, n) => a + (n.monto || 0), 0);
  const pago = estadoDePago(Math.max(plan.totalCalculado + envio - descuentos, 0), pagos.filter(x => x.planId === plan.id));
  const pagado = pago.estado === 'pagado' || pago.estado === 'pagado_de_mas';
  const parcial = pago.estado === 'parcial';

  const partes = [
    b.saldoAnteriorAplicado > 0 && `${b.saldoAnteriorAplicado} trasladadas`,
    `${b.compradas} nuevas`,
    b.ajusteManual > 0 && `${b.ajusteManual} a favor`,
  ].filter(Boolean) as string[];
  const intervalos = plan.regimen === 'intervalos' && (plan.intervalos?.length || 0) > 0;

  return (
    <section className="glass-card p-4 space-y-3" aria-label="Tu período">
      <div>
        <h3 className="font-semibold text-lg">Tu período</h3>
        <p className="tabular-nums font-medium">{formatDateAR(plan.fechaInicio)} al {formatDateAR(plan.fechaFin)}</p>
        {intervalos && <p className="text-sm" data-testid="cliente-tramos">Días de servicio: {textoTramos(tramosDelContrato(plan))}</p>}
      </div>

      {/* Lo que corresponde pagar, destacado */}
      <div className="rounded-xl border-2 border-primary bg-primary/15 px-4 py-3" data-testid="cliente-importe-box">
        <p className="text-sm font-semibold">
          {pagado ? <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />Pagado</span>
            : parcial ? 'Te queda por pagar' : 'Importe de tu contratación'}
        </p>
        <p className="text-[2.25rem] leading-tight font-bold tabular-nums" data-testid="cliente-importe">
          {formatCurrencyAR(parcial ? pago.pendiente : pago.aAbonar)}
        </p>
        <p className="text-sm" data-testid="cliente-desglose">
          {b.compradas} vianda{b.compradas === 1 ? '' : 's'} nueva{b.compradas === 1 ? '' : 's'}
          {creditos > 0 && ` · ${creditos} vianda${creditos === 1 ? '' : 's'} a favor aplicada${creditos === 1 ? '' : 's'}`}
        </p>
        {(parcial || pagado || envio > 0 || descuentos > 0) && (
          <p className="text-xs text-muted-foreground mt-1" data-testid="cliente-detalle-pago">
            Total {formatCurrencyAR(pago.aAbonar)}
            {envio > 0 && ` (incluye envío ${formatCurrencyAR(envio)})`}
            {descuentos > 0 && ` · descuentos ${formatCurrencyAR(descuentos)}`}
            {pago.pagado > 0 && ` · pagado ${formatCurrencyAR(pago.pagado)}`}
          </p>
        )}
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

      {creditos > 0 && <p className="text-xs text-muted-foreground">Las viandas a favor no se cobran: ya están descontadas de las nuevas ({formatCurrencyAR(plan.precioUnitario)} c/u).</p>}
      <p className="text-xs text-muted-foreground">Así figura tu contrato registrado. Si querés cambiar algo, escribinos.</p>
    </section>
  );
}
