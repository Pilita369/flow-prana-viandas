import { useEffect, useState } from 'react';
import { getClients, getRewards, getRedemptions, addPoints } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { Client } from '@/types';

export default function AdminPoints() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [puntosInput, setPuntosInput] = useState(0);
  const [motivoInput, setMotivoInput] = useState('');
  const rewards = getRewards();
  const redemptions = getRedemptions();

  useEffect(() => { setClients(getClients()); }, []);

  const handleAddPoints = () => {
    if (!selectedClient || !puntosInput || !motivoInput) { toast.error('Completá todos los campos'); return; }
    addPoints(selectedClient, puntosInput, motivoInput);
    toast.success('Puntos agregados');
    setClients(getClients());
    setPuntosInput(0);
    setMotivoInput('');
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Puntos y canjes</h1>
        <p className="page-subtitle">Gestión del programa de fidelización</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Add points */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Agregar puntos</h3>
          <div className="space-y-3">
            <select
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-card"
              value={selectedClient}
              onChange={e => setSelectedClient(e.target.value)}
            >
              <option value="">Seleccionar cliente</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.nombre} {c.apellido} ({c.puntos} pts)</option>
              ))}
            </select>
            <Input type="number" placeholder="Puntos" value={puntosInput || ''} onChange={e => setPuntosInput(Number(e.target.value))} />
            <Input placeholder="Motivo" value={motivoInput} onChange={e => setMotivoInput(e.target.value)} />
            <Button onClick={handleAddPoints} className="w-full">Agregar puntos</Button>
          </div>
        </div>

        {/* Rewards */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Premios disponibles</h3>
          <div className="space-y-3">
            {rewards.map(r => (
              <div key={r.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                <div>
                  <p className="font-semibold text-sm">{r.nombre}</p>
                  <p className="text-xs text-muted-foreground">{r.descripcion}</p>
                </div>
                <Badge variant="secondary">{r.puntosRequeridos} pts</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent redemptions */}
      <div className="glass-card p-5 mt-6">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Últimos canjes</h3>
        {redemptions.length === 0 ? (
          <p className="text-muted-foreground text-sm">Sin canjes todavía</p>
        ) : (
          <div className="space-y-2">
            {redemptions.slice(-10).reverse().map(r => {
              const client = clients.find(c => c.id === r.clientId);
              const reward = rewards.find(rw => rw.id === r.rewardId);
              return (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <span className="text-sm">{client?.nombre} {client?.apellido}</span>
                  <span className="text-sm text-muted-foreground">{reward?.nombre} (-{r.puntosUsados} pts)</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
