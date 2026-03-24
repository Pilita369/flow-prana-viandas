import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { createClient, createPlan } from '@/lib/store';
import { toast } from 'sonner';
import { Copy, Send, Save } from 'lucide-react';
import type { PlanModality, DayOfWeek, DeliveryType } from '@/types';

const DAYS: { value: DayOfWeek; label: string }[] = [
  { value: 'lunes', label: 'Lunes' },
  { value: 'martes', label: 'Martes' },
  { value: 'miercoles', label: 'Miércoles' },
  { value: 'jueves', label: 'Jueves' },
  { value: 'viernes', label: 'Viernes' },
];

export default function CreateClient() {
  // --------------------------------------------
  // Datos personales del cliente
  // --------------------------------------------
  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    telefono: '',
    email: '',
    direccion: '',
    password: '',
  });

  // --------------------------------------------
  // Datos del contrato/plan
  // --------------------------------------------
  const [planForm, setPlanForm] = useState({
    cantidadContratada: 20,
    cantidadUsada: 0,
    modalidad: 'fijo' as PlanModality,
    precioUnitario: 0,
    importeAbonado: 0,
    fechaInicio: new Date().toISOString().split('T')[0],
    fechaFin: '',
    tipoEntrega: 'retiro' as DeliveryType,
    direccionEnvio: '',
    diasFijos: [] as DayOfWeek[],
    cantidadSemanal: 3,
    horaLimite: '20:00',
    observaciones: '',
  });

  // Link generado para el cliente
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  const toggleDay = (day: DayOfWeek) => {
    setPlanForm((prev) => ({
      ...prev,
      diasFijos: prev.diasFijos.includes(day)
        ? prev.diasFijos.filter((d) => d !== day)
        : [...prev.diasFijos, day],
    }));
  };

  const handleSave = () => {
    // Validaciones mínimas
    if (!form.nombre || !form.apellido || !form.telefono || !form.email) {
      toast.error('Completá nombre, apellido, teléfono y email');
      return;
    }

    if (planForm.cantidadContratada <= 0) {
      toast.error('La cantidad contratada debe ser mayor a 0');
      return;
    }

    if (planForm.cantidadUsada < 0 || planForm.cantidadUsada > planForm.cantidadContratada) {
      toast.error('La cantidad usada no puede ser mayor a la contratada');
      return;
    }

    // 1) Crear cliente
    const client = createClient({
      nombre: form.nombre,
      apellido: form.apellido,
      telefono: form.telefono,
      email: form.email,
      direccion: form.direccion || undefined,
      password: form.password || undefined,
      referidoPor: undefined,
    });

    // 2) Crear contrato / plan personalizado
    createPlan({
      clientId: client.id,
      cantidadContratada: Number(planForm.cantidadContratada),
      cantidadUsada: Number(planForm.cantidadUsada),
      modalidad: planForm.modalidad,
      precioUnitario: Number(planForm.precioUnitario),
      importeAbonado: Number(planForm.importeAbonado),
      fechaInicio: planForm.fechaInicio,
      fechaFin: planForm.fechaFin,
      tipoEntrega: planForm.tipoEntrega,
      direccionEnvio: planForm.tipoEntrega === 'envio' ? planForm.direccionEnvio : undefined,
      diasFijos: planForm.modalidad === 'fijo' ? planForm.diasFijos : undefined,
      cantidadSemanal: planForm.modalidad === 'flexible' ? Number(planForm.cantidadSemanal) : undefined,
      horaLimite: planForm.modalidad === 'flexible' ? planForm.horaLimite : undefined,
      observaciones: planForm.observaciones || undefined,
    });

    const link = `${window.location.origin}/cliente/${client.accessLink}`;
    setCreatedLink(link);

    toast.success('Cliente y contrato creados correctamente');
  };

  const copyLink = () => {
    if (!createdLink) return;
    navigator.clipboard.writeText(createdLink);
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
        {/* ===============================
            DATOS PERSONALES
           =============================== */}
        <div className="glass-card p-6 space-y-4">
          <h2 className="font-semibold">Datos personales</h2>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Nombre</Label>
              <Input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </div>

            <div>
              <Label>Apellido</Label>
              <Input
                value={form.apellido}
                onChange={(e) => setForm({ ...form, apellido: e.target.value })}
              />
            </div>

            <div>
              <Label>Teléfono</Label>
              <Input
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              />
            </div>

            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div className="md:col-span-2">
              <Label>Dirección (opcional)</Label>
              <Input
                value={form.direccion}
                onChange={(e) => setForm({ ...form, direccion: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* ===============================
            CONTRATO / PLAN
           =============================== */}
        <div className="glass-card p-6 space-y-4">
          <h2 className="font-semibold">Contrato / plan</h2>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label>Cantidad contratada</Label>
              <Input
                type="number"
                min={1}
                value={planForm.cantidadContratada}
                onChange={(e) =>
                  setPlanForm({
                    ...planForm,
                    cantidadContratada: Number(e.target.value),
                  })
                }
              />
            </div>

            <div>
              <Label>Cantidad ya usada</Label>
              <Input
                type="number"
                min={0}
                value={planForm.cantidadUsada}
                onChange={(e) =>
                  setPlanForm({
                    ...planForm,
                    cantidadUsada: Number(e.target.value),
                  })
                }
              />
            </div>

            <div>
              <Label>Modalidad</Label>
              <Select
                value={planForm.modalidad}
                onValueChange={(value: PlanModality) =>
                  setPlanForm({ ...planForm, modalidad: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fijo">Fijo</SelectItem>
                  <SelectItem value="flexible">Flexible</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Tipo de entrega</Label>
              <Select
                value={planForm.tipoEntrega}
                onValueChange={(value: DeliveryType) =>
                  setPlanForm({ ...planForm, tipoEntrega: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="retiro">Retiro</SelectItem>
                  <SelectItem value="envio">Envío</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Precio unitario</Label>
              <Input
                type="number"
                min={0}
                value={planForm.precioUnitario}
                onChange={(e) =>
                  setPlanForm({
                    ...planForm,
                    precioUnitario: Number(e.target.value),
                  })
                }
              />
            </div>

            <div>
              <Label>Importe abonado</Label>
              <Input
                type="number"
                min={0}
                value={planForm.importeAbonado}
                onChange={(e) =>
                  setPlanForm({
                    ...planForm,
                    importeAbonado: Number(e.target.value),
                  })
                }
              />
            </div>

            <div>
              <Label>Fecha de inicio</Label>
              <Input
                type="date"
                value={planForm.fechaInicio}
                onChange={(e) =>
                  setPlanForm({
                    ...planForm,
                    fechaInicio: e.target.value,
                  })
                }
              />
            </div>

            <div>
              <Label>Fecha de fin</Label>
              <Input
                type="date"
                value={planForm.fechaFin}
                onChange={(e) =>
                  setPlanForm({
                    ...planForm,
                    fechaFin: e.target.value,
                  })
                }
              />
            </div>

            {planForm.tipoEntrega === 'envio' && (
              <div className="md:col-span-2">
                <Label>Dirección de envío</Label>
                <Input
                  value={planForm.direccionEnvio}
                  onChange={(e) =>
                    setPlanForm({
                      ...planForm,
                      direccionEnvio: e.target.value,
                    })
                  }
                />
              </div>
            )}
          </div>

          {/* Datos específicos para plan fijo */}
          {planForm.modalidad === 'fijo' && (
            <div className="space-y-3">
              <Label>Días fijos sugeridos</Label>
              <div className="flex flex-wrap gap-4">
                {DAYS.map((day) => (
                  <label key={day.value} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={planForm.diasFijos.includes(day.value)}
                      onCheckedChange={() => toggleDay(day.value)}
                    />
                    {day.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Datos específicos para plan flexible */}
          {planForm.modalidad === 'flexible' && (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Cantidad semanal</Label>
                <Input
                  type="number"
                  min={1}
                  value={planForm.cantidadSemanal}
                  onChange={(e) =>
                    setPlanForm({
                      ...planForm,
                      cantidadSemanal: Number(e.target.value),
                    })
                  }
                />
              </div>

              <div>
                <Label>Hora límite para pedir</Label>
                <Input
                  type="time"
                  value={planForm.horaLimite}
                  onChange={(e) =>
                    setPlanForm({
                      ...planForm,
                      horaLimite: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          )}

          <div>
            <Label>Observaciones</Label>
            <Textarea
              value={planForm.observaciones}
              onChange={(e) =>
                setPlanForm({
                  ...planForm,
                  observaciones: e.target.value,
                })
              }
              placeholder="Ej: a veces se lleva doble vianda, si no consume queda a favor, etc."
            />
          </div>
        </div>

        <div className="flex gap-3">
          <Button onClick={handleSave}>
            <Save className="w-4 h-4 mr-2" />
            Guardar cliente
          </Button>
        </div>
      </div>
    </div>
  );
}