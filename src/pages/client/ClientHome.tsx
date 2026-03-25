import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  getClientByLink,
  getActivePlan,
  canOrderTomorrow,
  createOrder,
  getDisponibles,
  getCantidadUsada,
} from '@/lib/store';
import { getBusinessConfig } from '@/lib/business';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { Client, Plan } from '@/types';

export default function ClientHome() {
  const { accessLink } = useParams();
  const [client, setClient] = useState<Client | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [orderCheck, setOrderCheck] = useState<{ can: boolean; reason?: string }>({ can: false });

  const business = getBusinessConfig();

  useEffect(() => {
    if (!accessLink) return;

    const foundClient = getClientByLink(accessLink);
    if (!foundClient) return;

    setClient(foundClient);

    const activePlan = getActivePlan(foundClient.id) || null;
    setPlan(activePlan);

    setOrderCheck(canOrderTomorrow(foundClient.id));
  }, [accessLink]);

  if (!client) {
    return <div className="text-center py-12 text-muted-foreground">Cliente no encontrado</div>;
  }

  if (!plan) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="text-muted-foreground">No tenés un contrato activo. Escribinos para ayudarte.</p>
      </div>
    );
  }

  const usadas = getCantidadUsada(plan);
  const disponibles = getDisponibles(plan);

  const handleOrder = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    createOrder({
      clientId: client.id,
      planId: plan.id,
      fechaEntrega: tomorrow.toISOString().split('T')[0],
      creadoPor: 'cliente',
    });

    toast.success('Pedido enviado para mañana');
    setOrderCheck(canOrderTomorrow(client.id));
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
          Acá podés ver tu seguimiento. No podés editar datos, solo consultarlos.
        </p>
      </div>

      <div className="space-y-4">
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Tu contrato actual
            </span>

            <div className="flex gap-2">
              <Badge variant="secondary">{plan.modalidad}</Badge>
              <Badge variant="outline">{plan.tipoEntrega}</Badge>
            </div>
          </div>

          <div className="text-3xl font-bold">
            {disponibles}
            <span className="text-base text-muted-foreground font-normal ml-2">
              viandas disponibles
            </span>
          </div>

          <div className="w-full bg-muted rounded-full h-2.5 mt-3">
            <div
              className="bg-primary rounded-full h-2.5 transition-all"
              style={{
                width: `${plan.cantidadContratada > 0 ? (usadas / plan.cantidadContratada) * 100 : 0}%`,
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm mt-4">
            <div>
              <span className="text-muted-foreground">Contratadas:</span>{' '}
              <strong>{plan.cantidadContratada}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Usadas:</span>{' '}
              <strong>{usadas}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Precio por vianda:</span>{' '}
              <strong>${plan.precioUnitario.toLocaleString()}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Abonado:</span>{' '}
              <strong>${plan.importeAbonado.toLocaleString()}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Inicio:</span>{' '}
              <strong>{plan.fechaInicio}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Fin:</span>{' '}
              <strong>{plan.fechaFin}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Entrega:</span>{' '}
              <strong className="capitalize">{plan.tipoEntrega}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Puntos:</span>{' '}
              <strong>{client.puntos}</strong>
            </div>
          </div>
        </div>

        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-3">¿Tenés dudas?</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Si ves algo raro o querés consultar un consumo, escribinos y lo revisamos.
          </p>

          <Button onClick={handleContact} className="w-full">
            Escribir por WhatsApp
          </Button>
        </div>

        {plan.modalidad === 'flexible' && (
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">Pedido flexible</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Podés pedir hasta las {plan.horaLimite || '20:00'} hs.
            </p>

            {orderCheck.can ? (
              <Button onClick={handleOrder} className="w-full">
                Pedir vianda para mañana
              </Button>
            ) : (
              <div>
                <Button disabled className="w-full">
                  Pedir vianda para mañana
                </Button>
                <p className="text-xs text-muted-foreground mt-2">{orderCheck.reason}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}