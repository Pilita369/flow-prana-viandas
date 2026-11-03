import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computePlanBalance, todayISO } from '@/lib/consumo';
import { prepararGuardado } from '@/hooks/useConsumptionSaver';
import { diferenciaDeTraslado } from '@/components/ContractPeriodParts';
import type { Consumption, Plan } from '@/types';

// Base en memoria (entorno de prueba): imita supabase-js. Nada de esto toca datos reales.
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = { consumptions: [], points: [], clients: [], respaldos: [], plans: [] };
const log: string[] = [];
let failNextWrite = false;
let updateNoMatch = false;

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: 'select' | 'update' | 'delete' | 'insert' = 'select';
  let payload: Row | Row[] | null = null;
  let single = false;
  const run = () => {
    if (op !== 'select') log.push(`${op}:${table}`);
    if (op !== 'select' && failNextWrite) { failNextWrite = false; return { data: null, error: { message: 'Sin conexión' } }; }
    const rows = db[table];
    const match = (r: Row) => filters.every(f => f(r));
    let data: Row[] = [];
    if (op === 'insert') {
      const list = Array.isArray(payload) ? payload : [payload!];
      list.forEach(r => rows.push({ created_at: new Date().toISOString(), ...r }));
      data = list;
    } else if (op === 'update') {
      if (updateNoMatch) { updateNoMatch = false; return { data: [], error: null }; } // la base no cambió ninguna fila
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
const { setDailyConsumption, applyCarryOver } = await import('@/lib/store');

// Caso de verificación (no son datos reales): octubre 21 compradas, +1 ajuste, 11 consumidas → 11 trasladadas a noviembre.
const C = 'k';
const LAB = ['01', '02', '05', '06', '08', '09', '26', '27', '28', '29', '30'];
const octubre = {
  id: 'oct', clientId: C, cantidadContratada: 21, ajusteInicialUsadas: 0, modalidad: 'fijo', precioUnitario: 11000, totalCalculado: 231000,
  fechaInicio: '2026-10-01', fechaFin: '2026-10-30', tipoEntrega: 'retiro', unidadesPorRetiro: 1, activo: false,
  diasFijos: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'], fechasExcluidas: [], ajusteManualFavor: 1,
} as Plan;
const noviembre = {
  ...octubre, id: 'nov', cantidadContratada: 8, totalCalculado: 88000, fechaInicio: '2026-11-02', fechaFin: '2026-11-30', activo: true,
  ajusteManualFavor: 0, saldoAnteriorAplicado: 11, saldoOrigenPlanId: 'oct',
} as Plan;
const cons = (fecha: string, cantidad: number, planId = 'oct'): Consumption => ({
  id: `c-${fecha}`, clientId: C, planId, fecha, cantidad, status: cantidad > 0 ? 'retirado' : 'no_retirado', tipo: 'manual', createdAt: '1',
});
const rowOf = (c: Consumption): Row => ({ id: c.id, client_id: c.clientId, plan_id: c.planId, fecha: c.fecha, cantidad: c.cantidad, status: c.status, tipo: 'manual', notas: null, nota_cliente: null, created_at: '1' });
const planRow = (p: Plan): Row => ({
  id: p.id, client_id: p.clientId, cantidad_contratada: p.cantidadContratada, precio_unitario: p.precioUnitario, total_calculado: p.totalCalculado,
  fecha_inicio: p.fechaInicio, fecha_fin: p.fechaFin, activo: p.activo, saldo_anterior_aplicado: p.saldoAnteriorAplicado || 0,
  saldo_origen_plan_id: p.saldoOrigenPlanId || null, observaciones: null, modalidad: 'fijo', unidades_por_retiro: 1,
});
let base: Consumption[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-03T15:00:00Z'));
  base = [...LAB.map(d => cons(`2026-10-${d}`, 1)), cons('2026-10-13', 0), cons('2026-11-02', 1, 'nov')];
  db.consumptions = base.map(rowOf);
  db.points = []; db.respaldos = [];
  db.clients = [{ id: C, nombre: 'K', apellido: 'T', telefono: '', puntos: 12, access_link: 'x', created_at: '' }];
  db.plans = [planRow(octubre), planRow(noviembre)];
  log.length = 0; failNextWrite = false; updateNoMatch = false;
});
afterEach(() => { vi.useRealTimers(); });

const plans = [octubre, noviembre];
const day13 = () => db.consumptions.filter(r => r.fecha === '2026-10-13');

describe('corrección de un consumo de un contrato cerrado', () => {
  it('el 13/10 se imputa a octubre (no al contrato vigente) y pide respaldo por estar cerrado', () => {
    const p = prepararGuardado({ clientId: C, plans, consumos: base, fecha: '2026-10-13', cantidad: 1, today: todayISO() })!;
    expect(p.planId).toBe('oct');
    expect(p.respaldo?.motivo).toContain('13/10/2026 0 → 1');
    // Un día del contrato vigente no necesita respaldo
    expect(prepararGuardado({ clientId: C, plans, consumos: base, fecha: '2026-11-03', cantidad: 1, today: todayISO() })!.respaldo).toBeUndefined();
  });

  it('0 → 1 reemplaza el total del día (no suma), respalda antes de escribir y repetir no duplica', async () => {
    const p = prepararGuardado({ clientId: C, plans, consumos: base, fecha: '2026-10-13', cantidad: 1, today: todayISO() })!;
    const rows = await setDailyConsumption(p);
    expect(rows).toHaveLength(1);
    expect(day13()).toHaveLength(1);
    expect(day13()[0]).toMatchObject({ id: 'c-2026-10-13', cantidad: 1, status: 'retirado', plan_id: 'oct' });
    expect(log.indexOf('insert:respaldos')).toBeLessThan(log.indexOf('update:consumptions'));
    expect(db.respaldos[0]).toMatchObject({ tabla: 'consumptions', registro_id: `${C}|2026-10-13` });
    expect((db.respaldos[0].datos as { antes: Row[] }).antes[0]).toMatchObject({ cantidad: 0 });
    // Reintento / doble toque: mismo valor, no cambia nada ni deja otro respaldo
    await setDailyConsumption(p);
    expect(day13()).toHaveLength(1);
    expect(day13()[0].cantidad).toBe(1);
    expect(db.respaldos).toHaveLength(1);
  });

  it('si la base no actualiza la fila, NO se informa como guardado', async () => {
    const p = prepararGuardado({ clientId: C, plans, consumos: base, fecha: '2026-10-13', cantidad: 1, today: todayISO() })!;
    updateNoMatch = true;
    await expect(setDailyConsumption(p)).rejects.toThrow('no actualizó');
    expect(day13()[0].cantidad).toBe(0);
  });

  it('si falla la escritura no cambia nada y el reintento deja un solo registro', async () => {
    const p = prepararGuardado({ clientId: C, plans, consumos: base, fecha: '2026-10-13', cantidad: 1, today: todayISO() })!;
    failNextWrite = true; // falla el respaldo: no se toca el consumo
    await expect(setDailyConsumption(p)).rejects.toThrow('respaldo');
    expect(day13()[0].cantidad).toBe(0);
    await setDailyConsumption(p);
    expect(day13()).toHaveLength(1);
    expect(day13()[0].cantidad).toBe(1);
  });

  it('un registro imputado a otro contrato pasa al de su fecha', async () => {
    db.consumptions = db.consumptions.map(r => (r.fecha === '2026-10-13' ? { ...r, plan_id: 'nov' } : r));
    const consumos = base.map(c => (c.fecha === '2026-10-13' ? { ...c, planId: 'nov' } : c));
    const p = prepararGuardado({ clientId: C, plans, consumos, fecha: '2026-10-13', cantidad: 0, today: todayISO() })!;
    expect(p).toMatchObject({ planId: 'oct', reimputar: true });
    await setDailyConsumption(p);
    expect(day13()[0]).toMatchObject({ plan_id: 'oct', cantidad: 0 });
  });
});

describe('conciliación del saldo trasladado', () => {
  it('antes: 21 − 11 + 1 = 11 a favor, igual a lo trasladado; nada que conciliar', () => {
    const b = computePlanBalance(octubre, base, plans, todayISO());
    expect(b).toMatchObject({ consumidas: 11, restante: 11, trasladado: 11, trasladadoDeMas: 0 });
    expect(diferenciaDeTraslado(octubre, plans, b)).toBeNull();
  });

  it('si el 13/10 pasa de 0 a 1: 21 − 12 + 1 = 10; detecta 1 trasladada de más, sin descontarla dos veces', () => {
    const corregido = base.map(c => (c.fecha === '2026-10-13' ? { ...c, cantidad: 1, status: 'retirado' as const } : c));
    const oct = computePlanBalance(octubre, corregido, plans, todayISO());
    expect(oct).toMatchObject({ consumidas: 12, restante: 10, trasladado: 11, trasladadoDeMas: 1, aFavorSinAplicar: 0 });
    expect(diferenciaDeTraslado(octubre, plans, oct)).toMatchObject({ sobrante: 10, trasladado: 11, diferencia: 1 });
    // Noviembre sigue con lo que recibió hasta conciliar: la corrección no le descuenta nada por su cuenta
    const nov = computePlanBalance(noviembre, corregido, plans, todayISO());
    expect(nov).toMatchObject({ compradas: 8, saldoAnteriorAplicado: 11, consumidas: 1, disponible: 18 });
  });

  it('al conciliar: respaldo previo, noviembre recibe 10, sin tocar compras, importe ni pagos, y queda anotado en ambos', async () => {
    const nuevo = await applyCarryOver({ fromPlan: octubre, toPlan: noviembre, cantidad: 10, reducirCompra: false, motivo: 'conciliación por corrección de consumos', respaldar: true });
    expect(nuevo).toMatchObject({ saldoAnteriorAplicado: 10, cantidadContratada: 8, totalCalculado: 88000 });
    expect(db.respaldos.map(r => r.registro_id).sort()).toEqual(['nov', 'oct']);
    expect(log.indexOf('insert:respaldos')).toBeLessThan(log.indexOf('update:plans'));
    expect(String(db.plans.find(p => p.id === 'nov')!.observaciones)).toContain('11 → 10');
    expect(String(db.plans.find(p => p.id === 'oct')!.observaciones)).toContain('conciliado: 11 → 10');
    expect(db.points).toHaveLength(0);
    // Con el traslado conciliado, octubre ya no muestra diferencia y noviembre baja 1 (una sola vez)
    const plans2 = [octubre, { ...noviembre, saldoAnteriorAplicado: 10 }];
    const corregido = base.map(c => (c.fecha === '2026-10-13' ? { ...c, cantidad: 1, status: 'retirado' as const } : c));
    expect(diferenciaDeTraslado(octubre, plans2, computePlanBalance(octubre, corregido, plans2, todayISO()))).toBeNull();
    expect(computePlanBalance(plans2[1], corregido, plans2, todayISO()).disponible).toBe(17);
  });
});
