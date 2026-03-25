// src/lib/store.ts
// ============================================================
// STORE PRINCIPAL — MUNDO PRANA VIANDAS
//
// Este archivo maneja todos los datos de la app.
// Usa Supabase como base de datos real.
//
// Cada función tiene su versión async para Supabase
// y mantiene compatibilidad con el resto de la app.
// ============================================================

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
import { supabase } from '@/lib/supabase';

// ============================================================
// HELPERS GENERALES
// ============================================================

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function generateReferralCode(nombre: string): string {
  return (nombre.substring(0, 3).toUpperCase() + generateId().substring(0, 5)).toUpperCase();
}

// Normaliza estados viejos para no rompar lógica existente
function normalizeConsumptionStatus(status: ConsumptionStatus): 'retirado' | 'no_retirado' | 'reprogramado' | 'pendiente' {
  if (status === 'consumido') return 'retirado';
  if (status === 'no_retiro') return 'no_retirado';
  return status as 'retirado' | 'no_retirado' | 'reprogramado' | 'pendiente';
}

// Convierte la fila de Supabase al tipo Client de la app
function rowToClient(row: Record<string, unknown>): Client {
  return {
    id:             row.id as string,
    nombre:         row.nombre as string,
    apellido:       row.apellido as string,
    telefono:       row.telefono as string,
    email:          (row.email as string) || '',
    direccion:      row.direccion as string | undefined,
    codigoReferido: (row.codigo_referido as string) || '',
    referidoPor:    row.referido_por as string | undefined,
    puntos:         (row.puntos as number) || 0,
    accessLink:     row.access_link as string,
    hasAccount:     (row.has_account as boolean) || false,
    password:       row.password as string | undefined,
    alias:          row.alias as string | undefined,
    createdAt:      row.created_at as string,
  };
}

// Convierte la fila de Supabase al tipo Plan de la app
function rowToPlan(row: Record<string, unknown>): Plan {
  return {
    id:                   row.id as string,
    clientId:             row.client_id as string,
    cantidadContratada:   (row.cantidad_contratada as number) || 0,
    ajusteInicialUsadas:  (row.ajuste_inicial_usadas as number) || 0,
    modalidad:            row.modalidad as 'fijo' | 'flexible',
    precioUnitario:       (row.precio_unitario as number) || 0,
    totalCalculado:       (row.total_calculado as number) || 0,
    importeAbonado:       (row.importe_abonado as number) || 0,
    fechaInicio:          row.fecha_inicio as string,
    fechaFin:             row.fecha_fin as string,
    tipoEntrega:          (row.tipo_entrega as 'retiro' | 'envio') || 'retiro',
    direccionEnvio:       row.direccion_envio as string | undefined,
    unidadesPorRetiro:    (row.unidades_por_retiro as number) || 1,
    activo:               (row.activo as boolean) ?? true,
    diasFijos:            row.dias_fijos as DayOfWeek[] | undefined,
    cantidadSemanal:      row.cantidad_semanal as number | undefined,
    horaLimite:           row.hora_limite as string | undefined,
    fechasExcluidas:      (row.fechas_excluidas as string[]) || [],
    observaciones:        row.observaciones as string | undefined,
  };
}

// Convierte la fila de Supabase al tipo Consumption de la app
function rowToConsumption(row: Record<string, unknown>): Consumption {
  return {
    id:        row.id as string,
    clientId:  row.client_id as string,
    planId:    row.plan_id as string,
    fecha:     row.fecha as string,
    status:    row.status as ConsumptionStatus,
    tipo:      (row.tipo as 'fijo' | 'flexible' | 'manual') || 'manual',
    cantidad:  (row.cantidad as number) || 1,
    notas:     row.notas as string | undefined,
    createdAt: row.created_at as string,
  };
}

// Convierte la fila de Supabase al tipo FlexibleOrder
function rowToOrder(row: Record<string, unknown>): FlexibleOrder {
  return {
    id:           row.id as string,
    clientId:     row.client_id as string,
    planId:       row.plan_id as string,
    fechaPedido:  row.fecha_pedido as string,
    fechaEntrega: row.fecha_entrega as string,
    status:       row.status as OrderStatus,
    creadoPor:    row.creado_por as 'cliente' | 'admin',
  };
}

// ============================================================
// AUTH ADMIN (sigue siendo local — simple y seguro para un solo admin)
// ============================================================

