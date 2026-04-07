import { useEffect, useState } from 'react';
import { getClientPlans, getClientConsumptions, deleteConsumption } from '@/lib/store';
import { formatCurrencyAR, formatDateAR, calculateFixedPlanEstimatedEndDate } from '@/lib/business';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Plan, Consumption } from '@/types';

function normalizeStatus(status: string): string {
  if (status === 'consumido') return 'retirado';
  if (status === 'no_retiro') return 'no_retirado';
  return status;
}

function monthLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
}

// Calcula fecha estimada real desde hoy según viandas restantes y días pactados
function calcFechaRealEstimada(plan: Plan, disponibles: number): string {
  if (plan.modalidad !== 'fijo' || !plan.diasFijos?.length || disponibles <= 0) return '';
  const hoy = new Date().toISOString().split('T')[0];
  const diasRestantes = Math.ceil(disponibles / (plan.unidadesPorRetiro || 1));
  return calculateFixedPlanEstimatedEndDate(hoy, diasRestantes, plan.diasFijos, plan.fechasExcluidas || []);
}

interface Props {
  clientId: string;
  showAdmin?: boolean;
}

export default function ClientPlanHistory({ clientId, showAdmin = false }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [consumptions, setConsumptions] = useState<Consumption[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    const [p, c] = await Promise.all([
      getClientPlans(clientId),
      getClientConsumptions(clientId),
    ]);
    setPlans(p);
    setConsumptions(c);
    setLoading(false);
    // Expandir el período activo por defecto
    const active = p.find(plan => plan.activo);
    if (active) setExpandedPlan(active.id);
  };

  useEffect(() => { loadData(); }, [clientId]);

  const handleDeleteConsumption = async (c: Consumption) => {
    if (!window.confirm(`¿Eliminar el retiro del ${formatDateAR(c.fecha)}?`)) return;
    try {
      await deleteConsumption(c.id);
      toast.success('Retiro eliminado');
      await loadData();
    } catch {
      toast.error('Error al eliminar');
    }
  };

  if (loading || plans.length === 0) return null;

  const consMapByPlan = consumptions.reduce((acc, c) => {
    if (!acc[c.planId]) acc[c.planId] = [];
    acc[c.planId].push(c);
    return acc;
  }, {} as Record<string, Consumption[]>);

  const sortedPlans = plans
    .slice()
    .sort((a, b) => new Date(b.fechaInicio).getTime() - new Date(a.fechaInicio).getTime());

  const totalConsumidas = consumptions
    .filter(c => normalizeStatus(c.status) === 'retirado')
    .reduce((acc, c) => acc + c.cantidad, 0);

  const fechaInicioPrimero = sortedPlans[sortedPlans.length - 1]?.fechaInicio;
  const fechaFinUltimo = sortedPlans[0]?.fechaFin;
  const rangoFechas = sortedPlans.length === 1
    ? `${formatDateAR(sortedPlans[0].fechaInicio)} → ${formatDateAR(sortedPlans[0].fechaFin)}`
    : `${formatDateAR(fechaInicioPrimero)} → ${formatDateAR(fechaFinUltimo)}`;

  return (
    <div className="space-y-3">
      {/* Resumen acumulado */}
      <div className="glass-card p-4 flex flex-wrap gap-4 items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">
            Total histórico
            <span className="ml-2 normal-case font-normal text-muted-foreground/70">
              {rangoFechas}
            </span>
          </p>
          <p className="text-2xl font-bold">
            {totalConsumidas}
            <span className="text-sm font-normal text-muted-foreground ml-2">viandas consumidas</span>
          </p>
        </div>
        {showAdmin && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Neto consumido total</p>
            <p className="font-semibold">
              {formatCurrencyAR(
                sortedPlans.reduce((acc, p) => {
                  const cons = consMapByPlan[p.id] || [];
                  const consumidas = cons
                    .filter(c => normalizeStatus(c.status) === 'retirado')
                    .reduce((s, c) => s + c.cantidad, 0);
                  return acc + consumidas * p.precioUnitario;
                }, 0)
              )}
            </p>
          </div>
        )}
      </div>

      {/* Un card por período */}
      {sortedPlans.map((p, idx) => {
        const cons = consMapByPlan[p.id] || [];
        const consumidas = cons
          .filter(c => normalizeStatus(c.status) === 'retirado')
          .reduce((acc, c) => acc + c.cantidad, 0);
        const disponibles = Math.max(p.cantidadContratada - (p.ajusteInicialUsadas || 0) - consumidas, 0);
        const noRetiraron = cons.filter(c => normalizeStatus(c.status) === 'no_retirado').length;
        const pct = p.cantidadContratada > 0 ? Math.round((consumidas / p.cantidadContratada) * 100) : 0;
        const isExpanded = expandedPlan === p.id;

        // Fechas reales de retiro ordenadas
        const retirosOrdenados = cons
          .filter(c => normalizeStatus(c.status) === 'retirado')
          .sort((a, b) => a.fecha.localeCompare(b.fecha));

        // Fecha estimada real para plan activo (desde hoy con viandas restantes)
        const fechaRealEstimada = p.activo ? calcFechaRealEstimada(p, disponibles) : '';
        const fechaOriginalFin = formatDateAR(p.fechaFin);
        const fechaRealDistinta = fechaRealEstimada && formatDateAR(fechaRealEstimada) !== fechaOriginalFin;

        return (
          <div
            key={p.id}
            className={`glass-card p-4 space-y-3 ${p.activo ? 'ring-2 ring-primary/40' : ''}`}
          >
            {/* Header del período */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {p.activo
                  ? <Badge className="text-xs">Período actual</Badge>
                  : <Badge variant="outline" className="text-xs">Período anterior #{sortedPlans.length - idx}</Badge>
                }
                <span className="text-sm font-medium capitalize">{monthLabel(p.fechaFin)}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {formatDateAR(p.fechaInicio)} → {formatDateAR(p.fechaFin)}
              </span>
            </div>

            {/* Barra de progreso */}
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{consumidas} consumidas de {p.cantidadContratada}</span>
                <span>{pct}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all ${p.activo ? 'bg-primary' : 'bg-muted-foreground/40'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div className="text-center p-2 rounded bg-muted/50">
                <p className="text-xs text-muted-foreground">Contratadas</p>
                <p className="font-semibold">{p.cantidadContratada}</p>
              </div>
              <div className="text-center p-2 rounded bg-green-500/10">
                <p className="text-xs text-muted-foreground">Consumidas</p>
                <p className="font-semibold text-green-600">{consumidas}</p>
              </div>
              <div className={`text-center p-2 rounded ${disponibles > 0 ? 'bg-blue-500/10' : 'bg-muted/50'}`}>
                <p className="text-xs text-muted-foreground">Disponibles</p>
                <p className={`font-semibold ${disponibles > 0 ? 'text-blue-600' : ''}`}>{disponibles}</p>
              </div>
              <div className="text-center p-2 rounded bg-red-500/10">
                <p className="text-xs text-muted-foreground">No retiró</p>
                <p className="font-semibold text-red-500">{noRetiraron}</p>
              </div>
              <div className="text-center p-2 rounded bg-muted/50">
                <p className="text-xs text-muted-foreground">Precio x vianda</p>
                <p className="font-semibold">{formatCurrencyAR(p.precioUnitario)}</p>
              </div>
              <div className="text-center p-2 rounded bg-muted/50">
                <p className="text-xs text-muted-foreground">Total período</p>
                <p className="font-semibold">{formatCurrencyAR(p.totalCalculado)}</p>
              </div>
              {showAdmin && (
                <div className="text-center p-2 rounded bg-muted/50 md:col-span-2">
                  <p className="text-xs text-muted-foreground">Neto consumido</p>
                  <p className="font-semibold">{formatCurrencyAR(consumidas * p.precioUnitario)}</p>
                </div>
              )}
            </div>

            {/* Fin estimada real si difiere del original (viandas a favor) */}
            {p.activo && fechaRealDistinta && (
              <div className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-amber-500/10 text-amber-700">
                <span>⚠ Con {disponibles} viandas disponibles, el plan se estima terminar el <strong>{formatDateAR(fechaRealEstimada)}</strong> (pactado: {fechaOriginalFin})</span>
              </div>
            )}

            {p.observaciones && (
              <p className="text-xs text-muted-foreground italic">{p.observaciones}</p>
            )}

            {/* Toggle retiros */}
            {retirosOrdenados.length > 0 && (
              <div>
                <button
                  onClick={() => setExpandedPlan(isExpanded ? null : p.id)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {isExpanded ? 'Ocultar' : 'Ver'} fechas de retiro ({retirosOrdenados.length})
                </button>

                {isExpanded && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {retirosOrdenados.map(c => (
                      <span
                        key={c.id}
                        className="inline-flex items-center gap-1 text-xs rounded-full bg-green-500/10 text-green-700 px-2 py-0.5"
                      >
                        {formatDateAR(c.fecha)}
                        {c.cantidad > 1 && <span className="font-semibold">×{c.cantidad}</span>}
                        {showAdmin && (
                          <button
                            onClick={() => handleDeleteConsumption(c)}
                            className="ml-0.5 hover:text-red-600 transition-colors"
                            title="Eliminar este retiro"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
