import { forwardRef, useEffect, useRef, useState } from 'react';
import { ChevronDown, RefreshCw, FilePlus2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrencyAR, formatDateAR, getSuggestedPrice } from '@/lib/business';
import { capFirst, monthDays, planForMonth } from '@/lib/consumo';
import {
  LUNES_A_VIERNES, calcularPropuesta, contarDiasHabiles, excluidasEnPeriodo, fechasPropuestas, isExcluidaCliente,
} from '@/lib/habiles';
import type { DayOfWeek, DeliveryType, Plan } from '@/types';

const DAYS: { value: DayOfWeek; label: string }[] = [
  { value: 'lunes', label: 'Lun' }, { value: 'martes', label: 'Mar' }, { value: 'miercoles', label: 'Mié' },
  { value: 'jueves', label: 'Jue' }, { value: 'viernes', label: 'Vie' },
];

/** Lo que se guarda al confirmar: el contrato nuevo y cuánto saldo se aplica (una sola vez). */
export interface ContratoConfirmado {
  fechaInicio: string;
  fechaFin: string;
  unidadesPorRetiro: number;
  precioUnitario: number;
  modalidad: 'fijo' | 'flexible';
  tipoEntrega: DeliveryType;
  costoEnvio?: number;
  diasFijos?: DayOfWeek[];
  cantidadSemanal?: number;
  horaLimite?: string;
  observaciones: string;
  fechasExcluidas: string[];
  necesarias: number;
  aplicar: number;
  comprar: number;
  sumarPendientes: boolean;
  diasServicio: number;
}

interface Props {
  /** Mes seleccionado en el calendario, 'YYYY-MM'. */
  mes: string;
  plans: Plan[];
  activePlan: Plan | null;
  feriados: Set<string>;
  /** Saldo a favor del contrato vigente que todavía no se aplicó a otro contrato. */
  saldoDisponible: number;
  /** Viandas de ajustes manuales pendientes (sin contrato). */
  viandasPendientes: number;
  /** Guarda el contrato. Devuelve true si se guardó. */
  onConfirm: (c: ContratoConfirmado) => Promise<boolean>;
}

function formDesde(plan: Plan | null) {
  return {
    unidadesPorRetiro: plan?.unidadesPorRetiro || 1,
    precioUnitario: plan?.precioUnitario || getSuggestedPrice('retiro'),
    modalidad: (plan?.modalidad || 'fijo') as 'fijo' | 'flexible',
    tipoEntrega: (plan?.tipoEntrega || 'retiro') as DeliveryType,
    costoEnvio: plan?.costoEnvio || 0,
    diasFijos: plan?.diasFijos?.length ? plan.diasFijos : LUNES_A_VIERNES,
    cantidadSemanal: plan?.cantidadSemanal || 3,
    horaLimite: plan?.horaLimite || '20:00',
    observaciones: '',
  };
}

/**
 * Tarjeta destacada: días hábiles del mes seleccionado y propuesta de contratación / renovación.
 * Cambiar los campos solo recalcula la propuesta; se guarda únicamente al confirmar.
 */