const ADMIN_EMAIL    = 'admin@mundoprana.com';
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

// ============================================================
// CLIENTES — versiones síncronas (usan cache local)
// ============================================================

// Cache en memoria para no llamar a Supabase en cada render
let _clientsCache: Client[] | null = null;
let _plansCache: Plan[] | null = null;
let _consumptionsCache: Consumption[] | null = null;
let _ordersCache: FlexibleOrder[] | null = null;
let _pointsCache: PointTransaction[] | null = null;

export function clearCache(): void {
  _clientsCache      = null;
  _plansCache        = null;
  _consumptionsCache = null;
  _ordersCache       = null;
  _pointsCache       = null;
}

// ── Clientes ─────────────────────────────────────────────

export function getClients(): Client[] {
  return _clientsCache || [];
}

export function getClient(id: string): Client | undefined {
  return getClients().find((c) => c.id === id);
}

export function getClientByLink(link: string): Client | undefined {
  return getClients().find((c) => c.accessLink === link);
}

export function getClientByEmail(email: string): Client | undefined {
  return getClients().find((c) => c.email === email);
}

// Cargar todos los clientes desde Supabase (llamar al iniciar la app o en cada pantalla admin)
export async function loadClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('mp_clientes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error cargando clientes:', error.message);
    return [];
  }

  _clientsCache = (data || []).map(rowToClient);
  return _clientsCache;
}

// Cargar un solo cliente por su accessLink (para la vista del cliente)
export async function loadClientByLink(link: string): Promise<Client | null> {
  const { data, error } = await supabase
    .from('mp_clientes')
    .select('*')
    .eq('access_link', link)
    .single();

  if (error || !data) return null;
  return rowToClient(data as Record<string, unknown>);
}

export async function createClient(
  data: Omit<Client, 'id' | 'codigoReferido' | 'puntos' | 'accessLink' | 'hasAccount' | 'createdAt'>
): Promise<Client> {
  const newClient = {
    id:             generateId(),
    nombre:         data.nombre,
    apellido:       data.apellido,
    telefono:       data.telefono,
    email:          data.email || null,
    direccion:      data.direccion || null,
    codigo_referido: generateReferralCode(data.nombre),
    referido_por:   data.referidoPor || null,
    puntos:         0,
    access_link:    generateId(),
    has_account:    !!data.password,
    password:       data.password || null,
    alias:          data.alias || null,
    activo:         true,
  };

  const { data: inserted, error } = await supabase
    .from('mp_clientes')
    .insert(newClient)
    .select()
    .single();

  if (error) throw new Error(`Error creando cliente: ${error.message}`);

  clearCache();
  return rowToClient(inserted as Record<string, unknown>);
}

export async function updateClient(id: string, data: Partial<Client>): Promise<void> {
  // Convertir campos de la app al formato de Supabase
  const updates: Record<string, unknown> = {};
  if (data.nombre        !== undefined) updates.nombre         = data.nombre;
  if (data.apellido      !== undefined) updates.apellido       = data.apellido;
  if (data.telefono      !== undefined) updates.telefono       = data.telefono;
  if (data.email         !== undefined) updates.email          = data.email;
  if (data.direccion     !== undefined) updates.direccion      = data.direccion;
  if (data.puntos        !== undefined) updates.puntos         = data.puntos;
  if (data.alias         !== undefined) updates.alias          = data.alias;
  if (data.password      !== undefined) updates.password       = data.password;
  if (data.hasAccount    !== undefined) updates.has_account    = data.hasAccount;

  const { error } = await supabase
    .from('mp_clientes')
    .update(updates)
    .eq('id', id);

  if (error) throw new Error(`Error actualizando cliente: ${error.message}`);
  clearCache();
}

