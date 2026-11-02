import { formatCurrencyAR, formatDateAR, getSuggestedPrice } from '@/lib/business';
import { capFirst, monthDays, todayISO } from '@/lib/consumo';
import { contarDiasHabiles, contarEnTramos, contratoDelPeriodo, tramosDelContrato, viandasNecesarias } from '@/lib/habiles';
import type { Plan } from '@/types';

/**
 * Arriba de todo: el mes, sus días hábiles generales, el precio por vianda y el valor de referencia del mes completo.
 * Si los días de servicio del cliente son otros (inicio distinto, viajes, exclusiones), se muestran aparte.
 */
export default function ClientMonthCard({ plans, activePlan, feriados }: { plans: Plan[]; activePlan: Plan | null; feriados: Set<string> }) {
  const today = todayISO();
  const mes = today.slice(0, 7);
  const [y, m] = mes.split('-').map(Number);
  const days = monthDays(y, m - 1);
  const primero = days[0];
  const ultimo = days[days.length - 1];
  const label = capFirst(new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }));
  const mesNombre = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long' });

  // Días hábiles generales: lunes a viernes sin feriados
  const general = contarDiasHabiles(primero, ultimo, { feriados });

  // Días de servicio propios del cliente en este mes (su contrato, sus días y sus exclusiones)
  const contrato = contratoDelPeriodo(plans, mes, today);
  // Sus tramos de servicio (o todo su período), recortados al mes
  const tramosMes = contrato
    ? tramosDelContrato(contrato)
      .map(t => ({ desde: t.desde > primero ? t.desde : primero, hasta: t.hasta < ultimo ? t.hasta : ultimo }))
      .filter(t => t.desde <= t.hasta)
    : [];
  const propios = contrato
    ? contarEnTramos(tramosMes, { diasFijos: contrato.modalidad === 'fijo' ? contrato.diasFijos : undefined, feriados, excluidas: contrato.fechasExcluidas || [] })
    : null;
  const conTramos = contrato?.regimen === 'intervalos' && tramosMes.length > 0;
  const distintos = !!propios && propios.habiles !== general.habiles;

  const ref = activePlan || contrato || null;
  const precio = ref?.precioUnitario || getSuggestedPrice('retiro');
  const porDia = ref?.unidadesPorRetiro || 1;
  const valorMes = viandasNecesarias(general.habiles, porDia) * precio;

  return (
    <section className="glass-card border-2 border-primary/70 overflow-hidden" aria-label="Este mes">
      <div className="bg-primary/15 px-4 py-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">{label}</p>
        <p className="text-4xl font-bold tabular-nums leading-tight" data-testid="cliente-habiles">
          {general.habiles} <span className="text-xl font-semibold uppercase">días hábiles</span>
        </p>
        <p className="text-sm text-muted-foreground">
          Lunes a viernes{general.feriados.length > 0 ? `, sin ${general.feriados.length} feriado${general.feriados.length > 1 ? 's' : ''} (${general.feriados.map(d => d.slice(8)).join(', ')})` : ''}.
        </p>
      </div>
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted-foreground">Precio por vianda</span>
          <strong className="tabular-nums whitespace-nowrap shrink-0" data-testid="cliente-precio">{formatCurrencyAR(precio)}</strong>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted-foreground">Mes completo ({general.habiles} días{porDia > 1 ? ` × ${porDia}` : ''}), referencia</span>
          <span className="tabular-nums whitespace-nowrap shrink-0" data-testid="cliente-valor-mes">{formatCurrencyAR(valorMes)}</span>
        </div>
        <p className="text-xs text-muted-foreground">Valor de referencia, antes de aplicar saldo a favor. No es obligatorio contratar el mes completo.</p>
        {distintos && propios && (
          <p className="text-sm rounded-lg border-2 border-border px-3 py-2" data-testid="cliente-dias-propios">
            <strong>Tus días de servicio en {mesNombre}: {propios.habiles}</strong>
            {conTramos && ` · ${tramosMes.map(t => `${formatDateAR(t.desde).slice(0, 5)} al ${formatDateAR(t.hasta).slice(0, 5)}`).join(' y ')}`}
            {!conTramos && contrato && contrato.fechaInicio > primero && ` · desde el ${formatDateAR(contrato.fechaInicio)}`}
            {!conTramos && contrato && contrato.fechaFin < ultimo && ` · hasta el ${formatDateAR(contrato.fechaFin)}`}
            {propios.excluidas.length > 0 && ` · sin ${propios.excluidas.map(d => formatDateAR(d).slice(0, 5)).join(', ')}`}
          </p>
        )}
      </div>
    </section>
  );
}
