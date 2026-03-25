// src/pages/client/ClientHome.tsx
// ======================================================
// VISTA DEL CLIENTE — Solo lectura
// El cliente puede VER su información pero NO modificar nada.
// El único botón de acción es "Escribir por WhatsApp".
// Los clientes con plan flexible tienen además el botón
// de pedido para el día siguiente (si están dentro del horario).
// ======================================================

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
import { getBusinessConfig, formatCurrencyAR } from '@/lib/business';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { MessageCircle, Clock } from 'lucide-react';
import type { Client, Plan } from '@/types';

export default function ClientHome() {
  const { accessLink } = useParams();
  const [client, setClient]         = useState<Client | null>(null);
  const [plan, setPlan]             = useState<Plan | null>(null);
  const [orderCheck, setOrderCheck] = useState<{ can: boolean; reason?: string }>({ can: false });

  const business = getBusinessConfig();

  useEffect(() => {
    if (!accessLink) return;

    const foundClient = getClientByLink(accessLink);
    if (!foundClient) return;

    setClient(foundClient);

    const activePlan = getActivePlan(foundClient.id) || null;
    setPlan(activePlan);

    // Solo verificar pedido si el plan es flexible
    if (activePlan?.modalidad === 'flexible') {
      setOrderCheck(canOrderTomorrow(foundClient.id));
    }
  }, [accessLink]);

  // ── Cliente no encontrado ──
  if (!client) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Cliente no encontrado. Verificá el link.
      </div>
    );
  }

  // ── Sin contrato activo ──
  if (!plan) {
    return (
      <div className="glass-card p-8 text-center space-y-4">
        <p className="text-muted-foreground">No tenés un contrato activo.</p>
        <Button
          onClick={() => {
            const msg = encodeURIComponent(
              `Hola! Soy ${client.nombre} ${client.apellido}. Quisiera consultar sobre mi plan de viandas.`
            );
            window.open(`https://wa.me/${business.whatsappNegocio}?text=${msg}`, '_blank');
          }}
        >
          <MessageCircle className="w-4 h-4 mr-2" />
          Escribir por WhatsApp
        </Button>
      </div>
    );
  }

  const usadas      = getCantidadUsada(plan);
  const disponibles = getDisponibles(plan);
  const porcentaje  = plan.cantidadContratada > 0
    ? (usadas / plan.cantidadContratada) * 100
    : 0;

  // ── Pedido flexible para el día siguiente ──
  const handleOrder = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    createOrder({
      clientId:     client.id,
      planId:       plan.id,
      fechaEntrega: tomorrow.toISOString().split('T')[0],
      creadoPor:    'cliente',
    });

    toast.success('¡Pedido enviado! Te esperamos mañana 🌿');
    setOrderCheck(canOrderTomorrow(client.id));
  };

  // ── Botón de contacto por WhatsApp ──
  const handleContact = () => {
    const msg = encodeURIComponent(
      `Hola! Soy ${client.nombre} ${client.apellido}. Tengo una consulta sobre mi seguimiento de viandas.`
    );
    window.open(`https://wa.me/${business.whatsappNegocio}?text=${msg}`, '_blank');
  };

  // ── Color de la barra de progreso según saldo restante ──
  const barColor =
    disponibles <= 2 ? 'bg-destructive' :
    disponibles <= 5 ? 'bg-warning' :
    'bg-primary';

  return (
    <div className="space-y-4">

      {/* ── Saludo ── */}
      <div>
        <h2 className="text-xl font-display font-bold">Hola, {client.nombre} 🌿</h2>
        <p className="text-muted-foreground text-sm">
          Acá podés ver tu seguimiento. Para consultas, escribinos por WhatsApp.
        </p>
      </div>

      {/* ── Tarjeta principal: saldo de viandas ── */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Tu contrato actual
          </span>
          <div className="flex gap-2">
            <Badge variant="secondary">
              {plan.modalidad === 'fijo' ? 'Fijo' : 'Flexible'}
            </Badge>
            <Badge variant="outline" className="capitalize">
              {plan.tipoEntrega}
            </Badge>
          </div>
        </div>

        {/* Número grande con viandas disponibles */}
        <div>
          <span className="text-4xl font-bold">{disponibles}</span>
          <span className="text-base text-muted-foreground font-normal ml-2">
            viandas disponibles
          </span>
        </div>

        {/* Barra de progreso */}
        <div className="w-full bg-muted rounded-full h-2.5">
          <div
            className={`${barColor} rounded-full h-2.5 transition-all`}
            style={{ width: `${porcentaje}%` }}
          />
        </div>

        {/* Datos del contrato — SOLO LECTURA, sin botones de edición */}
        <div className="grid grid-cols-2 gap-3 text-sm">
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
            <strong>{formatCurrencyAR(plan.precioUnitario)}</strong>
          </div>
          <div>
            <span className="text-muted-foreground">Abonado:</span>{' '}
            <strong>{formatCurrencyAR(plan.importeAbonado)}</strong>
          </div>
          <div>
            <span className="text-muted-foreground">Inicio:</span>{' '}
            <strong>{plan.fechaInicio}</strong>
          </div>
          <div>
            <span className="text-muted-foreground">Fin:</span>{' '}
            <strong>{plan.fechaFin}</strong>
          </div>
          {plan.modalidad === 'fijo' && plan.diasFijos && plan.diasFijos.length > 0 && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Días de retiro:</span>{' '}
              <strong className="capitalize">{plan.diasFijos.join(', ')}</strong>
            </div>
          )}
          <div>
            <span className="text-muted-foreground">Puntos acumulados:</span>{' '}
            <strong className="text-primary">{client.puntos} pts</strong>
          </div>
        </div>
      </div>

      {/* ── Pedido flexible (solo si el plan es flexible) ── */}
      {plan.modalidad === 'flexible' && (
        <div className="glass-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Pedido para mañana</h3>
          </div>

          <p className="text-xs text-muted-foreground">
            Podés pedir hasta las <strong>{plan.horaLimite || '20:00'} hs</strong>.
            Si no pedís, la vianda queda a tu favor.
          </p>

          {orderCheck.can ? (
            <Button onClick={handleOrder} className="w-full">
              Pedir vianda para mañana
            </Button>
          ) : (
            <div className="space-y-2">
              <Button disabled className="w-full">
                Pedir vianda para mañana
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                {orderCheck.reason ?? 'Pedido cerrado o sin disponibilidad.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Botón de contacto WhatsApp ── */}
      <div className="glass-card p-5 space-y-3">
        <h3 className="text-sm font-semibold">¿Tenés dudas?</h3>
        <p className="text-xs text-muted-foreground">
          Si ves algo raro o querés consultar un consumo, escribinos por WhatsApp.
        </p>

        <Button
          onClick={handleContact}
          variant="outline"
          className="w-full border-green-500 text-green-600 hover:bg-green-50"
        >
          <MessageCircle className="w-4 h-4 mr-2" />
          Escribir por WhatsApp
        </Button>
      </div>

    </div>
  );
}