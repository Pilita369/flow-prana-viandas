import { capFirst, monthDays, planForMonth } from '@/lib/consumo';
import { contarDiasHabiles, isExcluidaCliente } from '@/lib/habiles';
import type { Plan } from '@/types';

/** Mes seleccionado en el calendario y sus días hábiles (feriados y exclusiones del cliente incluidos). */
export default function MonthWorkdaysCard({ mes, plans, feriados }: { mes: string; plans: Plan[]; feriados: Set<string> }) {
  const [y, m] = mes.split('-').map(Number);
  const days = monthDays(y, m - 1);
  const planMes = planForMonth(plans, y, m - 1);
  const h = contarDiasHabiles(days[0], days[days.length - 1], {
    diasFijos: planMes?.modalidad === 'fijo' ? planMes.diasFijos : undefined,
    feriados,
    excluidas: days.filter(d => isExcluidaCliente(plans, d)),
  });
  const label = capFirst(new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }));
  return (
    <div className="glass-card border-2 border-primary/70 bg-primary/15 px-4 sm:px-5 py-4">
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">{label}</p>
      <p className="text-3xl sm:text-4xl font-bold tabular-nums leading-tight" data-testid="habiles-mes">
        {h.habiles} <span className="text-xl sm:text-2xl font-semibold uppercase">días hábiles</span>
      </p>
      <p className="text-sm text-muted-foreground mt-1">
        {h.diasDelPeriodo} de lunes a viernes
        {h.feriados.length > 0 && ` · ${h.feriados.length} feriado${h.feriados.length > 1 ? 's' : ''} (${h.feriados.map(d => d.slice(8)).join(', ')})`}
        {h.excluidas.length > 0 && ` · ${h.excluidas.length} excluido${h.excluidas.length > 1 ? 's' : ''} (${h.excluidas.map(d => d.slice(8)).join(', ')})`}
      </p>
    </div>
  );
}
