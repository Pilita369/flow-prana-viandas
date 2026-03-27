import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getClientByLink, getClientPoints, getRewards, redeemReward } from '@/lib/store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { RefreshCw, Star, ShoppingBag, Users, Zap, Gift } from 'lucide-react';
import type { Client, PointTransaction } from '@/types';

const HOW_TO_EARN = [
  { icon: 'refresh', label: 'Renovación mensual', puntos: 30, descripcion: 'Cada vez que renovás tu plan' },
  { icon: 'star', label: 'Plan completo del mes', puntos: 50, descripcion: 'Si no faltás ningún día del mes' },
  { icon: 'bag', label: 'Compra producto extra', puntos: 15, descripcion: 'Pan, budín, postre u otra vianda' },
  { icon: 'users', label: 'Referido que compra', puntos: 40, descripcion: 'Cuando alguien se une con tu código' },
];

function EarnIcon({ type }: { type: string }) {
  const cls = 'w-4 h-4';
  if (type === 'star') return <Star className={cls} />;
  if (type === 'bag') return <ShoppingBag className={cls} />;
  if (type === 'users') return <Users className={cls} />;
  return <RefreshCw className={cls} />;
}

export default function ClientPoints() {
  const { accessLink } = useParams();
  const [client, setClient] = useState<Client | null>(null);
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const rewards = getRewards();

  const load = async () => {
    if (!accessLink) return;
    setLoading(true);
    try {
      const c = await getClientByLink(accessLink);
      if (c) {
        setClient(c);
        const pts = await getClientPoints(c.id);
        setTransactions([...pts].reverse());
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [accessLink]);

  const handleRedeem = async (rewardId: string) => {
    if (!client) return;
    const ok = await redeemReward(client.id, rewardId);
    if (ok) { toast.success('Canje realizado! Avisanos para hacerlo efectivo'); load(); }
    else toast.error('No tenés suficientes puntos');
  };

  if (loading) return <div className="text-center py-12 text-muted-foreground">Cargando...</div>;
  if (!client) return null;

  const sortedRewards = [...rewards].sort((a, b) => a.puntosRequeridos - b.puntosRequeridos);
  const nextReward = sortedRewards.find(r => r.puntosRequeridos > client.puntos);
  const puntosParaProximo = nextReward ? nextReward.puntosRequeridos - client.puntos : 0;
  const progressPct = nextReward ? Math.round((client.puntos / nextReward.puntosRequeridos) * 100) : 100;

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-display font-bold">Mis puntos</h2>

      <div className="glass-card p-5 text-center">
        <div className="text-5xl font-bold text-primary">{client.puntos}</div>
        <p className="text-sm text-muted-foreground mt-1">puntos acumulados</p>
        {nextReward && (
          <div className="mt-4 space-y-2">
            <div className="w-full bg-muted rounded-full h-2.5">
              <div className="bg-primary rounded-full h-2.5 transition-all" style={{ width: `${Math.min(progressPct, 100)}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              Te faltan <strong>{puntosParaProximo} pts</strong> para: {nextReward.nombre}
            </p>
          </div>
        )}
        {!nextReward && rewards.length > 0 && (
          <p className="text-xs text-green-600 mt-3 font-medium">Podes canjear todos los premios!</p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Gift className="w-4 h-4" />Premios
        </h3>
        <div className="space-y-2">
          {sortedRewards.map(r => {
            const canRedeem = client.puntos >= r.puntosRequeridos;
            return (
              <div key={r.id} className={`glass-card p-3 flex items-center justify-between gap-3 ${canRedeem ? 'border border-primary/30' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="text-2xl">{r.nombre.split(' ')[0]}</div>
                  <div>
                    <p className="font-semibold text-sm">{r.nombre.split(' ').slice(1).join(' ')}</p>
                    <p className="text-xs text-muted-foreground">{r.descripcion}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant={canRedeem ? 'default' : 'secondary'}>{r.puntosRequeridos} pts</Badge>
                  {canRedeem && <Button size="sm" onClick={() => handleRedeem(r.id)} className="text-xs h-7">Canjear</Button>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4" />Como sumar puntos
        </h3>
        <div className="space-y-2">
          {HOW_TO_EARN.map((item, i) => (
            <div key={i} className="glass-card p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <EarnIcon type={item.icon} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.descripcion}</p>
              </div>
              <Badge variant="secondary" className="shrink-0 font-bold">+{item.puntos}</Badge>
            </div>
          ))}
        </div>
      </div>

      {transactions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Historial</h3>
          <div className="space-y-1">
            {transactions.map(t => (
              <div key={t.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm">{t.motivo}</p>
                  <p className="text-xs text-muted-foreground">{new Date(t.fecha).toLocaleDateString('es-AR')}</p>
                </div>
                <Badge variant={t.puntos > 0 ? 'default' : 'destructive'}>{t.puntos > 0 ? '+' : ''}{t.puntos}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}