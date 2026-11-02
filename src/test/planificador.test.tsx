import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ContractPlannerCard, { type ContratoConfirmado } from '@/components/ContractPlannerCard';
import MonthWorkdaysCard from '@/components/MonthWorkdaysCard';
import { calcularPropuesta, fechasPropuestas, ultimoDiaDelMes } from '@/lib/habiles';
import type { Plan } from '@/types';

// Contrato de octubre de Karen, con los días excluidos de noviembre guardados en él
const octubre = {
  id: 'k1', clientId: 'karen', cantidadContratada: 21, ajusteInicialUsadas: 0, modalidad: 'fijo', precioUnitario: 11000,
  totalCalculado: 231000, fechaInicio: '2026-10-01', fechaFin: '2026-10-30', tipoEntrega: 'retiro', unidadesPorRetiro: 1,
  activo: true, diasFijos: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'], fechasExcluidas: ['2026-11-09', '2026-11-23'],
  ajusteManualFavor: 1,
} as Plan;

describe('propuesta de contratación', () => {
  it('propone del 1 al último día del mes, o desde el día siguiente al contrato vigente', () => {
    expect(ultimoDiaDelMes('2026-11')).toBe('2026-11-30');
    expect(ultimoDiaDelMes('2028-02')).toBe('2028-02-29');
    expect(fechasPropuestas('2026-11', octubre)).toEqual({ inicio: '2026-11-01', fin: '2026-11-30' });
    expect(fechasPropuestas('2026-10', { ...octubre, fechaFin: '2026-10-15' } as Plan)).toEqual({ inicio: '2026-10-16', fin: '2026-10-31' });
    expect(fechasPropuestas('2026-12', null)).toEqual({ inicio: '2026-12-01', fin: '2026-12-31' });
  });

  it('Karen en noviembre: 19 días de servicio, aplica 11 a favor y compra 8', () => {
    const p = calcularPropuesta({
      inicio: '2026-11-01', fin: '2026-11-30', unidadesPorRetiro: 1, precioUnitario: 11000, feriados: new Set(),
      excluidas: ['2026-11-09', '2026-11-23'], saldoDisponible: 11, aplicarElegido: null, ajustesPendientes: 0, necesariasManual: null,
    });
    expect(p).toMatchObject({ necesarias: 19, maxAplicar: 11, aplicar: 11, comprar: 8, importe: 88000 });
    expect(p.servicio).toMatchObject({ habiles: 19, diasDelPeriodo: 21 });
  });

  it('feriado y excluido el mismo día se descuentan una vez; 2 viandas por día duplica', () => {
    const p = calcularPropuesta({
      inicio: '2026-11-02', fin: '2026-11-13', unidadesPorRetiro: 2, precioUnitario: 1000, feriados: new Set(['2026-11-09']),
      excluidas: ['2026-11-09', '2026-11-10'], saldoDisponible: 0, aplicarElegido: null, ajustesPendientes: 0, necesariasManual: null,
    });
    expect(p.servicio.habiles).toBe(8);
    expect(p).toMatchObject({ necesarias: 16, aplicar: 0, comprar: 16, importe: 16000 });
  });

  it('el saldo aplicado nunca supera lo disponible ni lo necesario, y se puede aplicar menos', () => {
    const base = { inicio: '2026-11-02', fin: '2026-11-06', unidadesPorRetiro: 1, precioUnitario: 100, feriados: new Set<string>(), excluidas: [], ajustesPendientes: 0, necesariasManual: null };
    expect(calcularPropuesta({ ...base, saldoDisponible: 11, aplicarElegido: null })).toMatchObject({ necesarias: 5, aplicar: 5, comprar: 0 });
    expect(calcularPropuesta({ ...base, saldoDisponible: 11, aplicarElegido: 99 }).aplicar).toBe(5);
    expect(calcularPropuesta({ ...base, saldoDisponible: 11, aplicarElegido: 2 })).toMatchObject({ aplicar: 2, comprar: 3 });
    expect(calcularPropuesta({ ...base, saldoDisponible: 1, aplicarElegido: null, ajustesPendientes: 1 })).toMatchObject({ aplicar: 1, comprar: 3 });
  });
});

