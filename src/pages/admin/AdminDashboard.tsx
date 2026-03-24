import { useEffect, useState } from 'react';
import { Users, ShoppingBag, CalendarCheck, Award } from 'lucide-react';
import { getClients, getPlans, getPendingOrders, getTodayConsumptions, getFixedClientsForToday } from '@/lib/store';

export default function AdminDashboard() {
  const [stats, setStats] = useState({ clients: 0, activePlans: 0, todayConsumptions: 0, pendingOrders: 0, todayFixed: 0 });

  useEffect(() => {
    const clients = getClients();
    const plans = getPlans().filter(p => p.activo);
    const todayC = getTodayConsumptions();
    const pendingO = getPendingOrders();
    const todayF = getFixedClientsForToday();
    setStats({
      clients: clients.length,
      activePlans: plans.length,
      todayConsumptions: todayC.length,
      pendingOrders: pendingO.length,
      todayFixed: todayF.length,
    });
  }, []);

  const cards = [
    { label: 'Clientes', value: stats.clients, icon: Users, color: 'text-primary' },
    { label: 'Planes activos', value: stats.activePlans, icon: CalendarCheck, color: 'text-success' },
    { label: 'Retiros hoy', value: `${stats.todayConsumptions}/${stats.todayFixed}`, icon: CalendarCheck, color: 'text-secondary' },
    { label: 'Pedidos pendientes', value: stats.pendingOrders, icon: ShoppingBag, color: 'text-warning' },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Resumen de la operación del día</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(card => (
          <div key={card.label} className="stat-card">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{card.label}</span>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <span className="text-2xl font-bold">{card.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