export async function deleteClient(id: string): Promise<void> {
  // Supabase borra en cascada: planes, consumos, pedidos, puntos, canjes
  const { error } = await supabase
    .from('mp_clientes')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Error eliminando cliente: ${error.message}`);
  clearCache();
}

// ── Planes ────────────────────────────────────────────────

export function getPlans(): Plan[] {
  return _plansCache || [];
}

export function getClientPlans(clientId: string): Plan[] {
  return getPlans().filter((p) => p.clientId === clientId);
}

export function getActivePlan(clientId: string): Plan | undefined {
  return getPlans().find((p) => p.clientId === clientId && p.activo);
}

export async function loadPlans(): Promise<Plan[]> {
  const { data, error } = await supabase
    .from('mp_planes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error cargando planes:', error.message);
    return [];
  }

  _plansCache = (data || []).map(rowToPlan);
  return _plansCache;
}

// Cargar solo el plan activo de un cliente (para vista cliente)
export async function loadActivePlan(clientId: string): Promise<Plan | null> {
  const { data, error } = await supabase
    .from('mp_planes')
    .select('*')
    .eq('client_id', clientId)
    .eq('activo', true)
    .single();

  if (error || !data) return null;
  return rowToPlan(data as Record<string, unknown>);
}

export async function createPlan(
  data: Omit<Plan, 'id' | 'activo' | 'totalCalculado'>
): Promise<Plan> {
  // Desactivar planes anteriores del mismo cliente
  await supabase
    .from('mp_planes')
    .update({ activo: false })
    .eq('client_id', data.clientId);

  const newPlan = {
    id:                    generateId(),
    client_id:             data.clientId,
    cantidad_contratada:   data.cantidadContratada,
    ajuste_inicial_usadas: data.ajusteInicialUsadas || 0,
    modalidad:             data.modalidad,
    precio_unitario:       data.precioUnitario,
    total_calculado:       calcularTotalContrato(data.cantidadContratada, data.precioUnitario),
    importe_abonado:       (data as Plan & { importeAbonado?: number }).importeAbonado || 0,
    fecha_inicio:          data.fechaInicio,
    fecha_fin:             data.fechaFin,
    tipo_entrega:          data.tipoEntrega || 'retiro',
    direccion_envio:       data.direccionEnvio || null,
    unidades_por_retiro:   data.unidadesPorRetiro || 1,
    activo:                true,
    dias_fijos:            data.diasFijos || null,
    cantidad_semanal:      data.cantidadSemanal || null,
    hora_limite:           data.horaLimite || null,
    fechas_excluidas:      data.fechasExcluidas || [],
    observaciones:         data.observaciones || null,
  };

  const { data: inserted, error } = await supabase
    .from('mp_planes')
    .insert(newPlan)
    .select()
    .single();

  if (error) throw new Error(`Error creando plan: ${error.message}`);

  clearCache();
  return rowToPlan(inserted as Record<string, unknown>);
}

export async function updatePlan(id: string, data: Partial<Plan>): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (data.cantidadContratada  !== undefined) updates.cantidad_contratada  = data.cantidadContratada;
  if (data.precioUnitario      !== undefined) updates.precio_unitario      = data.precioUnitario;
  if (data.fechaInicio         !== undefined) updates.fecha_inicio         = data.fechaInicio;
  if (data.fechaFin            !== undefined) updates.fecha_fin            = data.fechaFin;
  if (data.diasFijos           !== undefined) updates.dias_fijos           = data.diasFijos;
  if (data.fechasExcluidas     !== undefined) updates.fechas_excluidas     = data.fechasExcluidas;
  if (data.observaciones       !== undefined) updates.observaciones        = data.observaciones;
  if (data.activo              !== undefined) updates.activo               = data.activo;
  if (data.cantidadSemanal     !== undefined) updates.cantidad_semanal     = data.cantidadSemanal;
  if (data.horaLimite          !== undefined) updates.hora_limite          = data.horaLimite;

  // Recalcular total si cambiaron cantidad o precio
  const plan = getPlans().find((p) => p.id === id);
  if (plan) {
    const cant  = (data.cantidadContratada ?? plan.cantidadContratada);
    const price = (data.precioUnitario     ?? plan.precioUnitario);
    updates.total_calculado = calcularTotalContrato(cant, price);
  }

  const { error } = await supabase
    .from('mp_planes')
    .update(updates)
    .eq('id', id);

  if (error) throw new Error(`Error actualizando plan: ${error.message}`);
  clearCache();
}

// ── Consumos ──────────────────────────────────────────────

export function getConsumptions(): Consumption[] {
  return _consumptionsCache || [];
}

export function getPlanConsumptions(planId: string): Consumption[] {
  return getConsumptions().filter((c) => c.planId === planId);
}

export function getClientConsumptions(clientId: string): Consumption[] {
  return getConsumptions()
    .filter((c) => c.clientId === clientId)
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
}

export function getTodayConsumptions(): Consumption[] {
  const today = new Date().toISOString().split('T')[0];
  return getConsumptions().filter((c) => c.fecha === today);
}

export function getCantidadUsada(plan?: Plan | null): number {
  if (!plan) return 0;
  const ajuste   = plan.ajusteInicialUsadas || 0;
  const historial = getPlanConsumptions(plan.id)
    .filter((c) => normalizeConsumptionStatus(c.status) === 'retirado')
    .reduce((acc, c) => acc + (c.cantidad || 0), 0);
  return ajuste + historial;
}

export function getDisponibles(plan?: Plan | null): number {
  if (!plan) return 0;
  return Math.max(plan.cantidadContratada - getCantidadUsada(plan), 0);
}

export async function loadConsumptions(clientId?: string): Promise<Consumption[]> {
  let query = supabase.from('mp_consumos').select('*').order('fecha', { ascending: false });
  if (clientId) query = query.eq('client_id', clientId);

  const { data, error } = await query;
  if (error) {
    console.error('Error cargando consumos:', error.message);
    return [];
  }

  const result = (data || []).map(rowToConsumption);
  if (!clientId) _consumptionsCache = result;
  return result;
}

export async function createConsumption(
  data: Omit<Consumption, 'id' | 'createdAt'>
): Promise<Consumption> {
  const newConsumption = {
    id:        generateId(),
    client_id: data.clientId,
    plan_id:   data.planId,
    fecha:     data.fecha,
    status:    data.status,
    tipo:      data.tipo || 'manual',
    cantidad:  data.cantidad || 1,
    notas:     data.notas || null,
  };

  const { data: inserted, error } = await supabase
    .from('mp_consumos')
    .insert(newConsumption)
    .select()
    .single();

  if (error) throw new Error(`Error creando consumo: ${error.message}`);

  // Sumar puntos si fue un retiro exitoso
  if (normalizeConsumptionStatus(data.status) === 'retirado') {
    await addPoints(data.clientId, data.cantidad || 1, `Consumo registrado (${data.fecha})`);
  }

  clearCache();
  return rowToConsumption(inserted as Record<string, unknown>);
}

export async function updateConsumption(id: string, status: ConsumptionStatus): Promise<void> {
  const prev = getConsumptions().find((c) => c.id === id);

  const { error } = await supabase
    .from('mp_consumos')
    .update({ status })
    .eq('id', id);

  if (error) throw new Error(`Error actualizando consumo: ${error.message}`);

  // Ajustar puntos según cambio de estado
  if (prev) {
    const prevNorm = normalizeConsumptionStatus(prev.status);
    const nextNorm = normalizeConsumptionStatus(status);

    if (prevNorm !== 'retirado' && nextNorm === 'retirado') {
      await addPoints(prev.clientId, prev.cantidad, `Consumo registrado (${prev.fecha})`);
    }
    if (prevNorm === 'retirado' && nextNorm !== 'retirado') {
      await addPoints(prev.clientId, -prev.cantidad, `Corrección de consumo (${prev.fecha})`);
    }
  }

  clearCache();
}

export async function deleteConsumption(id: string): Promise<void> {
  const found = getConsumptions().find((c) => c.id === id);

  const { error } = await supabase
    .from('mp_consumos')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Error eliminando consumo: ${error.message}`);

  // Restar puntos si era un retiro
  if (found && normalizeConsumptionStatus(found.status) === 'retirado') {
    await addPoints(found.clientId, -found.cantidad, `Eliminación de consumo (${found.fecha})`);
  }

  clearCache();
}

