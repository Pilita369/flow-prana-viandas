import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getClientByLink, getRanking } from '@/lib/store';
import { Trophy } from 'lucide-react';
import type { Client } from '@/types';

export default function ClientRanking() {
  const { accessLink } = useParams();
  const [ranking, setRanking] = useState<{ client: Client; puntos: number }[]>([]);
  const [myId, setMyId] = useState<string>('');

  useEffect(() => {
    if (!accessLink) return;
    const c = getClientByLink(accessLink);
    if (c) { setMyId(c.id); setRanking(getRanking()); }
  }, [accessLink]);

  const myPos = ranking.findIndex(r => r.client.id === myId) + 1;

  return (
    <div>
      <h2 className="text-xl font-display font-bold mb-2">Ranking</h2>
      {myPos > 0 && <p className="text-sm text-muted-foreground mb-4">Estás en la posición #{myPos}</p>}

      {ranking.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted-foreground">Sin datos de ranking</div>
      ) : (
        <div className="space-y-2">
          {ranking.map((r, i) => (
            <div key={r.client.id} className={`glass-card p-3 flex items-center gap-3 ${r.client.id === myId ? 'ring-2 ring-primary' : ''}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i < 3 ? 'bg-secondary/20 text-secondary' : 'bg-muted text-muted-foreground'}`}>
                {i === 0 ? <Trophy className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className="flex-1 text-sm font-medium">{r.client.nombre} {r.client.apellido[0]}.</span>
              <span className="font-bold text-sm">{r.puntos} pts</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
