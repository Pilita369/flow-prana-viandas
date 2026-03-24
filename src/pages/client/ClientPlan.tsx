import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getClientByLink, getActivePlan } from '@/lib/store';
import { Badge } from '@/components/ui/badge';
import type { Plan } from '@/types';

export default function ClientPlan() {
  const { accessLink } = useParams();
  const [plan, setPlan] = useState<Plan | null>(null);

  useEffect(() => {
    if (!accessLink) return;
    const c = getClientByLink(accessLink);
    if (c) setPlan(getActivePlan(c.id) || null);
  }, [accessLink]);

  if (!plan) return <div className="text-center py-12 text-muted-foreground">Sin plan activo</div>;

  return (
    <div>
      <h2 className="text-xl font-display font-bold mb-4">Mi plan</h2>
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold">{plan.tipo} viandas</span>
          <Badge variant="secondary">{plan.modalidad}</Badge>
        </div>
        <div className="w-full bg-muted rounded-full h-2.5">
          <div className="bg-primary rounded-full h-2.5" style={{ width: `${(plan.viandasUsadas / plan.tipo) * 100}%` }} />
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted-foreground">Usadas:</span> <strong>{plan.viandasUsadas}</strong></div>
          <div><span className="text-muted-foreground">Restantes:</span> <strong>{plan.tipo - plan.viandasUsadas}</strong></div>
          <div><span className="text-muted-foreground">Inicio:</span> <strong>{plan.fechaInicio}</strong></div>
          <div><span className="text-muted-foreground">Fin:</span> <strong>{plan.fechaFin}</strong></div>
          <div><span className="text-muted-foreground">Abonado:</span> <strong>${plan.importeAbonado.toLocaleString()}</strong></div>
          {plan.diasFijos && <div><span className="text-muted-foreground">Días:</span> <strong>{plan.diasFijos.join(', ')}</strong></div>}
          {plan.incluyeEnvio && <div><Badge variant="outline">Con envío</Badge></div>}
          {plan.horaLimite && <div><span className="text-muted-foreground">Hora límite:</span> <strong>{plan.horaLimite}</strong></div>}
        </div>
      </div>
    </div>
  );
}
