import { useState } from 'react';
import { Copy, Plus, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrencyAR, formatDateAR } from '@/lib/business';
import { addDaysISO, computePlanBalance, todayISO } from '@/lib/consumo';
import { estadoDePago, estimarCobertura, necesidadDelContrato, resumenWhatsApp, textoTramos } from '@/lib/contrato';
import { tramosDelContrato } from '@/lib/habiles';
import { anularPago, registrarPago, type PagoContrato } from '@/lib/pagos';
import { ContractAdjustments, ContractCloseout, QuantityReview } from '@/components/ContractPeriodParts';
import type { Client, Consumption, CreditNote, Plan } from '@/types';

interface Props {
  client: Client;
  plan: Plan;
  plans: Plan[];
  consumptions: Consumption[];
  feriados: Set<string>;
  creditNotes: CreditNote[];
  pagos: PagoContrato[];
  onPagosChange: () => void | Promise<void>;
  /** Cambia la cantidad comprada después de que la persona confirma la revisión (solo contrato en curso). */
  onRevisarCantidad?: (plan: Plan, nuevaCantidad: number, detalle: string) => Promise<void>;
  /** Abrir "Conciliar saldo" desde el cierre de un contrato. */
  onConciliar?: (from: Plan, to: Plan) => void;
}

const ESTADO: Record<string, { label: string; cls: string }> = {
  sin_pagos: { label: 'Sin pagos registrados', cls: 'border-border bg-muted text-foreground' },
  parcial: { label: 'Pago parcial', cls: 'border-warning bg-warning/20 text-foreground' },
  pagado: { label: 'Pagado', cls: 'border-primary bg-primary/20 text-foreground' },
  pagado_de_mas: { label: 'Pagado de más', cls: 'border-warning bg-warning/20 text-foreground' },
};

/**
 * Resumen del contrato del período seleccionado.
 * En curso: lo que cubre, revisión de la cantidad, pago y hasta cuándo alcanzan las viandas.
 * Cerrado: el cierre tal como quedó, sin recalcular cantidades históricas.
 */
