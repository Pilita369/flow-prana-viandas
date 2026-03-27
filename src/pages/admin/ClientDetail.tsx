import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Send, Trash2, X, Edit2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  getClient, getActivePlan, getClientConsumptions, getClientPoints,
  getDisponibles, getCantidadUsada, createConsumption, deleteConsumption, updatePlan,
} from '@/lib/store';
import { formatCurrencyAR, formatDateAR, getDiasEstimadosFromPlan, calculateFixedPlanEstimatedEndDate, calcularTotalContrato } from '@/lib/business';
import { toast } from 'sonner';
import type { Client, Plan, Consumption, PointTransaction, ConsumptionStatus, DayOfWeek } from '@/types';

const DAYS: { value: DayOfWeek; label: string }[] = [
  { value: 'lunes', label: 'Lunes' },
  { value: 'martes', label: 'Martes' },
  { value: 'miercoles', label: 'Miércoles' },
  { value: 'jueves', label: 'Jueves' },
  { value: 'viernes', label: 'Viernes' },
];

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [client, setClient] = useState<Client | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [consumptions, setConsumptions] = useState<Consumption[]>([]);
  const [points, setPoints] = useState<PointTransaction[]>([]);
  const [usadas, setUsadas] = useState(0);
  const [disponibles, setDisponibles] = useState(0);
  const [newExcludedDate, setNewExcludedDate] = useState('');
  const [loading, setLoading] = useState(true);

  // Estado de edición del plan
  const [editingPlan, setEditingPlan] = useState(false);
  const [planEdit, setPlanEdit] = useState({
    cantidadContratada: 0,
    ajusteInicialUsadas: 0,
    precioUnitario: 0,
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
      setManualForm(prev => ({ ...prev, cantidad: activePlan?.unidadesPorRetiro || 1 }));

      if (activePlan) {
        setPlanEdit({
          cantidadContratada: activePlan.cantidadContratada,
          ajusteInicialUsadas: activePlan.ajusteInicialUsadas || 0,
          precioUnitario: activePlan.precioUnitario,
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

  const handleSavePlan = async () => {
    if (!plan) return;
    try {
      await updatePlan(plan.id, {
        cantidadContratada: Number(planEdit.cantidadContratada),
        ajusteInicialUsadas: Number(planEdit.ajusteInicialUsadas),
        precioUnitario: Number(planEdit.precioUnitario),
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
            <h3 className="font-semibold">Resumen del contrato</h3>
            {plan && !editingPlan && (
              <Button variant="outline" size="sm" onClick={() => setEditingPlan(true)}>
                <Edit2 className="w-3.5 h-3.5 mr-1.5" />Editar
              </Button>
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
                  <div><span className="text-muted-foreground">Total:</span> <strong>{formatCurrencyAR(plan.totalCalculado)}</strong></div>
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

      {/* Historial de movimientos */}
      <div className="glass-card p-5 mb-6">
        <h3 className="font-semibold mb-4">Historial de movimientos</h3>
        {consumptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin movimientos cargados todavía.</p>
        ) : (
          <div className="space-y-3">
            {consumptions.map(consumption => (
              <div key={consumption.id} className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b border-border pb-3">
                <div>
                  <p className="font-medium text-sm">{formatDateAR(consumption.fecha)} · {consumption.cantidad} vianda(s)</p>
                  <p className="text-xs text-muted-foreground">{consumption.tipo} · {consumption.notas || 'Sin observaciones'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={consumption.status === 'retirado' || consumption.status === 'consumido' ? 'default' : consumption.status === 'no_retirado' || consumption.status === 'no_retiro' ? 'destructive' : 'secondary'}>
                    {consumption.status === 'retirado' || consumption.status === 'consumido' ? 'Retirado' : consumption.status === 'no_retirado' || consumption.status === 'no_retiro' ? 'No retiró' : 'Reprogramado'}
                  </Badge>
                  <Button variant="outline" size="sm" onClick={() => handleDeleteConsumption(consumption.id)}>
                    <Trash2 className="w-4 h-4 mr-2" />Eliminar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Historial de puntos */}
      <div className="glass-card p-5">
        <h3 className="font-semibold mb-4">Historial de puntos</h3>
        {points.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin movimientos de puntos.</p>
        ) : (
          <div className="space-y-2">
            {points.map(point => (
              <div key={point.id} className="flex items-center justify-between border-b border-border pb-2">
                <div>
                  <p className="text-sm font-medium">{point.motivo}</p>
                  <p className="text-xs text-muted-foreground">{new Date(point.fecha).toLocaleString('es-AR')}</p>
                </div>
                <Badge variant={point.puntos >= 0 ? 'default' : 'destructive'}>{point.puntos >= 0 ? '+' : ''}{point.puntos}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}