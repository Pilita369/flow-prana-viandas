import { supabase } from '@/lib/supabase';
import type {
  Client,
  Plan,
  Consumption,
  FlexibleOrder,
  PointTransaction,
  Reward,
  Redemption,
  CreditNote,
  CreditNoteTipo,
  CreditNoteChange,
  DayOfWeek,
  ConsumptionStatus,
  OrderStatus,
} from '@/types';
import { calcularTotalContrato, getDayNameFromDate, isHoliday, isExcludedForClient } from '@/lib/business';
import { addDaysISO, dayTotal, parseISODate, partsInAR, planDailySave, todayISO, todayLabelAR } from '@/lib/consumo';
import { enTramos } from '@/lib/habiles';

// ======================================================
// HELPERS GENERALES
// ======================================================

function generateId(): string {
  return crypto.randomUUID();
}

function generateReferralCode(nombre: string): string {
  return (nombre.substring(0, 3).toUpperCase() + generateId().substring(0, 5)).toUpperCase();
}

function getItem<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
}

function setItem<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeConsumptionStatus(
  status: ConsumptionStatus
): 'retirado' | 'no_retirado' | 'reprogramado' | 'pendiente' {
  if (status === 'consumido') return 'retirado';
  if (status === 'no_retiro') return 'no_retirado';
  return status;
}

// ======================================================
// AUTH ADMIN LOCAL
// ======================================================

const ADMIN_EMAIL = 'admin@mundoprana.com';
const ADMIN_PASSWORD = 'prana2024';

export function authenticateAdmin(email: string, password: string): boolean {
  return email === ADMIN_EMAIL && password === ADMIN_PASSWORD;
}

export function isAdminLogged(): boolean {
  return sessionStorage.getItem('mp_admin') === 'true';
}

export function loginAdmin(email: string, password: string): boolean {
  const ok = authenticateAdmin(email, password);
  if (ok) sessionStorage.setItem('mp_admin', 'true');
  return ok;
}

export function logoutAdmin(): void {
  sessionStorage.removeItem('mp_admin');
}

// ======================================================
// CACHE SIMPLE
// ======================================================

let _clientsCache: Client[] = [];
let _plansCache: Plan[] = [];
let _consumptionsCache: Consumption[] = [];
let _ordersCache: FlexibleOrder[] = [];
let _pointsCache: PointTransaction[] = [];

function clearCache(): void {
  _clientsCache = [];
  _plansCache = [];
  _consumptionsCache = [];
  _ordersCache = [];
  _pointsCache = [];
}

// ======================================================
// MAPEO DB -> APP
// ======================================================

function rowToClient(row: Record<string, unknown>): Client {
  return {
    id: row.id as string,
    nombre: row.nombre as string,
    apellido: row.apellido as string,
    telefono: row.telefono as string,
    email: (row.email as string) || '',
    direccion: row.direccion as string | undefined,
    codigoReferido: (row.codigo_referido as string) || '',
    referidoPor: row.referido_por as string | undefined,
    puntos: (row.puntos as number) || 0,
    accessLink: row.access_link as string,
    hasAccount: (row.has_account as boolean) || false,
    password: row.password as string | undefined,
    alias: row.alias as string | undefined,
    createdAt: row.created_at as string,
  };
}

/** Los contratos se leen junto con sus ajustes manuales de viandas a favor. */
const PLAN_SELECT = '*, credit_notes(cantidad, tipo, anulado)';

function sumAjusteManual(row: Record<string, unknown>): number {
  const notes = row.credit_notes as { cantidad: number | null; tipo: string; anulado: boolean }[] | undefined;
  if (!Array.isArray(notes)) return 0;
  return notes
    .filter(n => n.tipo === 'vianda_favor' && !n.anulado)
    .reduce((acc, n) => acc + Math.max(Number(n.cantidad) || 0, 0), 0);
}

function rowToPlan(row: Record<string, unknown>): Plan {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    cantidadContratada: (row.cantidad_contratada as number) || 0,
    ajusteInicialUsadas: (row.ajuste_inicial_usadas as number) || 0,
    modalidad: row.modalidad as 'fijo' | 'flexible',
    precioUnitario: Number(row.precio_unitario || 0),
    totalCalculado: Number(row.total_calculado || 0),
    fechaInicio: row.fecha_inicio as string,
    fechaFin: row.fecha_fin as string,
    tipoEntrega: ((row.tipo_entrega as 'retiro' | 'envio') || 'retiro'),
    direccionEnvio: row.direccion_envio as string | undefined,
    costoEnvio: row.costo_envio as number | undefined,
    unidadesPorRetiro: (row.unidades_por_retiro as number) || 1,
    activo: (row.activo as boolean) ?? true,
    diasFijos: row.dias_fijos as DayOfWeek[] | undefined,
    cantidadSemanal: row.cantidad_semanal as number | undefined,
    horaLimite: row.hora_limite as string | undefined,
    fechasExcluidas: (row.fechas_excluidas as string[]) || [],
    observaciones: row.observaciones as string | undefined,
    saldoAnteriorAplicado: Number(row.saldo_anterior_aplicado || 0),
    saldoOrigenPlanId: (row.saldo_origen_plan_id as string) || undefined,
    ajusteManualFavor: sumAjusteManual(row),
    regimen: (row.regimen as Plan['regimen']) || undefined,
    intervalos: Array.isArray(row.intervalos) ? (row.intervalos as Plan['intervalos']) : undefined,
    cantidadSolicitada: row.cantidad_solicitada === null || row.cantidad_solicitada === undefined ? undefined : Number(row.cantidad_solicitada),
  };
}

function rowToConsumption(row: Record<string, unknown>): Consumption {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    planId: row.plan_id as string,
    fecha: row.fecha as string,
    status: row.status as ConsumptionStatus,
    tipo: row.tipo as 'fijo' | 'flexible' | 'manual',
    cantidad: (row.cantidad as number) || 0,
    notas: row.notas as string | undefined,
    notaCliente: (row.nota_cliente as string | null) || undefined,
    createdAt: row.created_at as string,
  };
}

function rowToOrder(row: Record<string, unknown>): FlexibleOrder {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    planId: row.plan_id as string,
    fechaPedido: row.fecha_pedido as string,
    fechaEntrega: row.fecha_entrega as string,
    status: row.status as OrderStatus,
    creadoPor: row.creado_por as 'cliente' | 'admin',
  };
}

function rowToPoint(row: Record<string, unknown>): PointTransaction {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    puntos: (row.puntos as number) || 0,
    motivo: row.motivo as string,
    fecha: row.fecha as string,
  };
}

// ======================================================
// CLIENTES
// ======================================================

