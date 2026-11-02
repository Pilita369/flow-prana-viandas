import { describe, it, expect } from 'vitest';
import { estadoDePago, estimarCobertura, necesidadDelContrato, resumenWhatsApp } from '@/lib/contrato';
import type { Plan } from '@/types';

// Contrato de noviembre de Karen tal como quedó al renovar: 8 nuevas + 11 trasladadas
const noviembre = {
  id: 'k2', clientId: 'karen', cantidadContratada: 8, saldoAnteriorAplicado: 11, saldoOrigenPlanId: 'k1', ajusteInicialUsadas: 0,
  modalidad: 'fijo', precioUnitario: 11000, totalCalculado: 88000, fechaInicio: '2026-11-02', fechaFin: '2026-11-30',
  tipoEntrega: 'retiro', unidadesPorRetiro: 1, activo: true, diasFijos: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'],
  fechasExcluidas: ['2026-11-09', '2026-11-23'],
} as Plan;

describe('contrato vigente', () => {
  it('19 días de servicio necesitan 19 viandas: 8 nuevas + 11 trasladadas', () => {
    const { servicio, necesarias } = necesidadDelContrato(noviembre, new Set());
    expect(servicio.habiles).toBe(19);
    expect(necesarias).toBe(19);
    expect(noviembre.cantidadContratada + (noviembre.saldoAnteriorAplicado || 0)).toBe(necesarias);
  });

  it('la cobertura usa todas las viandas utilizables (no solo las 8 compradas)', () => {
    const c = estimarCobertura(noviembre, 19, '2026-11-02', new Set());
    expect(c).toMatchObject({ hasta: '2026-11-30', alcanza: true, diasRestantes: 19, sobrantes: 0, faltantes: 0 });
    // Con solo 8 viandas (el error anterior) llegaría al 12/11
    expect(estimarCobertura(noviembre, 8, '2026-11-02', new Set())).toMatchObject({ hasta: '2026-11-12', alcanza: false, faltantes: 11 });
  });

  it('descuenta lo consumido y cuenta desde el día siguiente al último registro, sin pasar del fin', () => {
    // Consumió del 02 al 06/11 (5): quedan 14 para los 14 días de servicio del 09/11 al 30/11 (menos 09 y 23 excluidos)
    expect(estimarCobertura(noviembre, 14, '2026-11-07', new Set())).toMatchObject({ hasta: '2026-11-30', alcanza: true, diasRestantes: 14, sobrantes: 0 });
    // Si tuviera 3 más (por días sin consumo), sobrarían 3 al terminar (provisional)
    expect(estimarCobertura(noviembre, 17, '2026-11-07', new Set())).toMatchObject({ hasta: '2026-11-30', sobrantes: 3 });
  });

  it('estado de pago según los pagos registrados', () => {
    expect(estadoDePago(88000, [])).toMatchObject({ estado: 'sin_pagos', pagado: 0, pendiente: 88000 });
    expect(estadoDePago(88000, [{ monto: 50000, anulado: false }, { monto: 38000, anulado: true }])).toMatchObject({ estado: 'parcial', pendiente: 38000 });
    expect(estadoDePago(88000, [{ monto: 88000, anulado: false }])).toMatchObject({ estado: 'pagado', pendiente: 0 });
    expect(estadoDePago(88000, [{ monto: 90000, anulado: false }])).toMatchObject({ estado: 'pagado_de_mas', pendiente: 0 });
  });

  it('el resumen para WhatsApp trae período, cantidades, saldo aplicado e importe a abonar', () => {
    const texto = resumenWhatsApp({ nombre: 'Karen', plan: noviembre, diasServicio: 19, necesarias: 19, envio: 0, ajustesDinero: 0, pago: estadoDePago(88000, []) });
    expect(texto).toContain('Período: 02/11/2026 al 30/11/2026');
    expect(texto).toContain('Días de servicio: 19 (1 vianda por día) = 19 viandas');
    expect(texto).toContain('Saldo a favor aplicado: 11 viandas');
    expect(texto).toContain('Viandas nuevas: 8 x $ 11.000 = $ 88.000');
    expect(texto.endsWith('Total a abonar: $ 88.000')).toBe(true);
  });
});
