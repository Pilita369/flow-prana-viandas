import { describe, it, expect } from 'vitest';
import type { Consumption, Plan } from '@/types';
import {
  planDailySave,
  dayTotal,
  computePlanBalance,
  splitCarryOver,
  resolvePlanForDate,
  planForMonth,
  monthDays,
} from '@/lib/consumo';

const plan = (over: Partial<Plan> = {}): Plan => ({
  id: 'p1',
  clientId: 'c1',
  cantidadContratada: 21,
  ajusteInicialUsadas: 0,
  modalidad: 'fijo',
  precioUnitario: 1000,
  totalCalculado: 21000,
  fechaInicio: '2026-10-01',
  fechaFin: '2026-10-31',
  tipoEntrega: 'retiro',
  unidadesPorRetiro: 1,
  activo: true,
  ...over,
});

let seq = 0;
const row = (over: Partial<Consumption> = {}): Consumption => ({
  id: `r${++seq}`,
  clientId: 'c1',
  planId: 'p1',
  fecha: '2026-10-05',
  status: 'retirado',
  tipo: 'manual',
  cantidad: 1,
  createdAt: `2026-10-05T10:00:0${seq % 10}Z`,
  ...over,
});

/** Simula la base: aplica las operaciones sobre la lista de registros del día. */
function apply(rows: Consumption[], cantidad: number | null, notas?: string | null) {
  const ops = planDailySave(rows, cantidad, notas);
  let next = rows.filter(r => !ops.deleteIds.includes(r.id));
  if (ops.update) {
    next = next.map(r => (r.id === ops.update!.id ? { ...r, ...ops.update!, notas: ops.update!.notas ?? undefined } : r));
  }
  if (ops.insert) next = [...next, row({ ...ops.insert, notas: ops.insert.notas ?? undefined })];
  return { rows: next, ops };
}

describe('carga de una casilla', () => {
  it('1. registra 0, 1, 2 y más viandas en un día', () => {
    for (const n of [0, 1, 2, 5]) {
      const { rows, ops } = apply([], n);
      expect(rows).toHaveLength(1);
      expect(dayTotal(rows)).toBe(n);
      expect(ops.delta).toBe(n);
      expect(rows[0].status).toBe(n > 0 ? 'retirado' : 'no_retirado');
    }
  });

  it('distingue sin registro (null) de cero confirmado', () => {
    expect(dayTotal([])).toBeNull();
    expect(dayTotal(apply([], 0).rows)).toBe(0);
  });

  it('2. cambiar de 1 a 2 descuenta solo una vianda adicional', () => {
    const first = apply([], 1);
    const second = apply(first.rows, 2);
    expect(second.rows).toHaveLength(1);
    expect(second.ops.delta).toBe(1);
    expect(dayTotal(second.rows)).toBe(2);
  });

  it('3. corregir de 2 a 0 recupera las dos unidades', () => {
    const two = apply([], 2);
    const zero = apply(two.rows, 0);
    expect(zero.ops.delta).toBe(-2);
    expect(dayTotal(zero.rows)).toBe(0);
    expect(zero.rows).toHaveLength(1);
  });

  it('4. repetir el mismo guardado no duplica ni cambia nada', () => {
    const once = apply([], 2);
    const twice = apply(once.rows, 2);
    expect(twice.rows).toHaveLength(1);
    expect(twice.ops.delta).toBe(0);
    expect(twice.ops.update).toBeUndefined();
    expect(twice.ops.insert).toBeUndefined();
  });

  it('unifica registros duplicados del mismo día conservando las notas', () => {
    const dup = [row({ cantidad: 4, notas: 'retiró la hija' }), row({ cantidad: 4 })];
    expect(dayTotal(dup)).toBe(8);
    const { rows, ops } = apply(dup, 4);
    expect(rows).toHaveLength(1);
    expect(ops.delta).toBe(-4);
    expect(rows[0].notas).toBe('retiró la hija');
  });

  it('quitar el registro elimina todos los del día y devuelve las unidades', () => {
    const { rows, ops } = apply([row({ cantidad: 3 })], null);
    expect(rows).toHaveLength(0);
    expect(ops.delta).toBe(-3);
  });

  it('rechaza cantidades negativas o con decimales', () => {
    expect(() => planDailySave([], -1)).toThrow();
    expect(() => planDailySave([], 1.5)).toThrow();
  });
});

