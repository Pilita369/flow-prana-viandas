import { useEffect, useState } from 'react';
import { getBusinessConfig, saveBusinessConfig, formatDateAR } from '@/lib/business';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { X, Plus, Settings } from 'lucide-react';

export default function AdminSettings() {
  const [config, setConfig] = useState(getBusinessConfig());
  const [newFeriado, setNewFeriado] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setConfig(getBusinessConfig()); }, []);

  const handleSaveGeneral = () => {
    setSaving(true);
    try { saveBusinessConfig(config); toast.success('Configuración guardada'); }
    finally { setSaving(false); }
  };

  const addFeriado = () => {
    if (!newFeriado) return;
    if (config.feriados.includes(newFeriado)) { toast.error('Esa fecha ya está cargada'); return; }
    const updated = [...config.feriados, newFeriado].sort();
    const newConfig = { ...config, feriados: updated };
    setConfig(newConfig);
    saveBusinessConfig(newConfig);
    setNewFeriado('');
    toast.success(`${formatDateAR(newFeriado)} agregado como día no laborable`);
  };

  const removeFeriado = (fecha: string) => {
    const updated = config.feriados.filter(f => f !== fecha);
    const newConfig = { ...config, feriados: updated };
    setConfig(newConfig);
    saveBusinessConfig(newConfig);
    toast.success(`${formatDateAR(fecha)} eliminado`);
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
            <Input type="number" value={config.precioBaseRetiro} onChange={e => setConfig({ ...config, precioBaseRetiro: Number(e.target.value) })} className="mt-1" />
          </div>
          <div>
            <Label>Precio base envío a domicilio</Label>
            <Input type="number" value={config.precioBaseEnvio} onChange={e => setConfig({ ...config, precioBaseEnvio: Number(e.target.value) })} className="mt-1" />
          </div>
          <div className="md:col-span-2">
            <Label>WhatsApp del negocio (con código de país, sin +)</Label>
            <Input value={config.whatsappNegocio} onChange={e => setConfig({ ...config, whatsappNegocio: e.target.value })} placeholder="542996123456" className="mt-1" />
            <p className="text-xs text-muted-foreground mt-1">Ej: 542996123456 (54 = Argentina, 299 = Neuquén)</p>
          </div>
        </div>
        <Button onClick={handleSaveGeneral} disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</Button>
      </div>

      {/* Días no laborables */}
      <div className="glass-card p-5 space-y-4">
        <div>
          <h2 className="font-semibold">Días no laborables</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Estos días <strong>no cuentan</strong> en los planes ni aparecen como días de retiro. Cargalos vos manualmente.
          </p>
        </div>

        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label>Agregar fecha</Label>
            <Input type="date" value={newFeriado} onChange={e => setNewFeriado(e.target.value)} className="mt-1" />
          </div>
          <Button onClick={addFeriado} disabled={!newFeriado}>
            <Plus className="w-4 h-4 mr-2" />Agregar
          </Button>
        </div>

        {config.feriados.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Sin días no laborables cargados. Agregá los que necesitás.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {config.feriados.sort().map(fecha => (
              <div key={fecha} className="flex items-center gap-1.5 bg-muted rounded-full px-3 py-1 text-sm">
                <span>{formatDateAR(fecha)}</span>
                <button onClick={() => removeFeriado(fecha)} className="text-muted-foreground hover:text-destructive transition-colors ml-1">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">Total: <strong>{config.feriados.length}</strong> días cargados</p>
      </div>
    </div>
  );
}