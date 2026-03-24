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
    const c = getClientByLink(accessLink);
    if (c) setConsumptions(getClientConsumptions(c.id).reverse());
  }, [accessLink]);

  return (
    <div>
      <h2 className="text-xl font-display font-bold mb-4">Historial</h2>
      {consumptions.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted-foreground">Sin consumos registrados</div>
      ) : (
        <div className="space-y-2">
          {consumptions.map(c => (
            <div key={c.id} className="glass-card p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{c.fecha}</p>
                <p className="text-xs text-muted-foreground">{c.tipo}</p>
              </div>
              <Badge variant={c.status === 'retirado' ? 'default' : 'outline'}>
                {c.status === 'retirado' ? '✓ Retirado' : c.status === 'no_retirado' ? '✗ No retiró' : '↻ Reprogramado'}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