// ── Pedidos flexibles ─────────────────────────────────────

export function getFlexibleOrders(): FlexibleOrder[] {
  return _ordersCache || [];
}

export function getPendingOrders(): FlexibleOrder[] {
  return getFlexibleOrders().filter((o) => o.status === 'pendiente');
}

export async function loadFlexibleOrders(): Promise<FlexibleOrder[]> {
  const { data, error } = await supabase
    .from('mp_pedidos_flexibles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error cargando pedidos:', error.message);
    return [];
  }

  _ordersCache = (data || []).map(rowToOrder);
  return _ordersCache;
}

export async function createOrder(
  data: Omit<FlexibleOrder, 'id' | 'fechaPedido' | 'status'>
): Promise<FlexibleOrder> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const newOrder = {
    id:            generateId(),
    client_id:     data.clientId,
    plan_id:       data.planId,
    fecha_pedido:  new Date().toISOString().split('T')[0],
    fecha_entrega: data.fechaEntrega,
    status:        'pendiente',
    creado_por:    data.creadoPor || 'admin',
  };

  const { data: inserted, error } = await supabase
    .from('mp_pedidos_flexibles')
    .insert(newOrder)
    .select()
    .single();

  if (error) throw new Error(`Error creando pedido: ${error.message}`);

  clearCache();
  return rowToOrder(inserted as Record<string, unknown>);
}

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<void> {
  const { error } = await supabase
    .from('mp_pedidos_flexibles')
    .update({ status })
    .eq('id', id);

  if (error) throw new Error(`Error actualizando pedido: ${error.message}`);
  clearCache();
}

