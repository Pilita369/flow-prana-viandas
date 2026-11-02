import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { ChevronLeft, ChevronRight, Search, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent } from '@/components/ui/popover';
import ConsumptionCellEditor from '@/components/ConsumptionCellEditor';
import CarryOverDialog from '@/components/CarryOverDialog';
import { loadClients, loadPlans, loadConsumptionsOrThrow } from '@/lib/store';
import { formatDateAR, getBusinessConfig } from '@/lib/business';
import {
  computePlanBalance, dayTotal, getNextPlan, monthDays, parseISODate, planForMonth,
  resolvePlanForDate, todayISO, isConsumed, capFirst, type PlanBalance,
} from '@/lib/consumo';
import { cellKey as keyOf, useConsumptionSaver, useRefreshOnReturn } from '@/hooks/useConsumptionSaver';
import { ConsumptionLegend, DayMarks, SaveIndicator, dayStatusClass, dayTitle, dayToneClass, describeDay } from '@/components/ConsumptionShared';
import { toast } from 'sonner';
import type { Client, Consumption, Plan } from '@/types';

const DAY_ABBR = ['do', 'lu', 'ma', 'mi', 'ju', 'vi', 'sá'];

const fullName = (c: Client) => `${c.nombre} ${c.apellido}`.trim();

