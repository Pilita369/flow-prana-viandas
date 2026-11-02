import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ClientHistory from '@/components/ClientHistory';
import type { Consumption, Plan } from '@/types';

const plan = (id: string, inicio: string, fin: string, activo: boolean): Plan => ({
  id, clientId: 'c1', cantidadContratada: 20, ajusteInicialUsadas: 0, modalidad: 'fijo', precioUnitario: 1000,
  totalCalculado: 20000, fechaInicio: inicio, fechaFin: fin, tipoEntrega: 'retiro', unidadesPorRetiro: 1, activo,
} as Plan);
let n = 0;
const c = (fecha: string, planId: string, cantidad: number, notas?: string): Consumption => ({
  id: `r${++n}`, clientId: 'c1', planId, fecha, status: cantidad > 0 ? 'retirado' : 'no_retirado', tipo: 'manual', cantidad, notas, createdAt: '',
} as Consumption);

const plans = [plan('p1', '2026-03-02', '2026-03-31', false), plan('p2', '2026-10-01', '2026-10-31', true)];
const cons = [
  c('2026-03-02', 'p1', 1, 'primer registro'), c('2026-03-03', 'p1', 0),
  c('2026-10-05', 'p2', 2), c('2026-10-06', 'p2', 1, 'retiró la hija'),
  c('2026-05-04', 'plan-borrado', 1),
];

describe('pestaña Historial', () => {
  it('muestra cada registro una sola vez, desde el primero, con cantidad y notas', () => {
    render(<MemoryRouter><ClientHistory consumptions={cons} plans={plans} /></MemoryRouter>);
    expect(screen.getByText('02/03/2026', { selector: 'p' })).toBeInTheDocument(); // desde el primer registro
    expect(screen.getByText('5')).toBeInTheDocument(); // total consumido

    // Contrato vigente abierto por defecto
    expect(screen.getAllByText('05/10/2026')).toHaveLength(1);
    expect(screen.getByText('retiró la hija')).toBeInTheDocument();
    expect(screen.queryByText('primer registro')).toBeNull();

    // Abrir el contrato anterior
    fireEvent.click(screen.getByRole('button', { name: /Contrato #1/ }));
    expect(screen.getByText('primer registro')).toBeInTheDocument();
    expect(screen.getAllByText('03/03/2026')).toHaveLength(1);
    expect(screen.getAllByText('Sin consumo').length).toBeGreaterThan(0);

    // Registros cuyo contrato ya no existe siguen visibles
    expect(screen.getByText('Registros sin contrato asociado')).toBeInTheDocument();
    expect(screen.getAllByText('04/05/2026')).toHaveLength(1);
  });
});
