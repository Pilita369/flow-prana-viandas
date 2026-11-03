import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Consumption, Plan } from '@/types';

const conciliarTraslado = vi.fn();
vi.mock('@/lib/store', () => ({ conciliarTraslado: (...a: unknown[]) => conciliarTraslado(...a) }));
const { default: ConciliarSaldoDialog } = await import('@/components/ConciliarSaldoDialog');
const { TrasladoAConciliar, QuantityReview } = await import('@/components/ContractPeriodParts');
const { computePlanBalance } = await import('@/lib/consumo');

// Caso de verificación con la misma forma que el de Karen (datos de prueba)
const base = { clientId: 'k', ajusteInicialUsadas: 0, modalidad: 'fijo', precioUnitario: 11000, tipoEntrega: 'retiro', unidadesPorRetiro: 1, diasFijos: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'], fechasExcluidas: [] };
const oct = { ...base, id: 'oct', cantidadContratada: 21, totalCalculado: 231000, fechaInicio: '2026-10-01', fechaFin: '2026-10-30', activo: false, ajusteManualFavor: 1 } as Plan;
const nov = { ...base, id: 'nov', cantidadContratada: 8, totalCalculado: 88000, fechaInicio: '2026-11-02', fechaFin: '2026-11-30', activo: true, saldoAnteriorAplicado: 11, saldoOrigenPlanId: 'oct' } as Plan;
const c = (fecha: string, planId: string): Consumption => ({ id: fecha, clientId: 'k', planId, fecha, cantidad: 1, status: 'retirado', tipo: 'manual', createdAt: '1' });
const consumos = [...Array.from({ length: 12 }, (_, i) => c(`2026-10-${String(i + 1).padStart(2, '0')}`, 'oct')), c('2026-11-02', 'nov')];
const plans = [oct, nov];

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-03T15:00:00Z')); conciliarTraslado.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

describe('Conciliar saldo', () => {
  it('el aviso tiene la acción "Conciliar saldo" con el antes y el después', () => {
    const onConciliar = vi.fn();
    render(<TrasladoAConciliar plan={oct} plans={plans} balance={computePlanBalance(oct, consumos, plans, '2026-11-03')}
      destinoBalance={computePlanBalance(nov, consumos, plans, '2026-11-03')} onConciliar={onConciliar} />);
    expect(screen.getByTestId('conciliar-antes-despues').textContent).toContain('Trasladadas: 11 → 10');
    expect(screen.getByTestId('conciliar-antes-despues').textContent).toContain('18 → 17');
    fireEvent.click(screen.getByRole('button', { name: 'Conciliar saldo' }));
    expect(onConciliar).toHaveBeenCalledWith(nov, 10);
  });

  it('el diálogo muestra origen y destino antes/después y concilia con 10; un error permite reintentar', async () => {
    const onDone = vi.fn();
    conciliarTraslado.mockRejectedValueOnce(new Error('No se pudo conciliar (no se cambió nada): sin conexión'));
    conciliarTraslado.mockResolvedValueOnce({ cambio: true, antes: 11, despues: 10, sobrante: 10 });
    render(<ConciliarSaldoDialog open onOpenChange={() => {}} clientName="K" fromPlan={oct} toPlan={nov} plans={plans} consumptions={consumos} onDone={onDone} />);
    expect(screen.getByTestId('conciliar-trasladadas').textContent).toBe('10');
    expect(screen.getByTestId('conciliar-recibidas').textContent).toBe('10');
    expect(screen.getByTestId('conciliar-disponibles').textContent).toBe('17');
    expect(screen.getByTestId('conciliar-tabla').textContent).toContain('$ 88.000');
    fireEvent.click(screen.getByRole('button', { name: 'Conciliar saldo' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('no se cambió nada'));
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(conciliarTraslado).toHaveBeenLastCalledWith({ fromPlanId: 'oct', toPlanId: 'nov', cantidad: 10 });
  });

  it('noviembre con 10 trasladadas: 8 + 10 = 18 de 19 necesarias, falta cubrir 1; no se cambia nada solo', () => {
    const conciliado = { ...nov, saldoAnteriorAplicado: 10 };
    const b = computePlanBalance(conciliado, consumos, [oct, conciliado], '2026-11-03');
    expect(b.disponible).toBe(17);
    const servicio = { habiles: 19, diasDelPeriodo: 21, feriados: ['2026-11-09', '2026-11-23'], excluidas: [], fechas: [] };
    render(<QuantityReview plan={conciliado} balance={b} servicio={servicio} necesarias={19} />);
    expect(screen.getByTestId('cobertura-necesarias').textContent).toContain('8 compradas + 10 trasladadas = 18 de 19 necesarias');
    expect(screen.getByTestId('falta-cubrir').textContent).toBe('Falta cubrir 1 vianda.');
  });
});