export default function ActiveContractSummary({ client, plan, plans, consumptions, feriados, creditNotes, pagos, onPagosChange, onRevisarCantidad, onConciliar }: Props) {
  const today = todayISO();
  const { servicio, necesarias } = necesidadDelContrato(plan, feriados);
  const balance = computePlanBalance(plan, consumptions, plans, today);
  const origen = plan.saldoOrigenPlanId ? plans.find(p => p.id === plan.saldoOrigenPlanId) : undefined;
  const utilizables = balance.compradas + balance.saldoAnteriorAplicado + balance.ajusteManual - balance.ajusteInicial;

  // Hasta cuándo alcanzan: desde el día siguiente al último registro del contrato (o su inicio)
  const ultimo = consumptions.filter(c => c.planId === plan.id).map(c => c.fecha).sort().pop();
  const desde = ultimo ? addDaysISO(ultimo, 1) : plan.fechaInicio;
  const cobertura = estimarCobertura(plan, balance.disponible, desde, feriados);

  // Importe: contrato + envío − ajustes en dinero pendientes; pagos de este contrato
  const envio = plan.tipoEntrega === 'envio' ? plan.costoEnvio || 0 : 0;
  const ajustesDinero = creditNotes
    .filter(n => !n.aplicado && !n.anulado && (n.tipo === 'saldo_envio' || n.tipo === 'descuento'))
    .reduce((a, n) => a + (n.monto || 0), 0);
  const pagosPlan = pagos.filter(p => p.planId === plan.id);
  const pago = estadoDePago(Math.max(plan.totalCalculado + envio - ajustesDinero, 0), pagosPlan);

  const [registrando, setRegistrando] = useState(false);
  const [form, setForm] = useState({ monto: '', fecha: today, medio: 'transferencia', nota: '' });
  const [guardando, setGuardando] = useState(false);

  const guardarPago = async () => {
    if (guardando) return;
    setGuardando(true);
    try {
      await registrarPago({ clientId: client.id, planId: plan.id, fecha: form.fecha, monto: Number(form.monto), medio: form.medio, nota: form.nota });
      toast.success(`Pago de ${formatCurrencyAR(Number(form.monto))} registrado`);
      setRegistrando(false);
      setForm({ monto: '', fecha: today, medio: 'transferencia', nota: '' });
      await onPagosChange();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'No se pudo registrar el pago');
    } finally {
      setGuardando(false);
    }
  };

  const anular = async (p: PagoContrato) => {
    const motivo = window.prompt(`Anular el pago de ${formatCurrencyAR(p.monto)} del ${formatDateAR(p.fecha)}. Motivo:`);
    if (motivo === null) return;
    try {
      await anularPago(p.id, motivo);
      toast.success('Pago anulado. Queda en el historial.');
      await onPagosChange();
    } catch (e) { console.error(e); toast.error('No se pudo anular el pago'); }
  };

  const copiar = async () => {
    const texto = resumenWhatsApp({ nombre: client.nombre, plan, diasServicio: servicio.habiles, necesarias, envio, ajustesDinero, pago });
    try {
      await navigator.clipboard.writeText(texto);
      toast.success('Resumen copiado. Pegalo en WhatsApp.');
    } catch {
      window.prompt('Copiá el resumen:', texto);
    }
  };

  const estado = ESTADO[pago.estado];

  return (
    <div className="space-y-3">
      {balance.cerrado ? (
        <ContractCloseout plan={plan} plans={plans} balance={balance} onConciliar={onConciliar ? d => onConciliar(plan, d) : undefined} />
      ) : (
      <>
      {plan.regimen === 'intervalos' && (
        <p className="text-sm" data-testid="contrato-tramos"><span className="text-muted-foreground">Fechas de servicio: </span><strong>{textoTramos(tramosDelContrato(plan))}</strong></p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Dato label="Días de servicio" value={String(servicio.habiles)} testId="contrato-dias" />
        <Dato label={plan.regimen === 'manual' || plan.cantidadSolicitada !== undefined ? 'Viandas pedidas' : 'Viandas necesarias'} value={String(necesarias)} testId="contrato-necesarias" />
        <Dato label="Viandas compradas" value={String(plan.cantidadContratada)} testId="contrato-compradas" />
        <Dato label="Saldo anterior aplicado" value={String(plan.saldoAnteriorAplicado || 0)} testId="contrato-saldo" />
        {(plan.ajusteManualFavor || 0) > 0 && <Dato label="Ajustes a favor" value={String(plan.ajusteManualFavor)} />}
        <Dato label="Precio unitario" value={formatCurrencyAR(plan.precioUnitario)} />
        <Dato label="Importe del contrato" value={formatCurrencyAR(plan.totalCalculado)} strong testId="contrato-importe" />
      </div>
      {origen && (plan.saldoAnteriorAplicado || 0) > 0 && (
        <p className="text-sm text-muted-foreground">
          Saldo trasladado del contrato {formatDateAR(origen.fechaInicio)} al {formatDateAR(origen.fechaFin)}.
        </p>
      )}

      <QuantityReview plan={plan} balance={balance} servicio={servicio} necesarias={necesarias} onConfirm={onRevisarCantidad} />

      {/* Cobertura: todas las viandas utilizables, no solo las compradas */}
      {cobertura && (
        <p className="text-sm rounded-lg border-2 border-border bg-muted/30 px-3 py-2" data-testid="cobertura">
          {utilizables} utilizables − {balance.consumidas} consumidas = <strong>{balance.disponible} disponibles</strong>.{' '}
          {cobertura.diasRestantes === 0
            ? 'No quedan días de servicio en el período.'
            : cobertura.alcanza
              ? <>Alcanzan para los {cobertura.diasRestantes} días de servicio que faltan, hasta el <strong>{formatDateAR(plan.fechaFin)}</strong>{cobertura.sobrantes > 0 && <> y sobrarían {cobertura.sobrantes}</>}.</>
              : <>Alcanzan hasta el <strong>{cobertura.hasta ? formatDateAR(cobertura.hasta) : '-'}</strong>; faltan {cobertura.faltantes} para cubrir hasta el {formatDateAR(plan.fechaFin)}.</>}
        </p>
      )}
      </>
      )}

      <ContractAdjustments plan={plan} creditNotes={creditNotes} />

      {/* Pago */}
      <div className="rounded-lg border-2 border-border p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`text-sm font-semibold rounded-full border-2 px-3 py-1 ${estado.cls}`} data-testid="estado-pago">{estado.label}</span>
          {!registrando && (
            <Button variant="outline" size="sm" className="h-10" onClick={() => { setForm(f => ({ ...f, monto: String(pago.pendiente || '') })); setRegistrando(true); }}>
              <Plus className="w-4 h-4 mr-1.5" />Registrar pago
            </Button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <span><span className="block text-muted-foreground">A abonar</span><strong className="tabular-nums">{formatCurrencyAR(pago.aAbonar)}</strong></span>
          <span><span className="block text-muted-foreground">Pagado</span><strong className="tabular-nums">{formatCurrencyAR(pago.pagado)}</strong></span>
          <span><span className="block text-muted-foreground">Pendiente</span><strong className="tabular-nums" data-testid="pendiente">{formatCurrencyAR(pago.pendiente)}</strong></span>
        </div>
        {(envio > 0 || ajustesDinero > 0) && (
          <p className="text-xs text-muted-foreground">
            {formatCurrencyAR(plan.totalCalculado)}{envio > 0 && ` + envío ${formatCurrencyAR(envio)}`}{ajustesDinero > 0 && ` − ajustes a favor ${formatCurrencyAR(ajustesDinero)}`}
          </p>
        )}
        {pago.estado === 'sin_pagos' && <p className="text-xs text-muted-foreground">El pendiente sale de los pagos cargados acá. Si cobraste por fuera, registralo.</p>}

        {registrando && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div><Label htmlFor="pago-monto">Monto</Label><Input id="pago-monto" type="number" min={0} inputMode="numeric" className="h-11 mt-1" value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} /></div>
            <div><Label htmlFor="pago-fecha">Fecha</Label><Input id="pago-fecha" type="date" className="h-11 mt-1" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} /></div>
            <div>
              <Label htmlFor="pago-medio">Medio</Label>
              <select id="pago-medio" className="w-full h-11 mt-1 rounded-md border border-input bg-background px-2" value={form.medio} onChange={e => setForm({ ...form, medio: e.target.value })}>
                <option value="transferencia">Transferencia</option>
                <option value="efectivo">Efectivo</option>
                <option value="mercadopago">Mercado Pago</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div><Label htmlFor="pago-nota">Nota</Label><Input id="pago-nota" className="h-11 mt-1" value={form.nota} onChange={e => setForm({ ...form, nota: e.target.value })} placeholder="Opcional" /></div>
            <div className="col-span-2 flex gap-2">
              <Button className="h-11 flex-1" onClick={guardarPago} disabled={guardando || !(Number(form.monto) > 0)}>{guardando ? 'Guardando…' : 'Guardar pago'}</Button>
              <Button variant="outline" className="h-11" onClick={() => setRegistrando(false)}>Cancelar</Button>
            </div>
          </div>
        )}

        {pagosPlan.length > 0 && (
          <ul className="divide-y divide-border text-sm">
            {pagosPlan.map(p => (
              <li key={p.id} className={`flex items-center justify-between gap-2 py-1.5 ${p.anulado ? 'opacity-60' : ''}`}>
                <span className="min-w-0">
                  <span className={p.anulado ? 'line-through' : ''}>{formatDateAR(p.fecha)} · {formatCurrencyAR(p.monto)}</span>
                  <span className="text-muted-foreground"> · {p.medio || 'sin medio'}{p.nota ? ` · ${p.nota}` : ''}</span>
                  {p.anulado && <span className="block text-xs text-muted-foreground">Anulado{p.anuladoMotivo ? `: ${p.anuladoMotivo}` : ''}</span>}
                </span>
                {!p.anulado && (
                  <Button variant="ghost" size="sm" className="h-9 shrink-0 text-destructive" onClick={() => anular(p)}><Ban className="w-4 h-4 mr-1" />Anular</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button variant="outline" className="w-full h-11" onClick={copiar}>
        <Copy className="w-4 h-4 mr-2" />Copiar resumen para WhatsApp
      </Button>
    </div>
  );
}

function Dato({ label, value, strong, testId }: { label: string; value: string; strong?: boolean; testId?: string }) {
  return (
    <div className={`rounded-lg border-2 px-3 py-2 ${strong ? 'border-primary bg-primary/15' : 'border-border'}`}>
      <p className="text-xs text-muted-foreground leading-tight">{label}</p>
      <p className="text-lg font-bold tabular-nums" data-testid={testId}>{value}</p>
    </div>
  );
}