export async function loadClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error cargando clientes:', error.message);
    return [];
  }

  _clientsCache = (data || []).map((row) => rowToClient(row as Record<string, unknown>));
  return _clientsCache;
}

export async function getClients(): Promise<Client[]> {
  if (_clientsCache.length > 0) return _clientsCache;
  return loadClients();
}

export async function getClient(id: string): Promise<Client | undefined> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Error cargando cliente:', error.message);
    return undefined;
  }

  return data ? rowToClient(data as Record<string, unknown>) : undefined;
}

/** Cliente por su link de acceso; lanza el error si la consulta falla (undefined = el link no existe). */
export async function loadClientByLinkOrThrow(link: string): Promise<Client | undefined> {
  const { data, error } = await supabase.from('clients').select('*').eq('access_link', link).maybeSingle();
  if (error) throw new Error(`No se pudieron cargar tus datos: ${error.message}`);
  return data ? rowToClient(data as Record<string, unknown>) : undefined;
}

export async function getClientByLink(link: string): Promise<Client | undefined> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('access_link', link)
    .maybeSingle();

  if (error) {
    console.error('Error cargando cliente por link:', error.message);
    return undefined;
  }

  return data ? rowToClient(data as Record<string, unknown>) : undefined;
}

export async function getClientByCodigoReferido(codigo: string): Promise<Client | undefined> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('codigo_referido', codigo.toUpperCase())
    .maybeSingle();

  if (error) {
    console.error('Error buscando código referido:', error.message);
    return undefined;
  }

  return data ? rowToClient(data as Record<string, unknown>) : undefined;
}

export async function getClientByEmail(email: string): Promise<Client | undefined> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (error) {
    console.error('Error cargando cliente por email:', error.message);
    return undefined;
  }

  return data ? rowToClient(data as Record<string, unknown>) : undefined;
}

export async function createClient(
  data: Omit<Client, 'id' | 'codigoReferido' | 'puntos' | 'accessLink' | 'hasAccount' | 'createdAt'>
): Promise<Client> {
  const newClient = {
    id: generateId(),
    nombre: data.nombre,
    apellido: data.apellido,
    telefono: data.telefono,
    email: data.email || null,
    direccion: data.direccion || null,
    alias: data.alias || null,
    codigo_referido: generateReferralCode(data.nombre),
    referido_por: data.referidoPor || null,
    puntos: 0,
    access_link: generateId(),
    has_account: !!data.password,
    password: data.password || null,
  };

  const { data: inserted, error } = await supabase
    .from('clients')
    .insert(newClient)
    .select()
    .single();

  if (error) {
    console.error('Error creando cliente:', error.message);
    throw new Error(`Error creando cliente: ${error.message}`);
  }

  clearCache();
  return rowToClient(inserted as Record<string, unknown>);
}

export async function updateClient(id: string, data: Partial<Client>): Promise<Client | undefined> {
  const payload: Record<string, unknown> = {};

  if (data.nombre !== undefined) payload.nombre = data.nombre;
  if (data.apellido !== undefined) payload.apellido = data.apellido;
  if (data.telefono !== undefined) payload.telefono = data.telefono;
  if (data.email !== undefined) payload.email = data.email;
  if (data.direccion !== undefined) payload.direccion = data.direccion;
  if (data.alias !== undefined) payload.alias = data.alias;
  if (data.codigoReferido !== undefined) payload.codigo_referido = data.codigoReferido;
  if (data.referidoPor !== undefined) payload.referido_por = data.referidoPor;
  if (data.puntos !== undefined) payload.puntos = data.puntos;
  if (data.accessLink !== undefined) payload.access_link = data.accessLink;
  if (data.hasAccount !== undefined) payload.has_account = data.hasAccount;
  if (data.password !== undefined) payload.password = data.password;

  const { data: updated, error } = await supabase
    .from('clients')
    .update(payload)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error actualizando cliente:', error.message);
    return undefined;
  }

  clearCache();
  return updated ? rowToClient(updated as Record<string, unknown>) : undefined;
}

export async function deleteClient(id: string): Promise<void> {
  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error eliminando cliente:', error.message);
    throw new Error(`Error eliminando cliente: ${error.message}`);
  }

  clearCache();
}

// ======================================================
// PLANES
// ======================================================

export async function loadPlans(): Promise<Plan[]> {
  const { data, error } = await supabase
    .from('plans')
    .select(PLAN_SELECT)
    .order('fecha_inicio', { ascending: false });

  if (error) {
    console.error('Error cargando planes:', error.message);
    return [];
  }

  _plansCache = (data || []).map((row) => rowToPlan(row as Record<string, unknown>));
  return _plansCache;
}

/** Igual que loadPlans pero lanza el error (para pantallas que deben avisar si falla). */
export async function loadPlansOrThrow(): Promise<Plan[]> {
  const { data, error } = await supabase.from('plans').select(PLAN_SELECT).order('fecha_inicio', { ascending: false });
  if (error) throw new Error(`No se pudieron cargar los contratos: ${error.message}`);
  _plansCache = (data || []).map((row) => rowToPlan(row as Record<string, unknown>));
  return _plansCache;
}

export async function getPlans(): Promise<Plan[]> {
  if (_plansCache.length > 0) return _plansCache;
  return loadPlans();
}

/** Contratos de un cliente leídos directo de la base; lanza el error (para pantallas que deben avisar si falla). */
export async function loadClientPlansOrThrow(clientId: string): Promise<Plan[]> {
  const { data, error } = await supabase
    .from('plans')
    .select(PLAN_SELECT)
    .eq('client_id', clientId)
    .order('fecha_inicio', { ascending: false });
  if (error) throw new Error(`No se pudieron cargar los contratos: ${error.message}`);
  return (data || []).map((row) => rowToPlan(row as Record<string, unknown>));
}

/** Cliente leído de la base; lanza el error si la consulta falla (undefined = no existe). */
export async function loadClientOrThrow(id: string): Promise<Client | undefined> {
  const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`No se pudo cargar el cliente: ${error.message}`);
  return data ? rowToClient(data as Record<string, unknown>) : undefined;
}

/** Movimientos de puntos de un cliente (sin traer los de todos). */
export async function loadClientPointsOrThrow(clientId: string): Promise<PointTransaction[]> {
  const { data, error } = await supabase.from('points').select('*').eq('client_id', clientId).order('fecha', { ascending: false });
  if (error) throw new Error(`No se pudieron cargar los puntos: ${error.message}`);
  return (data || []).map((r) => rowToPoint(r as Record<string, unknown>));
}

