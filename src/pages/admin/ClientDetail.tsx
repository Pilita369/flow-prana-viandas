import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Copy, Send, X, Edit2, Check, RefreshCw, CalendarCheck, History, Award } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  getClient, getActivePlan, loadClientConsumptionsOrThrow, getClientPoints, getClientPlans,
  updatePlan, loadPlans, createPlan,
  renovarPlan, getCreditNotes, assignPendingManualCredits, isPendingManualCredit,
} from '@/lib/store';
import { addDaysISO, computePlanBalance, getNextPlan, todayISO, todayLabelAR } from '@/lib/consumo';
import ClientHistory from '@/components/ClientHistory';
import ClientPointsPanel from '@/components/ClientPointsPanel';
import ClientConsumptionCalendar from '@/components/ClientConsumptionCalendar';
import { useRefreshOnReturn } from '@/hooks/useConsumptionSaver';
import { formatCurrencyAR, formatDateAR, calcularTotalContrato } from '@/lib/business';
import { toast } from 'sonner';
import { useFeriados } from '@/lib/feriados';
import { contarDiasHabiles, viandasNecesarias } from '@/lib/habiles';
import type { Client, Plan, Consumption, PointTransaction, DayOfWeek, CreditNote } from '@/types';
import ClientCreditNotes from '@/components/ClientCreditNotes';
import ContractPlannerCard, { type ContratoConfirmado } from '@/components/ContractPlannerCard';
import MonthWorkdaysCard from '@/components/MonthWorkdaysCard';
import ActiveContractSummary from '@/components/ActiveContractSummary';
import { getPagosCliente, type PagoContrato } from '@/lib/pagos';
import { estimarCobertura } from '@/lib/contrato';
import { contratoDelPeriodo, contratosDelMes } from '@/lib/habiles';

const DAYS: { value: DayOfWeek; label: string }[] = [
  { value: 'lunes', label: 'Lunes' },
  { value: 'martes', label: 'Martes' },
  { value: 'miercoles', label: 'Miércoles' },
  { value: 'jueves', label: 'Jueves' },
  { value: 'viernes', label: 'Viernes' },
];

