import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { formatCurrencyAR, formatDateAR } from '@/lib/business';
import { isConsumed } from '@/lib/consumo';
import { advertenciasCambio, estadoDePago, textoTramos, type PropuestaRegimen } from '@/lib/contrato';
import type { PagoContrato } from '@/lib/pagos';
import type { Consumption, Intervalo, Plan, Regimen } from '@/types';

/**
 * Cálculo visible del contrato que se está editando: tramos, días efectivos, total pedido (editable),
 * créditos aplicados, viandas nuevas, importe, pagos y pendiente, más las advertencias. No guarda nada.
 */
export default function ContractRegimeCalc({ plan, regimen, tramos, unidades, precio, p, totalManual, onTotal, consumptions, pagos, ajustesDinero, envio }: {
  plan: Plan;
  regimen: Regimen;
  tramos: Intervalo[];
  unidades: number;
  precio: number;
  p: PropuestaRegimen;
  totalManual: number | null;
  onTotal: (v: number | null) => void;
  consumptions: Consumption[];
  pagos: PagoContrato[];
  ajustesDinero: number;
  envio: number;
}) {
  const creditos = (plan.saldoAnteriorAplicado || 0) + (plan.ajusteManualFavor || 0);
  const pago = estadoDePago(Math.max(p.importe + envio - ajustesDinero, 0), pagos.filter(x => x.planId === plan.id));
  const cons = consumptions.filter(c => c.planId === plan.id);
  const consumidas = cons.filter(c => isConsumed(c.status)).reduce((a, c) => a + (c.cantidad || 0), 0);
  const avisos = advertenciasCambio({
    tramos, consumosDelContrato: cons, consumidas, utilizables: p.nuevas + creditos, importe: pago.aAbonar, pagado: pago.pagado,
  });

  return (
    <div className="rounded-lg border-2 border-primary/60 bg-primary/5 p-3 space-y-3 text-sm" data-testid="calc-regimen">
      <p>
        <span className="text-muted-foreground">Fechas: </span>
        <strong>{regimen === 'intervalos' ? textoTramos(tramos) : `${formatDateAR(tramos[0]?.desde)} al ${formatDateAR(tramos[0]?.hasta)}`}</strong>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Dato label="Días efectivos de servicio" value={String(p.servicio.habiles)} testId="calc-dias" />
        <Dato label="Viandas por día" value={String(unidades)} />
      </div>
      <p className="text-xs text-muted-foreground">
        {p.servicio.diasDelPeriodo} días de atención{p.servicio.feriados.length > 0 && ` − ${p.servicio.feriados.length} feriado(s)`}
        {p.servicio.excluidas.length > 0 && ` − ${p.servicio.excluidas.length} excluido(s)`} = {p.servicio.habiles} × {unidades} = {p.sugeridas} sugeridas.
      </p>

      <div>
        <Label htmlFor="calc-total">Cantidad total que desea contratar</Label>
        <div className="flex gap-2 mt-1">
          <Input id="calc-total" type="number" min={0} inputMode="numeric" className="h-11" value={p.solicitadas}
            onChange={e => onTotal(Math.max(Number(e.target.value), 0))} />
          {totalManual !== null && regimen !== 'manual' && totalManual !== p.sugeridas && (
            <Button type="button" variant="outline" className="h-11 shrink-0" onClick={() => onTotal(null)}>Usar {p.sugeridas}</Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">Incluye las viandas que se cubren con créditos. Las nuevas a pagar se calculan abajo.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Dato label="Créditos disponibles" value={String(creditos)} />
        <Dato label="Créditos aplicados" value={String(p.aplicados)} testId="calc-aplicados" />
        <Dato label="Viandas nuevas a pagar" value={String(p.nuevas)} strong testId="calc-nuevas" />
        <Dato label="Precio unitario" value={formatCurrencyAR(precio)} />
        <Dato label="Importe del contrato" value={formatCurrencyAR(p.importe)} strong testId="calc-importe" />
        <Dato label="Pagos registrados" value={formatCurrencyAR(pago.pagado)} />
      </div>
      <p className="font-semibold" data-testid="calc-pendiente">Pendiente: {formatCurrencyAR(pago.pendiente)}{(envio > 0 || ajustesDinero > 0) && <span className="font-normal text-muted-foreground"> (importe{envio > 0 && ` + envío ${formatCurrencyAR(envio)}`}{ajustesDinero > 0 && ` − ajustes en $ ${formatCurrencyAR(ajustesDinero)}`} − pagos)</span>}</p>
      {p.sobrante > 0 && <p data-testid="calc-sobrante">Sobran {p.sobrante} vianda(s) de crédito: quedan a favor para otro período.</p>}
      {avisos.length > 0 && (
        <ul className="rounded-md border-2 border-warning bg-warning/10 px-3 py-2 space-y-1" data-testid="calc-avisos">
          {avisos.map(a => <li key={a}>⚠ {a}</li>)}
        </ul>
      )}
    </div>
  );
}

function Dato({ label, value, strong, testId }: { label: string; value: string; strong?: boolean; testId?: string }) {
  return (
    <div className={`rounded-lg border-2 px-3 py-2 ${strong ? 'border-primary bg-primary/15' : 'border-border bg-card'}`}>
      <p className="text-xs text-muted-foreground leading-tight">{label}</p>
      <p className="text-lg font-bold tabular-nums" data-testid={testId}>{value}</p>
    </div>
  );
}
