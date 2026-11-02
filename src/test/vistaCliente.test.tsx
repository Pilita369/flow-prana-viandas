import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ClientMonthCard from '@/components/client/ClientMonthCard';
import ClientPeriodSummary from '@/components/client/ClientPeriodSummary';
import ClientPeriodHistory from '@/components/client/ClientPeriodHistory';
import ClientSimulator from '@/components/client/ClientSimulator';
import type { Client, Consumption, CreditNote, Plan } from '@/types';

const base = {
  clientId: 'karen', ajusteInicialUsadas: 0, modalidad: 'fijo', precioUnitario: 11000, tipoEntrega: 'retiro', unidadesPorRetiro: 1,
  diasFijos: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'], fechasExcluidas: ['2026-11-09', '2026-11-23'],
};
// Tal como están registrados: octubre cerrado (21 + 1 de ajuste) y noviembre con 8 nuevas + 11 trasladadas
const octubre = { ...base, id: 'oct', cantidadContratada: 21, totalCalculado: 231000, fechaInicio: '2026-10-01', fechaFin: '2026-10-30', activo: false, ajusteManualFavor: 1, observaciones: '[02/11/2026] Recalculado por feriados ... Restaurado a 21' } as Plan;
const noviembre = { ...base, id: 'nov', cantidadContratada: 8, totalCalculado: 88000, fechaInicio: '2026-11-02', fechaFin: '2026-11-30', activo: true, saldoAnteriorAplicado: 11, saldoOrigenPlanId: 'oct', observaciones: '[02/11/2026] Saldo anterior aplicado: 11 vianda(s)' } as Plan;
const plans = [octubre, noviembre];
const conConsumo = ['01', '02', '05', '06', '08', '09', '26', '27', '28', '29', '30'];
const cons = [
  ...conConsumo.map((d, i) => ({ id: `a${i}`, clientId: 'karen', planId: 'oct', fecha: `2026-10-${d}`, status: 'retirado', cantidad: 1, tipo: 'manual', createdAt: '' })),
  ...['07', '13', '14'].map((d, i) => ({ id: `b${i}`, clientId: 'karen', planId: 'oct', fecha: `2026-10-${d}`, status: 'no_retirado', cantidad: 0, tipo: 'manual', createdAt: '' })),
] as Consumption[];
const notas = [{ id: 'n1', clientId: 'karen', tipo: 'vianda_favor', descripcion: 'Vianda a favor de septiembre', cantidad: 1, fecha: '2026-11-02T01:58:08Z', aplicado: true, planId: 'oct', anulado: false, historial: [{ fecha: '', accion: 'creado', detalle: 'detalle interno' }] }] as CreditNote[];
const karen = { id: 'karen', nombre: 'Karen', apellido: 'Tralma' } as Client;

beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-02T15:00:00Z')); });
afterAll(() => { vi.useRealTimers(); });

describe('vista del cliente', () => {
  it('arriba: mes, días hábiles generales, precio, valor del mes completo y días propios aparte', () => {
    render(<ClientMonthCard plans={plans} activePlan={noviembre} feriados={new Set()} />);
    expect(screen.getByText('Noviembre de 2026')).toBeInTheDocument();
    expect(screen.getByTestId('cliente-habiles').textContent).toMatch(/^21/);
    expect(screen.getByTestId('cliente-precio').textContent).toBe('$ 11.000');
    expect(screen.getByTestId('cliente-valor-mes').textContent).toBe('$ 231.000');
    expect(screen.getByTestId('cliente-dias-propios').textContent).toContain('Tus días de servicio en noviembre: 19');
    expect(screen.getByTestId('cliente-dias-propios').textContent).toContain('sin 09/11, 23/11');
  });

  it('un único resumen: 11 trasladadas + 8 nuevas = 19, barra sobre 19 e importe por las 8', () => {
    render(<ClientPeriodSummary plan={noviembre} plans={plans} consumptions={cons} creditNotes={[]} />);
    expect(screen.getByTestId('cliente-para-usar').textContent).toBe('11 trasladadas + 8 nuevas = 19');
    expect(screen.getByTestId('cliente-disponibles').textContent).toBe('0 consumidas → 19 disponibles');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuemax')).toBe('19');
    expect(screen.getByTestId('cliente-importe').textContent).toBe('$ 88.000');
    expect(screen.queryByText(/Restaurado|Saldo anterior aplicado: 11 vianda/)).toBeNull(); // sin notas internas
  });

  it('historial por período: cierre de octubre con sus 11 trasladadas y registros hasta el último día cargado', () => {
    render(<ClientPeriodHistory plans={plans} consumptions={cons} creditNotes={notas} />);
    const periodos = screen.getAllByTestId('hist-periodo');
    expect(periodos).toHaveLength(2);
    expect(screen.getByTestId('hist-cierre').textContent).toContain('21 compradas − 11 consumidas + 1 de ajuste (Vianda a favor de septiembre) = 11 a favor al cierre');
    expect(screen.getByTestId('hist-cierre').textContent).toContain('Se trasladaron 11 al período 02/11/2026 al 30/11/2026');
    expect(screen.getByTestId('hist-cierre').textContent).toContain('Pendiente de trasladar: 0');
    expect(screen.getByTestId('hist-en-curso').textContent).toContain('11 trasladadas + 8 nuevas = 19 para usar');
    const registros = screen.getAllByTestId('hist-registros').map(e => e.textContent);
    expect(registros[0]).toBe('Todavía no hay consumos registrados en este período.'); // noviembre: no usa el 30/11
    expect(registros[1]).toContain('hasta el 30/10/2026');
    expect(document.body.textContent).not.toMatch(/Recalculado|Restaurado|detalle interno/);
  });

  it('la simulación no suma otra vez las 11 trasladadas y no aplica saldo por defecto', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<ClientSimulator client={karen} plan={noviembre} plans={plans} consumptions={cons} feriados={new Set()} />);
    expect((screen.getByLabelText('Desde') as HTMLInputElement).value).toBe('2026-12-01');
    expect(screen.getByTestId('sim-saldo').textContent).toBe('0');
    expect(screen.getByTestId('sim-nuevas').textContent).toBe('23');
    fireEvent.change(screen.getByLabelText('Viandas que necesitás'), { target: { value: '15' } });
    expect(screen.getByTestId('sim-nuevas').textContent).toBe('15');
    expect(screen.getByTestId('sim-importe').textContent).toBe('$ 165.000');
    fireEvent.click(screen.getByRole('button', { name: /Pedir este cambio/ }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(decodeURIComponent(String(open.mock.calls[0][0]))).toContain('necesitaría 15 viandas');
    open.mockRestore();
  });
});
