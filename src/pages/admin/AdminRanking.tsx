// src/pages/admin/AdminRanking.tsx
// ======================================================
// RANKING DE CLIENTES POR PUNTOS
// Muestra el alias del cliente en lugar del nombre real.
// El alias se puede inventar para motivar a otros clientes.
// ======================================================

import { useEffect, useState } from 'react';
import { getRanking } from '@/lib/store';
import { Trophy, Medal } from 'lucide-react';
import type { Client } from '@/types';

export default function AdminRanking() {
  const [ranking, setRanking] = useState<{ client: Client; puntos: number }[]>([]);

  useEffect(() => {
    setRanking(getRanking());
  }, []);

  // Ícono según posición
  const getPositionIcon = (index: number) => {
    if (index === 0) return <Trophy className="w-4 h-4 text-yellow-500" />;
    if (index === 1) return <Medal className="w-4 h-4 text-gray-400" />;
    if (index === 2) return <Medal className="w-4 h-4 text-amber-600" />;
    return <span className="text-sm font-bold text-muted-foreground">{index + 1}</span>;
  };

  // Color del borde según posición
  const getBorderClass = (index: number) => {
    if (index === 0) return 'border-l-4 border-l-yellow-400';
    if (index === 1) return 'border-l-4 border-l-gray-300';
    if (index === 2) return 'border-l-4 border-l-amber-500';
    return '';
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Ranking de clientes</h1>
        <p className="page-subtitle">
          Top clientes por puntos acumulados. Se muestra el alias, no el nombre real.
        </p>
      </div>

      {ranking.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-muted-foreground">
            No hay clientes con puntos todavía.
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-w-2xl">
          {ranking.map((r, i) => (
            <div
              key={r.client.id}
              className={`glass-card p-4 flex items-center gap-4 ${getBorderClass(i)}`}
            >
              {/* Posición */}
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-muted shrink-0">
                {getPositionIcon(i)}
              </div>

              {/* Alias o nombre */}
              <div className="flex-1 min-w-0">
                {/* Muestra el alias si existe, sino el nombre */}
                <p className="font-semibold text-sm">
                  {r.client.alias || r.client.nombre}
                </p>
                {/* Solo el admin ve el nombre real debajo del alias */}
                {r.client.alias && r.client.alias !== r.client.nombre && (
                  <p className="text-xs text-muted-foreground">
                    ({r.client.nombre} {r.client.apellido})
                  </p>
                )}
              </div>

              {/* Puntos */}
              <span className="font-bold text-lg shrink-0">
                {r.puntos}
                <span className="text-xs text-muted-foreground ml-1">pts</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}