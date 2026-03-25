import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Send, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  getClient,
  getActivePlan,
  getClientConsumptions,
  getClientPoints,
  getDisponibles,
  getCantidadUsada,
  createConsumption,
  deleteConsumption,
  updatePlan,
} from '@/lib/store';
import {
  formatCurrencyAR,
  formatDateAR,
  getDiasEstimadosFromPlan,
  calculateFixedPlanEstimatedEndDate,
} from '@/lib/business';
import { toast } from 'sonner';
import type { Client, Plan, Consumption, PointTransaction, ConsumptionStatus } from '@/types';

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [client, setClient] = useState<Client | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [consumptions, setConsumptions] = useState<Consumption[]>([]);
  const [points, setPoints] = useState<PointTransaction[]>([]);
  const [newExcludedDate, setNewExcludedDate] = useState('');

  const [manualForm, setManualForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    status: 'retirado' as ConsumptionStatus,
    cantidad: 1,
    notas: '',
  });

  const load = () => {
    if (!id) return;

    const c = getClient(id);
    if (!c) {
      navigate('/admin/clientes');
      return;
    }

    const activePlan = getActivePlan(id) || null;

    setClient(c);
    setPlan(activePlan);
    setConsumptions(getClientConsumptions(id));
    setPoints(getClientPoints(id));

    setManualForm((prev) => ({
      ...prev,
      cantidad: activePlan?.unidadesPorRetiro || 1,
    }));
  };

  useEffect(() => {
    load();
  }, [id]);

  if (!client) return null;

  const usadas = getCantidadUsada(plan);
  const disponibles = getDisponibles(plan);
  const accessUrl = `${window.location.origin}/cliente/${client.accessLink}`;

  const diasEstimados = getDiasEstimadosFromPlan(plan);
  const fechaEstimadaFin =
    plan?.modalidad === 'fijo'
      ? calculateFixedPlanEstimatedEndDate(
          plan.fechaInicio,
          diasEstimados,
          plan.diasFijos || [],
          plan.fechasExcluidas || []
        )
      : plan?.fechaFin || '';

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(accessUrl);
    toast.success('Link copiado');
  };

  const handleWhatsApp = () => {
    const msg = encodeURIComponent(
      `Hola ${client.nombre}, te comparto tu acceso de Mundo Prana para ver tu seguimiento: ${accessUrl}`
    );

    window.open(`https://wa.me/${client.telefono.replace(/\D/g, '')}?text=${msg}`, '_blank');
  };

  const handleManualConsumption = () => {
    if (!plan) {
      toast.error('El cliente no tiene contrato activo');
      return;
    }

    if (manualForm.cantidad < 0) {
      toast.error('La cantidad no puede ser negativa');
      return;
    }

    createConsumption({
      clientId: client.id,
      planId: plan.id,
      fecha: manualForm.fecha,
      status: manualForm.status,
      tipo: 'manual',
      cantidad: Number(manualForm.cantidad),
      notas: manualForm.notas || undefined,
    });

    toast.success('Movimiento cargado');
    load();
  };

  const handleDeleteConsumption = (consumptionId: string) => {
    const ok = window.confirm('¿Eliminar este movimiento?');
    if (!ok) return;

    deleteConsumption(consumptionId);
    toast.success('Movimiento eliminado');
    load();
  };

  const addExcludedDate = () => {
    if (!plan || !newExcludedDate) return;

    updatePlan(plan.id, {
      fechasExcluidas: Array.from(new Set([...(plan.fechasExcluidas || []), newExcludedDate])).sort(),
    });

    setNewExcludedDate('');
    toast.success('Fecha excluida agregada');
    load();
  };

  const removeExcludedDate = (date: string) => {
    if (!plan) return;

    updatePlan(plan.id, {
      fechasExcluidas: (plan.fechasExcluidas || []).filter((d) => d !== date),
    });

    toast.success('Fecha excluida eliminada');
    load();
  };

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => navigate('/admin/clientes')} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Volver
      </Button>

      <div className="page-header">
        <h1 className="page-title">
          {client.nombre} {client.apellido}
        </h1>
        <p className="page-subtitle">
          {client.email} · {client.telefono}
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="glass-card p-5 space-y-3">
          <h3 className="font-semibold">Resumen del contrato</h3>

          {plan ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{plan.modalidad}</Badge>
                <Badge variant="outline">{plan.tipoEntrega}</Badge>
                <Badge variant="outline">{plan.unidadesPorRetiro} por retiro</Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Contratadas:</span>{' '}
                  <strong>{plan.cantidadContratada}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Usadas:</span>{' '}
                  <strong>{usadas}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Disponibles:</span>{' '}
                  <strong>{disponibles}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Puntos:</span>{' '}
                  <strong>{client.puntos}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Precio unitario:</span>{' '}
                  <strong>{formatCurrencyAR(plan.precioUnitario)}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Total:</span>{' '}
                  <strong>{formatCurrencyAR(plan.totalCalculado)}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Inicio:</span>{' '}
                  <strong>{formatDateAR(plan.fechaInicio)}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Fin estimada:</span>{' '}
                  <strong>{fechaEstimadaFin ? formatDateAR(fechaEstimadaFin) : '-'}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Días estimados:</span>{' '}
                  <strong>{diasEstimados}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Viandas por día:</span>{' '}
                  <strong>{plan.unidadesPorRetiro}</strong>
                </div>
              </div>

              {plan.diasFijos?.length ? (
                <p className="text-sm text-muted-foreground">
                  <strong>Días fijos:</strong> {plan.diasFijos.join(', ')}
                </p>
              ) : null}

              {plan.observaciones ? (
                <p className="text-sm text-muted-foreground">
                  <strong>Observaciones:</strong> {plan.observaciones}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Sin contrato activo</p>
          )}
        </div>

        <div className="glass-card p-5 space-y-4">
          <h3 className="font-semibold">Acceso del cliente</h3>

          <div>
            <Label>Link público</Label>
            <Input value={accessUrl} readOnly />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={handleCopyLink}>
              <Copy className="w-4 h-4 mr-2" />
              Copiar link
            </Button>

            <Button onClick={handleWhatsApp}>
              <Send className="w-4 h-4 mr-2" />
              Enviar por WhatsApp
            </Button>
          </div>
        </div>
      </div>

      {plan && (
        <div className="glass-card p-5 mb-6 space-y-4">
          <h3 className="font-semibold">Fechas excluidas para este cliente</h3>

          <div className="flex gap-2">
            <Input
              type="date"
              value={newExcludedDate}
              onChange={(e) => setNewExcludedDate(e.target.value)}
            />
            <Button variant="outline" onClick={addExcludedDate}>
              Agregar fecha
            </Button>
          </div>

          {(plan.fechasExcluidas || []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(plan.fechasExcluidas || []).map((date) => (
                <span
                  key={date}
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
                >
                  {formatDateAR(date)}
                  <button type="button" onClick={() => removeExcludedDate(date)}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="glass-card p-5 mb-6 space-y-4">
        <h3 className="font-semibold">Cargar consumo manual / histórico</h3>

        <div className="grid md:grid-cols-4 gap-4">
          <div>
            <Label>Fecha</Label>
            <Input
              type="date"
              value={manualForm.fecha}
              onChange={(e) => setManualForm({ ...manualForm, fecha: e.target.value })}
            />
          </div>

          <div>
            <Label>Estado</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={manualForm.status}
              onChange={(e) =>
                setManualForm({
                  ...manualForm,
                  status: e.target.value as ConsumptionStatus,
                })
              }
            >
              <option value="retirado">Retirado</option>
              <option value="no_retirado">No retiró</option>
              <option value="reprogramado">Reprogramado</option>
            </select>
          </div>

          <div>
            <Label>Cantidad</Label>
            <Input
              type="number"
              min={0}
              value={manualForm.cantidad}
              onChange={(e) =>
                setManualForm({
                  ...manualForm,
                  cantidad: Number(e.target.value),
                })
              }
            />
          </div>

          <div className="flex items-end">
            <Button className="w-full" onClick={handleManualConsumption}>
              Guardar movimiento
            </Button>
          </div>
        </div>

        <div>
          <Label>Notas</Label>
          <Textarea
            value={manualForm.notas}
            onChange={(e) =>
              setManualForm({
                ...manualForm,
                notas: e.target.value,
              })
            }
            placeholder="Ej: se llevó 2 viandas, quedó una a favor, se corrigió conteo, etc."
          />
        </div>
      </div>

      <div className="glass-card p-5 mb-6">
        <h3 className="font-semibold mb-4">Historial de movimientos</h3>

        {consumptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin movimientos cargados todavía.</p>
        ) : (
          <div className="space-y-3">
            {consumptions.map((consumption) => (
              <div
                key={consumption.id}
                className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b border-border pb-3"
              >
                <div>
                  <p className="font-medium text-sm">
                    {formatDateAR(consumption.fecha)} · {consumption.cantidad} vianda(s)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {consumption.tipo} · {consumption.notas || 'Sin observaciones'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      consumption.status === 'retirado' || consumption.status === 'consumido'
                        ? 'default'
                        : consumption.status === 'no_retirado' || consumption.status === 'no_retiro'
                        ? 'destructive'
                        : 'secondary'
                    }
                  >
                    {consumption.status === 'retirado' || consumption.status === 'consumido'
                      ? 'Retirado'
                      : consumption.status === 'no_retirado' || consumption.status === 'no_retiro'
                      ? 'No retiró'
                      : 'Reprogramado'}
                  </Badge>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteConsumption(consumption.id)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Eliminar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-card p-5">
        <h3 className="font-semibold mb-4">Historial de puntos</h3>

        {points.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin movimientos de puntos.</p>
        ) : (
          <div className="space-y-2">
            {points.map((point) => (
              <div key={point.id} className="flex items-center justify-between border-b border-border pb-2">
                <div>
                  <p className="text-sm font-medium">{point.motivo}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(point.fecha).toLocaleString('es-AR')}
                  </p>
                </div>

                <Badge variant={point.puntos >= 0 ? 'default' : 'destructive'}>
                  {point.puntos >= 0 ? '+' : ''}
                  {point.puntos}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}