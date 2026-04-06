import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  getClientByLink,
  getActivePlan,
  canOrderTomorrow,
  createOrder,
} from '@/lib/store';
import { getBusinessConfig } from '@/lib/business';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import ClientPlanHistory from '@/components/ClientPlanHistory';
import type { Client, Plan } from '@/types';

export default function ClientHome() {
  const { accessLink } = useParams();
  const [client, setClient] = useState<Client | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [orderCheck, setOrderCheck] = useState<{ can: boolean; reason?: string }>({ can: false });
  const [loading, setLoading] = useState(true);

  const business = getBusinessConfig();

  const load = async () => {
    if (!accessLink) return;
    setLoading(true);
    try {
      const foundClient = await getClientByLink(accessLink);
      if (!foundClient) return;
      setClient(foundClient);

      const activePlan = (await getActivePlan(foundClient.id)) || null;
      setPlan(activePlan);

      const check = await canOrderTomorrow(foundClient.id);
      setOrderCheck(check);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [accessLink]);

  if (loading) return <div className="text-center py-12 text-muted-foreground">Cargando...</div>;
  if (!client) return <div className="text-center py-12 text-muted-foreground">Cliente no encontrado</div>;

  const handleOrder = async () => {
    if (!plan) return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await createOrder({
      clientId: client.id,
      planId: plan.id,
      fechaEntrega: tomorrow.toISOString().split('T')[0],
      creadoPor: 'cliente',
    });
    toast.success('Pedido enviado para mañana');
    const check = await canOrderTomorrow(client.id);
    setOrderCheck(check);
  };

  const handleContact = () => {
    const msg = encodeURIComponent(
      `Hola! Soy ${client.nombre} ${client.apellido}. Tengo una consulta sobre mi seguimiento de viandas.`
    );
    window.open(`https://wa.me/${business.whatsappNegocio}?text=${msg}`, '_blank');
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-display font-bold">Hola, {client.nombre}</h2>
        <p className="text-muted-foreground text-sm">
          Este panel es solo de consulta. Si tenés dudas, escribinos.
        </p>
      </div>

      <div className="space-y-4">
        {/* Historial de períodos — siempre visible */}
        <ClientPlanHistory clientId={client.id} showAdmin={false} />

        {/* Pedido flexible */}
        {plan?.modalidad === 'flexible' && (
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">Pedido flexible</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Podés pedir hasta las {plan.horaLimite || '20:00'} hs.
            </p>
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

        {/* Sin plan activo */}
        {!plan && (
          <div className="glass-card p-8 text-center">
            <p className="text-muted-foreground">No tenés un contrato activo. Escribinos para ayudarte.</p>
          </div>
        )}

        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3">¿Tenés dudas?</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Si ves algo raro o querés consultar un consumo, escribinos y lo revisamos.
          </p>
          <Button onClick={handleContact} className="w-full">Escribir por WhatsApp</Button>
        </div>
      </div>
    </div>
  );
}