export async function getClientPlans(clientId: string): Promise<Plan[]> {
  const plans = await getPlans();
  return plans.filter((p) => p.clientId === clientId);
}

export async function getActivePlan(clientId: string): Promise<Plan | undefined> {
  const plans = await getPlans();
  return plans.find((p) => p.clientId === clientId && p.activo);
}

export async function createPlan(
  data: Omit<Plan, 'id' | 'activo' | 'totalCalculado'>
): Promise<Plan> {
  await supabase
    .from('plans')
    .update({ activo: false })
    .eq('client_id', data.clientId);

  const newPlan = {
    id: generateId(),
    client_id: data.clientId,
    cantidad_contratada: data.cantidadContratada,
    ajuste_inicial_usadas: data.ajusteInicialUsadas || 0,
    modalidad: data.modalidad,
    precio_unitario: data.precioUnitario,
    total_calculado: calcularTotalContrato(data.cantidadContratada, data.precioUnitario),
    fecha_inicio: data.fechaInicio,
    fecha_fin: data.fechaFin,
    tipo_entrega: data.tipoEntrega || 'retiro',
    direccion_envio: data.direccionEnvio || null,
    costo_envio: data.costoEnvio || null,
    unidades_por_retiro: data.unidadesPorRetiro || 1,
    activo: true,
    dias_fijos: data.diasFijos || null,
    cantidad_semanal: data.cantidadSemanal || null,
    hora_limite: data.horaLimite || null,
    fechas_excluidas: data.fechasExcluidas || [],
    observaciones: data.observaciones || null,
    saldo_anterior_aplicado: data.saldoAnteriorAplicado || 0,
    saldo_origen_plan_id: data.saldoOrigenPlanId || null,
    regimen: data.regimen || null,
    intervalos: data.regimen === 'intervalos' && data.intervalos?.length ? data.intervalos : null,
    cantidad_solicitada: data.cantidadSolicitada ?? null,
  };

  const { data: inserted, error } = await supabase
    .from('plans')
    .insert(newPlan)
    .select(PLAN_SELECT)
    .single();

  if (error) {
    console.error('Error creando plan:', error.message);
    throw new Error(`Error creando plan: ${error.message}`);
  }

  clearCache();
  return rowToPlan(inserted as Record<string, unknown>);
}

export async function updatePlan(id: string, data: Partial<Plan>): Promise<Plan | undefined> {
  const payload: Record<string, unknown> = {};

  if (data.cantidadContratada !== undefined) payload.cantidad_contratada = data.cantidadContratada;
  if (data.ajusteInicialUsadas !== undefined) payload.ajuste_inicial_usadas = data.ajusteInicialUsadas;
  if (data.modalidad !== undefined) payload.modalidad = data.modalidad;
  if (data.precioUnitario !== undefined) payload.precio_unitario = data.precioUnitario;
  if (data.fechaInicio !== undefined) payload.fecha_inicio = data.fechaInicio;
  if (data.fechaFin !== undefined) payload.fecha_fin = data.fechaFin;
  if (data.tipoEntrega !== undefined) payload.tipo_entrega = data.tipoEntrega;
  if (data.direccionEnvio !== undefined) payload.direccion_envio = data.direccionEnvio;
  if (data.costoEnvio !== undefined) payload.costo_envio = data.costoEnvio;
  if (data.unidadesPorRetiro !== undefined) payload.unidades_por_retiro = data.unidadesPorRetiro;
  if (data.activo !== undefined) payload.activo = data.activo;
  if (data.diasFijos !== undefined) payload.dias_fijos = data.diasFijos;
  if (data.cantidadSemanal !== undefined) payload.cantidad_semanal = data.cantidadSemanal;
  if (data.horaLimite !== undefined) payload.hora_limite = data.horaLimite;
  if (data.fechasExcluidas !== undefined) payload.fechas_excluidas = data.fechasExcluidas;
  if (data.observaciones !== undefined) payload.observaciones = data.observaciones;
  if (data.saldoAnteriorAplicado !== undefined) payload.saldo_anterior_aplicado = data.saldoAnteriorAplicado;
  if (data.saldoOrigenPlanId !== undefined) payload.saldo_origen_plan_id = data.saldoOrigenPlanId || null;
  if (data.regimen !== undefined) payload.regimen = data.regimen || null;
  if (data.intervalos !== undefined) payload.intervalos = data.intervalos?.length ? data.intervalos : null;
  if (data.cantidadSolicitada !== undefined) payload.cantidad_solicitada = data.cantidadSolicitada ?? null;

  if (data.cantidadContratada !== undefined || data.precioUnitario !== undefined) {
    const plans = await getPlans();
    const current = plans.find((p) => p.id === id);
    const cantidad = data.cantidadContratada ?? current?.cantidadContratada ?? 0;
    const precio = data.precioUnitario ?? current?.precioUnitario ?? 0;
    payload.total_calculado = calcularTotalContrato(cantidad, precio);
  }

  const { data: updated, error } = await supabase
    .from('plans')
    .update(payload)
    .eq('id', id)
    .select(PLAN_SELECT)
    .maybeSingle();

  if (error) {
    console.error('Error actualizando plan:', error.message);
    return undefined;
  }

  clearCache();
  return updated ? rowToPlan(updated as Record<string, unknown>) : undefined;
}

export async function renovarPlan(
  clientId: string,
  data: Omit<Plan, 'id' | 'activo' | 'totalCalculado'>,
  puntosRenovacion: number = 30
): Promise<Plan> {
  const newPlan = await createPlan(data);
  if (puntosRenovacion > 0) {
    await addPoints(clientId, puntosRenovacion, 'Renovación de plan');
  }
  return newPlan;
}

export async function getPlanConsumptions(planId: string): Promise<Consumption[]> {
  const consumptions = await getConsumptions();
  return consumptions.filter((c) => c.planId === planId);
}

export async function getCantidadUsada(plan?: Plan | null): Promise<number> {
  if (!plan) return 0;

  const ajusteInicial = plan.ajusteInicialUsadas || 0;

  const historial = (await getPlanConsumptions(plan.id))
    .filter((c) => normalizeConsumptionStatus(c.status) === 'retirado')
    .reduce((acc, c) => acc + (c.cantidad || 0), 0);

  return ajusteInicial + historial;
}

export async function getDisponibles(plan?: Plan | null): Promise<number> {
  if (!plan) return 0;
  const trasladado = (await getPlans())
    .filter((p) => p.saldoOrigenPlanId === plan.id)
    .reduce((acc, p) => acc + (p.saldoAnteriorAplicado || 0), 0);
  return Math.max(
    plan.cantidadContratada + (plan.saldoAnteriorAplicado || 0) + (plan.ajusteManualFavor || 0) - (await getCantidadUsada(plan)) - trasladado,
    0
  );
}