// ── Puntos ────────────────────────────────────────────────

export function getPointTransactions(): PointTransaction[] {
  return _pointsCache || [];
}

export function getClientPoints(clientId: string): PointTransaction[] {
  return getPointTransactions()
    .filter((p) => p.clientId === clientId)
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
}

export async function loadPoints(clientId?: string): Promise<PointTransaction[]> {
  let query = supabase.from('mp_puntos').select('*').order('fecha', { ascending: false });
  if (clientId) query = query.eq('client_id', clientId);

  const { data, error } = await query;
  if (error) {
    console.error('Error cargando puntos:', error.message);
    return [];
  }

  const result = (data || []).map((row) => ({
    id:       row.id as string,
    clientId: row.client_id as string,
    puntos:   row.puntos as number,
    motivo:   row.motivo as string,
    fecha:    row.fecha as string,
  }));

  if (!clientId) _pointsCache = result;
  return result;
}

export async function addPoints(clientId: string, puntos: number, motivo: string): Promise<void> {
  // Registrar el movimiento de puntos
  await supabase.from('mp_puntos').insert({
    id:        generateId(),
    client_id: clientId,
    puntos,
    motivo,
  });

  // Actualizar el total de puntos del cliente
  const client = getClients().find((c) => c.id === clientId);
  if (client) {
    const nuevoTotal = Math.max((client.puntos || 0) + puntos, 0);
    await supabase
      .from('mp_clientes')
      .update({ puntos: nuevoTotal })
      .eq('id', clientId);

    // Actualizar cache local
    if (_clientsCache) {
      const idx = _clientsCache.findIndex((c) => c.id === clientId);
      if (idx !== -1) _clientsCache[idx] = { ..._clientsCache[idx], puntos: nuevoTotal };
    }
  }
}

// ── Premios y canjes ──────────────────────────────────────

export async function loadRewards(): Promise<Reward[]> {
  const { data, error } = await supabase
    .from('mp_premios')
    .select('*')
    .eq('activo', true)
    .order('puntos_requeridos');

  if (error) {
    console.error('Error cargando premios:', error.message);
    return [];
  }

  return (data || []).map((row) => ({
    id:               row.id as string,
    nombre:           row.nombre as string,
    descripcion:      row.descripcion as string,
    puntosRequeridos: row.puntos_requeridos as number,
    activo:           row.activo as boolean,
  }));
}

// Versión síncrona para compatibilidad (usa localStorage como fallback)
export function getRewards(): Reward[] {
  const raw = localStorage.getItem('mp_rewards_cache');
  if (raw) {
    try { return JSON.parse(raw); } catch { /* ignorar */ }
  }
  return [
    { id: 'premio-1', nombre: '1 vianda gratis',   descripcion: 'Canjeá por una vianda del menú del día', puntosRequeridos: 10, activo: true },
    { id: 'premio-2', nombre: 'Producto especial',  descripcion: 'Un producto elaborado a tu elección',    puntosRequeridos: 20, activo: true },
    { id: 'premio-3', nombre: 'Plan 10 gratis',     descripcion: '10 viandas de regalo',                   puntosRequeridos: 30, activo: true },
  ];
}

export async function saveRewards(rewards: Reward[]): Promise<void> {
  // Guardar en cache local para uso inmediato
  localStorage.setItem('mp_rewards_cache', JSON.stringify(rewards));

  // Sincronizar con Supabase
  for (const r of rewards) {
    await supabase.from('mp_premios').upsert({
      id:                r.id,
      nombre:            r.nombre,
      descripcion:       r.descripcion || '',
      puntos_requeridos: r.puntosRequeridos,
      activo:            r.activo ?? true,
    });
  }
}

