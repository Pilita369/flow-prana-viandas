// src/pages/admin/CreateClient.tsx
// ======================================================
// FORMULARIO PARA CREAR UN NUEVO CLIENTE
// Calcula automáticamente:
//   - Fecha fin según días elegidos + feriados
//   - Total sugerido a abonar (cantidad × precio unitario)
// ======================================================

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createClient, createPlan } from '@/lib/store';
import {
  calculateFixedPlanEndDate,
  calcularTotalSugerido,
  formatCurrencyAR,
  getBusinessConfig,
  getSuggestedPrice,
} from '@/lib/business';
import { toast } from 'sonner';
import { Copy, Save, Send } from 'lucide-react';
import type { DayOfWeek, DeliveryType, PlanModality } from '@/types';

// Días de la semana disponibles
const DAYS: { value: DayOfWeek; label: string }[] = [
  { value: 'lunes',     label: 'Lunes'     },
  { value: 'martes',    label: 'Martes'    },
  { value: 'miercoles', label: 'Miércoles' },
  { value: 'jueves',    label: 'Jueves'    },
  { value: 'viernes',   label: 'Viernes'   },
];

export default function CreateClient() {
  const businessConfig = getBusinessConfig();

  // ── Datos personales del cliente ──────────────────────
  const [form, setForm] = useState({
    nombre:    '',
    apellido:  '',
    alias:     '',   // Nombre o apodo para el ranking (puede ser inventado)
    telefono:  '',
    email:     '',
    direccion: '',
    password:  '',
  });

  // ── Datos del contrato / plan ─────────────────────────
  const [planForm, setPlanForm] = useState({
    cantidadContratada:  20,
    ajusteInicialUsadas: 0,
    modalidad:           'fijo' as PlanModality,
    precioUnitario:      businessConfig.precioBaseRetiro,
    importeAbonado:      0,
    fechaInicio:         new Date().toISOString().split('T')[0],
    fechaFin:            '',
    tipoEntrega:         'retiro' as DeliveryType,
    direccionEnvio:      '',
    diasFijos:           [] as DayOfWeek[],
    cantidadSemanal:     3,
    horaLimite:          '20:00',
    observaciones:       '',
  });

  // Link generado después de guardar
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  // ── Total sugerido calculado reactivamente ─────────────
  // Se recalcula cada vez que cambia la cantidad o el precio
  const totalSugerido = calcularTotalSugerido(
    planForm.cantidadContratada,
    planForm.precioUnitario
  );

  // ── Alternar día en el listado de días fijos ──────────
  const toggleDay = (day: DayOfWeek) => {
    setPlanForm((prev) => ({
      ...prev,
      diasFijos: prev.diasFijos.includes(day)
        ? prev.diasFijos.filter((d) => d !== day)
        : [...prev.diasFijos, day],
    }));
  };

  // ── Actualizar precio sugerido según tipo de entrega ──
  useEffect(() => {
    setPlanForm((prev) => ({
      ...prev,
      precioUnitario: getSuggestedPrice(prev.tipoEntrega),
    }));
  }, [planForm.tipoEntrega]);

  // ── Calcular fecha fin automáticamente (solo plan fijo) ─
  // Se recalcula cuando cambian: fecha inicio, cantidad, días elegidos
  useEffect(() => {
    if (planForm.modalidad === 'fijo') {
      const fechaFinCalculada = calculateFixedPlanEndDate(
        planForm.fechaInicio,
        Number(planForm.cantidadContratada),
        planForm.diasFijos
      );

      setPlanForm((prev) => ({ ...prev, fechaFin: fechaFinCalculada }));
    }
  }, [
    planForm.modalidad,
    planForm.fechaInicio,
    planForm.cantidadContratada,
    planForm.diasFijos,
  ]);

  // ── Guardar cliente + contrato ─────────────────────────
  const handleSave = () => {
    // Validaciones básicas
    if (!form.nombre || !form.apellido || !form.telefono || !form.email) {
      toast.error('Completá nombre, apellido, teléfono y email');
      return;
    }

    if (planForm.cantidadContratada <= 0) {
      toast.error('La cantidad contratada debe ser mayor a 0');
      return;
    }

    if (
      planForm.ajusteInicialUsadas < 0 ||
      planForm.ajusteInicialUsadas > planForm.cantidadContratada
    ) {
      toast.error('El ajuste inicial no puede ser mayor a la cantidad contratada');
      return;
    }

    if (planForm.modalidad === 'fijo' && planForm.diasFijos.length === 0) {
      toast.error('En un plan fijo tenés que elegir al menos un día');
      return;
    }

    if (!planForm.fechaFin) {
      toast.error('La fecha de fin no puede quedar vacía');
      return;
    }

    // Crear cliente en el store
    const client = createClient({
      nombre:     form.nombre,
      apellido:   form.apellido,
      alias:      form.alias || form.nombre, // Si no pone alias, usa el nombre
      telefono:   form.telefono,
      email:      form.email,
      direccion:  form.direccion || undefined,
      password:   form.password || undefined,
      referidoPor: undefined,
    });

    // Crear plan/contrato asociado al cliente
    createPlan({
      clientId:            client.id,
      cantidadContratada:  Number(planForm.cantidadContratada),
      ajusteInicialUsadas: Number(planForm.ajusteInicialUsadas),
      modalidad:           planForm.modalidad,
      precioUnitario:      Number(planForm.precioUnitario),
      importeAbonado:      Number(planForm.importeAbonado),
      fechaInicio:         planForm.fechaInicio,
      fechaFin:            planForm.fechaFin,
      tipoEntrega:         planForm.tipoEntrega,
      direccionEnvio:      planForm.tipoEntrega === 'envio' ? planForm.direccionEnvio : undefined,
      diasFijos:           planForm.modalidad === 'fijo' ? planForm.diasFijos : undefined,
      cantidadSemanal:     planForm.modalidad === 'flexible' ? Number(planForm.cantidadSemanal) : undefined,
      horaLimite:          planForm.modalidad === 'flexible' ? planForm.horaLimite : undefined,
      observaciones:       planForm.observaciones || undefined,
    });

    const link = `${window.location.origin}/cliente/${client.accessLink}`;
    setCreatedLink(link);

    toast.success('Cliente y contrato creados correctamente');
  };

  const copyLink = async () => {
    if (!createdLink) return;
    await navigator.clipboard.writeText(createdLink);
    toast.success('Link copiado');
  };

  const sendWhatsApp = () => {
    if (!createdLink || !form.telefono) return;

    const msg = encodeURIComponent(
      `Hola ${form.nombre}! 🌿 Te comparto tu acceso a Mundo Prana para ver tu seguimiento de viandas: ${createdLink}`
    );

    window.open(
      `https://wa.me/${form.telefono.replace(/\D/g, '')}?text=${msg}`,
      '_blank'
    );
  };

  // ── Pantalla de confirmación después de guardar ────────
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

  // ── Formulario principal ───────────────────────────────
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Nuevo cliente</h1>
        <p className="page-subtitle">Alta manual de cliente y contrato personalizado</p>
      </div>

      <div className="grid gap-6">

        {/* ── DATOS PERSONALES ── */}
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

            <div>
              {/* El alias se muestra en el ranking en lugar del nombre real.
                  Podés inventarlo para motivar a otros clientes. */}
              <Label>Alias para el ranking</Label>
              <Input
                placeholder="Ej: La Reina del Tapper, Pilar.fit..."
                value={form.alias}
                onChange={(e) => setForm({ ...form, alias: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Este nombre se muestra en el ranking público. Si lo dejás vacío, se usa el nombre.
              </p>
            </div>

            <div>
              <Label>Dirección (opcional)</Label>
              <Input
                value={form.direccion}
                onChange={(e) => setForm({ ...form, direccion: e.target.value })}
              />
            </div>

            <div>
              <Label>Contraseña de acceso (opcional)</Label>
              <Input
                type="password"
                placeholder="Si la dejás vacía, el cliente accede solo por el link"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* ── CONTRATO / PLAN ── */}
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
                  setPlanForm({ ...planForm, cantidadContratada: Number(e.target.value) })
                }
              />
            </div>

            <div>
              {/* Ajuste inicial: si el cliente ya usó viandas antes de empezar
                  a cargar el historial, ponés ese número acá. */}
              <Label>Ajuste inicial usado</Label>
              <Input
                type="number"
                min={0}
                value={planForm.ajusteInicialUsadas}
                onChange={(e) =>
                  setPlanForm({ ...planForm, ajusteInicialUsadas: Number(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                Usalo si querés arrancar con un saldo previo sin cargar todo el historial.
              </p>
            </div>

            <div>
              <Label>Modalidad</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={planForm.modalidad}
                onChange={(e) =>
                  setPlanForm({ ...planForm, modalidad: e.target.value as PlanModality })
                }
              >
                <option value="fijo">Fijo (días determinados por vos)</option>
                <option value="flexible">Flexible (avisa la noche anterior)</option>
              </select>
            </div>

            <div>
              <Label>Tipo de entrega</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={planForm.tipoEntrega}
                onChange={(e) =>
                  setPlanForm({ ...planForm, tipoEntrega: e.target.value as DeliveryType })
                }
              >
                <option value="retiro">Retiro en el local</option>
                <option value="envio">Envío a domicilio</option>
              </select>
            </div>

            <div>
              <Label>Precio unitario por vianda</Label>
              <Input
                type="number"
                min={0}
                value={planForm.precioUnitario}
                onChange={(e) =>
                  setPlanForm({ ...planForm, precioUnitario: Number(e.target.value) })
                }
              />
            </div>

            <div>
              {/* TOTAL SUGERIDO — calculado automáticamente */}
              <Label>Total sugerido a abonar</Label>
              <div className="flex items-center h-10 px-3 rounded-md border border-input bg-muted text-sm font-semibold text-primary">
                {formatCurrencyAR(totalSugerido)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {planForm.cantidadContratada} viandas × {formatCurrencyAR(planForm.precioUnitario)}
              </p>
            </div>

            <div>
              {/* Importe que realmente pagó el cliente (puede ser diferente al sugerido) */}
              <Label>Importe abonado (real)</Label>
              <Input
                type="number"
                min={0}
                value={planForm.importeAbonado}
                onChange={(e) =>
                  setPlanForm({ ...planForm, importeAbonado: Number(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                Ingresá lo que el cliente efectivamente pagó.
              </p>
            </div>

            <div>
              <Label>Fecha de inicio</Label>
              <Input
                type="date"
                value={planForm.fechaInicio}
                onChange={(e) =>
                  setPlanForm({ ...planForm, fechaInicio: e.target.value })
                }
              />
            </div>

            <div>
              <Label>Fecha de fin</Label>
              <Input
                type="date"
                value={planForm.fechaFin}
                onChange={(e) =>
                  setPlanForm({ ...planForm, fechaFin: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                {planForm.modalidad === 'fijo'
                  ? 'Se calcula sola según los días elegidos y los feriados nacionales.'
                  : 'Ingresala manualmente para el plan flexible.'}
              </p>
            </div>

            {planForm.tipoEntrega === 'envio' && (
              <div className="md:col-span-2">
                <Label>Dirección de envío</Label>
                <Input
                  value={planForm.direccionEnvio}
                  onChange={(e) =>
                    setPlanForm({ ...planForm, direccionEnvio: e.target.value })
                  }
                />
              </div>
            )}
          </div>

          {/* ── Días fijos (solo para plan fijo) ── */}
          {planForm.modalidad === 'fijo' && (
            <div className="space-y-3">
              <Label>Días de retiro</Label>
              <p className="text-xs text-muted-foreground">
                Marcá los días que este cliente viene a buscar su vianda.
                La fecha fin se calcula sola.
              </p>
              <div className="flex flex-wrap gap-4">
                {DAYS.map((day) => (
                  <label key={day.value} className="flex items-center gap-2 text-sm cursor-pointer">
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

          {/* ── Config para plan flexible ── */}
          {planForm.modalidad === 'flexible' && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                El cliente tiene un cupo semanal. Puede avisarte la noche anterior
                hasta la hora límite para confirmar que retira al día siguiente.
                Si no avisa, la vianda queda a su favor.
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Cupo semanal de viandas</Label>
                  <Input
                    type="number"
                    min={1}
                    value={planForm.cantidadSemanal}
                    onChange={(e) =>
                      setPlanForm({ ...planForm, cantidadSemanal: Number(e.target.value) })
                    }
                  />
                </div>

                <div>
                  <Label>Hora límite para pedir</Label>
                  <Input
                    type="time"
                    value={planForm.horaLimite}
                    onChange={(e) =>
                      setPlanForm({ ...planForm, horaLimite: e.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Pasada esta hora, el botón de pedido se deshabilita.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div>
            <Label>Observaciones internas</Label>
            <Textarea
              value={planForm.observaciones}
              onChange={(e) =>
                setPlanForm({ ...planForm, observaciones: e.target.value })
              }
              placeholder="Ej: a veces se lleva doble, es alérgica al gluten, si no retira queda a favor, etc."
            />
          </div>

          {/* ── Resumen de feriados cargados ── */}
          <div>
            <Label>Feriados nacionales 2026 (cargados automáticamente)</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {businessConfig.feriados
                .filter((f) => f.startsWith('2026'))
                .map((feriado) => (
                  <span
                    key={feriado}
                    className="inline-flex items-center rounded-full border px-3 py-1 text-xs text-muted-foreground"
                  >
                    {feriado}
                  </span>
                ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Estos días se saltean automáticamente al calcular la fecha fin.
              No hace falta que los cargues a mano.
            </p>
          </div>
        </div>

        {/* ── BOTÓN GUARDAR ── */}
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