import { describe, it, expect, vi, beforeEach } from 'vitest';

// Base en memoria que imita las llamadas de supabase-js usadas por el store.
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = { consumptions: [], points: [], clients: [] };
let failNextWrite = false;

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: 'select' | 'update' | 'delete' | 'insert' = 'select';
  let payload: Row | Row[] | null = null;
  let single = false;

  const run = () => {
    if (op !== 'select' && failNextWrite) {
      failNextWrite = false;
      return { data: null, error: { message: 'Sin conexión' } };
    }
    const rows = db[table];
    const match = (r: Row) => filters.every(f => f(r));
    let data: Row[] = [];
    if (op === 'insert') {
      const list = Array.isArray(payload) ? payload : [payload!];
      list.forEach(r => rows.push({ created_at: new Date().toISOString(), ...r }));
      data = list;
    } else if (op === 'update') {
      rows.filter(match).forEach(r => Object.assign(r, payload));
      data = rows.filter(match);
    } else if (op === 'delete') {
      data = rows.filter(match);
      db[table] = rows.filter(r => !match(r));
    } else {
      data = rows.filter(match);
    }
    return { data: single ? (data[0] ?? null) : data.map(r => ({ ...r })), error: null };
  };

  const b: Record<string, unknown> = {
    select: () => b,
    eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return b; },
    in: (k: string, vs: unknown[]) => { filters.push(r => vs.includes(r[k])); return b; },
    order: () => b,
    range: () => b,
    update: (p: Row) => { op = 'update'; payload = p; return b; },
    insert: (p: Row | Row[]) => { op = 'insert'; payload = p; return b; },
    delete: () => { op = 'delete'; return b; },
    maybeSingle: () => { single = true; return b; },
    single: () => { single = true; return b; },
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  };
  return b;
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => query(t) } }));

const { setDailyConsumption } = await import('@/lib/store');

const CLIENT = 'c1';
const save = (cantidad: number | null, fecha = '2026-11-02', notas?: string | null) =>
  setDailyConsumption({ clientId: CLIENT, planId: 'p1', fecha, cantidad, notas });
const rowsOf = (fecha = '2026-11-02') => db.consumptions.filter(r => r.client_id === CLIENT && r.fecha === fecha);
const points = () => db.clients[0].puntos as number;
const consumed = () => db.consumptions
  .filter(r => r.status === 'retirado')
  .reduce((a, r) => a + (r.cantidad as number), 0);

beforeEach(() => {
  db.consumptions = [];
  db.points = [];
  db.clients = [{ id: CLIENT, nombre: 'Ana', apellido: 'P', telefono: '', puntos: 0, access_link: 'x', created_at: '' }];
  failNextWrite = false;
});

describe('setDailyConsumption (con base simulada)', () => {
  it('registra 0, 1, 2 y 5 viandas en distintos días', async () => {
    await save(0, '2026-11-02');
    await save(1, '2026-11-03');
    await save(2, '2026-11-04');
    await save(5, '2026-11-05');
    expect(db.consumptions).toHaveLength(4);
    expect(rowsOf('2026-11-02')[0]).toMatchObject({ cantidad: 0, status: 'no_retirado' });
    expect(consumed()).toBe(8);
    expect(points()).toBe(8);
  });

  it('cambiar de 1 a 2 descuenta solo una vianda más y no crea otro registro', async () => {
    await save(1);
    await save(2);
    expect(rowsOf()).toHaveLength(1);
    expect(consumed()).toBe(2);
    expect(db.points.map(p => p.puntos)).toEqual([1, 1]);
  });

  it('corregir de 2 a 0 devuelve las dos unidades', async () => {
    await save(2);
    await save(0);
    expect(rowsOf()).toHaveLength(1);
    expect(consumed()).toBe(0);
    expect(points()).toBe(0);
  });

  it('guardar varias veces el mismo valor (o recargar) no duplica', async () => {
    await save(2);
    await save(2);
    await save(2);
    expect(rowsOf()).toHaveLength(1);
    expect(consumed()).toBe(2);
    expect(db.points).toHaveLength(1);
  });

  it('unifica duplicados existentes conservando notas y corrigiendo puntos', async () => {
    db.consumptions.push(
      { id: 'a', client_id: CLIENT, plan_id: 'p1', fecha: '2026-11-02', status: 'retirado', tipo: 'manual', cantidad: 4, notas: 'retiró la hija', created_at: '1' },
      { id: 'b', client_id: CLIENT, plan_id: 'p1', fecha: '2026-11-02', status: 'retirado', tipo: 'manual', cantidad: 4, notas: null, created_at: '2' },
    );
    db.clients[0].puntos = 8;
    await save(4);
    expect(rowsOf()).toHaveLength(1);
    expect(rowsOf()[0]).toMatchObject({ id: 'a', cantidad: 4, notas: 'retiró la hija' });
    expect(points()).toBe(4);
  });

  it('si falla la escritura informa el error y el reintento deja el dato bien', async () => {
    failNextWrite = true;
    await expect(save(2)).rejects.toThrow('Sin conexión');
    expect(rowsOf()).toHaveLength(0);
    await save(2);
    expect(rowsOf()).toHaveLength(1);
    expect(consumed()).toBe(2);
  });

  it('quitar el registro deja el día sin registro', async () => {
    await save(3);
    await save(null);
    expect(rowsOf()).toHaveLength(0);
    expect(points()).toBe(0);
  });
});
