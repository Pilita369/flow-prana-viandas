import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatCurrencyAR, formatDateAR } from '@/lib/business';
import type { PlanBalance } from '@/lib/consumo';
import { tramosDelContrato, type DiasHabiles } from '@/lib/habiles';
import { textoTramos } from '@/lib/contrato';
import type { CreditNote, Plan } from '@/types';

function Dato({ label, value, strong, testId }: { label: string; value: string; strong?: boolean; testId?: string }) {
  return (
    <div className={`rounded-lg border-2 px-3 py-2 ${strong ? 'border-primary bg-primary/15' : 'border-border'}`}>
      <p className="text-xs text-muted-foreground leading-tight">{label}</p>
      <p className="text-lg font-bold tabular-nums" data-testid={testId}>{value}</p>
    </div>
  );
}

const corto = (iso: string) => formatDateAR(iso).slice(0, 5);

/** Cierre de un contrato terminado: cantidades históricas tal como quedaron, sin recalcular. */
export function ContractCloseout({ plan, plans, balance }: { plan: Plan; plans: Plan[]; balance: PlanBalance }) {
  const destinos = plans.filter(p => p.saldoOrigenPlanId === plan.id && (p.saldoAnteriorAplicado || 0) > 0);
  const origen = plan.saldoOrigenPlanId ? plans.find(p => p.id === plan.saldoOrigenPlanId) : undefined;
  // De lo comprado + recibido, lo que quedó sin consumir (los días en 0 no restan nada)
  const sinConsumir = Math.max(balance.compradas + balance.saldoAnteriorAplicado - balance.ajusteInicial - balance.consumidas, 0);
  return (
    <div className="space-y-2" data-testid="cierre">
      <p className="text-sm font-semibold">Cierre del contrato</p>
      <div className="grid grid-cols-2 gap-2">
        <Dato label="Viandas compradas" value={String(plan.cantidadContratada)} testId="contrato-compradas" />
        <Dato label="Importe del contrato" value={formatCurrencyAR(plan.totalCalculado)} testId="contrato-importe" />
        {balance.saldoAnteriorAplicado > 0 && <Dato label="Saldo recibido" value={`+${balance.saldoAnteriorAplicado}`} />}
        <Dato label="Consumidas" value={String(balance.consumidas)} testId="cierre-consumidas" />
        <Dato label="Sin consumir" value={String(sinConsumir)} testId="cierre-sin-consumir" />
        <Dato label="Ajustes a favor" value={`+${balance.ajusteManual}`} testId="cierre-ajustes" />
        <Dato label="Saldo al cierre" value={String(Math.max(balance.restante, 0))} strong testId="cierre-saldo" />
        <Dato label="Pendiente de trasladar" value={String(balance.aFavorSinAplicar)} testId="cierre-pendiente" />
      </div>
      {origen && balance.saldoAnteriorAplicado > 0 && (
        <p className="text-sm text-muted-foreground">Recibió {balance.saldoAnteriorAplicado} del contrato {formatDateAR(origen.fechaInicio)} al {formatDateAR(origen.fechaFin)}.</p>
      )}
      {destinos.map(d => (
        <p key={d.id} className="text-sm text-muted-foreground" data-testid="cierre-destino">
          Trasladadas {d.saldoAnteriorAplicado} al contrato {formatDateAR(d.fechaInicio)} al {formatDateAR(d.fechaFin)}.
        </p>
      ))}
      {balance.excedido > 0 && <p className="text-sm text-destructive">Se consumieron {balance.excedido} más de las disponibles.</p>}
      {balance.trasladadoDeMas > 0 && <p className="text-sm text-destructive" data-testid="cierre-de-mas">Se trasladaron {balance.trasladadoDeMas} más de lo que sobró: falta conciliar.</p>}
      <p className="text-xs text-muted-foreground">Los días cargados en 0 son días sin consumo: no cambian lo comprado ni el importe.</p>
    </div>
  );
}

