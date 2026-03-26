import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createClient, createPlan } from '@/lib/store';
import {
  calculateFixedPlanEstimatedEndDate,
  calcularDiasContratadosEstimados,
  calcularTotalContrato,
  formatCurrencyAR,
  formatDateAR,
  getBusinessConfig,
  getSuggestedPrice,
} from '@/lib/business';
import { toast } from 'sonner';
import { Copy, Save, Send, X } from 'lucide-react';
import type { DayOfWeek, DeliveryType, PlanModality } from '@/types';

const DAYS: { value: DayOfWeek; label: string }[] = [
  { value: 'lunes', label: 'Lunes' },
  { value: 'martes', label: 'Martes' },
  { value: 'miercoles', label: 'Miércoles' },
  { value: 'jueves', label: 'Jueves' },
  { value: 'viernes', label: 'Viernes' },
];

export default function CreateClient() {
  const businessConfig = getBusinessConfig();

  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    alias: '',
    telefono: '',
    email: '',
    direccion: '',
    password: '',
  });

  const [planForm, setPlanForm] = useState({
    cantidadContratada: 38,
    ajusteInicialUsadas: 0,
    modalidad: 'fijo' as PlanModality,
    precioUnitario: businessConfig.precioBaseRetiro,
    fechaInicio: new Date().toISOString().split('T')[0],
    fechaFin: '',
    tipoEntrega: 'retiro' as DeliveryType,
    direccionEnvio: '',
    diasFijos: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'] as DayOfWeek[],
    cantidadSemanal: 3,
    horaLimite: '20:00',
    unidadesPorRetiro: 2,
    observaciones: '',
    fechasExcluidas: [] as string[],
  });

  const [newExcludedDate, setNewExcludedDate] = useState('');
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const totalCalculado = useMemo(() => {
    return calcularTotalContrato(planForm.cantidadContratada, planForm.precioUnitario);
  }, [planForm.cantidadContratada, planForm.precioUnitario]);

  const diasContratadosEstimados = useMemo(() => {
    return calcularDiasContratadosEstimados(
      planForm.cantidadContratada,
      planForm.unidadesPorRetiro
    );
  }, [planForm.cantidadContratada, planForm.unidadesPorRetiro]);

  const toggleDay = (day: DayOfWeek) => {
    setPlanForm((prev) => ({
      ...prev,
      diasFijos: prev.diasFijos.includes(day)
        ? prev.diasFijos.filter((d) => d !== day)
        : [...prev.diasFijos, day],
    }));
  };

  useEffect(() => {
    setPlanForm((prev) => ({
      ...prev,
      precioUnitario: getSuggestedPrice(prev.tipoEntrega),
    }));
  }, [planForm.tipoEntrega]);

  useEffect(() => {
    if (planForm.modalidad === 'fijo') {
      const fin = calculateFixedPlanEstimatedEndDate(
        planForm.fechaInicio,
        diasContratadosEstimados,
        planForm.diasFijos,
        planForm.fechasExcluidas
      );

      setPlanForm((prev) => ({
        ...prev,
        fechaFin: fin,
      }));
    }
  }, [
    planForm.modalidad,
    planForm.fechaInicio,
    planForm.diasFijos,
    planForm.fechasExcluidas,
    diasContratadosEstimados,
  ]);

  const addExcludedDate = () => {
    if (!newExcludedDate) return;

    setPlanForm((prev) => ({
      ...prev,
      fechasExcluidas: Array.from(new Set([...prev.fechasExcluidas, newExcludedDate])).sort(),
    }));

    setNewExcludedDate('');
  };

  const removeExcludedDate = (date: string) => {
    setPlanForm((prev) => ({
      ...prev,
      fechasExcluidas: prev.fechasExcluidas.filter((d) => d !== date),
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      if (!form.nombre || !form.apellido || !form.telefono || !form.email) {
        toast.error('Completá nombre, apellido, teléfono y email');
        return;
      }

      if (planForm.cantidadContratada <= 0) {
        toast.error('La cantidad contratada debe ser mayor a 0');
        return;
      }

      if (planForm.unidadesPorRetiro <= 0) {
        toast.error('Las viandas por retiro deben ser mayores a 0');
        return;
      }

      if (planForm.modalidad === 'fijo' && planForm.diasFijos.length === 0) {
        toast.error('Elegí al menos un día para el plan fijo');
        return;
      }

      const client = await createClient({
        nombre: form.nombre,
        apellido: form.apellido,
        alias: form.alias || undefined,
        telefono: form.telefono,
        email: form.email,
        direccion: form.direccion || undefined,
        password: form.password || undefined,
        referidoPor: undefined,
      });

      await createPlan({
        clientId: client.id,
        cantidadContratada: Number(planForm.cantidadContratada),
        ajusteInicialUsadas: Number(planForm.ajusteInicialUsadas),
        modalidad: planForm.modalidad,
        precioUnitario: Number(planForm.precioUnitario),
        fechaInicio: planForm.fechaInicio,
        fechaFin: planForm.fechaFin,
        tipoEntrega: planForm.tipoEntrega,
        direccionEnvio: planForm.tipoEntrega === 'envio' ? planForm.direccionEnvio : undefined,
        diasFijos: planForm.modalidad === 'fijo' ? planForm.diasFijos : undefined,
        cantidadSemanal: planForm.modalidad === 'flexible' ? Number(planForm.cantidadSemanal) : undefined,
        horaLimite: planForm.modalidad === 'flexible' ? planForm.horaLimite : undefined,
        unidadesPorRetiro: Number(planForm.unidadesPorRetiro),
        observaciones: planForm.observaciones || undefined,
        fechasExcluidas: planForm.fechasExcluidas,
      });

      const link = `${window.location.origin}/cliente/${client.accessLink}`;
      setCreatedLink(link);

      toast.success('Cliente creado correctamente');
    } catch (error) {
      console.error(error);
      toast.error('No se pudo crear el cliente');
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async () => {
    if (!createdLink) return;
    await navigator.clipboard.writeText(createdLink);
    toast.success('Link copiado');
  };

  const sendWhatsApp = () => {
    if (!createdLink || !form.telefono) return;

    const msg = encodeURIComponent(
      `Hola ${form.nombre}, te comparto tu acceso a Mundo Prana para ver tu seguimiento: ${createdLink}`
    );

    window.open(`https://wa.me/${form.telefono.replace(/\D/g, '')}?text=${msg}`, '_blank');
  };

  if (createdLink) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Cliente creado</h1>
          <p className="page-subtitle">
            {form.nombre} {form.apellido} ya tiene su acceso generado
          </p>
        </div>

        <div className="glass-card p-6 max-w-2xl space-y-4">
          <div>
            <Label>Link del cliente</Label>
            <div className="flex gap-2 mt-2">
              <Input value={createdLink} readOnly />
              <Button variant="outline" size="icon" onClick={copyLink}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={copyLink} variant="outline">
              <Copy className="w-4 h-4 mr-2" />
              Copiar link
            </Button>

            <Button onClick={sendWhatsApp}>
              <Send className="w-4 h-4 mr-2" />
              Enviar por WhatsApp
            </Button>

            <Button variant="secondary" onClick={() => window.location.reload()}>
              Crear otro cliente
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Nuevo cliente</h1>
        <p className="page-subtitle">Alta manual de cliente y contrato personalizado</p>
      </div>

      <div className="grid gap-6">
        <div className="glass-card p-6 space-y-4">
          <h2 className="font-semibold">Datos personales</h2>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Nombre</Label>
              <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>

            <div>
              <Label>Apellido</Label>
              <Input value={form.apellido} onChange={(e) => setForm({ ...form, apellido: e.target.value })} />
            </div>

            <div>
              <Label>Teléfono</Label>
              <Input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
            </div>

            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>

            <div>
              <Label>Alias para ranking</Label>
              <Input
                value={form.alias}
                onChange={(e) => setForm({ ...form, alias: e.target.value })}
                placeholder="Ej: La Reina del Tupper"
              />
            </div>

            <div>
              <Label>Dirección (opcional)</Label>
              <Input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="glass-card p-6 space-y-4">
          <h2 className="font-semibold">Contrato / plan</h2>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Cantidad contratada</Label>
              <Input
                type="number"
                min={1}
                value={planForm.cantidadContratada}
                onChange={(e) => setPlanForm({ ...planForm, cantidadContratada: Number(e.target.value) })}
              />
            </div>

            <div>
              <Label>Ajuste inicial usado</Label>
              <Input
                type="number"
                min={0}
                value={planForm.ajusteInicialUsadas}
                onChange={(e) => setPlanForm({ ...planForm, ajusteInicialUsadas: Number(e.target.value) })}
              />
            </div>

            <div>
              <Label>Modalidad</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={planForm.modalidad}
                onChange={(e) => setPlanForm({ ...planForm, modalidad: e.target.value as PlanModality })}
              >
                <option value="fijo">Fijo</option>
                <option value="flexible">Flexible</option>
              </select>
            </div>

            <div>
              <Label>Tipo de entrega</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={planForm.tipoEntrega}
                onChange={(e) => setPlanForm({ ...planForm, tipoEntrega: e.target.value as DeliveryType })}
              >
                <option value="retiro">Retiro en el local</option>
                <option value="envio">Envío</option>
              </select>
            </div>

            <div>
              <Label>Precio unitario por vianda</Label>
              <Input
                type="number"
                min={0}
                value={planForm.precioUnitario}
                onChange={(e) => setPlanForm({ ...planForm, precioUnitario: Number(e.target.value) })}
              />
            </div>

            <div>
              <Label>Total calculado</Label>
              <Input value={formatCurrencyAR(totalCalculado)} readOnly />
            </div>

            <div>
              <Label>Viandas por retiro</Label>
              <Input
                type="number"
                min={1}
                value={planForm.unidadesPorRetiro}
                onChange={(e) => setPlanForm({ ...planForm, unidadesPorRetiro: Number(e.target.value) })}
              />
            </div>

            <div>
              <Label>Días contratados estimados</Label>
              <Input value={String(diasContratadosEstimados)} readOnly />
            </div>

            <div>
              <Label>Fecha de inicio</Label>
              <Input
                type="date"
                value={planForm.fechaInicio}
                onChange={(e) => setPlanForm({ ...planForm, fechaInicio: e.target.value })}
              />
            </div>

            <div>
              <Label>Fecha estimada de finalización</Label>
              <Input value={planForm.fechaFin ? formatDateAR(planForm.fechaFin) : ''} readOnly />
            </div>

            {planForm.tipoEntrega === 'envio' && (
              <div className="md:col-span-2">
                <Label>Dirección de envío</Label>
                <Input
                  value={planForm.direccionEnvio}
                  onChange={(e) => setPlanForm({ ...planForm, direccionEnvio: e.target.value })}
                />
              </div>
            )}
          </div>

          {planForm.modalidad === 'fijo' && (
            <div className="space-y-3">
              <Label>Días de retiro</Label>
              <div className="flex flex-wrap gap-4">
                {DAYS.map((day) => (
                  <label key={day.value} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={planForm.diasFijos.includes(day.value)}
                      onChange={() => toggleDay(day.value)}
                    />
                    {day.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {planForm.modalidad === 'flexible' && (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Cantidad semanal</Label>
                <Input
                  type="number"
                  min={1}
                  value={planForm.cantidadSemanal}
                  onChange={(e) => setPlanForm({ ...planForm, cantidadSemanal: Number(e.target.value) })}
                />
              </div>

              <div>
                <Label>Hora límite para pedir</Label>
                <Input
                  type="time"
                  value={planForm.horaLimite}
                  onChange={(e) => setPlanForm({ ...planForm, horaLimite: e.target.value })}
                />
              </div>
            </div>
          )}

          <div className="space-y-3">
            <Label>Fechas excluidas para este cliente</Label>

            <div className="flex gap-2">
              <Input
                type="date"
                value={newExcludedDate}
                onChange={(e) => setNewExcludedDate(e.target.value)}
              />
              <Button type="button" variant="outline" onClick={addExcludedDate}>
                Agregar fecha
              </Button>
            </div>

            {planForm.fechasExcluidas.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {planForm.fechasExcluidas.map((date) => (
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

          <div>
            <Label>Observaciones internas</Label>
            <Textarea
              value={planForm.observaciones}
              onChange={(e) => setPlanForm({ ...planForm, observaciones: e.target.value })}
              placeholder="Ej: contrato 19 días del mes, 2 viandas diarias, si falta se excluye la fecha."
            />
          </div>
        </div>

        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Guardando...' : 'Guardar cliente'}
          </Button>
        </div>
      </div>
    </div>
  );
}