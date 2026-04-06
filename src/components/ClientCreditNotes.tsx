import { useEffect, useState } from 'react';
import { getCreditNotes, saveCreditNote, toggleCreditNote, deleteCreditNote } from '@/lib/store';
import { formatCurrencyAR, formatDateAR } from '@/lib/business';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, Check } from 'lucide-react';
import { toast } from 'sonner';
import type { CreditNote, CreditNoteTipo } from '@/types';

const TIPOS: { value: CreditNoteTipo; label: string; emoji: string }[] = [
  { value: 'saldo_envio',   label: 'Saldo de envío',  emoji: '🚚' },
  { value: 'vianda_favor',  label: 'Vianda a favor',  emoji: '🥗' },
  { value: 'descuento',     label: 'Descuento',        emoji: '💸' },
  { value: 'atencion',      label: 'Atención / regalo',emoji: '🎁' },
  { value: 'otro',          label: 'Otro',             emoji: '📝' },
];

function tipoLabel(tipo: CreditNoteTipo) {
  return TIPOS.find(t => t.value === tipo) ?? { label: tipo, emoji: '📝' };
}

interface Props {
  clientId: string;
}

export default function ClientCreditNotes({ clientId }: Props) {
  const [notes, setNotes] = useState<CreditNote[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    tipo: 'saldo_envio' as CreditNoteTipo,
    descripcion: '',
    monto: '',
    cantidad: '',
  });

  const load = () => setNotes(getCreditNotes(clientId));

  useEffect(() => { load(); }, [clientId]);

  const handleSave = () => {
    if (!form.descripcion.trim()) { toast.error('Escribí una descripción'); return; }
    saveCreditNote({
      clientId,
      tipo: form.tipo,
      descripcion: form.descripcion.trim(),
      monto: form.monto ? Number(form.monto) : undefined,
      cantidad: form.cantidad ? Number(form.cantidad) : undefined,
    });
    setForm({ tipo: 'saldo_envio', descripcion: '', monto: '', cantidad: '' });
    setAdding(false);
    toast.success('Ajuste registrado');
    load();
  };

  const handleToggle = (id: string) => {
    toggleCreditNote(id);
    load();
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('¿Eliminar este ajuste?')) return;
    deleteCreditNote(id);
    toast.success('Ajuste eliminado');
    load();
  };

  const pendientes = notes.filter(n => !n.aplicado);
  const aplicados  = notes.filter(n => n.aplicado);

  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Ajustes y saldos a favor</h3>
          {pendientes.length > 0 && (
            <p className="text-xs text-amber-600 mt-0.5">{pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''} de aplicar</p>
          )}
        </div>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />Agregar
          </Button>
        )}
      </div>

      {/* Formulario */}
      {adding && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 md:col-span-1">
              <Label className="text-xs">Tipo</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm mt-1"
                value={form.tipo}
                onChange={e => setForm({ ...form, tipo: e.target.value as CreditNoteTipo })}
              >
                {TIPOS.map(t => (
                  <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>
                ))}
              </select>
            </div>
            {(form.tipo === 'saldo_envio' || form.tipo === 'descuento') && (
              <div>
                <Label className="text-xs">Monto ($)</Label>
                <Input
                  type="number" min={0} placeholder="0"
                  value={form.monto}
                  onChange={e => setForm({ ...form, monto: e.target.value })}
                  className="h-9 text-sm mt-1"
                />
              </div>
            )}
            {form.tipo === 'vianda_favor' && (
              <div>
                <Label className="text-xs">Cantidad de viandas</Label>
                <Input
                  type="number" min={1} placeholder="1"
                  value={form.cantidad}
                  onChange={e => setForm({ ...form, cantidad: e.target.value })}
                  className="h-9 text-sm mt-1"
                />
              </div>
            )}
          </div>
          <div>
            <Label className="text-xs">Descripción</Label>
            <Input
              placeholder="Ej: saldo envío semana del 31/03, vianda de regalo por fidelidad..."
              value={form.descripcion}
              onChange={e => setForm({ ...form, descripcion: e.target.value })}
              className="h-9 text-sm mt-1"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave}>Guardar ajuste</Button>
            <Button size="sm" variant="outline" onClick={() => setAdding(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {/* Pendientes */}
      {pendientes.length > 0 && (
        <div className="space-y-2">
          {pendientes.map(n => {
            const t = tipoLabel(n.tipo);
            return (
              <div key={n.id} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50/50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm">{t.emoji}</span>
                    <Badge variant="outline" className="text-xs">{t.label}</Badge>
                    {n.monto && <span className="text-xs font-semibold text-amber-700">{formatCurrencyAR(n.monto)}</span>}
                    {n.cantidad && <span className="text-xs font-semibold text-amber-700">{n.cantidad} vianda{n.cantidad !== 1 ? 's' : ''}</span>}
                  </div>
                  <p className="text-sm mt-1">{n.descripcion}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatDateAR(n.fecha.split('T')[0])}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => handleToggle(n.id)} title="Marcar como aplicado">
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-destructive" onClick={() => handleDelete(n.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Aplicados (colapsables) */}
      {aplicados.length > 0 && (
        <details className="group">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground list-none flex items-center gap-1">
            <span className="group-open:hidden">▶</span>
            <span className="hidden group-open:inline">▼</span>
            Ver {aplicados.length} aplicado{aplicados.length !== 1 ? 's' : ''}
          </summary>
          <div className="mt-2 space-y-2">
            {aplicados.map(n => {
              const t = tipoLabel(n.tipo);
              return (
                <div key={n.id} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border bg-muted/20 opacity-60">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm">{t.emoji}</span>
                      <Badge variant="outline" className="text-xs">{t.label}</Badge>
                      {n.monto && <span className="text-xs font-semibold">{formatCurrencyAR(n.monto)}</span>}
                      {n.cantidad && <span className="text-xs font-semibold">{n.cantidad} vianda{n.cantidad !== 1 ? 's' : ''}</span>}
                      <Badge variant="secondary" className="text-xs">Aplicado</Badge>
                    </div>
                    <p className="text-sm mt-1">{n.descripcion}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatDateAR(n.fecha.split('T')[0])}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => handleToggle(n.id)} title="Desmarcar">
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={() => handleDelete(n.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {notes.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">Sin ajustes registrados.</p>
      )}
    </div>
  );
}
