import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getClientByLink, getActivePlan, getDisponibles, getCantidadUsada } from '@/lib/store';
import { Badge } from '@/components/ui/badge';
import { formatCurrencyAR, formatDateAR } from '@/lib/business';
import type { Plan } from '@/types';

export default function ClientPlan() {
  const { accessLink } = useParams();
  const [plan, setPlan] = useState<Plan | null>(null);

  useEffect(() => {
    if (!accessLink) return;

    const client = getClientByLink(accessLink);
    if (!client) return;

    setPlan(getActivePlan(client.id) || null);
  }, [accessLink]);

  if (!plan) {
    return <div className="text-center py-12 text-muted-foreground">Sin contrato activo</div>;
  }

  const usadas = getCantidadUsada(plan);
  const disponibles = getDisponibles(plan);

  return (
    <div>
      <h2 className="text-xl font-display font-bold mb-4">Mi plan</h2>

      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold">{disponibles} disponibles</span>
          <div className="flex gap-2">
            <Badge variant="secondary">{plan.modalidad}</Badge>
            <Badge variant="outline">{plan.tipoEntrega}</Badge>
          </div>
        </div>

        <div className="w-full bg-muted rounded-full h-2.5">
          <div
            className="bg-primary rounded-full h-2.5"
            style={{
              width: `${plan.cantidadContratada > 0 ? (usadas / plan.cantidadContratada) * 100 : 0}%`,
            }}
          />
        </div>

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
            <span className="text-muted-foreground">Disponibles:</span>{' '}
            <strong>{disponibles}</strong>
          </div>

          <div>
            <span className="text-muted-foreground">Precio unitario:</span>{' '}
            <strong>{formatCurrencyAR(plan.precioUnitario)}</strong>
          </div>

          <div>
            <span className="text-muted-foreground">Inicio:</span>{' '}
            <strong>{formatDateAR(plan.fechaInicio)}</strong>
          </div>

          <div>
            <span className="text-muted-foreground">Fin:</span>{' '}
            <strong>{formatDateAR(plan.fechaFin)}</strong>
          </div>

          <div>
            <span className="text-muted-foreground">Total:</span>{' '}
            <strong>{formatCurrencyAR(plan.totalCalculado)}</strong>
          </div>

          <div>
            <span className="text-muted-foreground">Entrega:</span>{' '}
            <strong className="capitalize">{plan.tipoEntrega}</strong>
          </div>

          <div>
            <span className="text-muted-foreground">Por retiro:</span>{' '}
            <strong>{plan.unidadesPorRetiro}</strong>
          </div>

          {plan.diasFijos?.length ? (
            <div className="col-span-2">
              <span className="text-muted-foreground">Días fijos:</span>{' '}
              <strong>{plan.diasFijos.join(', ')}</strong>
            </div>
          ) : null}

          {(plan.fechasExcluidas || []).length > 0 ? (
            <div className="col-span-2">
              <span className="text-muted-foreground">Fechas excluidas:</span>{' '}
              <strong>{plan.fechasExcluidas?.join(', ')}</strong>
            </div>
          ) : null}

          {plan.horaLimite ? (
            <div className="col-span-2">
              <span className="text-muted-foreground">Hora límite de pedido:</span>{' '}
              <strong>{plan.horaLimite}</strong>
            </div>
          ) : null}

          {plan.observaciones ? (
            <div className="col-span-2">
              <span className="text-muted-foreground">Observaciones:</span>{' '}
              <strong>{plan.observaciones}</strong>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}