import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import ClientConsumptionView from '@/components/client/ClientConsumptionView';
import ConsumptionCellEditor from '@/components/ConsumptionCellEditor';
import type { Client, Consumption, Plan } from '@/types';

const client = { id: 'k', nombre: 'Karen', apellido: 'T', telefono: '', puntos: 0, accessLink: 'x' } as unknown as Client;
const base = {
  clientId: 'k', ajusteInicialUsadas: 0, modalidad: 'fijo', precioUnitario: 11000, tipoEntrega: 'retiro', unidadesPorRetiro: 1,
  diasFijos: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'], fechasExcluidas: [],
};
// Datos de prueba (no reales)
const octubre = { ...base, id: 'oct', cantidadContratada: 21, totalCalculado: 231000, fechaInicio: '2026-10-01', fechaFin: '2026-10-30', activo: false, ajusteManualFavor: 1 } as Plan;
const noviembre = { ...base, id: 'nov', cantidadContratada: 8, totalCalculado: 88000, fechaInicio: '2026-11-02', fechaFin: '2026-11-30', activo: true, saldoAnteriorAplicado: 11, saldoOrigenPlanId: 'oct', fechasExcluidas: ['2026-11-04'] } as Plan;
const c = (fecha: string, cantidad: number, planId: string, extra: Partial<Consumption> = {}): Consumption =>
  ({ id: fecha, clientId: 'k', planId, fecha, cantidad, status: cantidad > 0 ? 'retirado' : 'no_retirado', tipo: 'manual', createdAt: '1', ...extra });
const consumos = [
  c('2026-10-01', 1, 'oct'), c('2026-10-02', 2, 'oct'), c('2026-10-13', 0, 'oct', { notas: 'interno: revisar caja', notaCliente: 'Se registró sin consumo' }),
  c('2026-11-02', 1, 'nov'), c('2026-11-03', 0, 'nov'),
];
const feriados = new Set(['2026-10-12']);

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-03T15:00:00Z')); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const cell = (fecha: string) => document.querySelector(`[data-fecha="${fecha}"]`) as HTMLButtonElement;

describe('calendario del cliente (solo consulta)', () => {
  it('abre en el mes actual y distingue sin registro, 0, consumos, hoy, excluido y futuros programados', () => {
    render(<ClientConsumptionView client={client} plans={[octubre, noviembre]} consumptions={consumos} feriados={feriados} />);
    expect(screen.getByTestId('cliente-cal-mes').textContent).toBe('Noviembre de 2026');
    expect(cell('2026-11-02').getAttribute('aria-label')).toBe('02/11/2026: 1 vianda · día programado');
    expect(cell('2026-11-03').getAttribute('aria-label')).toBe('03/11/2026: sin consumo · día programado · hoy');
    expect(cell('2026-11-04').getAttribute('aria-label')).toContain('Excluido');
    // Futuro: programado pero sin valor, nunca como consumo
    expect(cell('2026-11-10').getAttribute('aria-label')).toBe('10/11/2026: fecha futura · día programado');
    expect(cell('2026-11-10').textContent).not.toMatch(/\b1\b/);
    expect(cell('2026-11-07').getAttribute('aria-label')).toBe('07/11/2026: fecha futura');
    // Solo consulta: no hay campos para editar
    expect(document.querySelector('input, textarea')).toBeNull();
  });

  it('en octubre muestra sus consumos y su resumen, sin mezclar las compras de noviembre', () => {
    render(<ClientConsumptionView client={client} plans={[octubre, noviembre]} consumptions={consumos} feriados={feriados} />);
    fireEvent.click(screen.getByLabelText('Mes anterior'));
    expect(screen.getByTestId('cliente-cal-mes').textContent).toBe('Octubre de 2026');
    expect(cell('2026-10-02').getAttribute('aria-label')).toBe('02/10/2026: 2 viandas · día programado');
    expect(cell('2026-10-12').getAttribute('aria-label')).toContain('Feriado');
    expect(cell('2026-10-14').getAttribute('aria-label')).toBe('14/10/2026: sin registro · día programado');
    const r = screen.getByTestId('cliente-cal-resumen').textContent!;
    expect(r).toContain('En octubre: 3 viandas consumidas en 2 días');
    expect(r).toContain('Contrato del 01/10/2026 al 30/10/2026 (terminado)');
    expect(screen.getByTestId('cliente-cal-cuenta').textContent).toContain('21 compradas + 1 a favor − 3 consumidas = 19 a favor al cierre');
    expect(r).not.toContain('8 compradas');
  });

  it('al tocar una fecha muestra el detalle y la nota para el cliente, nunca la interna; WhatsApp solo se abre con la fecha', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<ClientConsumptionView client={client} plans={[octubre, noviembre]} consumptions={consumos} feriados={feriados} />);
    fireEvent.click(screen.getByLabelText('Mes anterior'));
    fireEvent.click(cell('2026-10-13'));
    const det = screen.getByTestId('cliente-cal-detalle');
    expect(within(det).getByTestId('cliente-cal-estado').textContent).toBe('Registrado: 0, sin consumo');
    expect(within(det).getByTestId('cliente-cal-nota').textContent).toBe('Nota: Se registró sin consumo');
    expect(document.body.textContent).not.toContain('interno: revisar caja');
    fireEvent.click(within(det).getByRole('button', { name: /Consultar este día por WhatsApp/ }));
    expect(open).toHaveBeenCalledTimes(1);
    const url = decodeURIComponent(String(open.mock.calls[0][0]));
    expect(url).toContain('martes 13/10/2026');
    expect(url).toContain('figura: 0 vianda(s)');
  });
});

