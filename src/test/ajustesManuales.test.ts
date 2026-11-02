import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computePlanBalance, splitCarryOver } from '@/lib/consumo';
import type { Consumption, Plan } from '@/types';

// Base en memoria que imita supabase-js, incluido el "embed" de credit_notes al leer contratos.
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = { clients: [], plans: [], credit_notes: [] };
let seq = 0;

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  let payload: Row | null = null;
  let single = false;
  let embed = false;
  const withEmbed = (r: Row): Row => (table === 'plans' && embed
    ? { ...r, credit_notes: db.credit_notes.filter(n => n.plan_id === r.id).map(n => ({ cantidad: n.cantidad, tipo: n.tipo, anulado: n.anulado })) }
    : { ...r, historial: r.historial ? JSON.parse(JSON.stringify(r.historial)) : r.historial });
  const run = () => {
    const match = (r: Row) => filters.every(f => f(r));
    let data: Row[] = [];
    if (op === 'insert') {
      const r = { id: `n${++seq}`, fecha: new Date().toISOString(), anulado: false, ...payload } as Row;
      db[table].push(r);
      data = [r];
    } else if (op === 'update') {
      db[table].filter(match).forEach(r => Object.assign(r, payload));
      data = db[table].filter(match);
    } else if (op === 'delete') {
      db[table] = db[table].filter(r => !match(r));
    } else {
      data = db[table].filter(match);
    }
    const out = data.map(withEmbed);
    return { data: single ? out[0] ?? null : out, error: null };
  };
  const b: Record<string, unknown> = {
    select: (cols?: string) => { if (cols && cols.includes('credit_notes(')) embed = true; return b; },
    order: () => b,
    eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return b; },
    insert: (p: Row) => { op = 'insert'; payload = p; return b; },
    update: (p: Row) => { op = 'update'; payload = p; return b; },
    delete: () => { op = 'delete'; return b; },
    single: () => { single = true; return b; },
    maybeSingle: () => { single = true; return b; },
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  };
  return b;
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => query(t) } }));
const store = await import('@/lib/store');

const planRow = (id: string, inicio: string, fin: string, extra: Row = {}): Row => ({
  id, client_id: 'c1', cantidad_contratada: 20, ajuste_inicial_usadas: 0, modalidad: 'fijo', precio_unitario: 1000,
  total_calculado: 20000, fecha_inicio: inicio, fecha_fin: fin, unidades_por_retiro: 1, activo: true, ...extra,
});

const plan = (o: Partial<Plan> = {}): Plan => ({
  id: 'p1', clientId: 'c1', cantidadContratada: 20, ajusteInicialUsadas: 0, modalidad: 'fijo', precioUnitario: 0,
  totalCalculado: 0, fechaInicio: '2026-10-01', fechaFin: '2026-10-31', tipoEntrega: 'retiro', unidadesPorRetiro: 1, activo: true, ...o,
} as Plan);
const consumo = (cantidad: number, planId = 'p1'): Consumption => ({
  id: `x${++seq}`, clientId: 'c1', planId, fecha: '2026-10-10', status: 'retirado', tipo: 'manual', cantidad, createdAt: '',
} as Consumption);

const planActual = async (id: string) => (await store.loadPlans()).find(p => p.id === id)!;

beforeEach(() => {
  db.clients = [{ id: 'c1' }, { id: 'c2' }];
  db.plans = [planRow('p-oct', '2026-10-01', '2026-10-31', { activo: false }), planRow('p-nov', '2026-11-01', '2026-11-30')];
  db.credit_notes = [];
  localStorage.clear();
});

describe('cálculo con ajustes manuales', () => {
  it('suman al disponible del contrato y no se cuentan dos veces al trasladar el saldo', () => {
    const oct = plan({ ajusteManualFavor: 3 });
    const cons = Array.from({ length: 21 }, () => consumo(1));
    const b = computePlanBalance(oct, cons, [oct], '2026-11-01');
    expect(b.ajusteManual).toBe(3);
    expect(b.disponible).toBe(2); // 20 + 3 − 21
    expect(b.aFavorSinAplicar).toBe(2);

    // Renovación: aplica las 2 que sobran (incluyen el ajuste) y compra 18
    expect(splitCarryOver(20, b.aFavorSinAplicar)).toEqual({ aplicar: 2, comprar: 18 });
    const nov = plan({ id: 'p2', fechaInicio: '2026-11-01', fechaFin: '2026-11-30', cantidadContratada: 18, saldoAnteriorAplicado: 2, saldoOrigenPlanId: 'p1' });
    expect(computePlanBalance(oct, cons, [oct, nov], '2026-11-01').disponible).toBe(0);
    expect(computePlanBalance(nov, [], [oct, nov], '2026-11-01').disponible).toBe(20);
  });
});