/**
 * Aplica (o corrige) el saldo a favor de un contrato en el contrato siguiente.
 * Solo se ejecuta por confirmación explícita y deja constancia en las observaciones del contrato destino.
 */
export async function applyCarryOver(params: {
  fromPlan: Plan;
  toPlan: Plan;
  cantidad: number;
  reducirCompra: boolean;
  motivo?: string;
  /** Conciliación: guardar antes una copia de ambos contratos en "respaldos" y anotarla también en el contrato de origen. */
  respaldar?: boolean;
}): Promise<Plan> {
  const { fromPlan, toPlan, reducirCompra, motivo, respaldar } = params;
  const cantidad = Math.max(Math.floor(params.cantidad || 0), 0);
  const previo = toPlan.saldoOrigenPlanId === fromPlan.id ? toPlan.saldoAnteriorAplicado || 0 : 0;

  if (toPlan.saldoOrigenPlanId && toPlan.saldoOrigenPlanId !== fromPlan.id && (toPlan.saldoAnteriorAplicado || 0) > 0) {
    throw new Error('El contrato siguiente ya tiene saldo aplicado desde otro contrato');
  }

  const payload: Record<string, unknown> = {
    saldo_anterior_aplicado: cantidad,
    saldo_origen_plan_id: cantidad > 0 ? fromPlan.id : null,
  };

  let nuevaCompra = toPlan.cantidadContratada;
  if (reducirCompra) {
    nuevaCompra = Math.max(toPlan.cantidadContratada - (cantidad - previo), 0);
    payload.cantidad_contratada = nuevaCompra;
    payload.total_calculado = calcularTotalContrato(nuevaCompra, toPlan.precioUnitario);
  }

  const hoy = todayLabelAR();
  const origen = `${fromPlan.fechaInicio.split('-').reverse().join('/')}–${fromPlan.fechaFin.split('-').reverse().join('/')}`;
  const linea =
    `[${hoy}] Saldo anterior aplicado: ${previo} → ${cantidad} vianda(s) del contrato ${origen}` +
    (reducirCompra && nuevaCompra !== toPlan.cantidadContratada
      ? `; compra ajustada de ${toPlan.cantidadContratada} a ${nuevaCompra}`
      : '') +
    (motivo ? ` (${motivo})` : '') +
    '.';
  payload.observaciones = toPlan.observaciones ? `${toPlan.observaciones}\n${linea}` : linea;

  if (respaldar) {
    // Copia de ambos contratos tal como están en la base, antes de cambiar nada
    const { data: actuales, error: readError } = await supabase.from('plans').select('*').in('id', [fromPlan.id, toPlan.id]);
    if (readError) throw new Error(`No se pudo leer el contrato para respaldarlo (no se cambió nada): ${readError.message}`);
    const { error: backupError } = await supabase.from('respaldos').insert((actuales || []).map((row) => ({
      motivo: `Antes de ${motivo || 'conciliar el saldo trasladado'}: traslado ${previo} → ${cantidad} vianda(s) del contrato ${origen}`,
      tabla: 'plans',
      registro_id: String((row as Record<string, unknown>).id),
      datos: row,
    })));
    if (backupError) throw new Error(`No se pudo guardar el respaldo (no se cambió nada): ${backupError.message}`);
  }

  const { data, error } = await supabase
    .from('plans')
    .update(payload)
    .eq('id', toPlan.id)
    .select(PLAN_SELECT)
    .single();

  if (error) {
    console.error('Error aplicando saldo:', error.message);
    throw new Error(`Error aplicando saldo: ${error.message}`);
  }

  if (respaldar) {
    // Constancia también en el contrato de origen (no cambia ninguna cantidad)
    const destino = `${toPlan.fechaInicio.split('-').reverse().join('/')}–${toPlan.fechaFin.split('-').reverse().join('/')}`;
    const nota = `[${hoy}] Saldo trasladado conciliado: ${previo} → ${cantidad} vianda(s) al contrato ${destino}${motivo ? ` (${motivo})` : ''}.`;
    const { error: notaError } = await supabase
      .from('plans')
      .update({ observaciones: fromPlan.observaciones ? `${fromPlan.observaciones}\n${nota}` : nota })
      .eq('id', fromPlan.id);
    if (notaError) console.error('No se pudo anotar la conciliación en el contrato de origen:', notaError.message);
  }

  clearCache();
  return rowToPlan(data as Record<string, unknown>);
}

/**
 * Concilia el saldo trasladado después de corregir consumos de un contrato cerrado.
 * Se hace en la base en una sola transacción (función conciliar_traslado): respalda ambos contratos,
 * fija lo recibido por el destino y lo anota en origen y destino. Repetirla no descuenta otra vez.
 * No toca compras, importes, pagos ni consumos, y conserva el vínculo entre los contratos.
 */
export async function conciliarTraslado(params: { fromPlanId: string; toPlanId: string; cantidad: number; motivo?: string }): Promise<{ cambio: boolean; antes: number; despues: number; sobrante: number }> {
  const { data, error } = await supabase.rpc('conciliar_traslado', {
    p_origen: params.fromPlanId,
    p_destino: params.toPlanId,
    p_cantidad: Math.max(Math.floor(params.cantidad || 0), 0),
    p_motivo: params.motivo || 'conciliación por corrección de consumos',
  });
  if (error) throw new Error(`No se pudo conciliar (no se cambió nada): ${error.message}`);
  clearCache();
  return data as { cambio: boolean; antes: number; despues: number; sobrante: number };
}

// ======================================================
// CONSUMOS
// ======================================================

// Supabase devuelve como máximo 1000 filas por consulta: se pagina para no perder registros.
const PAGE_SIZE = 1000;

