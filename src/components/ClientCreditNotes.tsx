import { useEffect, useState } from 'react';
import {
  getCreditNotes, saveCreditNote, setCreditNoteAplicado, updateManualCredit, anularCreditNote, isPendingManualCredit,
} from '@/lib/store';
import { computePlanBalance, formatTimestampDateAR, todayISO } from '@/lib/consumo';
import { formatCurrencyAR, formatDateAR } from '@/lib/business';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Minus, Check, Pencil, Ban, History, X, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Consumption, CreditNote, CreditNoteTipo, Plan } from '@/types';

const TIPOS_DINERO: { value: CreditNoteTipo; label: string }[] = [
  { value: 'saldo_envio', label: 'Saldo de envío' },
  { value: 'descuento', label: 'Descuento' },
  { value: 'atencion', label: 'Atención / regalo' },
  { value: 'otro', label: 'Otro' },
];
const tipoLabel = (tipo: CreditNoteTipo) =>
  tipo === 'vianda_favor' ? 'Vianda a favor' : TIPOS_DINERO.find(t => t.value === tipo)?.label ?? tipo;

const PENDIENTE = '__pendiente__';
const plural = (n: number) => `${n} vianda${n === 1 ? '' : 's'}`;
const rango = (p: Plan) => `${formatDateAR(p.fechaInicio)} a ${formatDateAR(p.fechaFin)}`;
const selectCls = 'w-full h-11 rounded-md border border-input bg-background px-3 text-base';

interface Props {
  clientId: string;
  /** Contratos del cliente. */
  plans: Plan[];
  activePlan: Plan | null;
  consumptions: Consumption[];
  /** Avisa a la ficha cuando cambian los ajustes (para releer contratos y saldos). */
  onChange?: (notes: CreditNote[]) => void;
}

