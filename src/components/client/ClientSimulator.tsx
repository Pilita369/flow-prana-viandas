import { useState } from 'react';
import { Calculator, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrencyAR, formatDateAR, getBusinessConfig, getSuggestedPrice } from '@/lib/business';
import { addDaysISO, computePlanBalance, todayISO } from '@/lib/consumo';
import { estimarCobertura } from '@/lib/contrato';
import { LUNES_A_VIERNES, calcularPropuesta, excluidasEnPeriodo, fechasPropuestas } from '@/lib/habiles';
import type { Client, Consumption, Plan } from '@/types';

/**
 * Simulación del próximo período para el cliente. No guarda nada ni aplica saldo:
 * solo calcula y, si quiere, arma un mensaje de WhatsApp para pedir el cambio. Confirma la administradora.
 * Usa el mismo cálculo que la preparación del contrato en administración.
 */
export default function ClientSimulator({ client, plan, plans, consumptions, feriados }: {
  client: Client; plan: Plan | null; plans: Plan[]; consumptions: Consumption[]; feriados: Set<string>;
}) {
  const today = todayISO();
  const mesSiguiente = plan ? addDaysISO(plan.fechaFin, 1).slice(0, 7) : today.slice(0, 7);
  const propuestas = fechasPropuestas(mesSiguiente, plan);
  const [inicio, setInicio] = useState(propuestas.inicio);
  const [fin, setFin] = useState(propuestas.fin);
  const [cantidad, setCantidad] = useState<number | null>(null);
  const [aplicar, setAplicar] = useState<number | null>(null);

  // Saldo a favor: definitivo si el contrato terminó; si sigue en curso, solo una estimación
  const b = plan ? computePlanBalance(plan, consumptions, plans, today) : null;
  const enCurso = !!plan && !!b && !b.cerrado;
  const ultimo = plan ? consumptions.filter(c => c.planId === plan.id).map(c => c.fecha).sort().pop() : undefined;
  const estimado = plan && b && enCurso
    ? estimarCobertura(plan, b.disponible, ultimo ? addDaysISO(ultimo, 1) : plan.fechaInicio, feriados)?.sobrantes ?? 0
    : b?.aFavorSinAplicar ?? 0;
  const maxSaldo = enCurso ? Math.max(b?.disponible ?? 0, 0) : (b?.aFavorSinAplicar ?? 0);

  const fijo = !plan || plan.modalidad === 'fijo';
  const p = calcularPropuesta({
    inicio, fin,
    diasFijos: fijo ? plan?.diasFijos : LUNES_A_VIERNES,
    unidadesPorRetiro: plan?.unidadesPorRetiro || 1,
    precioUnitario: plan?.precioUnitario || getSuggestedPrice('retiro'),
    feriados,
    excluidas: excluidasEnPeriodo(plans, inicio, fin),
    saldoDisponible: maxSaldo,
    aplicarElegido: aplicar ?? estimado,
    ajustesPendientes: 0,
    necesariasManual: cantidad,
  });
  const fechasOk = !!inicio && !!fin && inicio <= fin;

  const pedir = () => {
    const msg = [
      `Hola! Soy ${client.nombre} ${client.apellido}. Quisiera consultar por mi próximo período:`,
      `Del ${formatDateAR(inicio)} al ${formatDateAR(fin)} necesitaría ${p.necesarias} viandas.`,
      p.aplicar > 0 ? `Aplicando ${p.aplicar} a favor, serían ${p.comprar} nuevas (${formatCurrencyAR(p.importe)}).` : `Serían ${p.comprar} nuevas (${formatCurrencyAR(p.importe)}).`,
      '¿Me lo confirmás?',
    ].join('\n');
    window.open(`https://wa.me/${getBusinessConfig().whatsappNegocio}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <section className="glass-card p-4 space-y-4" aria-label="Simular próximo período">
      <div>
        <h3 className="font-semibold text-lg inline-flex items-center gap-2"><Calculator className="w-5 h-5" />Simular mi próximo período</h3>
        <p className="text-sm rounded-lg border-2 border-border bg-muted/40 px-3 py-2 mt-2">
          <strong>Es solo una simulación.</strong> No cambia tu contrato, tus pagos ni tu saldo. Si querés pedirlo, mandanos el mensaje y lo confirmamos.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="sim-inicio">Desde</Label>
          <Input id="sim-inicio" type="date" className="h-12 mt-1" value={inicio} onChange={e => setInicio(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="sim-fin">Hasta</Label>
          <Input id="sim-fin" type="date" className="h-12 mt-1" value={fin} onChange={e => setFin(e.target.value)} />
        </div>
      </div>
      {!fechasOk && <p className="text-sm text-destructive">La fecha “hasta” tiene que ser igual o posterior a “desde”.</p>}

      <p className="text-sm text-muted-foreground" data-testid="sim-dias">
        {p.servicio.habiles} días de servicio en esas fechas (lunes a viernes{p.servicio.feriados.length > 0 ? `, sin ${p.servicio.feriados.length} feriado(s)` : ''}{p.servicio.excluidas.length > 0 ? `, sin ${p.servicio.excluidas.length} día(s) que no venís` : ''}).
      </p>

      <div>
        <Label htmlFor="sim-cantidad">Viandas que necesitás</Label>
        <Input id="sim-cantidad" type="number" min={0} inputMode="numeric" className="h-12 mt-1 text-lg" value={p.necesarias}
          onChange={e => setCantidad(Math.max(Number(e.target.value), 0))} />
        <p className="text-xs text-muted-foreground mt-1">Podés poner menos si vas a viajar o faltar algunos días.</p>
      </div>

      <div className="rounded-lg border-2 border-border p-3 space-y-2">
        <p className="text-sm">
          {enCurso
            ? <>Saldo a favor <strong>estimado</strong> al {plan ? formatDateAR(plan.fechaFin) : ''}: <strong data-testid="sim-saldo">{estimado}</strong>. Es provisional: depende de lo que consumas hasta entonces.</>
            : <>Saldo a favor disponible: <strong data-testid="sim-saldo">{maxSaldo}</strong>.</>}
        </p>
        {maxSaldo > 0 && (
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="sim-aplicar">Saldo a aplicar (máx. {p.maxAplicar})</Label>
            <Input id="sim-aplicar" type="number" min={0} inputMode="numeric" className="h-12 w-24 text-right" value={p.aplicar}
              onChange={e => setAplicar(Number(e.target.value))} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg border-2 border-primary bg-primary/15 p-2.5">
          <p className="text-sm text-muted-foreground">Viandas nuevas</p>
          <p className="text-2xl font-bold tabular-nums" data-testid="sim-nuevas">{p.comprar}</p>
        </div>
        <div className="rounded-lg border-2 border-primary bg-primary/15 p-2.5">
          <p className="text-sm text-muted-foreground">Importe</p>
          <p className="text-2xl font-bold tabular-nums" data-testid="sim-importe">{formatCurrencyAR(p.importe)}</p>
        </div>
      </div>

      <Button className="w-full h-12 text-base" onClick={pedir} disabled={!fechasOk || p.necesarias <= 0}>
        <MessageCircle className="w-5 h-5 mr-2" />Pedir este cambio por WhatsApp
      </Button>
    </section>
  );
}
