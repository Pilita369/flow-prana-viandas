import { useEffect, useState } from 'react';
import { getRanking } from '@/lib/store';
import { Trophy } from 'lucide-react';
import type { Client } from '@/types';

export default function AdminRanking() {
  const [ranking, setRanking] = useState<{ client: Client; puntos: number }[]>([]);

  useEffect(() => { setRanking(getRanking()); }, []);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Ranking</h1>
        <p className="page-subtitle">Top clientes por puntos acumulados</p>
      </div>

      {ranking.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-muted-foreground">No hay clientes con puntos todavía.</p>
        </div>
      ) : (
        <div className="space-y-2 max-w-2xl">
          {ranking.map((r, i) => (
            <div key={r.client.id} className={`glass-card p-4 flex items-center gap-4 ${i < 3 ? 'border-l-4' : ''} ${i === 0 ? 'border-l-secondary' : i === 1 ? 'border-l-muted-foreground' : i === 2 ? 'border-l-secondary/60' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${i < 3 ? 'bg-secondary/20 text-secondary' : 'bg-muted text-muted-foreground'}`}>
                {i === 0 ? <Trophy className="w-4 h-4" /> : i + 1}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-sm">{r.client.nombre} {r.client.apellido}</p>
              </div>
              <span className="font-bold text-lg">{r.puntos}<span className="text-xs text-muted-foreground ml-1">pts</span></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
