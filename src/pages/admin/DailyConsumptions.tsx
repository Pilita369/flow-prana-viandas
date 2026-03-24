import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  getFixedClientsForToday, getTodayConsumptions, getFlexibleOrders,
  createConsumption, updateConsumption, getClients, getPlans
} from '@/lib/store';
import { toast } from 'sonner';
import type { Client, Plan, Consumption } from '@/types';

interface TodayItem {
  client: Client;
  plan: Plan;
  tipo: 'fijo' | 'flexible';
  consumption?: Consumption;
}

export default function DailyConsumptions() {
  const [items, setItems] = useState<TodayItem[]>([]);

  const load = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayConsumptions = getTodayConsumptions();
    const result: TodayItem[] = [];

    // Fixed clients for today
    const fixed = getFixedClientsForToday();
    fixed.forEach(({ client, plan }) => {
      const existing = todayConsumptions.find(c => c.clientId === client.id && c.fecha === today);
      result.push({ client, plan, tipo: 'fijo', consumption: existing });
    });

    // Confirmed flexible orders for today
    const orders = getFlexibleOrders().filter(o => o.fechaEntrega === today && o.status === 'confirmado');
    const clients = getClients();
    const plans = getPlans();
    orders.forEach(order => {
      const client = clients.find(c => c.id === order.clientId);
      const plan = plans.find(p => p.id === order.planId);
      if (client && plan) {
        const existing = todayConsumptions.find(c => c.clientId === client.id && c.fecha === today);
        result.push({ client, plan, tipo: 'flexible', consumption: existing });
      }
    });

    setItems(result);
  }, []);

  useEffect(() => { load(); }, [load]);

  const markStatus = (item: TodayItem, status: 'retirado' | 'no_retirado' | 'reprogramado') => {
    const today = new Date().toISOString().split('T')[0];
    if (item.consumption) {
      updateConsumption(item.consumption.id, status);
    } else {
      createConsumption({ clientId: item.client.id, planId: item.plan.id, fecha: today, status, tipo: item.tipo });
    }
    toast.success(`Marcado como ${status.replace('_', ' ')}`);
    load();
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Consumos del día</h1>
        <p className="page-subtitle">{new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })} · {items.length} viandas programadas</p>
      </div>

      {items.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-muted-foreground">No hay viandas programadas para hoy.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={`${item.client.id}-${i}`} className="glass-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                  {item.client.nombre[0]}{item.client.apellido[0]}
                </div>
                <div>
                  <p className="font-semibold text-sm">{item.client.nombre} {item.client.apellido}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{item.tipo}</Badge>
                    {item.consumption && (
                      <Badge variant={item.consumption.status === 'retirado' ? 'default' : 'secondary'} className="text-xs">
                        {item.consumption.status.replace('_', ' ')}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => markStatus(item, 'retirado')} variant={item.consumption?.status === 'retirado' ? 'default' : 'outline'}>
                  ✓ Retiró
                </Button>
                <Button size="sm" onClick={() => markStatus(item, 'no_retirado')} variant={item.consumption?.status === 'no_retirado' ? 'destructive' : 'outline'}>
                  ✗ No retiró
                </Button>
                <Button size="sm" onClick={() => markStatus(item, 'reprogramado')} variant={item.consumption?.status === 'reprogramado' ? 'secondary' : 'outline'}>
                  ↻
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