describe('editor de la casilla (administración)', () => {
  it('avisa si se intenta cerrar con un cambio sin guardar, y "Guardar" guarda ese valor', () => {
    const onSave = vi.fn(); const onClose = vi.fn(); const onDirty = vi.fn();
    const props = {
      clientName: 'K', fecha: '2026-10-13', rows: [consumos[2]], savedTotal: 0, habitual: 1, disponible: 0, feriado: false, excluida: false,
      onSave, onRetry: () => {}, onClose, onDirtyChange: onDirty, contrato: { desde: '01/10/2026', hasta: '30/10/2026', cerrado: true },
    };
    const { rerender } = render(<ConsumptionCellEditor {...props} />);
    expect(screen.getByTestId('editor-contrato-cerrado').textContent).toContain('cerrado');
    fireEvent.click(screen.getByLabelText('Sumar'));
    expect(onDirty).toHaveBeenLastCalledWith(true);
    rerender(<ConsumptionCellEditor {...props} avisoSinGuardar />);
    const aviso = screen.getByTestId('aviso-sin-guardar');
    fireEvent.click(within(aviso).getByRole('button', { name: 'Guardar 1' }));
    expect(onSave).toHaveBeenCalledWith(1, undefined, undefined);
    expect(onClose).toHaveBeenCalled();
  });

  it('la nota para el cliente se guarda aparte de la interna', () => {
    const onSave = vi.fn();
    render(<ConsumptionCellEditor clientName="K" fecha="2026-11-03" rows={[]} savedTotal={null} habitual={1} disponible={10}
      feriado={false} excluida={false} onSave={onSave} onRetry={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Agregar nota para el cliente'));
    fireEvent.change(screen.getByLabelText('Nota para el cliente'), { target: { value: 'Retiró en el local' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSave).toHaveBeenCalledWith(1, undefined, 'Retiró en el local');
  });
});

describe('tiempo límite de las consultas', () => {
  it('una consulta que no responde falla con un mensaje claro en vez de quedar cargando', async () => {
    vi.useRealTimers();
    vi.useFakeTimers();
    vi.stubGlobal('fetch', (_: unknown, init: RequestInit) => new Promise((_r, rej) => {
      init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
    }));
    const { fetchConLimite, TIEMPO_LIMITE_MS } = await import('@/lib/supabase');
    const p = fetchConLimite('https://ejemplo/rest/v1/consumptions');
    const check = expect(p).rejects.toThrow('tardó más de');
    await vi.advanceTimersByTimeAsync(TIEMPO_LIMITE_MS + 10);
    await check;
    vi.unstubAllGlobals();
  });
});