async function fetchAllConsumptionRows(): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('consumptions')
      .select('*')
      .order('fecha', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data || []) as Record<string, unknown>[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function loadConsumptions(): Promise<Consumption[]> {
  try {
    _consumptionsCache = (await fetchAllConsumptionRows()).map(rowToConsumption);
  } catch (e) {
    console.error('Error cargando consumos:', (e as Error).message);
    return [];
  }
  return _consumptionsCache;
}

/** Igual que loadConsumptions pero lanza el error (para pantallas que deben avisar si falla). */
export async function loadConsumptionsOrThrow(): Promise<Consumption[]> {
  _consumptionsCache = (await fetchAllConsumptionRows()).map(rowToConsumption);
  return _consumptionsCache;
}

/** Consumos de un cliente leídos directo de la base (sin caché), del más reciente al más antiguo. */
export async function loadClientConsumptionsOrThrow(clientId: string): Promise<Consumption[]> {
  let all: Consumption[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('consumptions')
      .select('*')
      .eq('client_id', clientId)
      .order('fecha', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`No se pudieron cargar los consumos: ${error.message}`);
    all = all.concat((data || []).map((r) => rowToConsumption(r as Record<string, unknown>)));
    if (!data || data.length < 1000) break;
  }
  return all;
}

/**
 * Fija el total consumido por un cliente en una fecha (reemplaza, no suma).
 * Lee el estado actual desde la base antes de escribir, por lo que repetir el guardado
 * no duplica registros ni puntos. `cantidad = null` quita el registro del día.
 * Devuelve los registros que quedan para ese día.
 */
export async function setDailyConsumption(params: {
  clientId: string;
  planId: string;
  fecha: string;
  cantidad: number | null;
  notas?: string | null;
  notaCliente?: string | null;
  /**
   * Corrección en un contrato cerrado: antes de escribir se guarda una copia del día en "respaldos"
   * (con el valor anterior y el nuevo), para dejar constancia de la corrección.
   */
  respaldo?: { motivo: string };
  /** El registro existente pertenece a otro contrato: pasarlo al contrato de su fecha. */
  reimputar?: boolean;
}): Promise<Consumption[]> {
  const { clientId, planId, fecha, cantidad, notas, notaCliente, respaldo, reimputar } = params;

  const { data: current, error: readError } = await supabase
    .from('consumptions')
    .select('*')
    .eq('client_id', clientId)
    .eq('fecha', fecha);
  if (readError) throw new Error(`No se pudo leer el día: ${readError.message}`);

  const rows = (current || []).map((r) => rowToConsumption(r as Record<string, unknown>));
  const ops = planDailySave(rows, cantidad, notas, notaCliente);
  // Si el registro que queda está en otro contrato, se pasa al contrato de su fecha
  const keep = ops.update ? rows.find(r => r.id === ops.update!.id) : rows.slice().sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))[0];
  if (reimputar && cantidad !== null && keep && keep.planId !== planId && !ops.update) {
    ops.update = { id: keep.id, cantidad, status: cantidad > 0 ? 'retirado' : 'no_retirado', notas: keep.notas || null, notaCliente: keep.notaCliente || null };
  }
  const cambiaPlan = !!reimputar && !!ops.update && !!keep && keep.planId !== planId;
  const cambia = !!ops.update || !!ops.insert || ops.deleteIds.length > 0;

  // Constancia de la corrección ANTES de modificar: si no se puede guardar el respaldo, no se cambia nada
  if (respaldo && cambia) {
    const { error } = await supabase.from('respaldos').insert({
      motivo: respaldo.motivo,
      tabla: 'consumptions',
      registro_id: `${clientId}|${fecha}`,
      datos: { antes: current || [], nuevo: { cantidad, plan_id: planId }, fecha_correccion: new Date().toISOString() },
    });
    if (error) throw new Error(`No se pudo guardar el respaldo de la corrección (no se cambió nada): ${error.message}`);
  }

  if (ops.update) {
    const { data: updated, error } = await supabase
      .from('consumptions')
      .update({
        cantidad: ops.update.cantidad, status: ops.update.status, notas: ops.update.notas, nota_cliente: ops.update.notaCliente,
        ...(cambiaPlan ? { plan_id: planId } : {}),
      })
      .eq('id', ops.update.id)
      .select('id');
    if (error) throw new Error(`No se pudo guardar: ${error.message}`);
    if (!updated || updated.length === 0) throw new Error('No se pudo guardar: la base no actualizó el registro');
  }

  if (ops.insert) {
    const { error } = await supabase.from('consumptions').insert({
      id: generateId(),
      client_id: clientId,
      plan_id: planId,
      fecha,
      status: ops.insert.status,
      tipo: 'manual',
      cantidad: ops.insert.cantidad,
      notas: ops.insert.notas,
      nota_cliente: ops.insert.notaCliente,
    });
    if (error) throw new Error(`No se pudo guardar: ${error.message}`);
  }

  if (ops.deleteIds.length > 0) {
    const { error } = await supabase.from('consumptions').delete().in('id', ops.deleteIds);
    if (error) throw new Error(`No se pudo unificar el día: ${error.message}`);
  }

  if (ops.delta !== 0) {
    await addPoints(
      clientId,
      ops.delta,
      ops.delta > 0 ? `Consumo registrado (${fecha})` : `Corrección de consumo (${fecha})`
    );
  }

  const { data: after, error: afterError } = await supabase
    .from('consumptions')
    .select('*')
    .eq('client_id', clientId)
    .eq('fecha', fecha);
  if (afterError) throw new Error(`No se pudo confirmar el guardado: ${afterError.message}. Tocá la fecha para reintentar.`);

  _consumptionsCache = [];
  const saved = (after || []).map((r) => rowToConsumption(r as Record<string, unknown>));
  // Solo se informa "guardado" si la base muestra exactamente el total pedido
  const total = dayTotal(saved);
  if (cantidad === null ? saved.length > 0 : total !== cantidad) {
    throw new Error(`No se confirmó el guardado: la base muestra ${total === null ? 'sin registro' : total}. Reintentá.`);
  }
  return saved;
}

export async function getConsumptions(): Promise<Consumption[]> {
  if (_consumptionsCache.length > 0) return _consumptionsCache;
  return loadConsumptions();
}

export async function getClientConsumptions(clientId: string): Promise<Consumption[]> {
  const consumptions = await getConsumptions();
  return consumptions
    .filter((c) => c.clientId === clientId)
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
}

export async function getTodayConsumptions(): Promise<Consumption[]> {
  const today = todayISO();
  const consumptions = await getConsumptions();
  return consumptions.filter((c) => c.fecha === today);
}

export async function createConsumption(data: Omit<Consumption, 'id' | 'createdAt'>): Promise<Consumption> {
  const newConsumption = {
    id: generateId(),
    client_id: data.clientId,
    plan_id: data.planId,
    fecha: data.fecha,
    status: data.status,
    tipo: data.tipo,
    cantidad: data.cantidad || 1,
    notas: data.notas || null,
  };

  const { data: inserted, error } = await supabase
    .from('consumptions')
    .insert(newConsumption)
    .select()
    .single();

  if (error) {
    console.error('Error creando consumo:', error.message);
    throw new Error(`Error creando consumo: ${error.message}`);
  }

  if (normalizeConsumptionStatus(data.status) === 'retirado') {
    await addPoints(data.clientId, data.cantidad, `Consumo registrado (${data.fecha})`);
  }

  clearCache();
  return rowToConsumption(inserted as Record<string, unknown>);
}

