import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import ClientPeriodSummary from '@/components/client/ClientPeriodSummary';
import { advertenciasCambio, estadoDePago, necesidadDelContrato, propuestaRegimen, resumenWhatsApp, textoTramos } from '@/lib/contrato';
import { calcularPropuesta, contarEnTramos, enTramos, recalcularContrato } from '@/lib/habiles';
import type { Plan } from '@/types';
import type { PagoContrato } from '@/lib/pagos';

const feriados = new Set(['2026-11-09', '2026-11-23']);
const tramos = [{ desde: '2026-11-10', hasta: '2026-11-16' }, { desde: '2026-11-24', hasta: '2026-11-30' }];
const base = { tramos, unidadesPorRetiro: 1, feriados, excluidas: [] as string[], precioUnitario: 11000 };

// Contrato de prueba con el mismo régimen que el caso pedido (no son datos fijos del código)
const plan = {
  id: 'g1', clientId: 'g', cantidadContratada: 9, ajusteInicialUsadas: 0, modalidad: 'fijo', precioUnitario: 11000, totalCalculado: 99000,
  fechaInicio: '2026-11-10', fechaFin: '2026-11-30', tipoEntrega: 'retiro', unidadesPorRetiro: 1, activo: true,
  diasFijos: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'], fechasExcluidas: [], ajusteManualFavor: 1,
  regimen: 'intervalos', intervalos: tramos, cantidadSolicitada: 10,
} as Plan;

describe('régimen por intervalos', () => {
  it('dos tramos de lunes a viernes: 5 + 5 = 10 días; 1 a favor → 9 nuevas, $99.000', () => {
    expect(contarEnTramos([tramos[0]], { feriados }).habiles).toBe(5);
    expect(contarEnTramos([tramos[1]], { feriados }).habiles).toBe(5);
    const p = propuestaRegimen({ ...base, total: null, creditos: 1 });
    expect(p).toMatchObject({ sugeridas: 10, solicitadas: 10, aplicados: 1, nuevas: 9, importe: 99000, sobrante: 0 });
    expect(p.servicio.habiles).toBe(10);
  });

  it('tramos superpuestos no duplican fechas', () => {
    const r = contarEnTramos([{ desde: '2026-11-10', hasta: '2026-11-16' }, { desde: '2026-11-13', hasta: '2026-11-20' }], { feriados });
    expect(r.habiles).toBe(9); // 10 al 20/11 de lunes a viernes, una sola vez
  });

  it('descuenta feriados y exclusiones dentro de los tramos, una sola vez', () => {
    const r = contarEnTramos(tramos, { feriados: new Set(['2026-11-12']), excluidas: ['2026-11-12', '2026-11-25'] });
    expect(r).toMatchObject({ habiles: 8, feriados: ['2026-11-12'], excluidas: ['2026-11-25'] });
  });

  it('cantidad manual: se distingue el total pedido de las nuevas a pagar', () => {
    expect(propuestaRegimen({ ...base, total: 6, creditos: 1 })).toMatchObject({ solicitadas: 6, aplicados: 1, nuevas: 5, importe: 55000 });
  });

  it('crédito mayor a lo pedido: 0 nuevas y el resto queda a favor', () => {
    expect(propuestaRegimen({ ...base, total: 3, creditos: 5 })).toMatchObject({ solicitadas: 3, aplicados: 3, nuevas: 0, importe: 0, sobrante: 2 });
  });

  it('el contrato guardado usa sus tramos y el total pedido; los créditos en viandas no se descuentan en dinero', () => {
    const n = necesidadDelContrato(plan, feriados);
    expect(n).toMatchObject({ sugeridas: 10, necesarias: 10, creditos: 1, nuevas: 9 });
    expect(n.servicio.habiles).toBe(10);
    expect(estadoDePago(plan.totalCalculado, []).pendiente).toBe(99000);
    expect(enTramos(plan, '2026-11-18')).toBe(false);
    expect(enTramos(plan, '2026-11-25')).toBe(true);
    expect(textoTramos(tramos)).toBe('10/11 al 16/11 y 24/11 al 30/11');
  });

  it('la propuesta de renovación también acepta tramos', () => {
    const p = calcularPropuesta({ inicio: '2026-11-01', fin: '2026-11-30', tramos, unidadesPorRetiro: 1, precioUnitario: 11000, feriados, excluidas: [], saldoDisponible: 0, aplicarElegido: null, ajustesPendientes: 1, necesariasManual: null });
    expect(p).toMatchObject({ necesarias: 10, comprar: 9, importe: 99000 });
  });

  it('un feriado fuera de los tramos no propone recalcular; uno dentro sí', () => {
    const sinCambio = recalcularContrato(plan, { feriados: new Set(), excluidas: [] }, { feriados: new Set(['2026-11-18']), excluidas: [] });
    expect(sinCambio).toBeNull();
    const conCambio = recalcularContrato(plan, { feriados: new Set(), excluidas: [] }, { feriados: new Set(['2026-11-25']), excluidas: [] });
    expect(conCambio).toMatchObject({ habilesAntes: 10, habilesDespues: 9, cantidadAntes: 9, cantidadDespues: 8 });
    expect(recalcularContrato({ ...plan, regimen: 'manual' }, { feriados: new Set(), excluidas: [] }, { feriados: new Set(['2026-11-25']), excluidas: [] })).toBeNull();
  });

  it('advierte registros fuera de las fechas y pagos mayores al importe', () => {
    const avisos = advertenciasCambio({ tramos, consumosDelContrato: [{ fecha: '2026-11-18', cantidad: 1, status: 'retirado' }], consumidas: 1, utilizables: 10, importe: 99000, pagado: 120000 });
    expect(avisos[0]).toContain('18/11');
    expect(avisos[1]).toContain('superan el nuevo importe');
  });

  it('el resumen de WhatsApp muestra los tramos', () => {
    const txt = resumenWhatsApp({ nombre: 'Cliente', plan, diasServicio: 10, necesarias: 10, envio: 0, ajustesDinero: 0, pago: estadoDePago(99000, []) });
    expect(txt).toContain('Fechas de servicio: 10/11 al 16/11 y 24/11 al 30/11');
    expect(txt).toContain('Días de servicio: 10 (1 vianda por día) = 10 viandas');
    expect(txt).toContain('Viandas a favor por ajustes: 1');
    expect(txt).toContain('Viandas nuevas: 9 x $ 11.000 = $ 99.000');
  });
});

