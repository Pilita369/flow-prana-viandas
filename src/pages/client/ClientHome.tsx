import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { addDaysISO, todayISO } from '@/lib/consumo';
import { canOrderTomorrow, createOrder } from '@/lib/store';
import { getBusinessConfig } from '@/lib/business';
import { useFeriados } from '@/lib/feriados';
import { useClientData } from '@/hooks/useClientData';
import ClientLoadState from '@/components/client/ClientLoadState';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import ClientMonthCard from '@/components/client/ClientMonthCard';
import ClientPeriodSummary from '@/components/client/ClientPeriodSummary';

/** Inicio del cliente: el mes (días hábiles y precio) y un único resumen del período registrado. */
export default function ClientHome() {
  const { accessLink } = useParams();
  const { loading, error, reload, client, plans, consumptions, creditNotes, pagos, activePlan: plan } = useClientData(accessLink);
  const { feriados } = useFeriados({ soloLectura: true });
  const [orderCheck, setOrderCheck] = useState<{ can: boolean; reason?: string }>({ can: false });

  useEffect(() => {
    if (client && plan?.modalidad === 'flexible') canOrderTomorrow(client.id).then(setOrderCheck).catch(() => {});
  }, [client, plan]);

  if (loading || error) return <ClientLoadState loading={loading} error={error} onRetry={() => { void reload(); }} />;
  if (!client) return <div className="text-center py-12 text-muted-foreground">Cliente no encontrado</div>;

  const handleOrder = async () => {
    if (!plan) return;
    await createOrder({ clientId: client.id, planId: plan.id, fechaEntrega: addDaysISO(todayISO(), 1), creadoPor: 'cliente' });
    toast.success('Pedido enviado para mañana');
    setOrderCheck(await canOrderTomorrow(client.id));
  };

  const handleContact = () => {
    const msg = encodeURIComponent(`Hola! Soy ${client.nombre} ${client.apellido}. Tengo una consulta sobre mi seguimiento de viandas.`);
    window.open(`https://wa.me/${getBusinessConfig().whatsappNegocio}?text=${msg}`, '_blank');
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-display font-bold">Hola, {client.nombre}</h2>
        <p className="text-muted-foreground">Este panel es solo de consulta. Si tenés dudas, escribinos.</p>
      </div>

      <ClientMonthCard plans={plans} activePlan={plan} feriados={feriados} />

      {plan ? (
        <ClientPeriodSummary plan={plan} plans={plans} consumptions={consumptions} creditNotes={creditNotes} pagos={pagos} />
      ) : (
        <div className="glass-card p-6 text-center text-muted-foreground">No tenés un contrato activo. Escribinos para ayudarte.</div>
      )}

      {plan?.modalidad === 'flexible' && (
        <section className="glass-card p-4">
          <h3 className="font-semibold mb-2">Pedido flexible</h3>
          <p className="text-sm text-muted-foreground mb-3">Podés pedir hasta las {plan.horaLimite || '20:00'} hs.</p>
          <Button onClick={handleOrder} disabled={!orderCheck.can} className="w-full h-12">Pedir vianda para mañana</Button>
          {!orderCheck.can && orderCheck.reason && <p className="text-sm text-muted-foreground mt-2">{orderCheck.reason}</p>}
        </section>
      )}

      <section className="glass-card p-4">
        <h3 className="font-semibold mb-2">¿Tenés dudas?</h3>
        <p className="text-sm text-muted-foreground mb-3">Si ves algo raro o querés consultar un consumo, escribinos y lo revisamos.</p>
        <Button onClick={handleContact} className="w-full h-12">Escribir por WhatsApp</Button>
      </section>
    </div>
  );
}