export default function ClientCreditNotes({ clientId, plans, activePlan, consumptions, onChange }: Props) {
  const [notes, setNotes] = useState<CreditNote[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'none' | 'viandas' | 'dinero'>('none');
  const [editing, setEditing] = useState<string | null>(null);
  const [anulando, setAnulando] = useState<string | null>(null);

  const load = async (notify = false) => {
    try {
      const list = await getCreditNotes(clientId);
      setNotes(list);
      setLoadError(null);
      if (notify) onChange?.(list);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'No se pudieron cargar los ajustes');
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [clientId]);

  const run = async (action: () => Promise<unknown>, okMsg?: string) => {
    if (busy) return false;
    setBusy(true);
    try {
      await action();
      if (okMsg) toast.success(okMsg);
      await load(true);
      return true;
    } catch (e) {
      toast.error(`No se guardó el cambio: ${e instanceof Error ? e.message : 'error de conexión'}`);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const planById = (id?: string) => plans.find(p => p.id === id);
  const today = todayISO();

  const viandas = notes.filter(n => n.tipo === 'vianda_favor');
  const dinero = notes.filter(n => n.tipo !== 'vianda_favor');
  const vigentes = viandas.filter(n => !n.anulado);
  const sum = (list: CreditNote[]) => list.reduce((a, n) => a + (n.cantidad || 0), 0);

  const enContratoVigente = activePlan ? sum(vigentes.filter(n => n.planId === activePlan.id)) : 0;
  const pendientes = sum(vigentes.filter(isPendingManualCredit));
  const yaAplicados = sum(vigentes.filter(n => (n.planId && n.planId !== activePlan?.id) || (!n.planId && n.aplicado)));
  const trasladado = activePlan?.saldoAnteriorAplicado || 0;
  const origen = planById(activePlan?.saldoOrigenPlanId);
  const balance = activePlan ? computePlanBalance(activePlan, consumptions, plans, today) : null;

  // Contratos para elegir: el vigente primero, después del más nuevo al más viejo
  const planOptions = [...plans].sort((a, b) =>
    a.id === activePlan?.id ? -1 : b.id === activePlan?.id ? 1 : b.fechaInicio.localeCompare(a.fechaInicio));

  return (
    <div className="glass-card p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">Ajustes y saldo a favor</h3>
          <p className="text-sm text-muted-foreground">Viandas a favor cargadas a mano. No modifican consumos ni pagos.</p>
        </div>
        {mode === 'none' && (
          <div className="flex flex-wrap gap-2">
            <Button className="h-11" onClick={() => setMode('viandas')}><Plus className="w-4 h-4 mr-1.5" />Viandas a favor</Button>
            <Button variant="outline" className="h-11" onClick={() => setMode('dinero')}>Ajuste en $</Button>
          </div>
        )}
      </div>

      {/* Resumen: de dónde viene cada vianda a favor */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <SummaryTile label="Saldo trasladado" value={trasladado}
          hint={trasladado > 0 && origen ? `del contrato ${rango(origen)}` : 'de meses anteriores'} />
        <SummaryTile label="Ajustes manuales" value={enContratoVigente} tone="ok"
          hint={activePlan ? 'suman al contrato vigente' : 'sin contrato vigente'} />
        <SummaryTile label="Pendientes de aplicar" value={pendientes} tone={pendientes > 0 ? 'warn' : undefined}
          hint="se suman al renovar" />
        <SummaryTile label="Ya aplicados" value={yaAplicados} hint="en contratos anteriores" />
      </div>
      {balance && (
        <p className="text-sm">
          Disponible del contrato vigente: <strong className="text-base">{balance.disponible}</strong>
          <span className="text-muted-foreground"> = {balance.compradas} compradas + {balance.saldoAnteriorAplicado} trasladadas + {balance.ajusteManual} de ajustes − {balance.consumidas + balance.ajusteInicial} usadas{balance.trasladado > 0 ? ` − ${balance.trasladado} pasadas al contrato siguiente` : ''}</span>
        </p>
      )}

      {mode === 'viandas' && (
        <ViandasForm
          title="Agregar viandas a favor"
          planOptions={planOptions}
          activePlanId={activePlan?.id}
          initial={{ cantidad: 1, descripcion: '', planId: activePlan?.id ?? PENDIENTE }}
          busy={busy}
          onCancel={() => setMode('none')}
          onSubmit={async v => {
            const ok = await run(() => saveCreditNote({
              clientId, tipo: 'vianda_favor', descripcion: v.descripcion, cantidad: v.cantidad,
              planId: v.planId === PENDIENTE ? undefined : v.planId,
            }), `${plural(v.cantidad)} a favor registradas`);
            if (ok) setMode('none');
          }}
        />
      )}

      {mode === 'dinero' && (
        <DineroForm busy={busy} onCancel={() => setMode('none')} onSubmit={async v => {
          const ok = await run(() => saveCreditNote({ clientId, tipo: v.tipo, descripcion: v.descripcion, monto: v.monto }), 'Ajuste registrado');
          if (ok) setMode('none');
        }} />
      )}

      {/* Viandas a favor */}
      {viandas.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Viandas a favor</h4>
          {viandas.map(n => {
            const p = planById(n.planId);
            let estado: { label: string; cls: string };
            if (n.anulado) estado = { label: 'Anulado', cls: 'bg-muted text-muted-foreground' };
            else if (isPendingManualCredit(n)) estado = { label: 'Pendiente de aplicar', cls: 'bg-warning/20 text-foreground' };
            else if (p && p.id === activePlan?.id) estado = { label: `Suma al contrato vigente (${rango(p)})`, cls: 'bg-primary/20 text-foreground' };
            else if (p) estado = { label: `Ya aplicado en contrato ${rango(p)}`, cls: 'bg-muted text-foreground' };
            else estado = { label: 'Aplicado (registro anterior, sin contrato)', cls: 'bg-muted text-foreground' };

            return (
              <div key={n.id} className={`rounded-lg border-2 p-3 space-y-2 ${n.anulado ? 'border-border opacity-70' : isPendingManualCredit(n) ? 'border-warning/60' : 'border-border'}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-xl font-bold tabular-nums ${n.anulado ? 'line-through' : ''}`}>+{n.cantidad || 0}</span>
                      <span className="text-sm">{(n.cantidad || 0) === 1 ? 'vianda' : 'viandas'}</span>
                      <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${estado.cls}`}>{estado.label}</span>
                    </div>
                    <p className="text-sm">{n.descripcion || <span className="text-muted-foreground">Sin motivo</span>}</p>
                    <p className="text-xs text-muted-foreground">
                      Cargado el {formatTimestampDateAR(n.fecha)}
                      {n.anulado && n.anuladoAt && ` · anulado el ${formatTimestampDateAR(n.anuladoAt)}`}
                      {n.anulado && n.anuladoMotivo && `: ${n.anuladoMotivo}`}
                    </p>
                  </div>
                  {!n.anulado && editing !== n.id && anulando !== n.id && (
                    <div className="flex flex-wrap gap-1.5">
                      {isPendingManualCredit(n) && activePlan && (
                        <Button size="sm" className="h-10" disabled={busy}
                          onClick={() => run(() => updateManualCredit(n.id, { planId: activePlan.id }, 'sumado al contrato vigente'), 'Sumado al contrato vigente')}>
                          <Check className="w-4 h-4 mr-1" />Sumar al vigente
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-10" onClick={() => { setEditing(n.id); setAnulando(null); }}>
                        <Pencil className="w-4 h-4 mr-1" />Corregir
                      </Button>
                      <Button size="sm" variant="outline" className="h-10 text-destructive" onClick={() => { setAnulando(n.id); setEditing(null); }}>
                        <Ban className="w-4 h-4 mr-1" />Anular
                      </Button>
                    </div>
                  )}
                </div>

                {p && !n.anulado && p.id !== activePlan?.id && (
                  <p className="text-xs text-muted-foreground">
                    Estas viandas ya forman parte del saldo de ese contrato; lo que sobró de ahí se traslada con el saldo, así que no se cuentan dos veces.
                  </p>
                )}

                {editing === n.id && (
                  <ViandasForm
                    title="Corregir ajuste"
                    planOptions={planOptions}
                    activePlanId={activePlan?.id}
                    initial={{ cantidad: n.cantidad || 1, descripcion: n.descripcion || '', planId: n.planId ?? PENDIENTE }}
                    withReason
                    busy={busy}
                    onCancel={() => setEditing(null)}
                    onSubmit={async v => {
                      const ok = await run(() => updateManualCredit(n.id, {
                        cantidad: v.cantidad, descripcion: v.descripcion, planId: v.planId === PENDIENTE ? null : v.planId,
                      }, v.reason), 'Ajuste corregido');
                      if (ok) setEditing(null);
                    }}
                  />
                )}

                {anulando === n.id && (
                  <AnularForm busy={busy} onCancel={() => setAnulando(null)} onSubmit={async motivo => {
                    const ok = await run(() => anularCreditNote(n.id, motivo), 'Ajuste anulado: ya no suma al saldo');
                    if (ok) setAnulando(null);
                  }} />
                )}

                <Historial note={n} />
              </div>
            );
          })}
        </div>
      )}

      {/* Ajustes en dinero (no cambian el saldo de viandas) */}
      {dinero.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ajustes en dinero</h4>
          {dinero.map(n => (
            <div key={n.id} className={`rounded-lg border-2 border-border p-3 space-y-2 ${n.anulado || n.aplicado ? 'opacity-75' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{tipoLabel(n.tipo)}</Badge>
                    {n.monto ? <span className={`font-bold ${n.anulado ? 'line-through' : ''}`}>{formatCurrencyAR(n.monto)}</span> : null}
                    {n.anulado ? <Badge variant="secondary">Anulado</Badge> : n.aplicado ? <Badge variant="secondary">Aplicado</Badge> : <Badge className="bg-warning/25 text-foreground hover:bg-warning/25">Pendiente</Badge>}
                  </div>
                  <p className="text-sm">{n.descripcion}</p>
                  <p className="text-xs text-muted-foreground">{formatTimestampDateAR(n.fecha)}</p>
                </div>
                {!n.anulado && anulando !== n.id && (
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" className="h-10" disabled={busy} onClick={() => run(() => setCreditNoteAplicado(n.id, !n.aplicado))}>
                      {n.aplicado ? <><Undo2 className="w-4 h-4 mr-1" />Marcar pendiente</> : <><Check className="w-4 h-4 mr-1" />Marcar aplicado</>}
                    </Button>
                    <Button size="sm" variant="outline" className="h-10 text-destructive" onClick={() => setAnulando(n.id)}>
                      <Ban className="w-4 h-4 mr-1" />Anular
                    </Button>
                  </div>
                )}
              </div>
              {anulando === n.id && (
                <AnularForm busy={busy} onCancel={() => setAnulando(null)} onSubmit={async motivo => {
                  const ok = await run(() => anularCreditNote(n.id, motivo), 'Ajuste anulado');
                  if (ok) setAnulando(null);
                }} />
              )}
              <Historial note={n} />
            </div>
          ))}
        </div>
      )}

      {loadError && <p className="text-sm text-destructive">No se pudieron cargar los ajustes: {loadError}</p>}
      {notes.length === 0 && mode === 'none' && !loadError && (
        <p className="text-sm text-muted-foreground">Sin ajustes manuales registrados.</p>
      )}
    </div>
  );
}

function SummaryTile({ label, value, hint, tone }: { label: string; value: number; hint: string; tone?: 'ok' | 'warn' }) {
  const cls = tone === 'ok' ? 'border-primary/60 bg-primary/10' : tone === 'warn' ? 'border-warning/70 bg-warning/10' : 'border-border bg-muted/40';
  return (
    <div className={`rounded-lg border-2 p-3 ${cls}`}>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-2xl font-bold tabular-nums leading-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

interface ViandasValues { cantidad: number; descripcion: string; planId: string; reason?: string }

function ViandasForm({ title, planOptions, activePlanId, initial, withReason, busy, onCancel, onSubmit }: {
  title: string;
  planOptions: Plan[];
  activePlanId?: string;
  initial: ViandasValues;
  withReason?: boolean;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: ViandasValues) => void;
}) {
  const [v, setV] = useState<ViandasValues>({ ...initial, reason: '' });
  const valid = Number.isInteger(v.cantidad) && v.cantidad > 0;
  return (
    <div className="rounded-lg border-2 border-primary/50 bg-muted/30 p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold">{title}</p>
        <Button size="icon" variant="ghost" className="h-10 w-10" onClick={onCancel} aria-label="Cancelar"><X className="w-5 h-5" /></Button>
      </div>
      <div className="grid gap-3 md:grid-cols-[auto_1fr]">
        <div>
          <Label className="text-sm">Cantidad de viandas</Label>
          <div className="flex items-center gap-2 mt-1">
            <Button type="button" variant="outline" size="icon" className="h-11 w-11" aria-label="Restar"
              onClick={() => setV(x => ({ ...x, cantidad: Math.max((x.cantidad || 1) - 1, 1) }))}><Minus className="w-4 h-4" /></Button>
            <Input type="number" inputMode="numeric" min={1} step={1} aria-label="Cantidad de viandas a favor"
              value={Number.isNaN(v.cantidad) ? '' : v.cantidad}
              onChange={e => setV(x => ({ ...x, cantidad: Math.floor(Number(e.target.value)) }))}
              className="h-11 w-20 text-center text-lg font-bold" />
            <Button type="button" variant="outline" size="icon" className="h-11 w-11" aria-label="Sumar"
              onClick={() => setV(x => ({ ...x, cantidad: (x.cantidad || 0) + 1 }))}><Plus className="w-4 h-4" /></Button>
          </div>
        </div>
        <div>
          <Label className="text-sm">Suma a</Label>
          <select className={`${selectCls} mt-1`} value={v.planId} onChange={e => setV(x => ({ ...x, planId: e.target.value }))} aria-label="Contrato al que suma">
            {planOptions.map(p => (
              <option key={p.id} value={p.id}>{p.id === activePlanId ? 'Contrato vigente' : 'Contrato'} {rango(p)}</option>
            ))}
            <option value={PENDIENTE}>Pendiente: sumar en la próxima renovación</option>
          </select>
        </div>
      </div>
      <div>
        <Label className="text-sm">Motivo (opcional)</Label>
        <Input value={v.descripcion} onChange={e => setV(x => ({ ...x, descripcion: e.target.value }))}
          placeholder="Ej: vianda que no se entregó el 12/11" className="h-11 mt-1" />
      </div>
      {withReason && (
        <div>
          <Label className="text-sm">Por qué se corrige (opcional, queda en el historial)</Label>
          <Input value={v.reason} onChange={e => setV(x => ({ ...x, reason: e.target.value }))} placeholder="Ej: se cargó 3 en vez de 2" className="h-11 mt-1" />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button className="h-11" disabled={busy || !valid} onClick={() => onSubmit(v)}>Guardar</Button>
        <Button variant="outline" className="h-11" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}

function DineroForm({ busy, onCancel, onSubmit }: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: { tipo: CreditNoteTipo; descripcion: string; monto?: number }) => void;
}) {
  const [tipo, setTipo] = useState<CreditNoteTipo>('saldo_envio');
  const [monto, setMonto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  return (
    <div className="rounded-lg border-2 border-border bg-muted/30 p-3 sm:p-4 space-y-3">
      <p className="font-semibold">Ajuste en dinero</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-sm">Tipo</Label>
          <select className={`${selectCls} mt-1`} value={tipo} onChange={e => setTipo(e.target.value as CreditNoteTipo)}>
            {TIPOS_DINERO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-sm">Monto ($)</Label>
          <Input type="number" min={0} value={monto} onChange={e => setMonto(e.target.value)} className="h-11 mt-1" placeholder="0" />
        </div>
      </div>
      <div>
        <Label className="text-sm">Descripción</Label>
        <Input value={descripcion} onChange={e => setDescripcion(e.target.value)} className="h-11 mt-1" placeholder="Ej: saldo de envío de la semana del 31/03" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button className="h-11" disabled={busy || !descripcion.trim()}
          onClick={() => onSubmit({ tipo, descripcion: descripcion.trim(), monto: monto ? Number(monto) : undefined })}>Guardar ajuste</Button>
        <Button variant="outline" className="h-11" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}

function AnularForm({ busy, onCancel, onSubmit }: { busy: boolean; onCancel: () => void; onSubmit: (motivo: string) => void }) {
  const [motivo, setMotivo] = useState('');
  return (
    <div className="rounded-lg border-2 border-destructive/50 bg-destructive/10 p-3 space-y-2">
      <p className="text-sm">Al anularlo deja de sumar al saldo. Queda visible, con su historial.</p>
      <Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo de la anulación (opcional)" className="h-11" />
      <div className="flex flex-wrap gap-2">
        <Button variant="destructive" className="h-11" disabled={busy} onClick={() => onSubmit(motivo)}>Anular ajuste</Button>
        <Button variant="outline" className="h-11" onClick={onCancel}>No anular</Button>
      </div>
    </div>
  );
}

function Historial({ note }: { note: CreditNote }) {
  if (note.historial.length === 0) return null;
  return (
    <details className="group text-sm">
      <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
        <History className="w-4 h-4" />Historial ({note.historial.length})
      </summary>
      <ol className="mt-2 space-y-1 border-l-2 border-border pl-3">
        {note.historial.map((h, i) => (
          <li key={i}>
            <span className="text-muted-foreground">{formatTimestampDateAR(h.fecha)}</span>{' '}
            <strong className="capitalize">{h.accion}</strong>: {h.detalle}
          </li>
        ))}
      </ol>
    </details>
  );
}