export async function updateConsumption(id: string, status: ConsumptionStatus): Promise<void> {
  const all = await getConsumptions();
  const prev = all.find((c) => c.id === id);
  if (!prev) return;

  const { error } = await supabase
    .from('consumptions')
    .update({ status })
    .eq('id', id);

  if (error) {
    console.error('Error actualizando consumo:', error.message);
    return;
  }

  const prevStatus = normalizeConsumptionStatus(prev.status);
  const nextStatus = normalizeConsumptionStatus(status);

  if (prevStatus !== 'retirado' && nextStatus === 'retirado') {
    await addPoints(prev.clientId, prev.cantidad, `Consumo registrado (${prev.fecha})`);
  }

  if (prevStatus === 'retirado' && nextStatus !== 'retirado') {
    await addPoints(prev.clientId, -prev.cantidad, `Corrección de consumo (${prev.fecha})`);
  }

  clearCache();
}

export async function deleteConsumption(id: string): Promise<void> {
  const all = await getConsumptions();
  const found = all.find((c) => c.id === id);
  if (!found) return;

  const { error } = await supabase
    .from('consumptions')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error eliminando consumo:', error.message);
    return;
  }

  if (normalizeConsumptionStatus(found.status) === 'retirado') {
    await addPoints(found.clientId, -found.cantidad, `Eliminación de consumo (${found.fecha})`);
  }

  clearCache();
}

// ======================================================
// PEDIDOS FLEXIBLES
// ======================================================

export async function loadFlexibleOrders(): Promise<FlexibleOrder[]> {
  const { data, error } = await supabase
    .from('flexible_orders')
    .select('*')
    .order('fecha_entrega', { ascending: false });

  if (error) {
    console.error('Error cargando pedidos:', error.message);
    return [];
  }

  _ordersCache = (data || []).map((row) => rowToOrder(row as Record<string, unknown>));
  return _ordersCache;
}

export async function getFlexibleOrders(): Promise<FlexibleOrder[]> {
  if (_ordersCache.length > 0) return _ordersCache;
  return loadFlexibleOrders();
}

export async function getPendingOrders(): Promise<FlexibleOrder[]> {
  const orders = await getFlexibleOrders();
  return orders.filter((o) => o.status === 'pendiente');
}

export async function createOrder(
  data: Omit<FlexibleOrder, 'id' | 'fechaPedido' | 'status'>
): Promise<FlexibleOrder> {
  const newOrder = {
    id: generateId(),
    client_id: data.clientId,
    plan_id: data.planId,
    fecha_pedido: new Date().toISOString(),
    fecha_entrega: data.fechaEntrega,
    status: 'pendiente',
    creado_por: data.creadoPor,
  };

  const { data: inserted, error } = await supabase
    .from('flexible_orders')
    .insert(newOrder)
    .select()
    .single();

  if (error) {
    console.error('Error creando pedido:', error.message);
    throw new Error(`Error creando pedido: ${error.message}`);
  }

  clearCache();
  return rowToOrder(inserted as Record<string, unknown>);
}

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<void> {
  const { error } = await supabase
    .from('flexible_orders')
    .update({ status })
    .eq('id', id);

  if (error) {
    console.error('Error actualizando pedido:', error.message);
  }

  clearCache();
}

// ======================================================
// PUNTOS
// ======================================================

export async function loadPointTransactions(): Promise<PointTransaction[]> {
  const { data, error } = await supabase
    .from('points')
    .select('*')
    .order('fecha', { ascending: false });

  if (error) {
    console.error('Error cargando puntos:', error.message);
    return [];
  }

  _pointsCache = (data || []).map((row) => rowToPoint(row as Record<string, unknown>));
  return _pointsCache;
}

export async function getPointTransactions(): Promise<PointTransaction[]> {
  if (_pointsCache.length > 0) return _pointsCache;
  return loadPointTransactions();
}

export async function getClientPoints(clientId: string): Promise<PointTransaction[]> {
  const points = await getPointTransactions();
  return points
    .filter((p) => p.clientId === clientId)
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
}

