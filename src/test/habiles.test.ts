import { describe, it, expect } from 'vitest';
import { contarDiasHabiles, isExcluidaCliente, recalcularContrato, viandasNecesarias } from '@/lib/habiles';
import { computePlanBalance, splitCarryOver } from '@/lib/consumo';
import type { Consumption, Plan } from '@/types';

const karen = (extra: Partial<Plan> = {}): Plan => ({
  id: 'k1', clientId: 'karen', cantidadContratada: 21, ajusteInicialUsadas: 0, modalidad: 'fijo', precioUnitario: 11000,
  totalCalculado: 231000, fechaInicio: '2026-10-01', fechaFin: '2026-10-30', tipoEntrega: 'retiro', unidadesPorRetiro: 1,
  activo: true, diasFijos: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'], fechasExcluidas: [], ...extra,
} as Plan);

describe('días hábiles', () => {
  it('cuenta lunes a viernes y descuenta feriados y excluidos una sola vez', () => {
    const base = contarDiasHabiles('2026-10-01', '2026-10-30', { feriados: [] });
    expect(base).toMatchObject({ habiles: 22, diasDelPeriodo: 22 });

    const conFeriado = contarDiasHabiles('2026-10-01', '2026-10-30', { feriados: ['2026-10-12'] });
    expect(conFeriado.habiles).toBe(21);

    // 12/10 es feriado y además está excluido: se descuenta una vez
    const doble = contarDiasHabiles('2026-10-01', '2026-10-30', { feriados: ['2026-10-12'], excluidas: ['2026-10-12', '2026-10-13'] });
    expect(doble).toMatchObject({ habiles: 20, feriados: ['2026-10-12'], excluidas: ['2026-10-13'] });

    // Un feriado en sábado no descuenta nada
    expect(contarDiasHabiles('2026-10-01', '2026-10-30', { feriados: ['2026-10-10'] }).habiles).toBe(22);
  });

  it('respeta los días de retiro del contrato y calcula las viandas', () => {
    const lunMie = contarDiasHabiles('2026-11-02', '2026-11-30', { diasFijos: ['lunes', 'miercoles'], feriados: ['2026-11-23'] });
    expect(lunMie.diasDelPeriodo).toBe(9);
    expect(lunMie.habiles).toBe(8);
    expect(viandasNecesarias(lunMie.habiles, 2)).toBe(16);
  });

  it('período vacío o invertido da cero', () => {
    expect(contarDiasHabiles('', '', { feriados: [] }).habiles).toBe(0);
    expect(contarDiasHabiles('2026-11-10', '2026-11-01', { feriados: [] }).habiles).toBe(0);
  });
});

describe('recalcular un contrato confirmado', () => {
  it('propone mover las viandas por la diferencia de días hábiles, sin aplicarlo', () => {
    const plan = karen();
    const rec = recalcularContrato(plan, { feriados: new Set(), excluidas: [] }, { feriados: new Set(['2026-10-12']), excluidas: [] });
    expect(rec).toMatchObject({ habilesAntes: 22, habilesDespues: 21, cantidadAntes: 21, cantidadDespues: 20, totalAntes: 231000, totalDespues: 220000 });
    expect(plan.cantidadContratada).toBe(21); // no se modifica el contrato
  });

  it('no propone nada si el día ya estaba excluido o cae fuera del contrato', () => {
    const plan = karen({ fechasExcluidas: ['2026-10-12'] });
    expect(recalcularContrato(plan, { feriados: new Set(), excluidas: ['2026-10-12'] }, { feriados: new Set(['2026-10-12']), excluidas: ['2026-10-12'] })).toBeNull();
    expect(recalcularContrato(karen(), { feriados: new Set(), excluidas: [] }, { feriados: new Set(['2026-11-20']), excluidas: [] })).toBeNull();
    expect(recalcularContrato(karen({ modalidad: 'flexible' }), { feriados: new Set(), excluidas: [] }, { feriados: new Set(['2026-10-12']), excluidas: [] })).toBeNull();
  });

  it('desmarcar un feriado suma de nuevo el día', () => {
    const rec = recalcularContrato(karen({ cantidadContratada: 20 }), { feriados: new Set(['2026-10-12']), excluidas: [] }, { feriados: new Set(), excluidas: [] });
    expect(rec?.cantidadDespues).toBe(21);
  });
});

describe('saldo de Karen', () => {
  const consumidos = ['01', '02', '05', '06', '08', '09', '26', '27', '28', '29', '30'];
  const cons = consumidos.map((d, i) => ({ id: `c${i}`, clientId: 'karen', planId: 'k1', fecha: `2026-10-${d}`, status: 'retirado', cantidad: 1, tipo: 'manual', createdAt: '' } as Consumption));

  it('10 sin consumir + 1 ajuste asignado = 11 disponibles, sin contar dos veces', () => {
    const sinAjuste = computePlanBalance(karen(), cons, [karen()], '2026-11-02');
    expect(sinAjuste.disponible).toBe(10);
    const conAjuste = computePlanBalance(karen({ ajusteManualFavor: 1 }), cons, [karen({ ajusteManualFavor: 1 })], '2026-11-02');
    expect(conAjuste).toMatchObject({ compradas: 21, ajusteManual: 1, consumidas: 11, disponible: 11, aFavorSinAplicar: 11 });
  });

  it('al renovar se aplican las 11 y se compran solo las que faltan', () => {
    const habiles = contarDiasHabiles('2026-11-02', '2026-12-01', { feriados: ['2026-11-23'] }).habiles;
    expect(habiles).toBe(21);
    expect(splitCarryOver(viandasNecesarias(habiles, 1), 11)).toEqual({ aplicar: 11, comprar: 10 });
  });
});

describe('día excluido del cliente', () => {
  it('se busca en el contrato al que corresponde la fecha', () => {
    const plans = [karen({ fechasExcluidas: ['2026-10-14', '2026-11-04'] })];
    expect(isExcluidaCliente(plans, '2026-10-14')).toBe(true);
    expect(isExcluidaCliente(plans, '2026-11-04')).toBe(true); // fecha futura guardada en el contrato vigente
    expect(isExcluidaCliente(plans, '2026-10-15')).toBe(false);
  });
});
