import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';

// Base en memoria que imita supabase-js (misma que usan las otras pruebas).
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = { consumptions: [], points: [], clients: [] };
let seq = 0;

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: 'select' | 'update' | 'delete' | 'insert' = 'select';
  let payload: Row | Row[] | null = null;
  let single = false;
  const run = () => {
    const match = (r: Row) => filters.every(f => f(r));
    let data: Row[] = [];
    if (op === 'insert') {
      const list = Array.isArray(payload) ? payload : [payload!];
      list.forEach(r => db[table].push({ created_at: `t${++seq}`, ...r }));
      data = list;
    } else if (op === 'update') {
      db[table].filter(match).forEach(r => Object.assign(r, payload));
      data = db[table].filter(match);
    } else if (op === 'delete') {
      data = db[table].filter(match);
      db[table] = db[table].filter(r => !match(r));
    } else {
      data = db[table].filter(match);
    }
    return { data: single ? (data[0] ?? null) : data.map(r => ({ ...r })), error: null };
  };
  const b: Record<string, unknown> = {
    select: () => b, order: () => b, range: () => b,
    eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return b; },
    in: (k: string, vs: unknown[]) => { filters.push(r => vs.includes(r[k])); return b; },
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

const store = await import('@/lib/store');
const { default: ClientConsumptionCalendar } = await import('@/components/ClientConsumptionCalendar');
import type { Client, Consumption, Plan } from '@/types';

const client = { id: 'c1', nombre: 'Ana', apellido: 'Pérez', telefono: '', puntos: 0, accessLink: 'x', createdAt: '' } as unknown as Client;
const plan = {
  id: 'p-nov', clientId: 'c1', cantidadContratada: 20, ajusteInicialUsadas: 0, modalidad: 'fijo', precioUnitario: 0,
  totalCalculado: 0, fechaInicio: '2026-11-01', fechaFin: '2026-11-30', tipoEntrega: 'retiro', unidadesPorRetiro: 1, activo: true,
  diasFijos: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
} as unknown as Plan;

/** Envuelve el calendario como lo hace la ficha: guarda la lista que le devuelve. */
function Ficha({ initial }: { initial: Consumption[] }) {
  const [cons, setCons] = useState(initial);
  (globalThis as { __setFicha?: (c: Consumption[]) => void }).__setFicha = setCons;
  return (
    <MemoryRouter>
      <ClientConsumptionCalendar client={client} plans={[plan]} consumptions={cons} onConsumptionsChange={setCons} />
    </MemoryRouter>
  );
}

const rowsDelDia = (fecha: string) => db.consumptions.filter(r => r.client_id === 'c1' && r.fecha === fecha);
const consumidas = () => db.consumptions.filter(r => r.status === 'retirado').reduce((a, r) => a + (r.cantidad as number), 0);
const dayButton = (label: RegExp) => screen.getByRole('button', { name: label });

async function elegir(dia: RegExp, cantidad: string) {
  fireEvent.click(dayButton(dia));
  const editor = await screen.findByRole('dialog');
  const opcion = within(editor).getByRole('button', { name: new RegExp(`^${cantidad}(habitual)?$`) });
  fireEvent.click(opcion);
}

beforeAll(() => {
  // Radix (popover) usa ResizeObserver, que jsdom no trae.
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-10T15:00:00Z')); // 10/11/2026 12:00 en Argentina
});

beforeEach(() => {
  db.clients = [{ id: 'c1', nombre: 'Ana', apellido: 'Pérez', puntos: 1 }];
  db.points = [];
  // Un consumo ya cargado desde la planilla general: 1 vianda el 03/11
  db.consumptions = [{ id: 'r1', client_id: 'c1', plan_id: 'p-nov', fecha: '2026-11-03', status: 'retirado', tipo: 'manual', cantidad: 1, notas: null, created_at: 't0' }];
});

describe('ficha del cliente y planilla general sobre los mismos registros', () => {
  it('la ficha muestra lo cargado en la planilla y al cambiar 1 → 2 actualiza el mismo registro', async () => {
    render(<Ficha initial={await store.loadClientConsumptionsOrThrow('c1')} />);
    expect(dayButton(/^03\/11\/2026: 1 viandas/)).toBeInTheDocument();

    await elegir(/^03\/11\/2026/, '2');
    await waitFor(() => expect(dayButton(/^03\/11\/2026: 2 viandas/)).toBeInTheDocument());
    expect(rowsDelDia('2026-11-03')).toHaveLength(1);
    expect(rowsDelDia('2026-11-03')[0].id).toBe('r1');
    expect(consumidas()).toBe(2);
    expect(db.clients[0].puntos).toBe(2); // solo +1, no +2
  });

  it('lo corregido en la planilla (2 → 0) se ve en la ficha y devuelve las viandas', async () => {
    render(<Ficha initial={await store.loadClientConsumptionsOrThrow('c1')} />);
    await elegir(/^03\/11\/2026/, '2');
    await waitFor(() => expect(consumidas()).toBe(2));

    // La planilla general guarda con la misma función
    await store.setDailyConsumption({ clientId: 'c1', planId: 'p-nov', fecha: '2026-11-03', cantidad: 0 });
    const recargado = await store.loadClientConsumptionsOrThrow('c1');
    act(() => (globalThis as { __setFicha?: (c: Consumption[]) => void }).__setFicha!(recargado));

    expect(dayButton(/^03\/11\/2026: sin consumo/)).toBeInTheDocument();
    expect(rowsDelDia('2026-11-03')).toHaveLength(1);
    expect(consumidas()).toBe(0);
    expect(db.clients[0].puntos).toBe(0);
  });

  it('registrar 0 en un día sin registro crea un solo registro "sin consumo"; repetir no duplica', async () => {
    render(<Ficha initial={await store.loadClientConsumptionsOrThrow('c1')} />);
    expect(dayButton(/^04\/11\/2026: sin registro/)).toBeInTheDocument();
    await elegir(/^04\/11\/2026/, '0');
    await waitFor(() => expect(dayButton(/^04\/11\/2026: sin consumo/)).toBeInTheDocument());
    await elegir(/^04\/11\/2026/, '0');
    await waitFor(() => expect(rowsDelDia('2026-11-04')).toHaveLength(1));
    expect(rowsDelDia('2026-11-04')[0]).toMatchObject({ cantidad: 0, status: 'no_retirado', plan_id: 'p-nov' });
  });

  it('los días futuros no se pueden cargar', async () => {
    render(<Ficha initial={[]} />);
    expect(dayButton(/^11\/11\/2026/)).toBeDisabled();
    expect(dayButton(/^10\/11\/2026/)).not.toBeDisabled();
  });
});