export async function addPoints(clientId: string, puntos: number, motivo: string): Promise<void> {
  const newPoint = {
    id: generateId(),
    client_id: clientId,
    puntos,
    motivo,
    fecha: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('points')
    .insert(newPoint);

  if (error) {
    console.error('Error agregando puntos:', error.message);
    return;
  }

  const client = await getClient(clientId);
  if (client) {
    await updateClient(clientId, {
      puntos: Math.max((client.puntos || 0) + puntos, 0),
    });
  }

  clearCache();
}

// ======================================================
// RECOMPENSAS / CANJES (LOCAL POR AHORA)
// ======================================================

export function getRewards(): Reward[] {
  return getItem('mp_rewards', [
    { id: 'r1', nombre: '🥗 1 Vianda extra', descripcion: 'Canje por una vianda de la carta fija', puntosRequeridos: 100, activo: true },
    { id: 'r2', nombre: '🎁 Postre o budín gratis', descripcion: 'Canje por un producto elaborado', puntosRequeridos: 200, activo: true },
    { id: 'r3', nombre: '💸 15% off en productos extras', descripcion: 'Compra productos elaborados por Mundo Prana', puntosRequeridos: 350, activo: true },
    { id: 'r4', nombre: '🌟 5 viandas', descripcion: 'Viandas de la carta congelada a eleccion', puntosRequeridos: 500, activo: true },
  ]);
}

export function saveRewards(rewards: Reward[]): void {
  setItem('mp_rewards', rewards);
}

export function getRedemptions(): Redemption[] {
  return getItem('mp_redemptions', []);
}

export async function redeemReward(clientId: string, rewardId: string): Promise<boolean> {
  const reward = getRewards().find((r) => r.id === rewardId);
  if (!reward) return false;

  const redemptions = getRedemptions();
  redemptions.push({
    id: generateId(),
    clientId,
    rewardId,
    fecha: new Date().toISOString(),
    puntosUsados: reward.puntosRequeridos,
  });

  setItem('mp_redemptions', redemptions);
  await addPoints(clientId, -reward.puntosRequeridos, `Canje: ${reward.nombre}`);
  return true;
}

// ======================================================
// NOTAS DE CRÉDITO / AJUSTES A FAVOR
// ======================================================

// Se guardan en Supabase (tabla credit_notes). Antes vivían solo en el navegador
// (localStorage 'mp_credit_notes'); migrateLocalCreditNotes los copia una sola vez.

const LOCAL_CREDIT_NOTES_KEY = 'mp_credit_notes';
const LOCAL_CREDIT_NOTES_BACKUP_KEY = 'mp_credit_notes_respaldo';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCreditNote(row: any): CreditNote {
  return {
    id: row.id,
    clientId: row.client_id,
    tipo: row.tipo,
    descripcion: row.descripcion,
    monto: row.monto === null || row.monto === undefined ? undefined : Number(row.monto),
    cantidad: row.cantidad === null || row.cantidad === undefined ? undefined : Number(row.cantidad),
    fecha: row.fecha,
    aplicado: !!row.aplicado,
    planId: row.plan_id || undefined,
    anulado: !!row.anulado,
    anuladoMotivo: row.anulado_motivo || undefined,
    anuladoAt: row.anulado_at || undefined,
    historial: Array.isArray(row.historial) ? row.historial : [],
  };
}

function cambio(accion: CreditNoteChange['accion'], detalle: string): CreditNoteChange {
  return { fecha: new Date().toISOString(), accion, detalle };
}

function planLabel(planId: string | undefined, plans: Plan[]): string {
  const p = planId ? plans.find(x => x.id === planId) : undefined;
  if (!p) return 'pendiente (sin contrato)';
  const f = (iso: string) => iso.split('-').reverse().join('/');
  return `contrato ${f(p.fechaInicio)} a ${f(p.fechaFin)}`;
}

let creditNotesMigration: Promise<void> | null = null;

/**
 * Copia a Supabase los ajustes guardados en este navegador.
 * - No duplica: cada ajuste lleva su id original en legacy_id (único) y se inserta ignorando los que ya existen.
 * - No pierde: la copia local se conserva en 'mp_credit_notes_respaldo'.
 * - Si falla, se reintenta la próxima vez que se abra la pantalla.
 */
export function migrateLocalCreditNotes(): Promise<void> {
  if (!creditNotesMigration) {
    creditNotesMigration = (async () => {
      const local = getItem<CreditNote[]>(LOCAL_CREDIT_NOTES_KEY, []);
      if (!Array.isArray(local) || local.length === 0) return;

      const { data: existingClients, error: clientsError } = await supabase.from('clients').select('id');
      if (clientsError) throw clientsError;
      const clientIds = new Set((existingClients || []).map((c: { id: string }) => c.id));

      const rows = local
        .filter(n => n && n.id && clientIds.has(n.clientId))
        .map(n => ({
          legacy_id: String(n.id),
          client_id: n.clientId,
          tipo: n.tipo,
          descripcion: n.descripcion || '',
          monto: n.monto ?? null,
          cantidad: n.cantidad ?? null,
          fecha: n.fecha || new Date().toISOString(),
          aplicado: !!n.aplicado,
        }));

      if (rows.length > 0) {
        const { error } = await supabase
          .from('credit_notes')
          .upsert(rows, { onConflict: 'legacy_id', ignoreDuplicates: true });
        if (error) throw error;
      }

      // Conservar la copia local como respaldo y dejar de usarla.
      const previousBackup = getItem<CreditNote[]>(LOCAL_CREDIT_NOTES_BACKUP_KEY, []);
      const backupIds = new Set(previousBackup.map(n => n.id));
      setItem(LOCAL_CREDIT_NOTES_BACKUP_KEY, [...previousBackup, ...local.filter(n => !backupIds.has(n.id))]);
      localStorage.removeItem(LOCAL_CREDIT_NOTES_KEY);
    })().catch(err => {
      creditNotesMigration = null;
      console.error('No se pudieron copiar los ajustes del navegador a la base', err);
    });
  }
  return creditNotesMigration;
}

export async function getCreditNotes(clientId: string): Promise<CreditNote[]> {
  await migrateLocalCreditNotes();
  const { data, error } = await supabase
    .from('credit_notes')
    .select('*')
    .eq('client_id', clientId)
    .order('fecha', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToCreditNote);
}

export async function saveCreditNote(
  data: Omit<CreditNote, 'id' | 'fecha' | 'aplicado' | 'anulado' | 'historial'>
): Promise<CreditNote> {
  const esVianda = data.tipo === 'vianda_favor';
  const cantidad = esVianda ? Math.floor(Number(data.cantidad)) : data.cantidad;
  if (esVianda && !(Number(cantidad) > 0)) throw new Error('Indicá cuántas viandas a favor');
  const plans = esVianda ? await loadPlans() : [];
  if (esVianda && data.planId && !plans.some(p => p.id === data.planId && p.clientId === data.clientId)) {
    throw new Error('El contrato elegido no es de este cliente');
  }
  const detalle = esVianda
    ? `${cantidad} vianda(s) a favor, suma a ${planLabel(data.planId, plans)}`
    : data.monto ? `Monto ${data.monto}` : 'Registrado';
  const { data: row, error } = await supabase
    .from('credit_notes')
    .insert({
      client_id: data.clientId,
      tipo: data.tipo,
      descripcion: data.descripcion,
      monto: data.monto ?? null,
      cantidad: cantidad ?? null,
      plan_id: esVianda ? data.planId || null : null,
      // Una vianda a favor asignada a un contrato ya está sumada a su saldo.
      aplicado: esVianda && !!data.planId,
      historial: [cambio('creado', detalle)],
    })
    .select('*')
    .single();
  if (error) throw error;
  clearCache();
  return rowToCreditNote(row);
}

async function getCreditNoteOrThrow(id: string): Promise<CreditNote> {
  const { data, error } = await supabase.from('credit_notes').select('*').eq('id', id).single();
  if (error) throw error;
  if (!data) throw new Error('No se encontró el ajuste');
  return rowToCreditNote(data);
}

/**
 * Corrige un ajuste manual de viandas (cantidad, motivo o contrato) y deja el cambio en su historial.
 * Siempre parte de la versión guardada, así el historial refleja lo que había realmente.
 */
export async function updateManualCredit(
  id: string,
  cambios: { cantidad?: number; descripcion?: string; planId?: string | null },
  motivo?: string,
): Promise<CreditNote> {
  const actual = await getCreditNoteOrThrow(id);
  if (actual.anulado) throw new Error('El ajuste está anulado');
  if (actual.tipo !== 'vianda_favor') throw new Error('Solo se corrigen ajustes de viandas');
  const plans = await loadPlans();

  const cantidad = cambios.cantidad === undefined ? actual.cantidad || 0 : Math.floor(Number(cambios.cantidad));
  if (!(cantidad > 0)) throw new Error('La cantidad debe ser mayor a 0. Para quitarlo, anulalo.');
  const descripcion = cambios.descripcion === undefined ? actual.descripcion : cambios.descripcion.trim();
  const planId = cambios.planId === undefined ? actual.planId : cambios.planId || undefined;
  if (planId && !plans.some(p => p.id === planId && p.clientId === actual.clientId)) {
    throw new Error('El contrato elegido no es de este cliente');
  }

  const partes: string[] = [];
  if (cantidad !== (actual.cantidad || 0)) partes.push(`cantidad ${actual.cantidad || 0} → ${cantidad}`);
  if (planId !== actual.planId) partes.push(`${planLabel(actual.planId, plans)} → ${planLabel(planId, plans)}`);
  if (descripcion !== actual.descripcion) partes.push(`motivo "${actual.descripcion || '-'}" → "${descripcion || '-'}"`);
  if (partes.length === 0) return actual;
  const detalle = partes.join('; ') + (motivo?.trim() ? ` (${motivo.trim()})` : '');

  const { data, error } = await supabase
    .from('credit_notes')
    .update({
      cantidad,
      descripcion,
      plan_id: planId || null,
      aplicado: !!planId,
      historial: [...actual.historial, cambio(planId && !actual.planId ? 'asignado' : 'corregido', detalle)],
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  clearCache();
  return rowToCreditNote(data);
}

/** Anula un ajuste: deja de contar en el saldo, pero queda visible con su historial. */
export async function anularCreditNote(id: string, motivo?: string): Promise<CreditNote> {
  const actual = await getCreditNoteOrThrow(id);
  if (actual.anulado) return actual;
  const ahora = new Date().toISOString();
  const { data, error } = await supabase
    .from('credit_notes')
    .update({
      anulado: true,
      anulado_at: ahora,
      anulado_motivo: motivo?.trim() || null,
      historial: [...actual.historial, cambio('anulado', motivo?.trim() ? `Anulado: ${motivo.trim()}` : 'Anulado')],
      updated_at: ahora,
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  clearCache();
  return rowToCreditNote(data);
}

/** Viandas a favor cargadas a mano que todavía no suman a ningún contrato. */
export function isPendingManualCredit(n: CreditNote): boolean {
  return n.tipo === 'vianda_favor' && !n.anulado && !n.planId && !n.aplicado && (n.cantidad || 0) > 0;
}

/** Asigna a un contrato los ajustes de viandas pendientes indicados (por ejemplo, al renovar). */
export async function assignPendingManualCredits(ids: string[], planId: string, motivo: string): Promise<number> {
  let total = 0;
  for (const id of ids) {
    const actual = await getCreditNoteOrThrow(id);
    if (!isPendingManualCredit(actual)) continue; // ya asignado o anulado: no se cuenta dos veces
    const n = await updateManualCredit(id, { planId }, motivo);
    total += n.cantidad || 0;
  }
  return total;
}

export async function setCreditNoteAplicado(id: string, aplicado: boolean): Promise<void> {
  const actual = await getCreditNoteOrThrow(id);
  if (actual.tipo === 'vianda_favor' && actual.planId) {
    throw new Error('Esta vianda a favor ya suma a un contrato; para quitarla, anulala.');
  }
  const { error } = await supabase
    .from('credit_notes')
    .update({
      aplicado,
      historial: [...actual.historial, cambio('corregido', aplicado ? 'Marcado como aplicado' : 'Marcado como pendiente')],
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
  clearCache();
}

export async function deleteCreditNote(id: string): Promise<void> {
  const { error } = await supabase.from('credit_notes').delete().eq('id', id);
  if (error) throw error;
  clearCache();
}

// ======================================================
// RANKING
// ======================================================

export async function getRanking(): Promise<{ client: Client; puntos: number }[]> {
  const clients = await getClients();
  return clients
    .map((c) => ({ client: c, puntos: c.puntos || 0 }))
    .sort((a, b) => b.puntos - a.puntos);
}

// ======================================================
// HELPERS DE NEGOCIO
// ======================================================

export async function canOrderTomorrow(clientId: string): Promise<{ can: boolean; reason?: string }> {
  const plan = await getActivePlan(clientId);

  if (!plan) return { can: false, reason: 'No tenés un plan activo' };
  if (plan.modalidad !== 'flexible') return { can: false, reason: 'Tu plan es fijo' };
  if ((await getDisponibles(plan)) <= 0) return { can: false, reason: 'Ya no te quedan viandas disponibles' };

  const now = partsInAR();
  const horaLimite = plan.horaLimite || '20:00';
  const [h, m] = horaLimite.split(':').map(Number);

  if (now.hour > h || (now.hour === h && now.minute >= m)) {
    return { can: false, reason: `La hora límite de pedido es ${horaLimite}` };
  }

  const tomorrowStr = addDaysISO(now.iso, 1);

  const existing = (await getFlexibleOrders()).find(
    (o) => o.clientId === clientId && o.fechaEntrega === tomorrowStr && o.status !== 'cancelado'
  );

  if (existing) {
    return { can: false, reason: 'Ya tenés un pedido para mañana' };
  }

  return { can: true };
}

export function getTodayDayName(): DayOfWeek {
  const map: Record<number, DayOfWeek> = {
    1: 'lunes',
    2: 'martes',
    3: 'miercoles',
    4: 'jueves',
    5: 'viernes',
  };

  const day = parseISODate(todayISO()).getDay();
  return map[day] || 'lunes';
}

export async function getFixedClientsForToday(): Promise<{ client: Client; plan: Plan }[]> {
  const today = todayISO();
  const todayDayName = getTodayDayName();

  const clients = await getClients();
  const plans = await getPlans();

  const result: { client: Client; plan: Plan }[] = [];

  for (const client of clients) {
    const plan = plans.find(
      (p) => p.clientId === client.id && p.activo && p.modalidad === 'fijo'
    );

    if (!plan) continue;
    if (!plan.diasFijos?.includes(todayDayName)) continue;
    if (!enTramos(plan, today)) continue; // fuera de sus intervalos de servicio
    if (isHoliday(today)) continue;
    if (isExcludedForClient(today, plan.fechasExcluidas)) continue;
    if ((await getDisponibles(plan)) <= 0) continue;

    result.push({ client, plan });
  }

  return result;
}

export async function getDashboardStats(): Promise<{
  clientsCount: number;
  activePlansCount: number;
  todayRetirados: number;
  pendingOrdersCount: number;
}> {
  const clients = await getClients();
  const plans = await getPlans();
  const todayConsumptions = await getTodayConsumptions();
  const pendingOrders = await getPendingOrders();

  return {
    clientsCount: clients.length,
    activePlansCount: plans.filter((p) => p.activo).length,
    todayRetirados: todayConsumptions.filter(
      (c) => normalizeConsumptionStatus(c.status) === 'retirado'
    ).length,
    pendingOrdersCount: pendingOrders.length,
  };
}