import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  getFixedClientsForToday,
  getTodayConsumptions,
  getFlexibleOrders,
  createConsumption,
  updateConsumption,
  getClients,
  getPlans,
  getDisponibles,
} from '@/lib/store';
import { toast } from 'sonner';
import type { Client, Plan, Consumption } from '@/types';

interface TodayItem {
  client: Client;
  plan: Plan;
  tipo: 'fijo' | 'flexible';
  consumption?: Consumption;
  disponibles: number;
}

export default function DailyConsumptions() {
  const [items, setItems] = useState<TodayItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const todayConsumptions = await getTodayConsumptions();
      const result: TodayItem[] = [];

      const fixed = await getFixedClientsForToday();
      for (const { client, plan } of fixed) {
        const existing = todayConsumptions.find(c => c.clientId === client.id && c.fecha === today);
        const disponibles = await getDisponibles(plan);
        result.push({ client, plan, tipo: 'fijo', consumption: existing, disponibles });
      }

      const orders = (await getFlexibleOrders()).filter(
        o => o.fechaEntrega === today && o.status === 'confirmado'
      );
      const clients = await getClients();
      const plans = await getPlans();

      for (const order of orders) {
        const client = clients.find(c => c.id === order.clientId);
        const plan = plans.find(p => p.id === order.planId);
        if (client && plan) {
          const existing = todayConsumptions.find(c => c.clientId === client.id && c.fecha === today);
          const disponibles = await getDisponibles(plan);
          result.push({ client, plan, tipo: 'flexible', consumption: existing, disponibles });
        }
      }

      setItems(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const markRetiro = async (item: TodayItem) => {
    const value = window.prompt('¿Cuántas viandas retiró hoy?', String(item.plan.unidadesPorRetiro || 1));
    if (value === null) return;
    const cantidad = Number(value);
    if (!cantidad || cantidad <= 0) { toast.error('La cantidad debe ser mayor a 0'); return; }

    const today = new Date().toISOString().split('T')[0];
    if (item.consumption) {
      await updateConsumption(item.consumption.id, 'retirado');
      toast.success('Retiro actualizado');
    } else {
      await createConsumption({ clientId: item.client.id, planId: item.plan.id, fecha: today, status: 'retirado', tipo: item.tipo, cantidad });
      toast.success('Retiro registrado');
    }
    await load();
  };

  const markOther = async (item: TodayItem, status: 'no_retirado' | 'reprogramado') => {
    const today = new Date().toISOString().split('T')[0];
    if (item.consumption) {
      await updateConsumption(item.consumption.id, status);
    } else {
      await createConsumption({ clientId: item.client.id, planId: item.plan.id, fecha: today, status, tipo: item.tipo, cantidad: 0 });
    }
    toast.success(`Marcado como ${status.replace('_', ' ')}`);
    await load();
  };

  if (loading) return <div className="text-center py-12 text-muted-foreground">Cargando...</div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Consumos del día</h1>
        <p className="page-subtitle">{items.length} clientes programados para hoy</p>
      </div>

      {items.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-muted-foreground">No hay clientes programados para hoy.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={`${item.client.id}-${index}`} className="glass-card p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                  {item.client.nombre[0]}{item.client.apellido[0]}
                </div>
                <div>
                  <p className="font-semibold text-sm">{item.client.nombre} {item.client.apellido}</p>
                  <div className="flex flex-wrap gap-2 mb-1">
                    <Badge variant="outline" className="text-xs">{item.tipo}</Badge>
                    <Badge variant="secondary" className="text-xs">{item.plan.tipoEntrega}</Badge>
                    <Badge variant="outline" className="text-xs">{item.plan.unidadesPorRetiro} por retiro</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Disponibles: <strong>{item.disponibles}</strong></p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => markRetiro(item)}>✓ Retiró</Button>
                <Button size="sm" variant="outline" onClick={() => markOther(item, 'no_retirado')}>✗ No retiró</Button>
                <Button size="sm" variant="outline" onClick={() => markOther(item, 'reprogramado')}>↻ Reprogramado</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}