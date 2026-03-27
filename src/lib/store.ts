import { supabase } from '@/lib/supabase';
import type {
  Client,
  Plan,
  Consumption,
  FlexibleOrder,
  PointTransaction,
  Reward,
  Redemption,
  DayOfWeek,
  ConsumptionStatus,
  OrderStatus,
} from '@/types';
import { calcularTotalContrato, getDayNameFromDate, isHoliday, isExcludedForClient } from '@/lib/business';

// ======================================================
// HELPERS GENERALES
// ======================================================

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
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
    unidadesPorRetiro: (row.unidades_por_retiro as number) || 1,
    activo: (row.activo as boolean) ?? true,
    diasFijos: row.dias_fijos as DayOfWeek[] | undefined,
    cantidadSemanal: row.cantidad_semanal as number | undefined,
    horaLimite: row.hora_limite as string | undefined,
    fechasExcluidas: (row.fechas_excluidas as string[]) || [],
    observaciones: row.observaciones as string | undefined,
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
    .select('*')
    .order('fecha_inicio', { ascending: false });

  if (error) {
    console.error('Error cargando planes:', error.message);
    return [];
  }

  _plansCache = (data || []).map((row) => rowToPlan(row as Record<string, unknown>));
  return _plansCache;
}

export async function getPlans(): Promise<Plan[]> {
  if (_plansCache.length > 0) return _plansCache;
  return loadPlans();
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
    unidades_por_retiro: data.unidadesPorRetiro || 1,
    activo: true,
    dias_fijos: data.diasFijos || null,
    cantidad_semanal: data.cantidadSemanal || null,
    hora_limite: data.horaLimite || null,
    fechas_excluidas: data.fechasExcluidas || [],
    observaciones: data.observaciones || null,
  };

  const { data: inserted, error } = await supabase
    .from('plans')
    .insert(newPlan)
    .select()
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
  if (data.unidadesPorRetiro !== undefined) payload.unidades_por_retiro = data.unidadesPorRetiro;
  if (data.activo !== undefined) payload.activo = data.activo;
  if (data.diasFijos !== undefined) payload.dias_fijos = data.diasFijos;
  if (data.cantidadSemanal !== undefined) payload.cantidad_semanal = data.cantidadSemanal;
  if (data.horaLimite !== undefined) payload.hora_limite = data.horaLimite;
  if (data.fechasExcluidas !== undefined) payload.fechas_excluidas = data.fechasExcluidas;
  if (data.observaciones !== undefined) payload.observaciones = data.observaciones;

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
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error actualizando plan:', error.message);
    return undefined;
  }

  clearCache();
  return updated ? rowToPlan(updated as Record<string, unknown>) : undefined;
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
  return Math.max(plan.cantidadContratada - (await getCantidadUsada(plan)), 0);
}

// ======================================================
// CONSUMOS
// ======================================================

export async function loadConsumptions(): Promise<Consumption[]> {
  const { data, error } = await supabase
    .from('consumptions')
    .select('*')
    .order('fecha', { ascending: false });

  if (error) {
    console.error('Error cargando consumos:', error.message);
    return [];
  }

  _consumptionsCache = (data || []).map((row) => rowToConsumption(row as Record<string, unknown>));
  return _consumptionsCache;
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
  const today = new Date().toISOString().split('T')[0];
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
    {
      id: '1',
      nombre: '1 Vianda gratis',
      descripcion: 'Canje por una vianda',
      puntosRequeridos: 10,
      activo: true,
    },
    {
      id: '2',
      nombre: 'Producto especial',
      descripcion: 'Canje por un producto especial',
      puntosRequeridos: 20,
      activo: true,
    },
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

  const now = new Date();
  const horaLimite = plan.horaLimite || '20:00';
  const [h, m] = horaLimite.split(':').map(Number);

  if (now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m)) {
    return { can: false, reason: `La hora límite de pedido es ${horaLimite}` };
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

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

  const day = new Date().getDay();
  return map[day] || 'lunes';
}

export async function getFixedClientsForToday(): Promise<{ client: Client; plan: Plan }[]> {
  const today = new Date().toISOString().split('T')[0];
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