function shiftMonth(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function DailyConsumptions() {
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  const mesParam = params.get('mes');
  const mes = mesParam && /^\d{4}-\d{2}$/.test(mesParam) ? mesParam : today.slice(0, 7);
  const year = Number(mes.slice(0, 4));
  const month0 = Number(mes.slice(5, 7)) - 1;
  const days = useMemo(() => monthDays(year, month0), [year, month0]);
  const feriados = useMemo(() => new Set(getBusinessConfig().feriados), []);

  const [clients, setClients] = useState<Client[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [consumptions, setConsumptionsState] = useState<Consumption[]>([]);
  const consRef = useRef<Consumption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ clientId: string; fecha: string } | null>(null);
  const [carry, setCarry] = useState<{ client: Client; from: Plan; to: Plan; sobrante: number; conciliacion: boolean } | null>(null);

  const anchorRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const setConsumptions = (next: Consumption[]) => { consRef.current = next; setConsumptionsState(next); };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [cl, pl, co] = await Promise.all([loadClients(), loadPlans(), loadConsumptionsOrThrow()]);
      setClients(cl);
      setPlans(pl);
      setConsumptions(co);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /** Relectura silenciosa (sin pantalla de carga), al volver a la pestaña. */
  const refresh = useCallback(async () => {
    try {
      const [cl, pl, co] = await Promise.all([loadClients(), loadPlans(), loadConsumptionsOrThrow()]);
      setClients(cl);
      setPlans(pl);
      setConsumptions(co);
    } catch { /* se mantiene lo que ya estaba en pantalla */ }
  }, []);

  // ---------- índices ----------
  const plansByClient = useMemo(() => {
    const m = new Map<string, Plan[]>();
    for (const p of plans) m.set(p.clientId, [...(m.get(p.clientId) || []), p]);
    return m;
  }, [plans]);

  const consByClient = useMemo(() => {
    const m = new Map<string, Consumption[]>();
    for (const c of consumptions) m.set(c.clientId, [...(m.get(c.clientId) || []), c]);
    return m;
  }, [consumptions]);

  const rowsFor = useCallback((clientId: string, fecha: string) =>
    (consByClient.get(clientId) || []).filter(c => c.fecha === fecha), [consByClient]);

  const sortedClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients
      .slice()
      .sort((a, b) => `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`, 'es'))
      .filter(c => !q || `${c.nombre} ${c.apellido} ${c.alias || ''}`.toLowerCase().includes(q));
  }, [clients, search]);

  /** Contrato que corresponde a cada día del mes, por cliente. */
  const dayPlans = useMemo(() => {
    const m = new Map<string, Map<string, Plan | undefined>>();
    for (const c of clients) {
      const cp = plansByClient.get(c.id) || [];
      m.set(c.id, new Map(days.map(d => [d, resolvePlanForDate(cp, d)])));
    }
    return m;
  }, [clients, plansByClient, days]);

  interface Summary {
    plan?: Plan;
    balance?: PlanBalance;
    next?: Plan;
    consumidasMes: number;
    diasSinConsumo: number;
  }

  const summaries = useMemo(() => {
    const m = new Map<string, Summary>();
    for (const c of clients) {
      const cp = plansByClient.get(c.id) || [];
      const cons = consByClient.get(c.id) || [];
      const plan = planForMonth(cp, year, month0);
      const inMonth = cons.filter(x => x.fecha.startsWith(mes));
      m.set(c.id, {
        plan,
        balance: plan ? computePlanBalance(plan, cons, cp, today) : undefined,
        next: plan ? getNextPlan(cp, plan) : undefined,
        consumidasMes: inMonth.filter(x => isConsumed(x.status)).reduce((a, x) => a + (x.cantidad || 0), 0),
        diasSinConsumo: new Set(inMonth.filter(x => !isConsumed(x.status) || !x.cantidad).map(x => x.fecha)).size,
      });
    }
    return m;
  }, [clients, plansByClient, consByClient, year, month0, mes, today]);

  // ---------- guardado ----------
  const saver = useConsumptionSaver({
    onSaved: ({ clientId, fecha, cantidad, rows, latest, planId }) => {
      const next = [...consRef.current.filter(c => !(c.clientId === clientId && c.fecha === fecha)), ...rows];
      setConsumptions(next);
      if (!latest || cantidad === null || cantidad <= 0) return;
      const client = clients.find(c => c.id === clientId);
      const cp = plansByClient.get(clientId) || [];
      const plan = plans.find(p => p.id === (rows[0]?.planId || planId));
      if (client && plan) {
        const b = computePlanBalance(plan, next.filter(c => c.clientId === clientId), cp, today);
        if (b.disponible < 0) {
          toast.warning(`${fullName(client)}: supera el saldo del contrato por ${-b.disponible} vianda(s). No se modificaron pagos ni contratos.`);
        }
      }
    },
    onFailed: ({ clientId, fecha }) => {
      const client = clients.find(c => c.id === clientId);
      toast.error(`No se guardó ${client ? fullName(client) : 'el consumo'} (${formatDateAR(fecha)}). Tocá la casilla para reintentar.`);
    },
  });
  const { cells } = saver;

  const save = useCallback((client: Client, fecha: string, cantidad: number | null, notas?: string | null) => {
    const existing = consRef.current.filter(c => c.clientId === client.id && c.fecha === fecha);
    const planId = existing[0]?.planId || resolvePlanForDate(plansByClient.get(client.id) || [], fecha)?.id;
    if (!planId) { toast.error(`${fullName(client)} no tiene contrato cargado`); return; }
    saver.save({ clientId: client.id, planId, fecha, cantidad, notas });
  }, [plansByClient, saver]);

  const retry = (client: Client, fecha: string) => saver.retry(client.id, fecha);

  useRefreshOnReturn(() => { void refresh(); }, !loading && !saver.busy);

  // ---------- scroll al día de hoy ----------
  // Posición de "hoy" medida dentro de la tabla (no desde el borde de la página), dejando dos días antes a la vista
  const todayScrollLeft = () => {
    const sc = scrollRef.current;
    const el = sc?.querySelector<HTMLElement>('[data-today="true"]');
    if (!sc || !el) return 0;
    const nameCol = sc.querySelector<HTMLElement>('[data-namecol="true"]');
    const left = el.getBoundingClientRect().left - sc.getBoundingClientRect().left + sc.scrollLeft;
    return Math.max(left - (nameCol?.offsetWidth || 0) - el.offsetWidth * 2, 0);
  };

  useEffect(() => {
    if (loading || !scrollRef.current) return;
    scrollRef.current.scrollLeft = todayScrollLeft();
  }, [loading, mes]);

  // ---------- navegación con teclado ----------
  const focusCell = (r: number, c: number) => {
    scrollRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${r}:${c}"]`)?.focus();
  };

  const onCellKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, client: Client, fecha: string, r: number, c: number, savedTotal: number | null, hasNotes: boolean) => {
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); save(client, fecha, Number(e.key)); return; }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      if (savedTotal === null) return;
      if (hasNotes) { anchorRef.current = e.currentTarget; setEditing({ clientId: client.id, fecha }); return; }
      save(client, fecha, null);
      return;
    }
    const moves: Record<string, [number, number]> = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
    if (moves[e.key]) { e.preventDefault(); focusCell(r + moves[e.key][0], c + moves[e.key][1]); }
  };

  // ---------- render ----------
  const monthLabel = capFirst(new Date(year, month0, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }));
  const editingClient = editing ? clients.find(c => c.id === editing.clientId) : undefined;

  const disponibleFor = (clientId: string, fecha: string): number | null => {
    const rows = rowsFor(clientId, fecha);
    const cp = plansByClient.get(clientId) || [];
    const plan = plans.find(p => p.id === rows[0]?.planId) || dayPlans.get(clientId)?.get(fecha);
    if (!plan) return null;
    return computePlanBalance(plan, consByClient.get(clientId) || [], cp, today).disponible;
  };

  return (
    <div>
      <div className="page-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Consumos</h1>
          <p className="page-subtitle">Tocá una casilla para registrar cuántas viandas consumió cada cliente ese día.</p>
        </div>
        <SaveIndicator saving={saver.savingCount} errors={saver.errorCount} lastSavedAt={saver.lastSavedAt} onRetryAll={saver.retryAll} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => setParams({ mes: shiftMonth(mes, -1) })} aria-label="Mes anterior">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="min-w-[9.5rem] text-center font-semibold">{monthLabel}</span>
          <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => setParams({ mes: shiftMonth(mes, 1) })} aria-label="Mes siguiente">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <Button variant={mes === today.slice(0, 7) ? 'secondary' : 'outline'} className="h-10" onClick={() => {
          if (mes === today.slice(0, 7)) {
            scrollRef.current?.scrollTo({ left: todayScrollLeft(), behavior: 'smooth' });
          } else setParams({});
        }}>Hoy</Button>
        <div className="relative flex-1 min-w-[10rem] max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente" className="h-10 pl-9" />
        </div>
      </div>

      <ConsumptionLegend />

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando...</div>
      ) : loadError ? (
        <div className="glass-card p-8 text-center space-y-3">
          <p className="text-destructive">No se pudieron cargar los consumos: {loadError}</p>
          <Button variant="outline" onClick={() => void load()}><RotateCw className="w-4 h-4 mr-2" />Reintentar</Button>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="glass-card overflow-auto max-h-[70vh] overscroll-x-contain">
            <table className="border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th data-namecol="true" className="sticky left-0 top-0 z-30 bg-card border-b-2 border-r-2 border-border text-left px-2 py-2 font-semibold w-[8.5rem] min-w-[8.5rem] md:w-[13rem] md:min-w-[13rem]">
                    Cliente
                  </th>
                  {days.map(d => {
                    const date = parseISODate(d);
                    const isToday = d === today;
                    const weekend = date.getDay() === 0 || date.getDay() === 6;
                    const feriado = feriados.has(d);
                    return (
                      <th
                        key={d}
                        data-today={isToday ? 'true' : undefined}
                        title={feriado ? 'Feriado' : undefined}
                        className={`sticky top-0 z-20 border-b-2 border-r border-border px-0.5 py-1 font-normal text-center min-w-[2.9rem]
                          ${isToday ? 'bg-secondary text-secondary-foreground' : feriado ? 'bg-amber-100 text-amber-900' : 'bg-card'}
                          ${weekend && !isToday ? 'text-muted-foreground/70' : ''}`}
                      >
                        <div className="text-[11px] uppercase leading-none">{DAY_ABBR[date.getDay()]}</div>
                        <div className="text-sm font-semibold leading-tight tabular-nums">{date.getDate()}</div>
                        <div className="text-[10px] font-semibold leading-none h-2.5">{isToday ? 'hoy' : feriado ? 'feriado' : ''}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedClients.length === 0 && (
                  <tr><td colSpan={days.length + 1} className="p-6 text-center text-muted-foreground">No hay clientes que coincidan.</td></tr>
                )}
                {sortedClients.map((client, r) => {
                  const cp = plansByClient.get(client.id) || [];
                  const sum = summaries.get(client.id);
                  const disp = sum?.balance?.disponible;
                  return (
                    <tr key={client.id}>
                      <th scope="row" className="sticky left-0 z-10 bg-card border-b border-r-2 border-border text-left px-2 py-1 font-normal w-[8.5rem] min-w-[8.5rem] md:w-[13rem] md:min-w-[13rem]">
                        <Link to={`/admin/clientes/${client.id}`} className="block text-sm font-medium leading-tight truncate hover:underline">
                          {fullName(client)}
                        </Link>
                        <span className={`text-xs leading-tight ${disp !== undefined && disp < 0 ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                          {cp.length === 0 ? 'Sin contrato' : disp === undefined ? 'Sin contrato este mes' : `Saldo ${disp}`}
                          {sum?.plan && <span className="hidden md:inline"> · hab. {sum.plan.unidadesPorRetiro || 1}</span>}
                        </span>
                      </th>
                      {days.map((d, c) => {
                        const rows = rowsFor(client.id, d);
                        const st = cells[keyOf(client.id, d)];
                        const plan = dayPlans.get(client.id)?.get(d);
                        const info = describeDay({ fecha: d, rows, plan, feriados, today, pending: st });
                        const { savedTotal, shown, future } = info;
                        const disabled = future || cp.length === 0;
                        const isToday = d === today;

                        return (
                          <td key={d} className={`border-b border-r border-border p-0.5 text-center ${isToday ? 'bg-secondary/10' : ''}`}>
                            <button
                              type="button"
                              data-cell={`${r}:${c}`}
                              disabled={disabled}
                              onClick={e => { anchorRef.current = e.currentTarget; setEditing({ clientId: client.id, fecha: d }); }}
                              onKeyDown={e => onCellKeyDown(e, client, d, r, c, savedTotal, info.hasNotes)}
                              aria-label={`${fullName(client)} ${formatDateAR(d)}: ${shown === null ? 'sin registro' : shown}`}
                              title={dayTitle(info, rows.length)}
                              className={`relative h-11 w-11 rounded-md text-sm tabular-nums transition-colors outline-none
                                focus-visible:ring-2 focus-visible:ring-ring
                                ${disabled ? 'cursor-default opacity-40' : 'hover:ring-1 hover:ring-primary/40'}
                                ${dayToneClass(info)}
                                ${dayStatusClass(st)}`}
                            >
                              {future ? '' : shown === null ? '–' : shown}
                              <DayMarks d={info} st={st} />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Popover open={!!editing} onOpenChange={open => { if (!open) setEditing(null); }}>
            <PopoverPrimitive.Anchor virtualRef={anchorRef as React.RefObject<HTMLElement>} />
            <PopoverContent className="w-[19rem] p-3" collisionPadding={12} onOpenAutoFocus={e => e.preventDefault()}>
              {editing && editingClient && (() => {
                const rows = rowsFor(editing.clientId, editing.fecha);
                const plan = plans.find(p => p.id === rows[0]?.planId) || dayPlans.get(editing.clientId)?.get(editing.fecha);
                return (
                  <ConsumptionCellEditor
                    clientName={fullName(editingClient)}
                    fecha={editing.fecha}
                    rows={rows}
                    savedTotal={dayTotal(rows)}
                    pending={cells[keyOf(editing.clientId, editing.fecha)]}
                    habitual={plan?.unidadesPorRetiro || 1}
                    disponible={disponibleFor(editing.clientId, editing.fecha)}
                    feriado={feriados.has(editing.fecha)}
                    excluida={!!plan?.fechasExcluidas?.includes(editing.fecha)}
                    onSave={(cant, notas) => save(editingClient, editing.fecha, cant, notas)}
                    onRetry={() => retry(editingClient, editing.fecha)}
                    onClose={() => { setEditing(null); anchorRef.current?.focus(); }}
                  />
                );
              })()}
            </PopoverContent>
          </Popover>

          <h2 className="text-lg font-semibold mt-8 mb-3">Resumen de {monthLabel}</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sortedClients.map(client => {
              const s = summaries.get(client.id);
              if (!s || (!s.plan && s.consumidasMes === 0)) return null;
              return (
                <SummaryCard
                  key={client.id}
                  client={client}
                  summary={s}
                  onApply={(conciliacion) => s.plan && s.next && s.balance && setCarry({
                    client, from: s.plan, to: s.next, conciliacion,
                    sobrante: Math.max(s.balance.restante, 0),
                  })}
                />
              );
            })}
          </div>
        </>
      )}

      {carry && (
        <CarryOverDialog
          open={!!carry}
          onOpenChange={open => { if (!open) setCarry(null); }}
          clientName={fullName(carry.client)}
          fromPlan={carry.from}
          toPlan={carry.to}
          sobrante={carry.sobrante}
          conciliacion={carry.conciliacion}
          onApplied={async () => setPlans(await loadPlans())}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------

function SummaryCard({ client, summary, onApply }: {
  client: Client;
  summary: { plan?: Plan; balance?: PlanBalance; next?: Plan; consumidasMes: number; diasSinConsumo: number };
  onApply: (conciliacion: boolean) => void;
}) {
  const { plan, balance: b, next, consumidasMes } = summary;
  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/admin/clientes/${client.id}`} className="font-semibold text-sm hover:underline">{fullName(client)}</Link>
        {plan && <span className="text-[11px] text-muted-foreground text-right">Contrato {formatDateAR(plan.fechaInicio)} – {formatDateAR(plan.fechaFin)}</span>}
      </div>

      {plan && b ? (
        <div className="grid grid-cols-5 gap-1.5 text-center">
          <Stat label="Compradas" value={b.compradas} />
          <Stat label="Trasladado" value={b.saldoAnteriorAplicado} />
          <Stat label="Ajustes" value={b.ajusteManual} />
          <Stat label="Consumidas" value={consumidasMes} hint="en el mes" tone="green" />
          <Stat label="Disponible" value={b.disponible} tone={b.disponible < 0 ? 'red' : 'blue'} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Sin contrato en este mes · {consumidasMes} consumidas</p>
      )}

      {b && b.consumidas !== consumidasMes && (
        <p className="text-[11px] text-muted-foreground">Consumidas en todo el contrato: {b.consumidas}{b.ajusteInicial ? ` (+${b.ajusteInicial} de ajuste inicial)` : ''}.</p>
      )}

      {b && b.excedido > 0 && (
        <p className="text-xs rounded bg-destructive/10 text-destructive px-2 py-1.5">
          Se registraron {b.excedido} vianda(s) más de las disponibles. No se modificaron pagos ni contratos: revisalo con el cliente.
        </p>
      )}

      {b && b.cerrado && b.aFavorSinAplicar > 0 && (
        <div className="text-xs rounded bg-amber-500/10 text-amber-800 px-2 py-1.5 space-y-1.5">
          <p><strong>Quedan {b.aFavorSinAplicar} vianda(s) a favor</strong> sin aplicar. El saldo se conserva para el próximo contrato.</p>
          {next ? (
            <Button size="sm" variant="outline" className="h-8" onClick={() => onApply(false)}>Aplicar al contrato siguiente</Button>
          ) : (
            <p>Todavía no hay contrato siguiente: se ofrecerá al <Link className="underline" to={`/admin/clientes/${client.id}`}>renovar desde la ficha</Link>.</p>
          )}
        </div>
      )}

      {b && b.trasladado > 0 && b.trasladadoDeMas === 0 && (
        <p className="text-[11px] text-muted-foreground">{b.trasladado} vianda(s) ya trasladadas al contrato siguiente.</p>
      )}

      {b && b.trasladadoDeMas > 0 && next && (
        <div className="text-xs rounded bg-destructive/10 text-destructive px-2 py-1.5 space-y-1.5">
          <p>Se trasladaron {b.trasladado} vianda(s) al contrato siguiente, pero después de las correcciones sobran {Math.max(b.restante, 0)}.</p>
          <Button size="sm" variant="outline" className="h-8" onClick={() => onApply(true)}>Conciliar saldo</Button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: 'green' | 'blue' | 'red' }) {
  const toneCls = tone === 'green' ? 'bg-green-500/10 text-green-700' : tone === 'blue' ? 'bg-blue-500/10 text-blue-700' : tone === 'red' ? 'bg-destructive/10 text-destructive' : 'bg-muted/50';
  return (
    <div className={`rounded-lg border border-border p-1.5 ${toneCls}`}>
      <p className="text-[11px] leading-tight text-muted-foreground">{label}</p>
      <p className="text-base font-bold tabular-nums">{value}</p>
      {hint && <p className="text-[10px] leading-none text-muted-foreground">{hint}</p>}
    </div>
  );
}
