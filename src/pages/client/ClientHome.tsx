import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getClientByLink, getActivePlan, canOrderTomorrow, createOrder } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { Client, Plan } from '@/types';

export default function ClientHome() {
  const { accessLink } = useParams();
  const [client, setClient] = useState<Client | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [orderCheck, setOrderCheck] = useState<{ can: boolean; reason?: string }>({ can: false });

  useEffect(() => {
    if (!accessLink) return;
    const c = getClientByLink(accessLink);
    if (c) {
      setClient(c);
      const p = getActivePlan(c.id);
      setPlan(p || null);
      setOrderCheck(canOrderTomorrow(c.id));
    }
  }, [accessLink]);

  if (!client) return <div className="text-center py-12 text-muted-foreground">Cliente no encontrado</div>;

  const handleOrder = () => {
    if (!plan) return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    createOrder({ clientId: client.id, planId: plan.id, fechaEntrega: tomorrow.toISOString().split('T')[0], creadoPor: 'cliente' });
    toast.success('¡Vianda pedida para mañana!');
    setOrderCheck(canOrderTomorrow(client.id));
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-display font-bold">¡Hola, {client.nombre}!</h2>
        <p className="text-muted-foreground text-sm">Bienvenido/a a tu portal de viandas</p>
      </div>

      {plan ? (
        <div className="space-y-4">
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tu plan</span>
              <Badge variant="secondary">{plan.modalidad}</Badge>
            </div>
            <div className="text-3xl font-bold">{plan.tipo - plan.viandasUsadas}<span className="text-base text-muted-foreground font-normal ml-1">viandas restantes</span></div>
            <div className="w-full bg-muted rounded-full h-2.5 mt-3">
              <div className="bg-primary rounded-full h-2.5 transition-all" style={{ width: `${(plan.viandasUsadas / plan.tipo) * 100}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-2">{plan.viandasUsadas} de {plan.tipo} usadas</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="stat-card">
              <span className="text-xs text-muted-foreground">Abonado</span>
              <span className="text-lg font-bold">${plan.importeAbonado.toLocaleString()}</span>
            </div>
            <div className="stat-card">
              <span className="text-xs text-muted-foreground">Puntos</span>
              <span className="text-lg font-bold">{client.puntos}</span>
            </div>
          </div>

          {plan.modalidad === 'flexible' && (
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold mb-3">Pedir vianda</h3>
              {orderCheck.can ? (
                <Button onClick={handleOrder} className="w-full">Pedir vianda para mañana</Button>
              ) : (
                <div>
                  <Button disabled className="w-full">Pedir vianda para mañana</Button>
                  <p className="text-xs text-muted-foreground mt-2">{orderCheck.reason}</p>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="glass-card p-8 text-center">
          <p className="text-muted-foreground">No tenés un plan activo. Contactá al administrador.</p>
        </div>
      )}
    </div>
  );
}