describe('tarjeta de días hábiles y contratación', () => {
  const props = {
    plans: [octubre], activePlan: octubre, feriados: new Set<string>(), saldoDisponible: 11, viandasPendientes: 0,
  };

  it('la tarjeta del mes sigue al calendario', () => {
    const { rerender } = render(<MonthWorkdaysCard mes="2026-11" plans={[octubre]} feriados={new Set()} />);
    expect(screen.getByText(/Noviembre de 2026/i)).toBeInTheDocument();
    expect(screen.getByTestId('habiles-mes').textContent).toMatch(/^19/);
    rerender(<MonthWorkdaysCard mes="2026-12" plans={[octubre]} feriados={new Set()} />);
    expect(screen.getByTestId('habiles-mes').textContent).toMatch(/^23/);
  });

  it('cambiar campos o el mes no guarda nada', () => {
    const onConfirm = vi.fn(async (_c: ContratoConfirmado) => true);
    const { rerender } = render(<ContractPlannerCard {...props} mes="2026-11" onConfirm={onConfirm} />);
    expect(screen.getByText('Preparar próximo mes')).toBeInTheDocument();
    expect(screen.getByTestId('dias-servicio').textContent).toBe('19');
    expect(screen.getByTestId('comprar').textContent).toBe('8');

    fireEvent.change(screen.getByLabelText('Fin'), { target: { value: '2026-11-13' } });
    fireEvent.change(screen.getByLabelText('Viandas por día'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Precio por vianda'), { target: { value: '12000' } });
    // 02/11 a 13/11: 10 días − 09/11 excluido = 9 × 2 = 18; aplica 11 → compra 7
    expect(screen.getByTestId('dias-servicio').textContent).toBe('9');
    expect(screen.getByTestId('necesarias').textContent).toBe('18');
    expect(screen.getByTestId('comprar').textContent).toBe('7');
    expect(onConfirm).not.toHaveBeenCalled();

    rerender(<ContractPlannerCard {...props} mes="2026-12" onConfirm={onConfirm} />);
    expect((screen.getByLabelText('Fin') as HTMLInputElement).value).toBe('2026-12-31');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('al confirmar se guarda una sola vez, aunque se toque dos veces', async () => {
    let resolver: (v: boolean) => void = () => {};
    const onConfirm = vi.fn((_c: ContratoConfirmado) => new Promise<boolean>(r => { resolver = r; }));
    render(<ContractPlannerCard {...props} mes="2026-11" onConfirm={onConfirm} />);
    const boton = screen.getByRole('button', { name: /Confirmar renovación/ });
    fireEvent.click(boton);
    fireEvent.click(boton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0]).toMatchObject({
      fechaInicio: '2026-11-01', fechaFin: '2026-11-30', necesarias: 19, aplicar: 11, comprar: 8, diasServicio: 19,
      fechasExcluidas: ['2026-11-09', '2026-11-23'],
    });
    await act(async () => { resolver(true); });
  });

  it('sin contrato vigente ofrece crear el contrato, sin saldo', () => {
    render(<ContractPlannerCard {...props} activePlan={null} plans={[]} saldoDisponible={0} mes="2026-11" onConfirm={vi.fn(async () => true)} />);
    expect(screen.getByRole('button', { name: /Crear contrato/ })).toBeInTheDocument();
    expect(screen.getByText('Preparar contratación')).toBeInTheDocument();
  });

  it('con el contrato vigente en curso, el saldo es provisional y no se aplica por defecto', () => {
    const onConfirm = vi.fn(async (_c: ContratoConfirmado) => true);
    render(<ContractPlannerCard {...props} saldoDisponible={19} saldoProvisional sobranteEstimado={0} mes="2026-12" onConfirm={onConfirm} />);
    expect(screen.getByTestId('saldo-provisional')).toBeInTheDocument();
    expect((screen.getByLabelText(/Aplicar a este contrato/) as HTMLInputElement).value).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: /Confirmar renovación/ }));
    expect(onConfirm.mock.calls[0][0]).toMatchObject({ aplicar: 0 });
  });
});