describe('importe destacado en la vista del cliente', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-02T15:00:00Z')); });
  afterAll(() => { vi.useRealTimers(); });
  const pago = (monto: number): PagoContrato => ({ id: `p${monto}`, clientId: 'g', planId: 'g1', fecha: '2026-11-02', monto, anulado: false, createdAt: '' });

  it('sin pagos: importe grande y desglose real', () => {
    render(<ClientPeriodSummary plan={plan} plans={[plan]} consumptions={[]} creditNotes={[]} />);
    expect(screen.getByText('Importe de tu contratación')).toBeInTheDocument();
    expect(screen.getByTestId('cliente-importe').textContent).toBe('$ 99.000');
    expect(screen.getByTestId('cliente-desglose').textContent).toBe('9 viandas nuevas · 1 vianda a favor aplicada');
    expect(screen.getByTestId('cliente-tramos').textContent).toContain('10/11 al 16/11 y 24/11 al 30/11');
    expect(screen.queryByText(/Importe por las/)).toBeNull();
  });

  it('pago parcial: "Te queda por pagar" con el pendiente real', () => {
    render(<ClientPeriodSummary plan={plan} plans={[plan]} consumptions={[]} creditNotes={[]} pagos={[pago(50000)]} />);
    expect(screen.getByText('Te queda por pagar')).toBeInTheDocument();
    expect(screen.getByTestId('cliente-importe').textContent).toBe('$ 49.000');
    expect(screen.getByTestId('cliente-detalle-pago').textContent).toContain('pagado $ 50.000');
  });

  it('totalmente abonado: "Pagado"', () => {
    render(<ClientPeriodSummary plan={plan} plans={[plan]} consumptions={[]} creditNotes={[]} pagos={[pago(99000)]} />);
    expect(screen.getByText('Pagado')).toBeInTheDocument();
  });
});