/** Cálculo de la cantidad a comprar de un contrato en curso. Solo muestra; cambia únicamente si se confirma. */
export function QuantityReview({ plan, balance, servicio, necesarias, onConfirm }: {
  plan: Plan;
  balance: PlanBalance;
  servicio: DiasHabiles;
  necesarias: number;
  onConfirm?: (plan: Plan, nuevaCantidad: number, detalle: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  if (plan.modalidad !== 'fijo') return null;
  const comprar = Math.max(necesarias - balance.saldoAnteriorAplicado - balance.ajusteManual, 0);
  const diff = comprar - plan.cantidadContratada;
  const confirmar = async () => {
    if (!onConfirm) return;
    if (!window.confirm(`¿Cambiar las viandas compradas de ${plan.cantidadContratada} a ${comprar}? El importe pasa de ${formatCurrencyAR(plan.totalCalculado)} a ${formatCurrencyAR(comprar * plan.precioUnitario)}.`)) return;
    setSaving(true);
    try {
      await onConfirm(plan, comprar, `${servicio.habiles} días de servicio = ${necesarias} viandas − ${balance.saldoAnteriorAplicado} trasladadas${balance.ajusteManual > 0 ? ` − ${balance.ajusteManual} de ajustes` : ''}`);
    } finally { setSaving(false); }
  };
  return (
    <div className="rounded-lg border-2 border-warning/60 bg-warning/10 px-3 py-2 text-sm space-y-2" data-testid="revision">
      <p className="font-semibold">Revisión de la cantidad</p>
      <p>
        {plan.regimen === 'intervalos' ? `Tramos ${textoTramos(tramosDelContrato(plan))}` : `Del ${formatDateAR(plan.fechaInicio)} al ${formatDateAR(plan.fechaFin)}`}: {servicio.diasDelPeriodo} días de atención
        {' '}− {servicio.feriados.length} feriado(s){servicio.feriados.length > 0 && ` (${servicio.feriados.map(corto).join(', ')})`}
        {' '}− {servicio.excluidas.length} excluido(s){servicio.excluidas.length > 0 && ` (${servicio.excluidas.map(corto).join(', ')})`}
        {' '}= <strong>{servicio.habiles} días</strong> × {plan.unidadesPorRetiro || 1} = {servicio.habiles * (plan.unidadesPorRetiro || 1)} viandas
        {plan.cantidadSolicitada !== undefined && plan.cantidadSolicitada !== servicio.habiles * (plan.unidadesPorRetiro || 1) && <>; pedidas: <strong>{necesarias}</strong></>}
        {' '}− {balance.saldoAnteriorAplicado} trasladadas{balance.ajusteManual > 0 && ` − ${balance.ajusteManual} de ajustes`}
        {' '}= <strong data-testid="revision-comprar">{comprar} a comprar</strong>.
      </p>
      <p>
        Contratadas: <strong>{plan.cantidadContratada}</strong>.{' '}
        {diff === 0 ? 'El cálculo coincide.' : `El cálculo da ${diff > 0 ? '+' : ''}${diff}.`} Revisalo y confirmalo vos: no se cambia nada solo.
      </p>
      {diff !== 0 && onConfirm && (
        <Button variant="outline" className="h-11" disabled={saving} onClick={confirmar}>
          Usar {comprar} viandas ({formatCurrencyAR(comprar * plan.precioUnitario)})
        </Button>
      )}
    </div>
  );
}

/** Ajustes de viandas sumados a este contrato, con su origen y aplicación. */
export function ContractAdjustments({ plan, creditNotes }: { plan: Plan; creditNotes: CreditNote[] }) {
  const ajustes = creditNotes.filter(n => n.tipo === 'vianda_favor' && n.planId === plan.id);
  if (ajustes.length === 0) return null;
  return (
    <ul className="text-sm rounded-lg border-2 border-border px-3 py-2 space-y-1" data-testid="ajustes-contrato">
      {ajustes.map(n => {
        const asignado = [...n.historial].reverse().find(h => h.accion === 'asignado');
        return (
          <li key={n.id} className={n.anulado ? 'line-through text-muted-foreground' : ''}>
            <strong>+{n.cantidad}</strong> vianda(s) a favor{n.descripcion ? `: ${n.descripcion}` : ''}
            <span className="block text-xs text-muted-foreground">
              Cargado el {formatDateAR(n.fecha.slice(0, 10))}. {asignado ? `Aplicación: ${asignado.detalle}` : 'Suma a este contrato'}{n.anulado ? '. Anulado' : ''}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Diferencia entre lo trasladado y el saldo real al cierre (después de corregir consumos de un contrato cerrado). */
export function diferenciaDeTraslado(plan: Plan, plans: Plan[], balance: PlanBalance): { destino: Plan; sobrante: number; trasladado: number; diferencia: number } | null {
  const destino = plans.find(p => p.saldoOrigenPlanId === plan.id && (p.saldoAnteriorAplicado || 0) > 0);
  if (!destino || !balance.cerrado) return null;
  const sobrante = Math.max(balance.restante, 0);
  const trasladado = destino.saldoAnteriorAplicado || 0;
  if (sobrante === trasladado) return null;
  return { destino, sobrante, trasladado, diferencia: trasladado - sobrante };
}

/** Aviso de conciliación: no cambia nada solo; ofrece conciliar con confirmación. */
export function TrasladoAConciliar({ plan, plans, balance, onConciliar }: {
  plan: Plan; plans: Plan[]; balance: PlanBalance; onConciliar: (destino: Plan, sobrante: number) => void;
}) {
  const d = diferenciaDeTraslado(plan, plans, balance);
  if (!d) return null;
  const deMas = d.diferencia > 0;
  return (
    <div className="glass-card border-2 border-warning p-4 space-y-2" role="status" data-testid="conciliar-traslado">
      <p className="font-semibold">Saldo trasladado a conciliar</p>
      <p className="text-sm">
        El contrato {formatDateAR(plan.fechaInicio)} al {formatDateAR(plan.fechaFin)} cerró con <strong>{d.sobrante}</strong> a favor
        ({balance.compradas + balance.saldoAnteriorAplicado} − {balance.consumidas} consumidas{balance.ajusteManual ? ` + ${balance.ajusteManual} de ajustes` : ''}{balance.ajusteInicial ? ` − ${balance.ajusteInicial} de ajuste inicial` : ''}),
        pero se trasladaron <strong>{d.trasladado}</strong> al contrato {formatDateAR(d.destino.fechaInicio)} al {formatDateAR(d.destino.fechaFin)}.
      </p>
      <p className="text-sm font-semibold" data-testid="conciliar-diferencia">
        {deMas ? `${d.diferencia} vianda(s) trasladada(s) de más` : `${-d.diferencia} vianda(s) a favor sin trasladar`}
      </p>
      <p className="text-xs text-muted-foreground">Nada se cambia solo. Conciliar ajusta solo lo trasladado; no toca compras, precios ni pagos.</p>
      <Button variant="outline" className="h-11" onClick={() => onConciliar(d.destino, d.sobrante)}>Revisar y conciliar</Button>
    </div>
  );
}
