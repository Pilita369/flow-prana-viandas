import { Badge } from '@/components/ui/badge';
import { formatTimestampDateAR } from '@/lib/consumo';
import type { PointTransaction } from '@/types';

/** Pestaña de puntos de la ficha: total y todos los movimientos (solo lectura, mismos datos que antes). */
export default function ClientPointsPanel({ puntos, points }: { puntos: number; points: PointTransaction[] }) {
  const porConsumos = points.filter(p => p.motivo.startsWith('Consumo registrado'));
  const otros = points.filter(p => !p.motivo.startsWith('Consumo registrado'));
  const totalPorConsumos = porConsumos.reduce((acc, p) => acc + p.puntos, 0);
  const totalOtros = otros.reduce((acc, p) => acc + p.puntos, 0);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-start">
      <div className="glass-card p-5 space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">Puntos totales</p>
          <p className="text-4xl font-bold tabular-nums">{puntos}</p>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-2 border-b border-border pb-2">
            <span className="text-muted-foreground">Por consumos ({porConsumos.length} movimientos)</span>
            <strong className="tabular-nums">{totalPorConsumos >= 0 ? '+' : ''}{totalPorConsumos}</strong>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Renovaciones, canjes y otros ({otros.length})</span>
            <strong className="tabular-nums">{totalOtros >= 0 ? '+' : ''}{totalOtros}</strong>
          </div>
        </div>
      </div>

      <div className="glass-card p-5 space-y-3">
        <h3 className="text-lg font-semibold">Movimientos</h3>
        {points.length === 0 && <p className="text-muted-foreground">Sin movimientos de puntos.</p>}
        {otros.map(point => <Row key={point.id} point={point} />)}
        {porConsumos.length > 0 && (
          <details className="group rounded-lg border-2 border-border">
            <summary className="cursor-pointer list-none flex items-center justify-between gap-2 px-3 py-3 min-h-[3rem]">
              <span className="font-medium">Puntos por consumos ({porConsumos.length} registros)</span>
              <Badge>+{totalPorConsumos}</Badge>
            </summary>
            <div className="border-t-2 border-border px-3 py-2 space-y-2">
              {porConsumos.map(point => <Row key={point.id} point={point} />)}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function Row({ point }: { point: PointTransaction }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
      <div className="min-w-0">
        <p className="font-medium">{point.motivo}</p>
        <p className="text-sm text-muted-foreground">{formatTimestampDateAR(point.fecha)}</p>
      </div>
      <Badge variant={point.puntos >= 0 ? 'default' : 'destructive'} className="shrink-0 text-sm">{point.puntos >= 0 ? '+' : ''}{point.puntos}</Badge>
    </div>
  );
}
