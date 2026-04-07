import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  getClientByLink,
  getActivePlan,
  getDisponibles,
  getCantidadUsada,
  getCreditNotes,
  canOrderTomorrow,
  createOrder,
} from '@/lib/store';
import { getBusinessConfig, formatCurrencyAR, formatDateAR } from '@/lib/business';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import ClientPlanHistory from '@/components/ClientPlanHistory';
import type { Client, Plan, CreditNote } from '@/types';

export default function ClientHome() {
  const { accessLink } = useParams();
  const [client, setClient] = useState<Client | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [usadas, setUsadas] = useState(0);
  const [disponibles, setDisponibles] = useState(0);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
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
      setUsadas(await getCantidadUsada(activePlan));
      setDisponibles(await getDisponibles(activePlan));
      setCreditNotes(getCreditNotes(foundClient.id));

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
        {/* Resumen del período actual */}
        {plan && (
          <div className="glass-card p-5 space-y-3 ring-2 ring-primary/30">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-semibold text-sm">Período actual</h3>
              <Badge className="text-xs">Activo</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Viandas contratadas</p>
                <p className="font-bold text-lg">{plan.cantidadContratada}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Precio por vianda</p>
                <p className="font-bold text-lg">{formatCurrencyAR(plan.precioUnitario)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Consumidas</p>
                <p className="font-semibold text-green-600">{usadas}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Disponibles</p>
                <p className={`font-semibold ${disponibles > 0 ? 'text-blue-600' : 'text-muted-foreground'}`}>{disponibles}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Inicio</p>
                <p className="font-semibold">{formatDateAR(plan.fechaInicio)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Fin pactada</p>
                <p className="font-semibold">{formatDateAR(plan.fechaFin)}</p>
              </div>
            </div>
            <div className="border-t border-border pt-3 space-y-1">
              {(() => {
                const pendingNotes = creditNotes.filter(n => !n.aplicado);
                const descMoneda = pendingNotes
                  .filter(n => n.tipo === 'saldo_envio' || n.tipo === 'descuento')
                  .reduce((acc, n) => acc + (n.monto || 0), 0);
                const descViandas = pendingNotes
                  .filter(n => n.tipo === 'vianda_favor')
                  .reduce((acc, n) => acc + (n.cantidad || 0) * plan.precioUnitario, 0);
                const totalAjustes = descMoneda + descViandas;
                const envio = plan.tipoEntrega === 'envio' ? (plan.costoEnvio || 0) : 0;
                const totalNeto = plan.totalCalculado + envio - totalAjustes;

                if (totalAjustes > 0) {
                  return (
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Viandas ({plan.cantidadContratada} × {formatCurrencyAR(plan.precioUnitario)})</span>
                        <span>{formatCurrencyAR(plan.totalCalculado)}</span>
                      </div>
                      {envio > 0 && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>Envío</span>
                          <span>{formatCurrencyAR(envio)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-green-700">
                        <span>Ajustes a favor</span>
                        <span>− {formatCurrencyAR(totalAjustes)}</span>
                      </div>
                      <div className="flex justify-between font-bold border-t border-border pt-1">
                        <span>Total a pagar</span>
                        <span>{formatCurrencyAR(totalNeto)}</span>
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">
                      Total del período{envio > 0 ? ` (incl. envío ${formatCurrencyAR(envio)})` : ''}
                    </span>
                    <span className="font-bold text-base">{formatCurrencyAR(plan.totalCalculado + envio)}</span>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

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
