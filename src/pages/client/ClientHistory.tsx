import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getClientByLink, getClientConsumptions } from '@/lib/store';
import { Badge } from '@/components/ui/badge';
import type { Consumption } from '@/types';

export default function ClientHistory() {
  const { accessLink } = useParams();
  const [consumptions, setConsumptions] = useState<Consumption[]>([]);

  useEffect(() => {
    if (!accessLink) return;

    const client = getClientByLink(accessLink);
    if (!client) return;

    setConsumptions(getClientConsumptions(client.id));
  }, [accessLink]);

  return (
    <div>
      <h2 className="text-xl font-display font-bold mb-4">Historial</h2>

      {consumptions.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted-foreground">
          Sin movimientos registrados
        </div>
      ) : (
        <div className="space-y-2">
          {consumptions.map((consumption) => (
            <div key={consumption.id} className="glass-card p-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{consumption.fecha}</p>
                <p className="text-xs text-muted-foreground">
                  {consumption.cantidad} vianda(s) · {consumption.tipo}
                  {consumption.notas ? ` · ${consumption.notas}` : ''}
                </p>
              </div>

              <Badge
                variant={
                  consumption.status === 'retirado' || consumption.status === 'consumido'
                    ? 'default'
                    : consumption.status === 'no_retirado' || consumption.status === 'no_retiro'
                    ? 'destructive'
                    : 'secondary'
                }
              >
                {consumption.status === 'retirado' || consumption.status === 'consumido'
                  ? '✓ Retirado'
                  : consumption.status === 'no_retirado' || consumption.status === 'no_retiro'
                  ? '✗ No retiró'
                  : '↻ Reprogramado'}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}