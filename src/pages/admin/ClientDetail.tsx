import { useEffect, useState } from 'react';
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
  updatePlan,
  renovarPlan, getCreditNotes, assignPendingManualCredits, isPendingManualCredit,
} from '@/lib/store';
import { addDaysISO, addMonthsISO, computePlanBalance, splitCarryOver, todayISO, todayLabelAR } from '@/lib/consumo';
import ClientHistory from '@/components/ClientHistory';
import ClientPointsPanel from '@/components/ClientPointsPanel';
import ClientConsumptionCalendar from '@/components/ClientConsumptionCalendar';
import { useRefreshOnReturn } from '@/hooks/useConsumptionSaver';
import { formatCurrencyAR, formatDateAR, getDiasEstimadosFromPlan, calculateFixedPlanEstimatedEndDate, calcularTotalContrato } from '@/lib/business';
import { toast } from 'sonner';
import type { Client, Plan, Consumption, PointTransaction, DayOfWeek, CreditNote } from '@/types';
import ClientCreditNotes from '@/components/ClientCreditNotes';

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

  // Estado de renovación
  const [renovando, setRenovando] = useState(false);
  const [renovForm, setRenovForm] = useState({
    necesita: 0,
    saldoAplicado: 0,
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
  const [sumarPendientes, setSumarPendientes] = useState(true);

  const openRenovar = () => {
    if (!plan) return;
    // Fecha inicio = día siguiente al fin del plan actual (o hoy si ya pasó)
    const today = todayISO();
    const inicio = plan.fechaFin >= today ? addDaysISO(plan.fechaFin, 1) : today;
    const fin = addMonthsISO(inicio, 1);

    setRenovForm({
      necesita: plan.cantidadContratada,
      saldoAplicado: saldoAFavorActivo,
      precioUnitario: plan.precioUnitario,
      costoEnvio: plan.costoEnvio || 0,
      fechaInicio: inicio,
      fechaFin: fin,
      tipoEntrega: plan.tipoEntrega,
      modalidad: plan.modalidad,
      unidadesPorRetiro: plan.unidadesPorRetiro,
      diasFijos: plan.diasFijos || [],
      cantidadSemanal: plan.cantidadSemanal || 3,
      horaLimite: plan.horaLimite || '20:00',
      observaciones: '',
    });
    setRenovando(true);
    setEditingPlan(false);
  };

  const handleConfirmarRenovacion = async () => {
    if (!client || !plan) return;
    const { aplicar, comprar: comprarSinAjustes } = splitCarryOver(Number(renovForm.necesita), Math.min(Number(renovForm.saldoAplicado), saldoAFavorActivo));
    if (renovForm.necesita <= 0) { toast.error('Indicá cuántas viandas necesita para el período'); return; }
    const pendientesIds = sumarPendientes ? creditosPendientes.map(n => n.id) : [];
    const ajustes = sumarPendientes ? viandasPendientes : 0;
    const comprar = Math.max(comprarSinAjustes - ajustes, 0);
    const notaSaldo = aplicar > 0
      ? `[${todayLabelAR()}] Saldo anterior aplicado: ${aplicar} vianda(s) del contrato ${formatDateAR(plan.fechaInicio)}–${formatDateAR(plan.fechaFin)}.`
      : '';
    try {
      const nuevo = await renovarPlan(
        client.id,
        {
          clientId: client.id,
          cantidadContratada: comprar,
          saldoAnteriorAplicado: aplicar,
          saldoOrigenPlanId: aplicar > 0 ? plan.id : undefined,
          precioUnitario: Number(renovForm.precioUnitario),
          costoEnvio: renovForm.tipoEntrega === 'envio' ? Number(renovForm.costoEnvio) : undefined,
          fechaInicio: renovForm.fechaInicio,
          fechaFin: renovForm.fechaFin,
          tipoEntrega: renovForm.tipoEntrega,
          modalidad: renovForm.modalidad,
          unidadesPorRetiro: Number(renovForm.unidadesPorRetiro),
          diasFijos: renovForm.modalidad === 'fijo' ? renovForm.diasFijos : undefined,
          cantidadSemanal: renovForm.modalidad === 'flexible' ? Number(renovForm.cantidadSemanal) : undefined,
          horaLimite: renovForm.modalidad === 'flexible' ? renovForm.horaLimite : undefined,
          observaciones: [renovForm.observaciones, notaSaldo].filter(Boolean).join('\n') || undefined,
          ajusteInicialUsadas: 0,
        },
        getRenovacionPuntos()
      );
      if (pendientesIds.length > 0) {
        try {
          await assignPendingManualCredits(pendientesIds, nuevo.id, 'sumado al renovar');
        } catch (err) {
          console.error(err);
          toast.error('El plan se renovó, pero no se pudieron sumar los ajustes pendientes. Sumalos desde "Ajustes y saldo a favor".');
        }
      }
      toast.success(`Plan renovado. +${getRenovacionPuntos()} puntos asignados`);
      setRenovando(false);
      await load();
    } catch (e) {
      console.error(e);
      toast.error('Error al renovar el plan');
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
  const diasEstimados = getDiasEstimadosFromPlan(plan);
  const fechaEstimadaFin = plan?.modalidad === 'fijo'
    ? calculateFixedPlanEstimatedEndDate(plan.fechaInicio, diasEstimados, plan.diasFijos || [], plan.fechasExcluidas || [])
    : plan?.fechaFin || '';

  const totalEditado = calcularTotalContrato(planEdit.cantidadContratada, planEdit.precioUnitario);
  const renovBase = splitCarryOver(renovForm.necesita, Math.min(renovForm.saldoAplicado, saldoAFavorActivo));
  const ajustesRenov = sumarPendientes ? viandasPendientes : 0;
  const renovSplit = { aplicar: renovBase.aplicar, comprar: Math.max(renovBase.comprar - ajustesRenov, 0) };
  const totalRenov = calcularTotalContrato(renovSplit.comprar, renovForm.precioUnitario);

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

      {/* FORMULARIO DE RENOVACIÓN */}
      {renovando && (
        <div className="glass-card p-5 mb-5 space-y-4 border-2 border-primary/30">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Renovar plan</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Se creará un nuevo plan. El anterior quedará en el historial. Se asignarán <strong>{getRenovacionPuntos()} puntos</strong> automáticamente.
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setRenovando(false)}><X className="w-4 h-4" /></Button>
          </div>

          {saldoAFavorActivo > 0 && (
            <div className="rounded-lg bg-amber-500/10 text-amber-800 text-sm px-3 py-2">
              <strong>Saldo a favor: {saldoAFavorActivo} vianda(s)</strong> sin consumir en el contrato actual
              {(balanceActivo?.ajusteManual || 0) > 0 && ` (incluye ${balanceActivo?.ajusteManual} de ajustes manuales)`}.
              Si necesita {renovForm.necesita || 0}, puede aplicar {renovSplit.aplicar}{ajustesRenov > 0 ? `, sumar ${ajustesRenov} de ajustes pendientes` : ''} y comprar {renovSplit.comprar} nuevas.
              Ajustá cuánto aplicar según lo que acordaste con el cliente.
            </div>
          )}

          {viandasPendientes > 0 && (
            <label className="flex items-start gap-3 rounded-lg border-2 border-warning/60 bg-warning/10 px-3 py-2 text-sm cursor-pointer">
              <input type="checkbox" className="mt-1 h-5 w-5 accent-[hsl(var(--primary))]" checked={sumarPendientes} onChange={e => setSumarPendientes(e.target.checked)} />
              <span>
                <strong>Sumar {viandasPendientes} vianda(s) de ajustes manuales pendientes</strong> al nuevo contrato.
                Se descuentan de las viandas a comprar y quedan registradas en el historial de cada ajuste.
              </span>
            </label>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">{saldoAFavorActivo > 0 || ajustesRenov > 0 ? 'Viandas que necesita' : 'Cantidad contratada'}</Label>
              <Input type="number" min={0} value={renovForm.necesita} onChange={e => setRenovForm({ ...renovForm, necesita: Number(e.target.value) })} className="h-8 text-sm" />
            </div>
            {saldoAFavorActivo > 0 && (
              <div>
                <Label className="text-xs">Saldo a favor a aplicar (máx. {saldoAFavorActivo})</Label>
                <Input type="number" min={0} max={saldoAFavorActivo} value={renovForm.saldoAplicado} onChange={e => setRenovForm({ ...renovForm, saldoAplicado: Math.max(0, Math.min(Number(e.target.value), saldoAFavorActivo)) })} className="h-8 text-sm" />
              </div>
            )}
            {(saldoAFavorActivo > 0 || ajustesRenov > 0) && (
              <div>
                <Label className="text-xs">Viandas nuevas a comprar</Label>
                <Input value={renovSplit.comprar} readOnly className="h-8 text-sm bg-muted" />
              </div>
            )}
            <div>
              <Label className="text-xs">Precio por vianda</Label>
              <Input type="number" value={renovForm.precioUnitario} onChange={e => setRenovForm({ ...renovForm, precioUnitario: Number(e.target.value) })} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Total</Label>
              <Input value={formatCurrencyAR(totalRenov)} readOnly className="h-8 text-sm bg-muted" />
            </div>
            <div>
              <Label className="text-xs">Viandas por retiro</Label>
              <Input type="number" value={renovForm.unidadesPorRetiro} onChange={e => setRenovForm({ ...renovForm, unidadesPorRetiro: Number(e.target.value) })} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Modalidad</Label>
              <select className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm" value={renovForm.modalidad} onChange={e => setRenovForm({ ...renovForm, modalidad: e.target.value as 'fijo' | 'flexible' })}>
                <option value="fijo">Fijo</option>
                <option value="flexible">Flexible</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Tipo de entrega</Label>
              <select className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm" value={renovForm.tipoEntrega} onChange={e => setRenovForm({ ...renovForm, tipoEntrega: e.target.value as 'retiro' | 'envio' })}>
                <option value="retiro">Retiro</option>
                <option value="envio">Envío</option>
              </select>
            </div>
            {renovForm.tipoEntrega === 'envio' && (
              <div>
                <Label className="text-xs">Costo de envío ($)</Label>
                <Input type="number" min={0} value={renovForm.costoEnvio} onChange={e => setRenovForm({ ...renovForm, costoEnvio: Number(e.target.value) })} className="h-8 text-sm" placeholder="Ej: 3500" />
              </div>
            )}
            <div>
              <Label className="text-xs">Fecha inicio</Label>
              <Input type="date" value={renovForm.fechaInicio} onChange={e => setRenovForm({ ...renovForm, fechaInicio: e.target.value })} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Fecha fin</Label>
              <Input type="date" value={renovForm.fechaFin} onChange={e => setRenovForm({ ...renovForm, fechaFin: e.target.value })} className="h-8 text-sm" />
            </div>
          </div>

          {renovForm.modalidad === 'fijo' && (
            <div>
              <Label className="text-xs">Días de retiro</Label>
              <div className="flex flex-wrap gap-3 mt-1">
                {DAYS.map(day => (
                  <label key={day.value} className="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={renovForm.diasFijos.includes(day.value)}
                      onChange={() => setRenovForm(prev => ({
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

          {renovForm.modalidad === 'flexible' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Cantidad semanal</Label>
                <Input type="number" value={renovForm.cantidadSemanal} onChange={e => setRenovForm({ ...renovForm, cantidadSemanal: Number(e.target.value) })} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Hora límite</Label>
                <Input type="time" value={renovForm.horaLimite} onChange={e => setRenovForm({ ...renovForm, horaLimite: e.target.value })} className="h-8 text-sm" />
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">Observaciones</Label>
            <Textarea value={renovForm.observaciones} onChange={e => setRenovForm({ ...renovForm, observaciones: e.target.value })} className="text-sm min-h-[50px]" placeholder="Observaciones para este período" />
          </div>

          <div className="flex gap-3">
            <Button onClick={handleConfirmarRenovacion}>
              <RefreshCw className="w-4 h-4 mr-2" />Confirmar renovación
            </Button>
            <Button variant="outline" onClick={() => setRenovando(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-5 h-auto w-full sm:w-auto p-1.5 gap-1.5 border-2 border-border bg-card">
          <TabsTrigger value="consumos" className="h-12 flex-1 min-w-0 px-2 sm:px-3 sm:flex-none sm:min-w-[9rem] text-base gap-1.5 sm:gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><CalendarCheck className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />Consumos</TabsTrigger>
          <TabsTrigger value="historial" className="h-12 flex-1 min-w-0 px-2 sm:px-3 sm:flex-none sm:min-w-[9rem] text-base gap-1.5 sm:gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><History className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />Historial</TabsTrigger>
          <TabsTrigger value="puntos" className="h-12 flex-1 min-w-0 px-2 sm:px-3 sm:flex-none sm:min-w-[9rem] text-base gap-1.5 sm:gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Award className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />Puntos</TabsTrigger>
        </TabsList>

        {/* CONSUMOS: carga del mes, ajustes y, al costado, contrato, fechas excluidas y acceso */}
        <TabsContent value="consumos" className="mt-0">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] xl:grid-rows-[auto_1fr]">
            <div className="space-y-5 min-w-0 xl:col-start-1 xl:row-start-1 xl:row-span-2">
              <ClientConsumptionCalendar
                client={client}
                plans={clientPlans}
                consumptions={consumptions}
                onConsumptionsChange={next => { void refreshAfterConsumption(next); }}
              />
              <ClientCreditNotes clientId={client.id} plans={clientPlans} activePlan={plan} onChange={notes => { void refreshAfterCredits(notes); }} />
            </div>

            <div className="space-y-5 min-w-0 xl:col-start-2 xl:row-start-1">
              {/* Resumen del contrato */}
              <div className="glass-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Contrato activo</h3>
                  {plan && !editingPlan && !renovando && (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={openRenovar}>
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

                {plan ? (
                  editingPlan ? (
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
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">{plan.modalidad}</Badge>
                        <Badge variant="outline">{plan.tipoEntrega}</Badge>
                        <Badge variant="outline">{plan.unidadesPorRetiro} por retiro</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><span className="text-muted-foreground">Precio unitario:</span> <strong>{formatCurrencyAR(plan.precioUnitario)}</strong></div>
                        {plan.tipoEntrega === 'envio' && (
                          <div><span className="text-muted-foreground">Costo de envío:</span> <strong>{plan.costoEnvio ? formatCurrencyAR(plan.costoEnvio) : 'No definido'}</strong></div>
                        )}
                        <div className="col-span-2">
                          {(() => {
                            // Solo ajustes en dinero: las viandas a favor ya suman al saldo de viandas
                            const pendingNotes = creditNotes.filter(n => !n.aplicado && !n.anulado && (n.tipo === 'saldo_envio' || n.tipo === 'descuento'));
                            const totalAjustes = pendingNotes.reduce((acc, n) => acc + (n.monto || 0), 0);
                            const envio = plan.tipoEntrega === 'envio' ? (plan.costoEnvio || 0) : 0;
                            const totalNeto = plan.totalCalculado + envio - totalAjustes;

                            if (totalAjustes > 0) {
                              return (
                                <div className="rounded-lg bg-muted/40 border border-border px-3 py-2 space-y-1 text-sm">
                                  <div className="flex justify-between text-muted-foreground">
                                    <span>Viandas ({plan.cantidadContratada} × {formatCurrencyAR(plan.precioUnitario)})</span>
                                    <span>{formatCurrencyAR(plan.totalCalculado)}</span>
                                  </div>
                                  {envio > 0 && (
                                    <div className="flex justify-between text-muted-foreground">
                                      <span>Envío</span>
                                      <span>{formatCurrencyAR(envio)}</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between text-green-700">
                                    <span>Ajustes a favor ({pendingNotes.length})</span>
                                    <span>− {formatCurrencyAR(totalAjustes)}</span>
                                  </div>
                                  <div className="flex justify-between font-semibold border-t border-border pt-1 mt-1">
                                    <span>Total a pagar</span>
                                    <span>{formatCurrencyAR(totalNeto)}</span>
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Total:</span>
                                <strong>{formatCurrencyAR(plan.totalCalculado + envio)}</strong>
                              </div>
                            );
                          })()}
                        </div>
                        <div><span className="text-muted-foreground">Inicio:</span> <strong>{formatDateAR(plan.fechaInicio)}</strong></div>
                        <div><span className="text-muted-foreground">Fin estimada:</span> <strong>{fechaEstimadaFin ? formatDateAR(fechaEstimadaFin) : '-'}</strong></div>
                        <div><span className="text-muted-foreground">Días estimados:</span> <strong>{diasEstimados}</strong></div>
                        <div><span className="text-muted-foreground">Viandas por día:</span> <strong>{plan.unidadesPorRetiro}</strong></div>
                      </div>
                      {plan.diasFijos?.length ? <p className="text-sm text-muted-foreground"><strong>Días fijos:</strong> {plan.diasFijos.join(', ')}</p> : null}
                      {plan.observaciones ? <p className="text-sm text-muted-foreground"><strong>Observaciones:</strong> {plan.observaciones}</p> : null}
                    </>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">Sin contrato activo</p>
                )}
              </div>
            </div>

            <div className="space-y-5 min-w-0 xl:col-start-2 xl:row-start-2 self-start">
              {/* Fechas excluidas */}
              {plan && (
                <div className="glass-card p-5 space-y-4">
                  <h3 className="font-semibold">Fechas excluidas para este cliente</h3>
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
          <ClientHistory consumptions={consumptions} plans={clientPlans} />
        </TabsContent>

        {/* PUNTOS */}
        <TabsContent value="puntos" className="mt-0">
          <ClientPointsPanel puntos={client.puntos} points={points} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
