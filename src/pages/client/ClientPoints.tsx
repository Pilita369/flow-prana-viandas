import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getClientByLink, getClientPoints, getRewards, redeemReward } from '@/lib/store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { Client, PointTransaction } from '@/types';

export default function ClientPoints() {
  const { accessLink } = useParams();
  const [client, setClient] = useState<Client | null>(null);
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);
  const rewards = getRewards();

  const load = () => {
    if (!accessLink) return;
    const c = getClientByLink(accessLink);
    if (c) {
      setClient(c);
      setTransactions(getClientPoints(c.id).reverse());
    }
  };

  useEffect(() => { load(); }, [accessLink]);

  const handleRedeem = (rewardId: string) => {
    if (!client) return;
    if (redeemReward(client.id, rewardId)) {
      toast.success('¡Canje realizado!');
      load();
    } else {
      toast.error('No tenés suficientes puntos');
    }
  };

  if (!client) return null;

  return (
    <div>
      <h2 className="text-xl font-display font-bold mb-4">Mis puntos</h2>
      <div className="glass-card p-5 mb-4 text-center">
        <span className="text-4xl font-bold">{client.puntos}</span>
        <p className="text-sm text-muted-foreground">puntos acumulados</p>
      </div>

      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Premios</h3>
      <div className="space-y-2 mb-6">
        {rewards.map(r => (
          <div key={r.id} className="glass-card p-3 flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">{r.nombre}</p>
              <p className="text-xs text-muted-foreground">{r.puntosRequeridos} pts</p>
            </div>
            <Button size="sm" disabled={client.puntos < r.puntosRequeridos} onClick={() => handleRedeem(r.id)}>Canjear</Button>
          </div>
        ))}
      </div>

      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Movimientos</h3>
      <div className="space-y-1">
        {transactions.map(t => (
          <div key={t.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
            <span className="text-sm">{t.motivo}</span>
            <Badge variant={t.puntos > 0 ? 'default' : 'destructive'}>{t.puntos > 0 ? '+' : ''}{t.puntos}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
