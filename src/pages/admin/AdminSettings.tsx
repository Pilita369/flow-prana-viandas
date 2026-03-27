import { useEffect, useState } from 'react';
import { getBusinessConfig, saveBusinessConfig, formatDateAR, FERIADOS_ARGENTINA_2026 } from '@/lib/business';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { X, Plus, RefreshCw, Settings } from 'lucide-react';

export default function AdminSettings() {
  const [config, setConfig] = useState(getBusinessConfig());
  const [newFeriado, setNewFeriado] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setConfig(getBusinessConfig());
  }, []);

  const handleSaveGeneral = () => {
    setSaving(true);
    try {
      saveBusinessConfig(config);
      toast.success('Configuración guardada');
    } finally {
      setSaving(false);
    }
  };

  const addFeriado = () => {
    if (!newFeriado) return;
    if (config.feriados.includes(newFeriado)) { toast.error('Esa fecha ya está cargada'); return; }
    const updated = [...config.feriados, newFeriado].sort();
    setConfig({ ...config, feriados: updated });
    saveBusinessConfig({ ...config, feriados: updated });
    setNewFeriado('');
    toast.success(`Feriado ${formatDateAR(newFeriado)} agregado`);
  };

  const removeFeriado = (fecha: string) => {
    const updated = config.feriados.filter(f => f !== fecha);
    setConfig({ ...config, feriados: updated });
    saveBusinessConfig({ ...config, feriados: updated });
    toast.success(`Feriado ${formatDateAR(fecha)} eliminado`);
  };

  const resetFeriados = () => {
    if (!window.confirm('¿Restaurar la lista de feriados por defecto (sin 23/3 ni 24/3)?')) return;
    setConfig({ ...config, feriados: FERIADOS_ARGENTINA_2026 });
    saveBusinessConfig({ ...config, feriados: FERIADOS_ARGENTINA_2026 });
    toast.success('Feriados restaurados');
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><Settings className="w-6 h-6" />Configuración</h1>
        <p className="page-subtitle">Precios, contacto y días no laborables</p>
      </div>

      {/* Precios y contacto */}
      <div className="glass-card p-5 space-y-4">
        <h2 className="font-semibold">Precios y contacto</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Precio base retiro en local</Label>
            <Input
              type="number"
              value={config.precioBaseRetiro}
              onChange={e => setConfig({ ...config, precioBaseRetiro: Number(e.target.value) })}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Precio base envío a domicilio</Label>
            <Input
              type="number"
              value={config.precioBaseEnvio}
              onChange={e => setConfig({ ...config, precioBaseEnvio: Number(e.target.value) })}
              className="mt-1"
            />
          </div>
          <div className="md:col-span-2">
            <Label>WhatsApp del negocio (con código de país, sin +)</Label>
            <Input
              value={config.whatsappNegocio}
              onChange={e => setConfig({ ...config, whatsappNegocio: e.target.value })}
              placeholder="542996123456"
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">Ej: 542996123456 (54 = Argentina, 299 = Neuquén)</p>
          </div>
        </div>
        <Button onClick={handleSaveGeneral} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </div>

      {/* Feriados / días no laborables */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-semibold">Días no laborables</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Estos días NO se cuentan en los planes ni aparecen como días de retiro
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={resetFeriados}>
            <RefreshCw className="w-3 h-3 mr-2" />Restaurar defaults
          </Button>
        </div>

        {/* Agregar nuevo */}
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label>Agregar fecha</Label>
            <Input
              type="date"
              value={newFeriado}
              onChange={e => setNewFeriado(e.target.value)}
              className="mt-1"
            />
          </div>
          <Button onClick={addFeriado} disabled={!newFeriado}>
            <Plus className="w-4 h-4 mr-2" />Agregar
          </Button>
        </div>

        {/* Lista de feriados */}
        <div className="flex flex-wrap gap-2">
          {config.feriados.sort().map(fecha => (
            <div
              key={fecha}
              className="flex items-center gap-1.5 bg-muted rounded-full px-3 py-1 text-sm"
            >
              <span>{formatDateAR(fecha)}</span>
              <button
                onClick={() => removeFeriado(fecha)}
                className="text-muted-foreground hover:text-destructive transition-colors ml-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {config.feriados.length === 0 && (
            <p className="text-sm text-muted-foreground">No hay días no laborables configurados</p>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Total: <strong>{config.feriados.length}</strong> días cargados
        </p>
      </div>
    </div>
  );
}