const ContractPlannerCard = forwardRef<HTMLDivElement, Props>(function ContractPlannerCard(
  { mes, plans, activePlan, feriados, saldoDisponible, viandasPendientes, onConfirm }, ref,
) {
  const [form, setForm] = useState(() => formDesde(activePlan));
  const [fechas, setFechas] = useState(() => fechasPropuestas(mes, activePlan));
  const [aplicarElegido, setAplicarElegido] = useState<number | null>(null);
  const [necesariasManual, setNecesariasManual] = useState<number | null>(null);
  const [sumarPendientes, setSumarPendientes] = useState(true);
  const [saving, setSaving] = useState(false);
  // Evita guardar dos veces con un doble toque (el estado tarda un render en actualizarse)
  const busy = useRef(false);

  // Al cambiar de mes (o de contrato vigente) se vuelve a proponer: es solo una propuesta, no se guarda nada
  useEffect(() => {
    setFechas(fechasPropuestas(mes, activePlan));
    setAplicarElegido(null);
    setNecesariasManual(null);
  }, [mes, activePlan?.id, activePlan?.fechaFin]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setForm(formDesde(activePlan)); }, [activePlan?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Días hábiles del MES (mismas reglas que el calendario)
  const [y, m] = mes.split('-').map(Number);
  const days = monthDays(y, m - 1);
  const planMes = planForMonth(plans, y, m - 1);
  const habilesMes = contarDiasHabiles(days[0], days[days.length - 1], {
    diasFijos: planMes?.modalidad === 'fijo' ? planMes.diasFijos : undefined,
    feriados,
    excluidas: days.filter(d => isExcluidaCliente(plans, d)),
  });
  const mesLabel = capFirst(new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }));

  // Propuesta para el PERÍODO elegido
  const fijo = form.modalidad === 'fijo';
  const excluidas = excluidasEnPeriodo(plans, fechas.inicio, fechas.fin);
  const p = calcularPropuesta({
    inicio: fechas.inicio,
    fin: fechas.fin,
    diasFijos: fijo ? form.diasFijos : LUNES_A_VIERNES,
    unidadesPorRetiro: form.unidadesPorRetiro,
    precioUnitario: form.precioUnitario,
    feriados,
    excluidas,
    saldoDisponible,
    aplicarElegido,
    ajustesPendientes: sumarPendientes ? viandasPendientes : 0,
    necesariasManual: fijo ? necesariasManual : (necesariasManual ?? (activePlan?.cantidadContratada || 0)),
  });
  const fechasOk = !!fechas.inicio && !!fechas.fin && fechas.inicio <= fechas.fin;
  const accion = activePlan ? 'Confirmar renovación' : 'Crear contrato';

  const confirmar = async () => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      const ok = await onConfirm({
        fechaInicio: fechas.inicio,
        fechaFin: fechas.fin,
        unidadesPorRetiro: Number(form.unidadesPorRetiro),
        precioUnitario: Number(form.precioUnitario),
        modalidad: form.modalidad,
        tipoEntrega: form.tipoEntrega,
        costoEnvio: form.tipoEntrega === 'envio' ? Number(form.costoEnvio) : undefined,
        diasFijos: fijo ? form.diasFijos : undefined,
        cantidadSemanal: fijo ? undefined : Number(form.cantidadSemanal),
        horaLimite: fijo ? undefined : form.horaLimite,
        observaciones: form.observaciones,
        fechasExcluidas: excluidas,
        necesarias: p.necesarias,
        aplicar: p.aplicar,
        comprar: p.comprar,
        sumarPendientes: sumarPendientes && viandasPendientes > 0,
        diasServicio: p.servicio.habiles,
      });
      if (ok) { setAplicarElegido(null); setNecesariasManual(null); setForm(f => ({ ...f, observaciones: '' })); }
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <div ref={ref} className="glass-card border-2 border-primary/70 overflow-hidden scroll-mt-24">
      {/* Días hábiles del mes seleccionado */}
      <div className="bg-primary/15 px-4 sm:px-5 py-4 border-b-2 border-primary/40">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">{mesLabel}</p>
        <p className="text-3xl sm:text-4xl font-bold tabular-nums leading-tight" data-testid="habiles-mes">
          {habilesMes.habiles} <span className="text-xl sm:text-2xl font-semibold uppercase">días hábiles</span>
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {habilesMes.diasDelPeriodo} de lunes a viernes
          {habilesMes.feriados.length > 0 && ` · ${habilesMes.feriados.length} feriado${habilesMes.feriados.length > 1 ? 's' : ''} (${habilesMes.feriados.map(d => d.slice(8)).join(', ')})`}
          {habilesMes.excluidas.length > 0 && ` · ${habilesMes.excluidas.length} excluido${habilesMes.excluidas.length > 1 ? 's' : ''} (${habilesMes.excluidas.map(d => d.slice(8)).join(', ')})`}
        </p>
      </div>

      {/* Propuesta de contratación del período */}
      <div className="p-4 sm:p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-lg">{activePlan ? 'Preparar renovación' : 'Preparar contratación'}</h3>
          <p className="text-sm text-muted-foreground">Es una propuesta: no se guarda nada hasta que tocás “{accion}”.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="plan-inicio">Inicio del servicio</Label>
            <Input id="plan-inicio" type="date" value={fechas.inicio} onChange={e => setFechas(f => ({ ...f, inicio: e.target.value }))} className="h-11 mt-1" />
          </div>
          <div>
            <Label htmlFor="plan-fin">Fin</Label>
            <Input id="plan-fin" type="date" value={fechas.fin} onChange={e => setFechas(f => ({ ...f, fin: e.target.value }))} className="h-11 mt-1" />
          </div>
          <div>
            <Label htmlFor="plan-unidades">Viandas por día</Label>
            <Input id="plan-unidades" type="number" min={1} inputMode="numeric" value={form.unidadesPorRetiro} onChange={e => setForm({ ...form, unidadesPorRetiro: Math.max(Number(e.target.value), 1) })} className="h-11 mt-1" />
          </div>
          <div>
            <Label htmlFor="plan-precio">Precio por vianda</Label>
            <Input id="plan-precio" type="number" min={0} inputMode="numeric" value={form.precioUnitario} onChange={e => setForm({ ...form, precioUnitario: Number(e.target.value) })} className="h-11 mt-1" />
          </div>
        </div>
        {!fechasOk && <p className="text-sm text-destructive">La fecha de fin tiene que ser igual o posterior al inicio.</p>}

        <div className="grid grid-cols-2 gap-2 text-center">
          <Tile label="Días de servicio del período" value={String(p.servicio.habiles)} testId="dias-servicio" />
          <Tile label="Viandas necesarias" value={String(p.necesarias)} testId="necesarias" />
        </div>
        <p className="text-sm text-muted-foreground -mt-2">
          Del {formatDateAR(fechas.inicio)} al {formatDateAR(fechas.fin)}, ambos incluidos: {p.servicio.diasDelPeriodo} {fijo && form.diasFijos.length < 5 ? 'días de retiro' : 'de lunes a viernes'}
          {p.servicio.feriados.length > 0 && ` − ${p.servicio.feriados.length} feriado(s)`}
          {p.servicio.excluidas.length > 0 && ` − ${p.servicio.excluidas.length} excluido(s)`}
          {` × ${form.unidadesPorRetiro} por día`}.
        </p>
        {necesariasManual !== null && fijo && (
          <p className="text-sm">
            Cantidad escrita a mano.{' '}
            <button type="button" className="underline text-primary min-h-[2.5rem]" onClick={() => setNecesariasManual(null)}>Volver al cálculo por días</button>
          </p>
        )}

        <div className="rounded-lg border-2 border-border p-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm text-muted-foreground">Saldo a favor disponible</span>
              <span className="block text-sm text-muted-foreground">{activePlan ? `contrato ${formatDateAR(activePlan.fechaInicio)} al ${formatDateAR(activePlan.fechaFin)}` : 'sin contrato vigente'}</span>
            </span>
            <strong className="text-2xl tabular-nums" data-testid="saldo-disponible">{saldoDisponible}</strong>
          </div>
          {saldoDisponible > 0 && (
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="plan-aplicar">Aplicar a este contrato (máx. {p.maxAplicar})</Label>
              <Input id="plan-aplicar" type="number" min={0} max={p.maxAplicar} inputMode="numeric" value={p.aplicar}
                onChange={e => setAplicarElegido(Number(e.target.value))} className="h-11 w-24 text-right" />
            </div>
          )}
          {viandasPendientes > 0 && (
            <label className="flex items-start gap-3 text-sm cursor-pointer">
              <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[hsl(var(--primary))]" checked={sumarPendientes} onChange={e => setSumarPendientes(e.target.checked)} />
              <span>Sumar {viandasPendientes} vianda(s) de ajustes manuales pendientes</span>
            </label>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-center">
          <Tile label="Viandas nuevas a comprar" value={String(p.comprar)} strong testId="comprar" />
          <Tile label="Importe final" value={formatCurrencyAR(p.importe)} strong testId="importe" />
        </div>

        <details className="group rounded-lg border-2 border-border">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-2 px-3 min-h-[3rem] font-medium">
            Más opciones (modalidad, entrega, días, cantidad)
            <ChevronDown className="w-4 h-4 group-open:rotate-180 transition-transform" />
          </summary>
          <div className="border-t-2 border-border p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Modalidad</Label>
                <select className="w-full h-11 mt-1 rounded-md border border-input bg-background px-2" value={form.modalidad} onChange={e => setForm({ ...form, modalidad: e.target.value as 'fijo' | 'flexible' })}>
                  <option value="fijo">Fijo</option>
                  <option value="flexible">Flexible</option>
                </select>
              </div>
              <div>
                <Label>Entrega</Label>
                <select className="w-full h-11 mt-1 rounded-md border border-input bg-background px-2" value={form.tipoEntrega} onChange={e => setForm({ ...form, tipoEntrega: e.target.value as DeliveryType })}>
                  <option value="retiro">Retiro</option>
                  <option value="envio">Envío</option>
                </select>
              </div>
              {form.tipoEntrega === 'envio' && (
                <div>
                  <Label>Costo de envío ($)</Label>
                  <Input type="number" min={0} value={form.costoEnvio} onChange={e => setForm({ ...form, costoEnvio: Number(e.target.value) })} className="h-11 mt-1" />
                </div>
              )}
              <div>
                <Label>Viandas necesarias (a mano)</Label>
                <Input type="number" min={0} value={p.necesarias} onChange={e => setNecesariasManual(Number(e.target.value))} className="h-11 mt-1" />
              </div>
            </div>
            {fijo ? (
              <div>
                <Label>Días de retiro</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {DAYS.map(day => {
                    const on = form.diasFijos.includes(day.value);
                    return (
                      <button key={day.value} type="button" aria-pressed={on}
                        onClick={() => setForm(f => ({ ...f, diasFijos: on ? f.diasFijos.filter(d => d !== day.value) : LUNES_A_VIERNES.filter(d => d === day.value || f.diasFijos.includes(d)) }))}
                        className={`h-11 min-w-[3.25rem] rounded-lg border-2 px-2 ${on ? 'border-primary bg-primary/20 font-semibold' : 'border-border'}`}>
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Cantidad semanal</Label>
                  <Input type="number" value={form.cantidadSemanal} onChange={e => setForm({ ...form, cantidadSemanal: Number(e.target.value) })} className="h-11 mt-1" />
                </div>
                <div>
                  <Label>Hora límite</Label>
                  <Input type="time" value={form.horaLimite} onChange={e => setForm({ ...form, horaLimite: e.target.value })} className="h-11 mt-1" />
                </div>
              </div>
            )}
            <div>
              <Label>Observaciones</Label>
              <Textarea value={form.observaciones} onChange={e => setForm({ ...form, observaciones: e.target.value })} className="mt-1 min-h-[60px]" placeholder="Observaciones para este período" />
            </div>
          </div>
        </details>

        <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
          Al confirmar se crea el contrato del <strong>{formatDateAR(fechas.inicio)}</strong> al <strong>{formatDateAR(fechas.fin)}</strong> con{' '}
          <strong>{p.comprar}</strong> viandas nuevas{p.aplicar > 0 && <>, se aplican <strong>{p.aplicar}</strong> a favor</>}
          {sumarPendientes && viandasPendientes > 0 && <> y se suman <strong>{viandasPendientes}</strong> de ajustes</>}.
          {activePlan && ' El contrato actual queda en el historial.'}
        </div>

        <Button className="w-full h-12 text-base" onClick={confirmar} disabled={saving || !fechasOk || p.necesarias <= 0}>
          {activePlan ? <RefreshCw className="w-4 h-4 mr-2" /> : <FilePlus2 className="w-4 h-4 mr-2" />}
          {saving ? 'Guardando…' : accion}
        </Button>
      </div>
    </div>
  );
});

export default ContractPlannerCard;

function Tile({ label, value, strong, testId }: { label: string; value: string; strong?: boolean; testId?: string }) {
  return (
    <div className={`rounded-lg border-2 p-2.5 ${strong ? 'border-primary bg-primary/15' : 'border-border bg-card'}`}>
      <p className="text-xs sm:text-sm leading-tight text-muted-foreground">{label}</p>
      <p className="text-xl sm:text-2xl font-bold tabular-nums" data-testid={testId}>{value}</p>
    </div>
  );
}
