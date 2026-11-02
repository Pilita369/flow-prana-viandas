import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContractCloseout } from '@/components/ContractPeriodParts';
import { computePlanBalance } from '@/lib/consumo';
import { contratoDelPeriodo, contratosDelMes } from '@/lib/habiles';
import type { Consumption, Plan } from '@/types';

const base = {
  clientId: 'karen', ajusteInicialUsadas: 0, modalidad: 'fijo', precioUnitario: 11000, tipoEntrega: 'retiro', unidadesPorRetiro: 1,
  diasFijos: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'], fechasExcluidas: ['2026-11-09', '2026-11-23'],
};
// Como están en la base: octubre cerrado con +1 de ajuste; noviembre con 8 nuevas + 11 trasladadas
const octubre = { ...base, id: 'oct', cantidadContratada: 21, totalCalculado: 231000, fechaInicio: '2026-10-01', fechaFin: '2026-10-30', activo: false, ajusteManualFavor: 1 } as Plan;
const noviembre = { ...base, id: 'nov', cantidadContratada: 8, totalCalculado: 88000, fechaInicio: '2026-11-02', fechaFin: '2026-11-30', activo: true, saldoAnteriorAplicado: 11, saldoOrigenPlanId: 'oct' } as Plan;
const plans = [octubre, noviembre];

// 11 días con 1 vianda y 11 días en 0 (sin consumo) en octubre
const conConsumo = ['01', '02', '05', '06', '08', '09', '26', '27', '28', '29', '30'];
const enCero = ['07', '12', '13', '14', '15', '16', '19', '20', '21', '22', '23'];
const cons = [
  ...conConsumo.map((d, i) => ({ id: `a${i}`, clientId: 'karen', planId: 'oct', fecha: `2026-10-${d}`, status: 'retirado', cantidad: 1, tipo: 'manual', createdAt: '' })),
  ...enCero.map((d, i) => ({ id: `b${i}`, clientId: 'karen', planId: 'oct', fecha: `2026-10-${d}`, status: 'no_retirado', cantidad: 0, tipo: 'manual', createdAt: '' })),
] as Consumption[];

describe('contrato del período seleccionado', () => {
  it('octubre muestra el contrato de octubre y noviembre el de noviembre', () => {
    expect(contratoDelPeriodo(plans, '2026-10', '2026-11-02')?.id).toBe('oct');
    expect(contratoDelPeriodo(plans, '2026-11', '2026-11-02')?.id).toBe('nov');
    expect(contratosDelMes(plans, '2026-10').map(p => p.id)).toEqual(['oct']);
  });

  it('si un mes tiene varios contratos, se listan todos y por defecto el que cubre hoy', () => {
    const a = { ...octubre, id: 'a', fechaInicio: '2026-12-01', fechaFin: '2026-12-15', activo: false } as Plan;
    const b = { ...octubre, id: 'b', fechaInicio: '2026-12-16', fechaFin: '2026-12-31', activo: true } as Plan;
    expect(contratosDelMes([a, b], '2026-12').map(p => p.id)).toEqual(['a', 'b']);
    expect(contratoDelPeriodo([a, b], '2026-12', '2026-12-20')?.id).toBe('b');
    expect(contratoDelPeriodo([a, b], '2026-12', '2026-12-05')?.id).toBe('a');
  });

  it('un mes sin contrato propio no muestra el de otro período terminado', () => {
    expect(contratoDelPeriodo([octubre], '2026-09', '2026-11-02')).toBeUndefined();
  });
});

describe('cierre de octubre de Karen', () => {
  it('21 compradas, 11 consumidas, 10 sin consumir, +1 de ajuste, saldo al cierre 11, pendiente 0', () => {
    const b = computePlanBalance(octubre, cons, plans, '2026-11-02');
    expect(b).toMatchObject({ compradas: 21, consumidas: 11, ajusteManual: 1, restante: 11, trasladado: 11, aFavorSinAplicar: 0, cerrado: true });
    render(<ContractCloseout plan={octubre} plans={plans} balance={b} />);
    expect(screen.getByTestId('contrato-compradas').textContent).toBe('21');
    expect(screen.getByTestId('contrato-importe').textContent).toBe('$ 231.000');
    expect(screen.getByTestId('cierre-consumidas').textContent).toBe('11');
    expect(screen.getByTestId('cierre-sin-consumir').textContent).toBe('10');
    expect(screen.getByTestId('cierre-ajustes').textContent).toBe('+1');
    expect(screen.getByTestId('cierre-saldo').textContent).toBe('11');
    expect(screen.getByTestId('cierre-pendiente').textContent).toBe('0');
    expect(screen.getByTestId('cierre-destino').textContent).toContain('Trasladadas 11 al contrato 02/11/2026 al 30/11/2026');
  });

  it('los días en 0 no cambian lo comprado ni el importe, y el saldo no se cuenta dos veces', () => {
    const b = computePlanBalance(octubre, cons, plans, '2026-11-02');
    expect(octubre.cantidadContratada).toBe(21);
    expect(octubre.totalCalculado).toBe(231000);
    const nov = computePlanBalance(noviembre, cons, plans, '2026-11-02');
    expect(nov).toMatchObject({ compradas: 8, saldoAnteriorAplicado: 11, ajusteManual: 0, disponible: 19 });
    expect(b.aFavorSinAplicar + nov.saldoAnteriorAplicado).toBe(11);
  });
});
