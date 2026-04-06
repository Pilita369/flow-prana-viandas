import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Send, Trash2, X, Edit2, Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  getClient, getActivePlan, getClientConsumptions, getClientPoints,
  getDisponibles, getCantidadUsada, createConsumption, deleteConsumption, updatePlan,
  renovarPlan, getCreditNotes,
} from '@/lib/store';
import { formatCurrencyAR, formatDateAR, getDiasEstimadosFromPlan, calculateFixedPlanEstimatedEndDate, calcularTotalContrato } from '@/lib/business';
import { toast } from 'sonner';
import type { Client, Plan, Consumption, PointTransaction, ConsumptionStatus, DayOfWeek, CreditNote } from '@/types';
import ClientPlanHistory from '@/components/ClientPlanHistory';
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

function normalizeStatus(status: ConsumptionStatus): string {
  if (status === 'retirado' || status === 'consumido') return 'retirado';
  if (status === 'no_retirado' || status === 'no_retiro') return 'no_retirado';
  return status;
}

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [client, setClient] = useState<Client | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [consumptions, setConsumptions] = useState<Consumption[]>([]);
  const [points, setPoints] = useState<PointTransaction[]>([]);
  const [usadas, setUsadas] = useState(0);
  const [disponibles, setDisponibles] = useState(0);
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
    cantidadContratada: 0,
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

  const [manualForm, setManualForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    status: 'retirado' as ConsumptionStatus,
    cantidad: 1,
    notas: '',
  });

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const c = await getClient(id);
      if (!c) { navigate('/admin/clientes'); return; }
      const activePlan = (await getActivePlan(id)) || null;
      const clientConsumptions = await getClientConsumptions(id);
      const clientPoints = await getClientPoints(id);
      const cantUsadas = await getCantidadUsada(activePlan);
      const cantDisponibles = await getDisponibles(activePlan);

      setClient(c);
      setPlan(activePlan);
      setConsumptions(clientConsumptions);
      setPoints(clientPoints);
      setUsadas(cantUsadas);
      setDisponibles(cantDisponibles);
      setCreditNotes(getCreditNotes(id));
      setManualForm(prev => ({ ...prev, cantidad: activePlan?.unidadesPorRetiro || 1 }));

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

  const openRenovar = () => {
    if (!plan) return;
    // Fecha inicio = día siguiente al fin del plan actual (o hoy si ya pasó)
    const planEnd = new Date(plan.fechaFin);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const inicioDate = planEnd >= today ? new Date(planEnd.getTime() + 86400000) : today;
    const finDate = new Date(inicioDate);
    finDate.setMonth(finDate.getMonth() + 1);

    setRenovForm({
      cantidadContratada: plan.cantidadContratada,
      precioUnitario: plan.precioUnitario,
      costoEnvio: plan.costoEnvio || 0,
      fechaInicio: inicioDate.toISOString().split('T')[0],
      fechaFin: finDate.toISOString().split('T')[0],
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
    if (!client) return;
    try {
      await renovarPlan(
        client.id,
        {
          clientId: client.id,
          cantidadContratada: Number(renovForm.cantidadContratada),
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
          observaciones: renovForm.observaciones || undefined,
          ajusteInicialUsadas: 0,
        },
        getRenovacionPuntos()
      );
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
  const totalRenov = calcularTotalContrato(renovForm.cantidadContratada, renovForm.precioUnitario);

  const handleCopyLink = async () => { await navigator.clipboard.writeText(accessUrl); toast.success('Link copiado'); };
  const handleWhatsApp = () => {
    const msg = encodeURIComponent(`Hola ${client.nombre}, te comparto tu acceso de Mundo Prana para ver tu seguimiento: ${accessUrl}`);
    window.open(`https://wa.me/${client.telefono.replace(/\D/g, '')}?text=${msg}`, '_blank');
  };

  const handleManualConsumption = async () => {
    if (!plan) { toast.error('El cliente no tiene contrato activo'); return; }
    if (manualForm.cantidad < 0) { toast.error('La cantidad no puede ser negativa'); return; }
    try {
      await createConsumption({ clientId: client.id, planId: plan.id, fecha: manualForm.fecha, status: manualForm.status, tipo: 'manual', cantidad: Number(manualForm.cantidad), notas: manualForm.notas || undefined });
      toast.success('Movimiento cargado');
      await load();
    } catch (e) { console.error(e); toast.error('Error al cargar el movimiento'); }
  };

  const handleDeleteConsumption = async (consumptionId: string) => {
    if (!window.confirm('¿Eliminar este movimiento?')) return;
    try { await deleteConsumption(consumptionId); toast.success('Movimiento eliminado'); await load(); }
    catch (e) { console.error(e); toast.error('Error al eliminar'); }
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

      <div className="grid md:grid-cols-2 gap-4 mb-6">
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
                  <div><span className="text-muted-foreground">Contratadas:</span> <strong>{plan.cantidadContratada}</strong></div>
                  <div><span className="text-muted-foreground">Usadas:</span> <strong>{usadas}</strong></div>
                  <div><span className="text-muted-foreground">Disponibles:</span> <strong>{disponibles}</strong></div>
                  <div><span className="text-muted-foreground">Puntos:</span> <strong>{client.puntos}</strong></div>
                  <div><span className="text-muted-foreground">Precio unitario:</span> <strong>{formatCurrencyAR(plan.precioUnitario)}</strong></div>
                  {plan.tipoEntrega === 'envio' && (
                    <div><span className="text-muted-foreground">Costo de envío:</span> <strong>{plan.costoEnvio ? formatCurrencyAR(plan.costoEnvio) : 'No definido'}</strong></div>
                  )}
                  <div className="col-span-2">
                    {(() => {
                      const pendingNotes = creditNotes.filter(n => !n.aplicado);
                      const descuentoMoneda = pendingNotes
                        .filter(n => n.tipo === 'saldo_envio' || n.tipo === 'descuento')
                        .reduce((acc, n) => acc + (n.monto || 0), 0);
                      const descuentoViandas = pendingNotes
                        .filter(n => n.tipo === 'vianda_favor')
                        .reduce((acc, n) => acc + (n.cantidad || 0) * plan.precioUnitario, 0);
                      const totalAjustes = descuentoMoneda + descuentoViandas;
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

      {/* HISTORIAL DE PLANES — al tope, siempre visible */}
      <div className="mb-6">
        <ClientPlanHistory clientId={client.id} showAdmin={true} />
      </div>

      {/* FORMULARIO DE RENOVACIÓN */}
      {renovando && (
        <div className="glass-card p-5 mb-6 space-y-4 border-2 border-primary/30">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Renovar plan</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Se creará un nuevo plan. El anterior quedará en el historial. Se asignarán <strong>{getRenovacionPuntos()} puntos</strong> automáticamente.
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setRenovando(false)}><X className="w-4 h-4" /></Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Cantidad contratada</Label>
              <Input type="number" value={renovForm.cantidadContratada} onChange={e => setRenovForm({ ...renovForm, cantidadContratada: Number(e.target.value) })} className="h-8 text-sm" />
            </div>
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

      {/* Fechas excluidas */}
      {plan && (
        <div className="glass-card p-5 mb-6 space-y-4">
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

      {/* Consumo manual */}
      <div className="glass-card p-5 mb-6 space-y-4">
        <h3 className="font-semibold">Cargar consumo manual / histórico</h3>
        <div className="grid md:grid-cols-4 gap-4">
          <div><Label>Fecha</Label><Input type="date" value={manualForm.fecha} onChange={e => setManualForm({ ...manualForm, fecha: e.target.value })} /></div>
          <div>
            <Label>Estado</Label>
            <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={manualForm.status} onChange={e => setManualForm({ ...manualForm, status: e.target.value as ConsumptionStatus })}>
              <option value="retirado">Retirado</option>
              <option value="no_retirado">No retiró</option>
              <option value="reprogramado">Reprogramado</option>
            </select>
          </div>
          <div><Label>Cantidad</Label><Input type="number" min={0} value={manualForm.cantidad} onChange={e => setManualForm({ ...manualForm, cantidad: Number(e.target.value) })} /></div>
          <div className="flex items-end"><Button className="w-full" onClick={handleManualConsumption}>Guardar movimiento</Button></div>
        </div>
        <div><Label>Notas</Label><Textarea value={manualForm.notas} onChange={e => setManualForm({ ...manualForm, notas: e.target.value })} placeholder="Ej: se llevó 2 viandas, quedó una a favor, se corrigió conteo, etc." /></div>
      </div>

      {/* Ajustes y saldos a favor */}
      <div className="mb-6">
        <ClientCreditNotes clientId={client.id} />
      </div>

      {/* Historial de puntos — solo movimientos relevantes (sin consumos individuales) */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Historial de puntos</h3>
          <span className="text-sm font-semibold">{client.puntos} pts totales</span>
        </div>
        {(() => {
          const puntosConsumidos = points.filter(p => p.motivo.startsWith('Consumo registrado'));
          const puntosRelevantes = points.filter(p => !p.motivo.startsWith('Consumo registrado'));
          const totalPorConsumos = puntosConsumidos.reduce((acc, p) => acc + p.puntos, 0);

          return (
            <div className="space-y-2">
              {/* Resumen de puntos por consumos */}
              {puntosConsumidos.length > 0 && (
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <div>
                    <p className="text-sm font-medium">Puntos por consumos ({puntosConsumidos.length} registros)</p>
                    <p className="text-xs text-muted-foreground">Suma automática por cada retiro</p>
                  </div>
                  <Badge variant="default">+{totalPorConsumos}</Badge>
                </div>
              )}
              {/* Movimientos relevantes: renovaciones, canjes, bonos, manuales */}
              {puntosRelevantes.length === 0 && puntosConsumidos.length === 0 && (
                <p className="text-sm text-muted-foreground">Sin movimientos de puntos.</p>
              )}
              {puntosRelevantes.map(point => (
                <div key={point.id} className="flex items-center justify-between border-b border-border pb-2">
                  <div>
                    <p className="text-sm font-medium">{point.motivo}</p>
                    <p className="text-xs text-muted-foreground">{new Date(point.fecha).toLocaleDateString('es-AR')}</p>
                  </div>
                  <Badge variant={point.puntos >= 0 ? 'default' : 'destructive'}>{point.puntos >= 0 ? '+' : ''}{point.puntos}</Badge>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