describe('ajustes manuales en Supabase', () => {
  it('agregar viandas a favor al contrato vigente las suma a su saldo, con historial', async () => {
    const n = await store.saveCreditNote({ clientId: 'c1', tipo: 'vianda_favor', descripcion: 'No se entregó', cantidad: 3, planId: 'p-nov' });
    expect(n).toMatchObject({ cantidad: 3, planId: 'p-nov', aplicado: true, anulado: false });
    expect(n.historial).toHaveLength(1);
    expect((await planActual('p-nov')).ajusteManualFavor).toBe(3);
    expect((await planActual('p-oct')).ajusteManualFavor).toBe(0);
  });

  it('corregir cambia el saldo y deja el cambio en el historial', async () => {
    const n = await store.saveCreditNote({ clientId: 'c1', tipo: 'vianda_favor', descripcion: '', cantidad: 3, planId: 'p-nov' });
    const c = await store.updateManualCredit(n.id, { cantidad: 2 }, 'se cargó 3 en vez de 2');
    expect(c.cantidad).toBe(2);
    expect(c.historial).toHaveLength(2);
    expect(c.historial[1].detalle).toContain('cantidad 3 → 2');
    expect(c.historial[1].detalle).toContain('se cargó 3 en vez de 2');
    expect((await planActual('p-nov')).ajusteManualFavor).toBe(2);
    expect(db.credit_notes).toHaveLength(1); // corrige el mismo registro, no crea otro
  });

  it('anular deja de sumar pero conserva el ajuste y su historial', async () => {
    const n = await store.saveCreditNote({ clientId: 'c1', tipo: 'vianda_favor', descripcion: 'error', cantidad: 4, planId: 'p-nov' });
    const a = await store.anularCreditNote(n.id, 'cargado por error');
    expect(a).toMatchObject({ anulado: true, anuladoMotivo: 'cargado por error' });
    expect(a.historial.map(h => h.accion)).toEqual(['creado', 'anulado']);
    expect((await planActual('p-nov')).ajusteManualFavor).toBe(0);
    expect(await store.getCreditNotes('c1')).toHaveLength(1);
    await expect(store.updateManualCredit(n.id, { cantidad: 5 })).rejects.toThrow();
  });

  it('un ajuste pendiente no suma hasta asignarlo, y asignarlo dos veces no lo duplica', async () => {
    const n = await store.saveCreditNote({ clientId: 'c1', tipo: 'vianda_favor', descripcion: 'para el próximo mes', cantidad: 2 });
    expect(store.isPendingManualCredit(n)).toBe(true);
    expect((await planActual('p-nov')).ajusteManualFavor).toBe(0);

    expect(await store.assignPendingManualCredits([n.id], 'p-nov', 'sumado al renovar')).toBe(2);
    expect(await store.assignPendingManualCredits([n.id], 'p-nov', 'sumado al renovar')).toBe(0);
    expect((await planActual('p-nov')).ajusteManualFavor).toBe(2);
    const [guardado] = await store.getCreditNotes('c1');
    expect(guardado.historial.map(h => h.accion)).toEqual(['creado', 'asignado']);
  });

  it('mover un ajuste de contrato lo resta de uno y lo suma al otro', async () => {
    const n = await store.saveCreditNote({ clientId: 'c1', tipo: 'vianda_favor', descripcion: '', cantidad: 1, planId: 'p-oct' });
    await store.updateManualCredit(n.id, { planId: 'p-nov' }, 'iba en noviembre');
    expect((await planActual('p-oct')).ajusteManualFavor).toBe(0);
    expect((await planActual('p-nov')).ajusteManualFavor).toBe(1);
  });

  it('rechaza cantidades inválidas y contratos de otro cliente', async () => {
    await expect(store.saveCreditNote({ clientId: 'c1', tipo: 'vianda_favor', descripcion: '', cantidad: 0, planId: 'p-nov' })).rejects.toThrow();
    await expect(store.saveCreditNote({ clientId: 'c2', tipo: 'vianda_favor', descripcion: '', cantidad: 1, planId: 'p-nov' })).rejects.toThrow();
    const n = await store.saveCreditNote({ clientId: 'c1', tipo: 'vianda_favor', descripcion: '', cantidad: 1, planId: 'p-nov' });
    await expect(store.updateManualCredit(n.id, { cantidad: 0 })).rejects.toThrow();
    expect(db.credit_notes).toHaveLength(1);
  });

  it('los ajustes en dinero no cambian el saldo de viandas', async () => {
    await store.saveCreditNote({ clientId: 'c1', tipo: 'descuento', descripcion: 'Descuento', monto: 500 });
    expect((await planActual('p-nov')).ajusteManualFavor).toBe(0);
  });
});
