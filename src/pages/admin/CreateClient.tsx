import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { createClient, createPlan } from '@/lib/store';
import { toast } from 'sonner';
import { Copy, Send, Save } from 'lucide-react';
import type { PlanType, PlanModality, DayOfWeek } from '@/types';

const DAYS: { value: DayOfWeek; label: string }[] = [
  { value: 'lunes', label: 'Lunes' },
  { value: 'martes', label: 'Martes' },
  { value: 'miercoles', label: 'Miércoles' },
  { value: 'jueves', label: 'Jueves' },
  { value: 'viernes', label: 'Viernes' },
];

export default function CreateClient() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    nombre: '', apellido: '', telefono: '', email: '', direccion: '', password: '',
  });
  const [planForm, setPlanForm] = useState({
    tipo: 10 as PlanType,
    modalidad: 'fijo' as PlanModality,
    importeAbonado: 0,
    fechaInicio: new Date().toISOString().split('T')[0],
    fechaFin: '',
    diasFijos: [] as DayOfWeek[],
    incluyeEnvio: false,
    cantidadSemanal: 3,
    horaLimite: '20:00',
  });
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  const handleSave = () => {
    if (!form.nombre || !form.apellido || !form.telefono || !form.email) {
      toast.error('Completá los campos obligatorios');
      return;
    }

    const client = createClient({
      nombre: form.nombre,
      apellido: form.apellido,
      telefono: form.telefono,
      email: form.email,
      direccion: form.direccion || undefined,
      password: form.password || undefined,
      referidoPor: undefined,
    });

    createPlan({
      clientId: client.id,
      tipo: planForm.tipo,
      modalidad: planForm.modalidad,
      importeAbonado: planForm.importeAbonado,
      fechaInicio: planForm.fechaInicio,
      fechaFin: planForm.fechaFin,
      diasFijos: planForm.modalidad === 'fijo' ? planForm.diasFijos : undefined,
      incluyeEnvio: planForm.modalidad === 'fijo' ? planForm.incluyeEnvio : undefined,
      cantidadSemanal: planForm.modalidad === 'flexible' ? planForm.cantidadSemanal : undefined,
      horaLimite: planForm.modalidad === 'flexible' ? planForm.horaLimite : undefined,
    });

    const link = `${window.location.origin}/cliente/${client.accessLink}`;
    setCreatedLink(link);
    toast.success('Cliente creado correctamente');
  };

  const copyLink = () => {
    if (createdLink) {
      navigator.clipboard.writeText(createdLink);
      toast.success('Link copiado');
    }
  };

  const sendWhatsApp = () => {
    if (createdLink && form.telefono) {
      const msg = encodeURIComponent(`¡Hola ${form.nombre}! Acá podés ver tu plan de viandas en Mundo Prana: ${createdLink}`);
      window.open(`https://wa.me/${form.telefono.replace(/\D/g, '')}?text=${msg}`, '_blank');
    }
  };

  const toggleDay = (day: DayOfWeek) => {
    setPlanForm(p => ({
      ...p,
      diasFijos: p.diasFijos.includes(day) ? p.diasFijos.filter(d => d !== day) : [...p.diasFijos, day],
    }));
  };

  if (createdLink) {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">¡Cliente creado!</h1>
          <p className="page-subtitle">{form.nombre} {form.apellido} fue dado de alta correctamente</p>
        </div>
        <div className="glass-card p-6 max-w-lg space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Link de acceso</Label>
            <div className="mt-1 flex gap-2">
              <Input value={createdLink} readOnly className="text-xs" />
              <Button variant="outline" size="icon" onClick={copyLink}><Copy className="w-4 h-4" /></Button>
            </div>
          </div>
          <div className="flex gap-3">
            <Button onClick={sendWhatsApp} className="flex-1">
              <Send className="w-4 h-4 mr-2" /> Enviar por WhatsApp
            </Button>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => { setCreatedLink(null); setForm({ nombre: '', apellido: '', telefono: '', email: '', direccion: '', password: '' }); }}>
              Crear otro
            </Button>
            <Button variant="outline" onClick={() => navigate('/admin/clientes')}>
              Ver clientes
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Crear cliente</h1>
        <p className="page-subtitle">Alta de nuevo cliente con plan asignado</p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Datos personales */}
        <div className="glass-card p-6">
          <h2 className="font-display font-bold text-lg mb-4">Datos personales</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Apellido *</Label>
              <Input value={form.apellido} onChange={e => setForm(f => ({ ...f, apellido: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Teléfono *</Label>
              <Input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} placeholder="+54 11 1234-5678" />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Dirección (opcional)</Label>
              <Input value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Contraseña (opcional, para acceso con cuenta)</Label>
              <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
          </div>
        </div>

        {/* Plan */}
        <div className="glass-card p-6">
          <h2 className="font-display font-bold text-lg mb-4">Plan de viandas</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cantidad de viandas</Label>
              <Select value={String(planForm.tipo)} onValueChange={v => setPlanForm(p => ({ ...p, tipo: Number(v) as PlanType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 viandas</SelectItem>
                  <SelectItem value="15">15 viandas</SelectItem>
                  <SelectItem value="20">20 viandas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Modalidad</Label>
              <Select value={planForm.modalidad} onValueChange={v => setPlanForm(p => ({ ...p, modalidad: v as PlanModality }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fijo">Fijo</SelectItem>
                  <SelectItem value="flexible">Flexible</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Importe abonado ($)</Label>
              <Input type="number" value={planForm.importeAbonado || ''} onChange={e => setPlanForm(p => ({ ...p, importeAbonado: Number(e.target.value) }))} />
            </div>
            <div className="space-y-2">
              <Label>Fecha inicio</Label>
              <Input type="date" value={planForm.fechaInicio} onChange={e => setPlanForm(p => ({ ...p, fechaInicio: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Fecha fin</Label>
              <Input type="date" value={planForm.fechaFin} onChange={e => setPlanForm(p => ({ ...p, fechaFin: e.target.value }))} />
            </div>
          </div>

          {/* Fijo options */}
          {planForm.modalidad === 'fijo' && (
            <div className="mt-4 pt-4 border-t border-border space-y-4">
              <Label className="text-sm font-medium">Días de retiro</Label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map(d => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      planForm.diasFijos.includes(d.value)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card text-muted-foreground border-border hover:border-primary/50'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={planForm.incluyeEnvio} onCheckedChange={v => setPlanForm(p => ({ ...p, incluyeEnvio: !!v }))} />
                <Label className="text-sm">Incluye envío</Label>
              </div>
            </div>
          )}

          {/* Flexible options */}
          {planForm.modalidad === 'flexible' && (
            <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cantidad semanal</Label>
                <Input type="number" value={planForm.cantidadSemanal} onChange={e => setPlanForm(p => ({ ...p, cantidadSemanal: Number(e.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label>Hora límite</Label>
                <Input type="time" value={planForm.horaLimite} onChange={e => setPlanForm(p => ({ ...p, horaLimite: e.target.value }))} />
              </div>
            </div>
          )}
        </div>

        <Button onClick={handleSave} size="lg" className="w-full sm:w-auto">
          <Save className="w-4 h-4 mr-2" /> Guardar y generar acceso
        </Button>
      </div>
    </div>
  );
}
