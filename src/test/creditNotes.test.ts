import { describe, it, expect, vi, beforeEach } from 'vitest';

// Base en memoria con lo mínimo de supabase-js que usan los ajustes.
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = { clients: [], credit_notes: [] };
let seq = 0;

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  let payload: Row | Row[] | null = null;
  let onConflict = '';
  let single = false;
  const run = () => {
    const match = (r: Row) => filters.every(f => f(r));
    let data: Row[] = [];
    if (op === 'insert' || op === 'upsert') {
      const list = (Array.isArray(payload) ? payload : [payload!]).map(r => ({ id: `n${++seq}`, fecha: new Date().toISOString(), ...r }) as Row);
      for (const r of list) {
        if (op === 'upsert' && db[table].some(x => x[onConflict] === r[onConflict])) continue; // ignoreDuplicates
        if (db[table].some(x => x.legacy_id && x.legacy_id === r.legacy_id)) return { data: null, error: { message: 'duplicate legacy_id' } };
        db[table].push(r);
        data.push(r);
      }
    } else if (op === 'update') {
      db[table].filter(match).forEach(r => Object.assign(r, payload));
    } else if (op === 'delete') {
      db[table] = db[table].filter(r => !match(r));
    } else {
      data = db[table].filter(match);
    }
    return { data: single ? data[0] ?? null : data.map(r => ({ ...r })), error: null };
  };
  const b: Record<string, unknown> = {
    select: () => b, order: () => b,
    eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return b; },
    insert: (p: Row) => { op = 'insert'; payload = p; return b; },
    upsert: (p: Row[], o: { onConflict: string }) => { op = 'upsert'; payload = p; onConflict = o.onConflict; return b; },
    update: (p: Row) => { op = 'update'; payload = p; return b; },
    delete: () => { op = 'delete'; return b; },
    single: () => { single = true; return b; },
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  };
  return b;
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => query(t) } }));

const LOCAL = [
  { id: 'abc123', clientId: 'c1', tipo: 'vianda_favor', descripcion: 'Vianda de regalo', cantidad: 1, fecha: '2026-10-05T15:00:00.000Z', aplicado: false },
  { id: 'def456', clientId: 'c1', tipo: 'saldo_envio', descripcion: 'Saldo envío', monto: 1500, fecha: '2026-10-10T15:00:00.000Z', aplicado: true },
  { id: 'old999', clientId: 'cliente-borrado', tipo: 'otro', descripcion: 'De un cliente que ya no existe', fecha: '2026-09-01T15:00:00.000Z', aplicado: false },
];

async function freshStore() {
  vi.resetModules();
  return import('@/lib/store');
}

beforeEach(() => {
  db.clients = [{ id: 'c1' }];
  db.credit_notes = [];
  localStorage.clear();
});

describe('ajustes a favor en Supabase', () => {
  it('copia los ajustes del navegador conservando sus valores', async () => {
    localStorage.setItem('mp_credit_notes', JSON.stringify(LOCAL));
    const store = await freshStore();
    const notes = await store.getCreditNotes('c1');
    expect(notes).toHaveLength(2);
    expect(notes.find(n => n.descripcion === 'Vianda de regalo')).toMatchObject({ cantidad: 1, aplicado: false, fecha: '2026-10-05T15:00:00.000Z' });
    expect(notes.find(n => n.descripcion === 'Saldo envío')).toMatchObject({ monto: 1500, aplicado: true });
    // la copia local queda como respaldo (incluido el del cliente borrado) y deja de usarse
    expect(localStorage.getItem('mp_credit_notes')).toBeNull();
    expect(JSON.parse(localStorage.getItem('mp_credit_notes_respaldo')!)).toHaveLength(3);
  });

  it('no duplica si se copia otra vez (otra pestaña, otro dispositivo o recarga)', async () => {
    localStorage.setItem('mp_credit_notes', JSON.stringify(LOCAL));
    await (await freshStore()).getCreditNotes('c1');
    localStorage.setItem('mp_credit_notes', JSON.stringify(LOCAL));
    await (await freshStore()).getCreditNotes('c1');
    localStorage.setItem('mp_credit_notes', JSON.stringify(LOCAL));
    const notes = await (await freshStore()).getCreditNotes('c1');
    expect(notes).toHaveLength(2);
    expect(db.credit_notes).toHaveLength(2);
  });

  it('una copia repetida no pisa un ajuste marcado como aplicado en la base', async () => {
    localStorage.setItem('mp_credit_notes', JSON.stringify(LOCAL));
    const store = await freshStore();
    const [nota] = (await store.getCreditNotes('c1')).filter(n => !n.aplicado);
    await store.setCreditNoteAplicado(nota.id, true);
    localStorage.setItem('mp_credit_notes', JSON.stringify(LOCAL));
    const notes = await (await freshStore()).getCreditNotes('c1');
    expect(notes.every(n => n.aplicado)).toBe(true);
  });

  it('alta, marcar aplicado y borrar desde la base', async () => {
    const store = await freshStore();
    const nota = await store.saveCreditNote({ clientId: 'c1', tipo: 'descuento', descripcion: 'Descuento', monto: 200 });
    expect(await store.getCreditNotes('c1')).toHaveLength(1);
    await store.setCreditNoteAplicado(nota.id, true);
    expect((await store.getCreditNotes('c1'))[0].aplicado).toBe(true);
    await store.deleteCreditNote(nota.id);
    expect(await store.getCreditNotes('c1')).toHaveLength(0);
  });
});