export async function loadRedemptions(clientId?: string): Promise<Redemption[]> {
  let query = supabase.from('mp_canjes').select('*').order('fecha', { ascending: false });
  if (clientId) query = query.eq('client_id', clientId);

  const { data, error } = await query;
  if (error) return [];

  return (data || []).map((row) => ({
    id:           row.id as string,
    clientId:     row.client_id as string,
    rewardId:     row.reward_id as string,
    fecha:        row.fecha as string,
    puntosUsados: row.puntos_usados as number,
  }));
}

export function getRedemptions(): Redemption[] {
  return [];
}

export async function redeemReward(clientId: string, rewardId: string): Promise<boolean> {
  const client = getClients().find((c) => c.id === clientId);
  const reward = getRewards().find((r) => r.id === rewardId);
  if (!client || !reward || client.puntos < reward.puntosRequeridos) return false;

  await supabase.from('mp_canjes').insert({
    id:           generateId(),
    client_id:    clientId,
    reward_id:    rewardId,
    puntos_usados: reward.puntosRequeridos,
  });

  await addPoints(clientId, -reward.puntosRequeridos, `Canje: ${reward.nombre}`);
  return true;
}

// ── Ranking ───────────────────────────────────────────────

export function getRanking(): { client: Client; puntos: number }[] {
  return getClients()
    .map((c) => ({ client: c, puntos: c.puntos || 0 }))
    .sort((a, b) => b.puntos - a.puntos);
}

// ── Helpers de negocio ────────────────────────────────────

export function canOrderTomorrow(clientId: string): { can: boolean; reason?: string } {
  const plan = getActivePlan(clientId);
  if (!plan)                          return { can: false, reason: 'No tenés un plan activo' };
  if (plan.modalidad !== 'flexible')  return { can: false, reason: 'Tu plan es fijo' };
  if (getDisponibles(plan) <= 0)      return { can: false, reason: 'Ya no te quedan viandas disponibles' };

  const now         = new Date();
  const horaLimite  = plan.horaLimite || '20:00';
  const [h, m]      = horaLimite.split(':').map(Number);

  if (now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m)) {
    return { can: false, reason: `La hora límite de pedido es ${horaLimite}` };
  }

  const tomorrow    = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const existing = getFlexibleOrders().find(
    (o) => o.clientId === clientId && o.fechaEntrega === tomorrowStr && o.status !== 'cancelado'
  );
  if (existing) return { can: false, reason: 'Ya tenés un pedido para mañana' };

  return { can: true };
}

export function getTodayDayName(): DayOfWeek {
  const map: Record<number, DayOfWeek> = {
    1: 'lunes', 2: 'martes', 3: 'miercoles', 4: 'jueves', 5: 'viernes',
  };
  return map[new Date().getDay()] || 'lunes';
}

export function getFixedClientsForToday(): { client: Client; plan: Plan }[] {
  const today        = new Date().toISOString().split('T')[0];
  const todayDayName = getTodayDayName();

  return getClients().reduce<{ client: Client; plan: Plan }[]>((acc, client) => {
    const plan = getPlans().find(
      (p) => p.clientId === client.id && p.activo && p.modalidad === 'fijo'
    );
    if (!plan)                                          return acc;
    if (!plan.diasFijos?.includes(todayDayName))        return acc;
    if (isHoliday(today))                               return acc;
    if (isExcludedForClient(today, plan.fechasExcluidas)) return acc;
    if (getDisponibles(plan) <= 0)                      return acc;
    acc.push({ client, plan });
    return acc;
  }, []);
}

// ============================================================
// CARGA INICIAL — llamar al entrar al panel admin
// Trae todos los datos de Supabase y llena los caches
// ============================================================
export async function loadAllData(): Promise<void> {
  await Promise.all([
    loadClients(),
    loadPlans(),
    loadConsumptions(),
    loadFlexibleOrders(),
    loadPoints(),
  ]);
}

// ============================================================
// LIMPIAR DATOS DE DEMO (por si quedaron en localStorage)
// ============================================================
export function clearAllDemoData(): void {
  localStorage.removeItem('mp_clients');
  localStorage.removeItem('mp_plans');
  localStorage.removeItem('mp_consumptions');
  localStorage.removeItem('mp_orders');
  localStorage.removeItem('mp_points');
  localStorage.removeItem('mp_redemptions');
  localStorage.removeItem('mp_rewards');
  clearCache();
}