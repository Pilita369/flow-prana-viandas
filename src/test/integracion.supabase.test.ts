/**
 * Prueba de escritura contra la base real usando SOLO un cliente temporal de prueba.
 * No toca clientes, contratos ni consumos reales: todo lo que crea cuelga del cliente
 * de prueba y se borra al final (las tablas borran en cascada desde clients).
 *
 * Se ejecuta solo a pedido:
 *   RUN_SUPABASE_IT=1 VITE_SUPABASE_URL=... VITE_SUPABASE_PUBLISHABLE_KEY=... npx vitest run src/test/integracion.supabase.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type * as StoreModule from '@/lib/store';
import type { Plan } from '@/types';

const enabled = process.env.RUN_SUPABASE_IT === '1';
const suite = enabled ? describe : describe.skip;

suite('integración con Supabase (cliente de prueba)', () => {
  let store: typeof StoreModule;
  let consumo: typeof import('@/lib/consumo');
  let supabase: typeof import('@/lib/supabase').supabase;
  let clientId = '';
  let octubre: Plan;
  let noviembre: Plan;

  const rowsDelDia = async (fecha: string) => {
    const { data, error } = await supabase.from('consumptions').select('*').eq('client_id', clientId).eq('fecha', fecha);
    if (error) throw error;
    return data || [];
  };
  const puntos = async () => {
    const { data } = await supabase.from('clients').select('puntos').eq('id', clientId).single();
    return data!.puntos as number;
  };
  const balance = async (plan: Plan) => {
    const all = (await store.loadConsumptionsOrThrow()).filter(c => c.clientId === clientId);
    const plans = (await store.loadPlans()).filter(p => p.clientId === clientId);
    const p = plans.find(x => x.id === plan.id)!;
    return consumo.computePlanBalance(p, all, plans, '2026-11-01');
  };
  const guardar = (plan: Plan, fecha: string, cantidad: number | null) =>
    store.setDailyConsumption({ clientId, planId: plan.id, fecha, cantidad });

  beforeAll(async () => {
    store = await import('@/lib/store');
    consumo = await import('@/lib/consumo');
    supabase = (await import('@/lib/supabase')).supabase;
    const c = await store.createClient({ nombre: 'ZZ Prueba', apellido: 'Automática (borrar)', telefono: '0', email: '' } as Parameters<typeof store.createClient>[0]);
    clientId = c.id;
    octubre = await store.createPlan({
      clientId, cantidadContratada: 21, ajusteInicialUsadas: 0, modalidad: 'fijo', precioUnitario: 0,
      fechaInicio: '2026-10-01', fechaFin: '2026-10-31', tipoEntrega: 'retiro', unidadesPorRetiro: 1,
    } as Omit<Plan, 'id' | 'activo' | 'totalCalculado'>);
    noviembre = await store.createPlan({
      clientId, cantidadContratada: 20, ajusteInicialUsadas: 0, modalidad: 'fijo', precioUnitario: 0,
      fechaInicio: '2026-11-02', fechaFin: '2026-11-30', tipoEntrega: 'retiro', unidadesPorRetiro: 1,
    } as Omit<Plan, 'id' | 'activo' | 'totalCalculado'>);
  }, 30000);

  afterAll(async () => {
    if (!clientId) return;
    await store.deleteClient(clientId);
    for (const t of ['clients', 'plans', 'consumptions', 'points', 'credit_notes']) {
      const col = t === 'clients' ? 'id' : 'client_id';
      const { count } = await supabase.from(t).select('*', { count: 'exact', head: true }).eq(col, clientId);
      expect(count, `quedaron filas de prueba en ${t}`).toBe(0);
    }
  }, 30000);

  it('registra 0, 1, 2 y 5 y lee lo mismo al recargar', async () => {
    await guardar(octubre, '2026-10-01', 0);
    await guardar(octubre, '2026-10-02', 1);
    await guardar(octubre, '2026-10-05', 2);
    await guardar(octubre, '2026-10-06', 5);
    expect((await rowsDelDia('2026-10-01'))[0]).toMatchObject({ cantidad: 0, status: 'no_retirado' });
    expect((await balance(octubre)).consumidas).toBe(8);
    expect(await puntos()).toBe(8);
  }, 30000);

  it('de 1 a 2 descuenta una sola vianda más; de 2 a 0 devuelve dos; sin duplicados', async () => {
    await guardar(octubre, '2026-10-02', 2);
    expect(await rowsDelDia('2026-10-02')).toHaveLength(1);
    expect((await balance(octubre)).consumidas).toBe(9);
    await guardar(octubre, '2026-10-05', 0);
    expect((await balance(octubre)).consumidas).toBe(7);
    await guardar(octubre, '2026-10-05', 0);
    await guardar(octubre, '2026-10-05', 0);
    expect(await rowsDelDia('2026-10-05')).toHaveLength(1);
    expect(await puntos()).toBe(7);
  }, 30000);

  it('la ficha y la planilla leen los mismos registros', async () => {
    const ficha = await store.loadClientConsumptionsOrThrow(clientId);
    const planilla = (await store.loadConsumptionsOrThrow()).filter(c => c.clientId === clientId);
    const norm = (l: { id: string; fecha: string; cantidad: number; status: string }[]) =>
      l.map(c => `${c.id}|${c.fecha}|${c.cantidad}|${c.status}`).sort();
    expect(norm(ficha)).toEqual(norm(planilla));
    expect(new Set(ficha.map(c => c.fecha)).size).toBe(ficha.length); // un registro por día
  }, 30000);

  it('saldo a favor: compró 21, consumió 19, aplica 2 y compra 18; corrección posterior se concilia', async () => {
    // Completar 19 consumidas en octubre: hoy hay 7 (2 + 5)
    for (const fecha of ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-14']) await guardar(octubre, fecha, 2);
    let b = await balance(octubre);
    expect(b.consumidas).toBe(19);
    expect(b.aFavorSinAplicar).toBe(2);

    const necesita = 20;
    const { aplicar, comprar } = consumo.splitCarryOver(necesita, b.aFavorSinAplicar);
    expect({ aplicar, comprar }).toEqual({ aplicar: 2, comprar: 18 });
    noviembre = await store.applyCarryOver({ fromPlan: octubre, toPlan: noviembre, cantidad: 2, reducirCompra: true });
    expect(noviembre).toMatchObject({ cantidadContratada: 18, saldoAnteriorAplicado: 2, saldoOrigenPlanId: octubre.id });
    b = await balance(octubre);
    expect(b).toMatchObject({ aFavorSinAplicar: 0, trasladado: 2, disponible: 0 });
    expect((await balance(noviembre)).disponible).toBe(20);

    // Corrección después del cierre: un día de octubre era 3, no 2 → se trasladó 1 de más
    await guardar(octubre, '2026-10-14', 3);
    b = await balance(octubre);
    expect(b.trasladadoDeMas).toBe(1);
    noviembre = await store.applyCarryOver({ fromPlan: octubre, toPlan: noviembre, cantidad: 1, reducirCompra: false });
    expect((await balance(octubre))).toMatchObject({ trasladadoDeMas: 0, disponible: 0 });
    expect((await balance(noviembre)).disponible).toBe(19);
    expect(noviembre.observaciones).toMatch(/Saldo anterior aplicado: 2 → 1/);
  }, 60000);

  it('ajustes a favor: se guardan en la base y no se duplican al copiar desde el navegador', async () => {
    localStorage.setItem('mp_credit_notes', JSON.stringify([
      { id: 'prueba-local-1', clientId, tipo: 'vianda_favor', descripcion: 'Prueba', cantidad: 1, fecha: '2026-10-20T15:00:00.000Z', aplicado: false },
    ]));
    expect(await store.getCreditNotes(clientId)).toHaveLength(1);
    // Otro dispositivo con la misma copia local
    localStorage.setItem('mp_credit_notes', JSON.stringify([
      { id: 'prueba-local-1', clientId, tipo: 'vianda_favor', descripcion: 'Prueba', cantidad: 1, fecha: '2026-10-20T15:00:00.000Z', aplicado: false },
    ]));
    const { vi } = await import('vitest');
    vi.resetModules();
    const store2 = await import('@/lib/store');
    const notas = await store2.getCreditNotes(clientId);
    expect(notas).toHaveLength(1);
    await store2.setCreditNoteAplicado(notas[0].id, true);
    const nueva = await store2.saveCreditNote({ clientId, tipo: 'descuento', descripcion: 'Prueba 2', monto: 100 });
    expect((await store2.getCreditNotes(clientId)).map(n => n.aplicado).sort()).toEqual([false, true]);
    await store2.deleteCreditNote(nueva.id);
    expect(await store2.getCreditNotes(clientId)).toHaveLength(1);
  }, 30000);

  it('viandas a favor manuales: suman al contrato, se corrigen y se anulan con historial', async () => {
    const antes = (await balance(noviembre)).disponible;
    const n = await store.saveCreditNote({ clientId, tipo: 'vianda_favor', descripcion: 'Prueba manual', cantidad: 3, planId: noviembre.id });
    expect((await store.loadPlans()).find(p => p.id === noviembre.id)!.ajusteManualFavor).toBe(3);
    expect((await balance(noviembre)).disponible).toBe(antes + 3);

    const c = await store.updateManualCredit(n.id, { cantidad: 2 }, 'prueba de corrección');
    expect(c.historial.map(h => h.accion)).toEqual(['creado', 'corregido']);
    expect((await balance(noviembre)).disponible).toBe(antes + 2);

    const a = await store.anularCreditNote(n.id, 'prueba de anulación');
    expect(a.anulado).toBe(true);
    expect((await balance(noviembre)).disponible).toBe(antes);
    // Pendiente (sin contrato): no suma hasta asignarlo; asignarlo dos veces no duplica
    const p = await store.saveCreditNote({ clientId, tipo: 'vianda_favor', descripcion: 'Pendiente', cantidad: 1 });
    expect((await balance(noviembre)).disponible).toBe(antes);
    expect(await store.assignPendingManualCredits([p.id, p.id], noviembre.id, 'prueba')).toBe(1);
    expect((await balance(noviembre)).disponible).toBe(antes + 1);
  }, 60000);
});
