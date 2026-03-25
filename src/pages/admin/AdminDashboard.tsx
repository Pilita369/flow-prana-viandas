// src/pages/admin/AdminDashboard.tsx
// ============================================================
// DASHBOARD PRINCIPAL DEL ADMIN
//
// Este componente es el primero que se carga al entrar al
// panel admin. Acá se hace la carga inicial de TODOS los
// datos desde Supabase, que quedan en memoria para que
// el resto de las pantallas los puedan usar sin recargar.
// ============================================================

import { useEffect, useState } from 'react';
import { Users, ShoppingBag, CalendarCheck, Loader2 } from 'lucide-react';
import {
  loadAllData,
  getClients,
  getPlans,
  getPendingOrders,
  getTodayConsumptions,
  getFixedClientsForToday,
} from '@/lib/store';

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    clients:          0,
    activePlans:      0,
    todayConsumptions: 0,
    pendingOrders:    0,
    todayFixed:       0,
  });

  useEffect(() => {
    async function init() {
      setLoading(true);

      // Carga todos los datos desde Supabase al entrar al panel
      // Esto llena los caches en memoria para toda la sesión
      await loadAllData();

      // Calcular estadísticas del día
      const clients  = getClients();
      const plans    = getPlans().filter((p) => p.activo);
      const todayC   = getTodayConsumptions();
      const pendingO = getPendingOrders();
      const todayF   = getFixedClientsForToday();

      setStats({
        clients:           clients.length,
        activePlans:       plans.length,
        todayConsumptions: todayC.length,
        pendingOrders:     pendingO.length,
        todayFixed:        todayF.length,
      });

      setLoading(false);
    }

    init();
  }, []);

  // Spinner mientras carga desde Supabase
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Cargando datos...</p>
        </div>
      </div>
    );
  }

  const cards = [
    { label: 'Clientes',          value: stats.clients,                                       icon: Users,         color: 'text-primary'   },
    { label: 'Planes activos',    value: stats.activePlans,                                   icon: CalendarCheck, color: 'text-success'   },
    { label: 'Retiros hoy',       value: `${stats.todayConsumptions}/${stats.todayFixed}`,    icon: CalendarCheck, color: 'text-secondary' },
    { label: 'Pedidos pendientes', value: stats.pendingOrders,                                icon: ShoppingBag,   color: 'text-warning'   },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Resumen de la operación del día</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="stat-card">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {card.label}
              </span>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <span className="text-2xl font-bold">{card.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}