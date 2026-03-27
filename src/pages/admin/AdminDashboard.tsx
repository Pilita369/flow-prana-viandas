import { useEffect, useState } from 'react';
import { Users, Calendar, CheckSquare, ShoppingBag } from 'lucide-react';
import { getDashboardStats } from '@/lib/store';
import { getBusinessConfig, saveBusinessConfig, FERIADOS_ARGENTINA_2026 } from '@/lib/business';

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    clientsCount: 0,
    activePlansCount: 0,
    todayRetirados: 0,
    pendingOrdersCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // ⚡ Migración única: limpiar feriados viejos del localStorage
    // Esto asegura que 23/3 y 24/3 ya no estén en la config guardada
    const migrated = localStorage.getItem('mp_feriados_migrated_v2');
    if (!migrated) {
      const config = getBusinessConfig();
      const feriadosLimpios = FERIADOS_ARGENTINA_2026; // sin 23/3 ni 24/3
      saveBusinessConfig({ ...config, feriados: feriadosLimpios });
      localStorage.setItem('mp_feriados_migrated_v2', 'true');
    }

    async function load() {
      try {
        const result = await getDashboardStats();
        setStats(result);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const cards = [
    { title: 'Clientes', value: stats.clientsCount, icon: Users },
    { title: 'Planes activos', value: stats.activePlansCount, icon: Calendar },
    { title: 'Retiros hoy', value: stats.todayRetirados, icon: CheckSquare },
    { title: 'Pedidos pendientes', value: stats.pendingOrdersCount, icon: ShoppingBag },
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Resumen de la operación del día</p>
      </div>

      {loading ? (
        <div className="glass-card p-10 text-center text-muted-foreground">
          Cargando dashboard...
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.title} className="glass-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-muted-foreground">{card.title}</span>
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div className="text-3xl font-bold">{card.value}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}