function getRenovacionPuntos(): number {
  try {
    const rules = JSON.parse(localStorage.getItem('mp_point_rules') || '[]');
    const rule = rules.find((r: { id: string; puntos: number }) => r.id === 'renovacion');
    return rule?.puntos ?? 30;
  } catch { return 30; }
}

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const TABS = ['consumos', 'historial', 'puntos'];
  const tab = TABS.includes(params.get('tab') || '') ? params.get('tab')! : 'consumos';
  const setTab = (t: string) => setParams(t === 'consumos' ? {} : { tab: t }, { replace: true });

  const [client, setClient] = useState<Client | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [consumptions, setConsumptions] = useState<Consumption[]>([]);
  const [clientPlans, setClientPlans] = useState<Plan[]>([]);
  const [points, setPoints] = useState<PointTransaction[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [newExcludedDate, setNewExcludedDate] = useState('');
  const [loading, setLoading] = useState(true);

  // Estado de edición del plan
  const [editingPlan, setEditingPlan] = useState(false);
  const [planEdit, setPlanEdit] = useState({
    cantidadContratada: 0,
    ajusteInicialUsadas: 0,
    precioUnitario: 0,
    costoEnvio: 0,
    fechaInicio: '',
    fechaFin: '',
    tipoEntrega: 'retiro' as 'retiro' | 'envio',
    modalidad: 'fijo' as 'fijo' | 'flexible',
    unidadesPorRetiro: 1,
    diasFijos: [] as DayOfWeek[],
    cantidadSemanal: 0,
    horaLimite: '',
    observaciones: '',
  });

  const { feriados } = useFeriados();
  // Mes que se ve en el calendario: lo sigue la tarjeta de días hábiles
  const [mes, setMes] = useState(todayISO().slice(0, 7));
  const plannerRef = useRef<HTMLDetailsElement>(null);
  // Contrato que se muestra: el del mes seleccionado en el calendario (se puede elegir si hay varios)
  const [planElegidoId, setPlanElegidoId] = useState<string | null>(null);
  useEffect(() => { setPlanElegidoId(null); }, [mes]);
  const [pagos, setPagos] = useState<PagoContrato[]>([]);
  const refreshPagos = async () => {
    if (!id) return;
    try { setPagos(await getPagosCliente(id)); } catch (e) { console.error('No se pudieron leer los pagos:', e); }
  };

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const c = await getClient(id);
      if (!c) { navigate('/admin/clientes'); return; }
      const activePlan = (await getActivePlan(id)) || null;
      const clientConsumptions = await loadClientConsumptionsOrThrow(id);
      const clientPoints = await getClientPoints(id);
      const allPlans = await getClientPlans(id);

      setClient(c);
      setPlan(activePlan);
      setConsumptions(clientConsumptions);
      setClientPlans(allPlans);
      setPoints(clientPoints);
      setCreditNotes(await getCreditNotes(id).catch(() => []));
      await refreshPagos();

      if (activePlan) {
        setPlanEdit({
          cantidadContratada: activePlan.cantidadContratada,
          ajusteInicialUsadas: activePlan.ajusteInicialUsadas || 0,
          precioUnitario: activePlan.precioUnitario,
          costoEnvio: activePlan.costoEnvio || 0,
          fechaInicio: activePlan.fechaInicio,
          fechaFin: activePlan.fechaFin,
          tipoEntrega: activePlan.tipoEntrega,
          modalidad: activePlan.modalidad,
          unidadesPorRetiro: activePlan.unidadesPorRetiro,
          diasFijos: activePlan.diasFijos || [],
          cantidadSemanal: activePlan.cantidadSemanal || 3,
          horaLimite: activePlan.horaLimite || '20:00',
          observaciones: activePlan.observaciones || '',
        });
      }
    } catch (error) {
      console.error('Error cargando cliente:', error);
      toast.error('Error cargando datos del cliente');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  /** Después de guardar un consumo: actualiza saldo y puntos sin recargar toda la ficha. */
  const refreshAfterConsumption = async (next: Consumption[]) => {
    if (!id) return;
    setConsumptions(next);
    const [c, clientPoints] = await Promise.all([getClient(id), getClientPoints(id)]);
    if (c) setClient(c);
    setPoints(clientPoints);
  };

  /** Después de cambiar un ajuste manual: relee contratos (su saldo incluye los ajustes). */
  const refreshAfterCredits = async (notes: CreditNote[]) => {
    if (!id) return;
    setCreditNotes(notes);
    await refreshPlans();
  };

  /** Relee los contratos (después de marcar días excluidos, recalcular o sumar ajustes). */
  const refreshPlans = async () => {
    if (!id) return;
    const [activePlan, allPlans] = await Promise.all([getActivePlan(id), getClientPlans(id)]);
    setPlan(activePlan || null);
    setClientPlans(allPlans);
  };

  /** Al volver a la pestaña, relee los consumos (pueden haberse cargado desde la planilla general u otro dispositivo). */
  useRefreshOnReturn(() => {
    if (!id) return;
    loadClientConsumptionsOrThrow(id).then(setConsumptions).catch(() => { /* se mantiene lo que había */ });
  }, !!id && !loading);

  // Saldo a favor del contrato activo que todavía no se aplicó a otro contrato
  const balanceActivo = plan ? computePlanBalance(plan, consumptions, clientPlans, todayISO()) : null;
  const saldoAFavorActivo = balanceActivo?.aFavorSinAplicar ?? 0;
  // Viandas a favor cargadas a mano que todavía no suman a ningún contrato: se ofrecen al renovar
  const creditosPendientes = creditNotes.filter(isPendingManualCredit);
  const viandasPendientes = creditosPendientes.reduce((acc, n) => acc + (n.cantidad || 0), 0);

  /**
   * Guarda el contrato preparado en la tarjeta (crear o renovar). Es el único lugar donde se aplica el saldo:
   * antes de guardar se relee de la base cuánto queda a favor, así no se aplica dos veces.
   */
  const confirmarContrato = async (c: ContratoConfirmado): Promise<boolean> => {
    if (!client || !id) return false;
    if (c.necesarias <= 0) { toast.error('Indicá cuántas viandas necesita para el período'); return false; }
    try {
      const [planesBase, consumosBase, notasBase] = await Promise.all([loadPlans(), loadClientConsumptionsOrThrow(id), getCreditNotes(id)]);
      const planesCliente = planesBase.filter(p => p.clientId === id);
      const vigente = planesCliente.find(p => p.activo) || null;
      const saldoBase = vigente ? computePlanBalance(vigente, consumosBase, planesCliente, todayISO()).aFavorSinAplicar : 0;
      if (c.aplicar > saldoBase) {
        toast.error(`El saldo a favor cambió (quedan ${saldoBase}). Revisá la propuesta antes de confirmar.`);
        await load();
        return false;
      }
      const pendientes = c.sumarPendientes ? notasBase.filter(isPendingManualCredit) : [];
      const ajustes = pendientes.reduce((acc, n) => acc + (n.cantidad || 0), 0);
      const comprar = Math.max(c.necesarias - c.aplicar - ajustes, 0);
      const notaSaldo = c.aplicar > 0 && vigente
        ? `[${todayLabelAR()}] Saldo anterior aplicado: ${c.aplicar} vianda(s) del contrato ${formatDateAR(vigente.fechaInicio)}–${formatDateAR(vigente.fechaFin)}.`
        : '';
      const datos = {
        clientId: client.id,
        cantidadContratada: comprar,
        saldoAnteriorAplicado: vigente ? c.aplicar : 0,
        saldoOrigenPlanId: vigente && c.aplicar > 0 ? vigente.id : undefined,
        precioUnitario: c.precioUnitario,
        costoEnvio: c.costoEnvio,
        fechaInicio: c.fechaInicio,
        fechaFin: c.fechaFin,
        tipoEntrega: c.tipoEntrega,
        modalidad: c.modalidad,
        unidadesPorRetiro: c.unidadesPorRetiro,
        diasFijos: c.diasFijos,
        cantidadSemanal: c.cantidadSemanal,
        horaLimite: c.horaLimite,
        observaciones: [c.observaciones.trim(), notaSaldo].filter(Boolean).join('\n') || undefined,
        ajusteInicialUsadas: 0,
        fechasExcluidas: c.fechasExcluidas,
      };
      const nuevo = vigente ? await renovarPlan(client.id, datos, getRenovacionPuntos()) : await createPlan(datos);
      if (pendientes.length > 0) {
        try {
          await assignPendingManualCredits(pendientes.map(n => n.id), nuevo.id, vigente ? 'sumado al renovar' : 'sumado al crear el contrato');
        } catch (err) {
          console.error(err);
          toast.error('El contrato se guardó, pero no se pudieron sumar los ajustes pendientes. Sumalos desde "Ajustes y saldo a favor".');
        }
      }
      toast.success(vigente ? `Contrato renovado. +${getRenovacionPuntos()} puntos asignados` : 'Contrato creado');
      await load();
      return true;
    } catch (e) {
      console.error(e);
      toast.error('No se pudo guardar el contrato. No se aplicó ningún saldo.');
      return false;
    }
  };
  const handleSavePlan = async () => {
    if (!plan) return;
    try {
      await updatePlan(plan.id, {
        cantidadContratada: Number(planEdit.cantidadContratada),
        ajusteInicialUsadas: Number(planEdit.ajusteInicialUsadas),
        precioUnitario: Number(planEdit.precioUnitario),
        costoEnvio: planEdit.tipoEntrega === 'envio' ? Number(planEdit.costoEnvio) : undefined,
        fechaInicio: planEdit.fechaInicio,
        fechaFin: planEdit.fechaFin,
        tipoEntrega: planEdit.tipoEntrega,
        modalidad: planEdit.modalidad,
        unidadesPorRetiro: Number(planEdit.unidadesPorRetiro),
        diasFijos: planEdit.modalidad === 'fijo' ? planEdit.diasFijos : undefined,
        cantidadSemanal: planEdit.modalidad === 'flexible' ? Number(planEdit.cantidadSemanal) : undefined,
        horaLimite: planEdit.modalidad === 'flexible' ? planEdit.horaLimite : undefined,
        observaciones: planEdit.observaciones || undefined,
      });
      toast.success('Contrato actualizado');
      setEditingPlan(false);
      await load();
    } catch (error) {
      console.error(error);
      toast.error('Error al actualizar el contrato');
    }
  };

  if (loading) return <p className="p-4 text-muted-foreground">Cargando...</p>;
  if (!client) return null;

  const accessUrl = `${window.location.origin}/cliente/${client.accessLink}`;
  const contratosMes = contratosDelMes(clientPlans, mes);
  const planSel = (planElegidoId && clientPlans.find(p => p.id === planElegidoId)) || contratoDelPeriodo(clientPlans, mes, todayISO()) || null;
  const esVigente = !!planSel && planSel.id === plan?.id;

  /** Cambia la cantidad comprada del contrato en curso, solo después de confirmar la revisión. */
  const revisarCantidad = async (p: Plan, nuevaCantidad: number, detalle: string) => {
    const nota = `[${todayLabelAR()}] Cantidad revisada: ${p.cantidadContratada} → ${nuevaCantidad} viandas (${detalle}). Importe ${formatCurrencyAR(p.totalCalculado)} → ${formatCurrencyAR(calcularTotalContrato(nuevaCantidad, p.precioUnitario))}.`;
    const updated = await updatePlan(p.id, { cantidadContratada: nuevaCantidad, observaciones: [p.observaciones, nota].filter(Boolean).join('\n') });
    if (!updated) { toast.error('No se pudo actualizar la cantidad'); return; }
    toast.success('Cantidad actualizada');
    await refreshPlans();
  };

  // Saldo para el próximo mes: provisional mientras el contrato vigente no terminó (sus viandas pueden consumirse)
  const saldoProvisional = !!plan && plan.fechaFin >= todayISO() && !getNextPlan(clientPlans, plan);
  const ultimoRegistro = plan ? consumptions.filter(c => c.planId === plan.id).map(c => c.fecha).sort().pop() : undefined;
  const sobranteEstimado = plan && balanceActivo
    ? estimarCobertura(plan, balanceActivo.disponible, ultimoRegistro ? addDaysISO(ultimoRegistro, 1) : plan.fechaInicio, feriados)?.sobrantes ?? 0
    : 0;

  const totalEditado = calcularTotalContrato(planEdit.cantidadContratada, planEdit.precioUnitario);
  const habilesEdit = planEdit.modalidad === 'fijo' && plan
    ? contarDiasHabiles(planEdit.fechaInicio, planEdit.fechaFin, { diasFijos: planEdit.diasFijos, feriados, excluidas: plan.fechasExcluidas || [] })
    : null;
  const handleCopyLink = async () => { await navigator.clipboard.writeText(accessUrl); toast.success('Link copiado'); };
  const handleWhatsApp = () => {
    const msg = encodeURIComponent(`Hola ${client.nombre}, te comparto tu acceso de Mundo Prana para ver tu seguimiento: ${accessUrl}`);
    window.open(`https://wa.me/${client.telefono.replace(/\D/g, '')}?text=${msg}`, '_blank');
  };

  const addExcludedDate = async () => {
    if (!plan || !newExcludedDate) return;
    try {
      await updatePlan(plan.id, { fechasExcluidas: Array.from(new Set([...(plan.fechasExcluidas || []), newExcludedDate])).sort() });
      setNewExcludedDate('');
      toast.success('Fecha excluida agregada');
      await load();
    } catch (e) { console.error(e); toast.error('Error al agregar fecha'); }
  };

  const removeExcludedDate = async (date: string) => {
    if (!plan) return;
    try {
      await updatePlan(plan.id, { fechasExcluidas: (plan.fechasExcluidas || []).filter(d => d !== date) });
      toast.success('Fecha excluida eliminada');
      await load();
    } catch (e) { console.error(e); toast.error('Error al eliminar fecha'); }
  };

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => navigate('/admin/clientes')} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-2" />Volver
      </Button>

      <div className="page-header">
        <h1 className="page-title">{client.nombre} {client.apellido}</h1>
        <p className="page-subtitle">{client.email} · {client.telefono}</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-5 h-auto w-full sm:w-auto p-1.5 gap-1.5 border-2 border-border bg-card">
          <TabsTrigger value="consumos" className="h-12 flex-1 min-w-0 px-2 sm:px-3 sm:flex-none sm:min-w-[9rem] text-base gap-1.5 sm:gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><CalendarCheck className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />Consumos</TabsTrigger>
          <TabsTrigger value="historial" className="h-12 flex-1 min-w-0 px-2 sm:px-3 sm:flex-none sm:min-w-[9rem] text-base gap-1.5 sm:gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><History className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />Historial</TabsTrigger>
          <TabsTrigger value="puntos" className="h-12 flex-1 min-w-0 px-2 sm:px-3 sm:flex-none sm:min-w-[9rem] text-base gap-1.5 sm:gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Award className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />Puntos</TabsTrigger>
        </TabsList>

        {/* CONSUMOS: carga del mes, ajustes y, al costado, contrato, fechas excluidas y acceso */}
        <TabsContent value="consumos" className="mt-0">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] xl:grid-rows-[auto_auto_auto_1fr]">
            {/* Días hábiles del mes: en celular, antes del calendario */}
            <div className="min-w-0 xl:col-start-2 xl:row-start-1">
              <MonthWorkdaysCard mes={mes} plans={clientPlans} feriados={feriados} />
            </div>

            <div className="space-y-5 min-w-0 xl:col-start-1 xl:row-start-1 xl:row-span-4">
              <ClientConsumptionCalendar
                mes={mes}
                onMesChange={setMes}
                client={client}
                plans={clientPlans}
                consumptions={consumptions}
                onConsumptionsChange={next => { void refreshAfterConsumption(next); }}
                onPlansChange={refreshPlans}
                viandasPendientes={viandasPendientes}
                planPeriodo={planSel}
              />
              <ClientCreditNotes clientId={client.id} plans={clientPlans} activePlan={plan} onChange={notes => { void refreshAfterCredits(notes); }} />
            </div>

            <div className="space-y-5 min-w-0 xl:col-start-2 xl:row-start-2">
              {/* Contrato del período seleccionado, con sus fechas bien identificadas */}
              <div className="glass-card p-5 space-y-3" data-testid="tarjeta-contrato">
                {contratosMes.length > 1 && (
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Contratos de este mes">
                    {contratosMes.map(c => (
                      <button key={c.id} type="button" role="radio" aria-checked={c.id === planSel?.id}
                        onClick={() => { setPlanElegidoId(c.id); setEditingPlan(false); }}
                        className={`min-h-[2.75rem] rounded-lg border-2 px-3 text-sm font-medium ${c.id === planSel?.id ? 'border-primary bg-primary/20' : 'border-border hover:bg-muted'}`}>
                        {formatDateAR(c.fechaInicio).slice(0, 5)} al {formatDateAR(c.fechaFin).slice(0, 5)}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{esVigente ? 'Contrato vigente' : 'Contrato del período'}</h3>
                    {planSel && (
                      <p className="text-lg font-bold tabular-nums" data-testid="contrato-periodo">{formatDateAR(planSel.fechaInicio)} al {formatDateAR(planSel.fechaFin)}</p>
                    )}
                    {planSel && !esVigente && (
                      <span className="inline-block mt-1 text-xs font-semibold rounded-full bg-muted text-foreground border border-border px-2.5 py-1">
                        Cerrado{plan ? ` · vigente: ${formatDateAR(plan.fechaInicio)} al ${formatDateAR(plan.fechaFin)}` : ''}
                      </span>
                    )}
                    {esVigente && plan && plan.fechaFin < todayISO() && (
                      <span className="inline-block mt-1 text-xs font-semibold rounded-full bg-warning/20 text-foreground border border-warning px-2.5 py-1">
                        Finalizó el {formatDateAR(plan.fechaFin)} · sin renovar
                      </span>
                    )}
                  </div>
                  {esVigente && plan && !editingPlan && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { if (plannerRef.current) { plannerRef.current.open = true; plannerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }}>
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Renovar
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setEditingPlan(true)}>
                        <Edit2 className="w-3.5 h-3.5 mr-1.5" />Editar
                      </Button>
                    </div>
                  )}
                  {editingPlan && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSavePlan}><Check className="w-3.5 h-3.5 mr-1.5" />Guardar</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingPlan(false)}><X className="w-3.5 h-3.5" /></Button>
                    </div>
                  )}
                </div>

                {planSel ? (
                  editingPlan && esVigente && plan ? (
                    /* FORMULARIO DE EDICIÓN */
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Cantidad contratada</Label>
                          <Input type="number" value={planEdit.cantidadContratada} onChange={e => setPlanEdit({ ...planEdit, cantidadContratada: Number(e.target.value) })} className="h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs">Ajuste inicial usado</Label>
                          <Input type="number" value={planEdit.ajusteInicialUsadas} onChange={e => setPlanEdit({ ...planEdit, ajusteInicialUsadas: Number(e.target.value) })} className="h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs">Precio por vianda</Label>
                          <Input type="number" value={planEdit.precioUnitario} onChange={e => setPlanEdit({ ...planEdit, precioUnitario: Number(e.target.value) })} className="h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs">Total calculado</Label>
                          <Input value={formatCurrencyAR(totalEditado)} readOnly className="h-8 text-sm bg-muted" />
                        </div>
                        <div>
                          <Label className="text-xs">Viandas por retiro</Label>
                          <Input type="number" value={planEdit.unidadesPorRetiro} onChange={e => setPlanEdit({ ...planEdit, unidadesPorRetiro: Number(e.target.value) })} className="h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs">Modalidad</Label>
                          <select className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm" value={planEdit.modalidad} onChange={e => setPlanEdit({ ...planEdit, modalidad: e.target.value as 'fijo' | 'flexible' })}>
                            <option value="fijo">Fijo</option>
                            <option value="flexible">Flexible</option>
                          </select>
                        </div>
                        <div>
                          <Label className="text-xs">Tipo de entrega</Label>
                          <select className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm" value={planEdit.tipoEntrega} onChange={e => setPlanEdit({ ...planEdit, tipoEntrega: e.target.value as 'retiro' | 'envio' })}>
                            <option value="retiro">Retiro</option>
                            <option value="envio">Envío</option>
                          </select>
                        </div>
                        {planEdit.tipoEntrega === 'envio' && (
                          <div>
                            <Label className="text-xs">Costo de envío ($)</Label>
                            <Input type="number" min={0} value={planEdit.costoEnvio} onChange={e => setPlanEdit({ ...planEdit, costoEnvio: Number(e.target.value) })} className="h-8 text-sm" placeholder="Ej: 3500" />
                          </div>
                        )}
                        <div>
                          <Label className="text-xs">Fecha inicio</Label>
                          <Input type="date" value={planEdit.fechaInicio} onChange={e => setPlanEdit({ ...planEdit, fechaInicio: e.target.value })} className="h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs">Fecha fin</Label>
                          <Input type="date" value={planEdit.fechaFin} onChange={e => setPlanEdit({ ...planEdit, fechaFin: e.target.value })} className="h-8 text-sm" />
                        </div>
                      </div>

                      {habilesEdit && plan && (() => {
                        const necesarias = viandasNecesarias(habilesEdit.habiles, planEdit.unidadesPorRetiro);
                        const cubiertas = (plan.saldoAnteriorAplicado || 0) + (plan.ajusteManualFavor || 0);
                        const comprar = Math.max(necesarias - cubiertas, 0);
                        return (
                          <div className="rounded-lg border-2 border-border bg-muted/30 p-3 text-sm space-y-2">
                            <p>
                              <strong>{habilesEdit.habiles} días hábiles</strong> del {formatDateAR(planEdit.fechaInicio)} al {formatDateAR(planEdit.fechaFin)}
                              {' '}({habilesEdit.diasDelPeriodo} − {habilesEdit.feriados.length} feriado(s) − {habilesEdit.excluidas.length} excluido(s))
                              {' '}→ {necesarias} viandas{cubiertas > 0 && `, ${cubiertas} ya cubiertas por saldo y ajustes`} → <strong>{comprar} a comprar</strong>.
                            </p>
                            {comprar !== Number(planEdit.cantidadContratada) && (
                              <Button variant="outline" size="sm" className="h-9" onClick={() => setPlanEdit({ ...planEdit, cantidadContratada: comprar })}>
                                Usar {comprar} ({formatCurrencyAR(calcularTotalContrato(comprar, planEdit.precioUnitario))})
                              </Button>
                            )}
                          </div>
                        );
                      })()}

                      {planEdit.modalidad === 'fijo' && (
                        <div>
                          <Label className="text-xs">Días de retiro</Label>
                          <div className="flex flex-wrap gap-3 mt-1">
                            {DAYS.map(day => (
                              <label key={day.value} className="flex items-center gap-1.5 text-xs">
                                <input type="checkbox" checked={planEdit.diasFijos.includes(day.value)}
                                  onChange={() => setPlanEdit(prev => ({
                                    ...prev,
                                    diasFijos: prev.diasFijos.includes(day.value)
                                      ? prev.diasFijos.filter(d => d !== day.value)
                                      : [...prev.diasFijos, day.value]
                                  }))} />
                                {day.label}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {planEdit.modalidad === 'flexible' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Cantidad semanal</Label>
                            <Input type="number" value={planEdit.cantidadSemanal} onChange={e => setPlanEdit({ ...planEdit, cantidadSemanal: Number(e.target.value) })} className="h-8 text-sm" />
                          </div>
                          <div>
                            <Label className="text-xs">Hora límite</Label>
                            <Input type="time" value={planEdit.horaLimite} onChange={e => setPlanEdit({ ...planEdit, horaLimite: e.target.value })} className="h-8 text-sm" />
                          </div>
                        </div>
                      )}

                      <div>
                        <Label className="text-xs">Observaciones</Label>
                        <Textarea value={planEdit.observaciones} onChange={e => setPlanEdit({ ...planEdit, observaciones: e.target.value })} className="text-sm min-h-[60px]" />
                      </div>
                    </div>
                  ) : (
                    /* VISTA NORMAL */
                    <>
                      <ActiveContractSummary
                        client={client}
                        plan={planSel}
                        plans={clientPlans}
                        consumptions={consumptions}
                        feriados={feriados}
                        creditNotes={creditNotes}
                        pagos={pagos}
                        onPagosChange={refreshPagos}
                        onRevisarCantidad={esVigente ? revisarCantidad : undefined}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">{planSel.modalidad}</Badge>
                        <Badge variant="outline">{planSel.tipoEntrega}</Badge>
                        <Badge variant="outline">{planSel.unidadesPorRetiro} por día</Badge>
                      </div>
                      {planSel.diasFijos?.length ? <p className="text-sm text-muted-foreground"><strong>Días fijos:</strong> {planSel.diasFijos.join(', ')}</p> : null}
                      {planSel.observaciones ? <p className="text-sm text-muted-foreground whitespace-pre-line"><strong>Observaciones:</strong> {planSel.observaciones}</p> : null}
                    </>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">Sin contrato en este mes.{plan ? ` Contrato vigente: ${formatDateAR(plan.fechaInicio)} al ${formatDateAR(plan.fechaFin)}.` : ''}</p>
                )}
              </div>
            </div>

            {/* Preparar el próximo mes: cerrado por defecto, debajo del contrato vigente */}
            <div className="min-w-0 xl:col-start-2 xl:row-start-3">
              <ContractPlannerCard
                ref={plannerRef}
                mes={plan && plan.fechaFin.slice(0, 7) >= mes ? addDaysISO(plan.fechaFin, 1).slice(0, 7) : mes}
                plans={clientPlans}
                activePlan={plan}
                feriados={feriados}
                saldoDisponible={saldoAFavorActivo}
                saldoProvisional={saldoProvisional}
                sobranteEstimado={sobranteEstimado}
                viandasPendientes={viandasPendientes}
                onConfirm={confirmarContrato}
              />
            </div>

            <div className="space-y-5 min-w-0 xl:col-start-2 xl:row-start-4 self-start">
              {/* Fechas excluidas */}
              {plan && (
                <div className="glass-card p-5 space-y-4">
                  <div>
                    <h3 className="font-semibold">Fechas excluidas para este cliente</h3>
                    <p className="text-sm text-muted-foreground">También podés marcarlas tocando "Marcar feriados" en el calendario.</p>
                  </div>
                  <div className="flex gap-2">
                    <Input type="date" value={newExcludedDate} onChange={e => setNewExcludedDate(e.target.value)} />
                    <Button variant="outline" onClick={addExcludedDate}>Agregar fecha</Button>
                  </div>
                  {(plan.fechasExcluidas || []).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {(plan.fechasExcluidas || []).map(date => (
                        <span key={date} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
                          {formatDateAR(date)}
                          <button type="button" onClick={() => removeExcludedDate(date)}><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Acceso del cliente */}
              <div className="glass-card p-5 space-y-4">
                <h3 className="font-semibold">Acceso del cliente</h3>
                <div><Label>Link público</Label><Input value={accessUrl} readOnly /></div>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={handleCopyLink}><Copy className="w-4 h-4 mr-2" />Copiar link</Button>
                  <Button onClick={handleWhatsApp}><Send className="w-4 h-4 mr-2" />Enviar por WhatsApp</Button>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* HISTORIAL: todo lo registrado, por contrato y por mes */}
        <TabsContent value="historial" className="mt-0">
          <ClientHistory consumptions={consumptions} plans={clientPlans} creditNotes={creditNotes} pagos={pagos} />
        </TabsContent>

        {/* PUNTOS */}
        <TabsContent value="puntos" className="mt-0">
          <ClientPointsPanel puntos={client.puntos} points={points} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
