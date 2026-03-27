import { useEffect, useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getFlexibleOrders, updateOrderStatus, getClients } from '@/lib/store';
import { toast } from 'sonner';
import type { FlexibleOrder, Client } from '@/types';

export default function FlexibleOrders() {
  const [orders, setOrders] = useState<(FlexibleOrder & { client?: Client })[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const clients = await getClients();
      const all = (await getFlexibleOrders())
        .sort((a, b) => new Date(b.fechaPedido).getTime() - new Date(a.fechaPedido).getTime())
        .map(o => ({ ...o, client: clients.find(c => c.id === o.clientId) }));
      setOrders(all);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleStatus = async (id: string, status: 'confirmado' | 'cancelado') => {
    await updateOrderStatus(id, status);
    toast.success(`Pedido ${status}`);
    await load();
  };

  if (loading) return <div className="text-center py-12 text-muted-foreground">Cargando...</div>;

  const pending = orders.filter(o => o.status === 'pendiente');
  const others = orders.filter(o => o.status !== 'pendiente');

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Pedidos flexibles</h1>
        <p className="page-subtitle">{pending.length} pendientes de confirmación</p>
      </div>

      {pending.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Pendientes</h2>
          <div className="space-y-3">
            {pending.map(o => (
              <div key={o.id} className="glass-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-l-4 border-l-warning">
                <div>
                  <p className="font-semibold text-sm">{o.client?.nombre} {o.client?.apellido}</p>
                  <p className="text-xs text-muted-foreground">Entrega: {o.fechaEntrega} · {o.creadoPor === 'cliente' ? 'Pedido por cliente' : 'Cargado manualmente'}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleStatus(o.id, 'confirmado')}>✓ Confirmar</Button>
                  <Button size="sm" variant="outline" onClick={() => handleStatus(o.id, 'cancelado')}>✗ Cancelar</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {others.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Historial</h2>
          <div className="space-y-2">
            {others.slice(0, 20).map(o => (
              <div key={o.id} className="glass-card p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">{o.client?.nombre} {o.client?.apellido}</p>
                  <p className="text-xs text-muted-foreground">Entrega: {o.fechaEntrega}</p>
                </div>
                <Badge variant={o.status === 'confirmado' ? 'default' : 'destructive'}>{o.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {orders.length === 0 && (
        <div className="glass-card p-12 text-center">
          <p className="text-muted-foreground">No hay pedidos flexibles todavía.</p>
        </div>
      )}
    </div>
  );
}