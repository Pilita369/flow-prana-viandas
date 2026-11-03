import { useParams } from 'react-router-dom';
import { formatDateAR } from '@/lib/business';
import { useFeriados } from '@/lib/feriados';
import { useClientData } from '@/hooks/useClientData';
import ClientSimulator from '@/components/client/ClientSimulator';
import ClientConsumptionView from '@/components/client/ClientConsumptionView';
import ClientLoadState from '@/components/client/ClientLoadState';

const DIAS: Record<string, string> = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes' };

/** Mi plan: cómo es el plan registrado, el calendario de consumos (solo consulta) y una simulación (sin cambiar nada). */
export default function ClientPlan() {
  const { accessLink } = useParams();
  const { loading, error, reload, client, plans, consumptions, activePlan: plan } = useClientData(accessLink);
  const { feriados } = useFeriados({ soloLectura: true });

  if (loading || error) return <ClientLoadState loading={loading} error={error} onRetry={() => { void reload(); }} />;
  if (!client) return <div className="text-center py-12 text-muted-foreground">Cliente no encontrado</div>;

  const excluidas = (plan?.fechasExcluidas || []).filter(d => plan && d >= plan.fechaInicio && d <= plan.fechaFin);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-display font-bold">Mi plan</h2>

      {plan ? (
        <section className="glass-card p-4 space-y-2" aria-label="Cómo es tu plan">
          <h3 className="font-semibold text-lg">Cómo es tu plan</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div><dt className="text-sm text-muted-foreground">Período</dt><dd className="font-medium tabular-nums">{formatDateAR(plan.fechaInicio)} al {formatDateAR(plan.fechaFin)}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Viandas por día</dt><dd className="font-medium">{plan.unidadesPorRetiro || 1}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Modalidad</dt><dd className="font-medium">{plan.modalidad === 'fijo' ? 'Días fijos' : 'Flexible'}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Entrega</dt><dd className="font-medium">{plan.tipoEntrega === 'envio' ? 'Envío' : 'Retiro en el local'}</dd></div>
            {plan.modalidad === 'fijo' && plan.diasFijos?.length ? (
              <div className="col-span-2"><dt className="text-sm text-muted-foreground">Días</dt><dd className="font-medium">{plan.diasFijos.map(d => DIAS[d] || d).join(', ')}</dd></div>
            ) : null}
            {excluidas.length > 0 && (
              <div className="col-span-2"><dt className="text-sm text-muted-foreground">Días que no venís en este período</dt><dd className="font-medium">{excluidas.map(formatDateAR).join(', ')}</dd></div>
            )}
          </dl>
        </section>
      ) : (
        <div className="glass-card p-6 text-center text-muted-foreground">No tenés un contrato activo.</div>
      )}

      {/* Calendario de consulta: debajo del resumen del período, solo lectura */}
      <ClientConsumptionView client={client} plans={plans} consumptions={consumptions} feriados={feriados} />

      <ClientSimulator client={client} plan={plan} plans={plans} consumptions={consumptions} feriados={feriados} />
    </div>
  );
}