describe('saldos', () => {
  it('calcula el saldo con cantidades reales y permite superar lo habitual', () => {
    const p = plan({ unidadesPorRetiro: 1 });
    const cons = [row({ cantidad: 2 }), row({ cantidad: 0, status: 'no_retirado' }), row({ cantidad: 1 })];
    const b = computePlanBalance(p, cons, [p], '2026-10-10');
    expect(b.consumidas).toBe(3);
    expect(b.disponible).toBe(18);
    expect(b.excedido).toBe(0);
  });

  it('marca exceso cuando se consume más que el saldo, sin topearlo', () => {
    const p = plan({ cantidadContratada: 2 });
    const b = computePlanBalance(p, [row({ cantidad: 3 })], [p], '2026-10-10');
    expect(b.disponible).toBe(-1);
    expect(b.excedido).toBe(1);
  });

  it('5. ejemplo: compró 21, consumió 19 → 2 a favor; necesita 20 → aplica 2 y compra 18', () => {
    const oct = plan();
    const cons = Array.from({ length: 19 }, () => row({ cantidad: 1 }));
    const b = computePlanBalance(oct, cons, [oct], '2026-11-01');
    expect(b.cerrado).toBe(true);
    expect(b.aFavorSinAplicar).toBe(2);
    expect(splitCarryOver(20, b.aFavorSinAplicar)).toEqual({ aplicar: 2, comprar: 18 });

    // Al aplicarlo al contrato siguiente, no se puede volver a aplicar
    const nov = plan({ id: 'p2', fechaInicio: '2026-11-01', fechaFin: '2026-11-30', cantidadContratada: 18, saldoAnteriorAplicado: 2, saldoOrigenPlanId: 'p1' });
    const after = computePlanBalance(oct, cons, [oct, nov], '2026-11-01');
    expect(after.trasladado).toBe(2);
    expect(after.aFavorSinAplicar).toBe(0);
    expect(after.disponible).toBe(0);
    expect(computePlanBalance(nov, [], [oct, nov], '2026-11-01').disponible).toBe(20);
  });

  it('detecta saldo trasladado de más si se corrige un consumo después del cierre', () => {
    const oct = plan();
    const nov = plan({ id: 'p2', fechaInicio: '2026-11-01', fechaFin: '2026-11-30', saldoAnteriorAplicado: 2, saldoOrigenPlanId: 'p1' });
    const cons = Array.from({ length: 20 }, () => row({ cantidad: 1 })); // se corrigió: consumió 20, no 19
    const b = computePlanBalance(oct, cons, [oct, nov], '2026-11-05');
    expect(b.trasladadoDeMas).toBe(1);
    expect(b.aFavorSinAplicar).toBe(0);
  });

  it('splitCarryOver nunca aplica más de lo necesario', () => {
    expect(splitCarryOver(1, 3)).toEqual({ aplicar: 1, comprar: 0 });
    expect(splitCarryOver(10, 0)).toEqual({ aplicar: 0, comprar: 10 });
  });
});

describe('contrato de cada fecha', () => {
  const a = plan({ id: 'a', fechaInicio: '2026-09-01', fechaFin: '2026-09-30', activo: false });
  const b = plan({ id: 'b', fechaInicio: '2026-10-01', fechaFin: '2026-10-29' });

  it('usa el contrato que cubre la fecha y si no, el último iniciado', () => {
    expect(resolvePlanForDate([a, b], '2026-09-15')?.id).toBe('a');
    expect(resolvePlanForDate([a, b], '2026-10-30')?.id).toBe('b');
    expect(resolvePlanForDate([a, b], '2026-08-01')?.id).toBe('b');
  });

  it('elige el contrato con mayor superposición en el mes', () => {
    expect(planForMonth([a, b], 2026, 9)?.id).toBe('b');
    expect(planForMonth([a, b], 2026, 7)).toBeUndefined();
  });

  it('genera todas las fechas del mes', () => {
    expect(monthDays(2026, 1)).toHaveLength(28);
    expect(monthDays(2026, 10)[0]).toBe('2026-11-01');
  });
});
