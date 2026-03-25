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

// Normaliza estados viejos/nuevos para que no se rompa la lógica.
function normalizeConsumptionStatus(status: ConsumptionStatus): 'retirado' | 'no_retirado' | 'reprogramado' | 'pendiente' {
  if (status === 'consumido') return 'retirado';
  if (status === 'no_retiro') return 'no_retirado';
  return status;
}

// ======================================================
// AUTENTICACIÓN ADMIN (LOCAL)
// ======================================================
// Más adelante lo migramos a Supabase.
const ADMIN_EMAIL = 'admin@mundoprana.com';
const ADMIN_PASSWORD = 'prana2024';

export function authenticateAdmin(email: string, password: string): boolean {
  return email === ADMIN_EMAIL && password === ADMIN_PASSWORD;
}

// Si alguna pantalla vieja la usa
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
// CLIENTES
// ======================================================

export function getClients(): Client[] {
  return getItem('mp_clients', []);
}

export function getClient(id: string): Client | undefined {
  return getClients().find((c) => c.id === id);
}

export function getClientById(id: string): Client | undefined {
  return getClient(id);
}

export function getClientByLink(link: string): Client | undefined {
  return getClients().find((c) => c.accessLink === link);
}

export function getClientByEmail(email: string): Client | undefined {
  return getClients().find((c) => c.email === email);
}

export function authenticateClient(email: string, password: string): Client | undefined {
  return getClients().find((c) => c.email === email && c.password === password);
}

export function createClient(
  data: Omit<Client, 'id' | 'codigoReferido' | 'puntos' | 'accessLink' | 'hasAccount' | 'createdAt'>
): Client {
  const clients = getClients();

  const client: Client = {
    ...data,
    id: generateId(),
    codigoReferido: generateReferralCode(data.nombre),
    puntos: 0,
    accessLink: generateId(),
    hasAccount: !!data.password,
    createdAt: new Date().toISOString(),
  };

  clients.push(client);
  setItem('mp_clients', clients);
  return client;
}

export function updateClient(id: string, data: Partial<Client>): Client | undefined {
  const clients = getClients();
  const index = clients.findIndex((c) => c.id === id);

  if (index === -1) return undefined;

  clients[index] = { ...clients[index], ...data };
  setItem('mp_clients', clients);
  return clients[index];
}

export function deleteClient(id: string): void {
  const clients = getClients().filter((c) => c.id !== id);
  setItem('mp_clients', clients);

  const plans = getPlans().filter((p) => p.clientId !== id);
  setItem('mp_plans', plans);

  const consumptions = getConsumptions().filter((c) => c.clientId !== id);
  setItem('mp_consumptions', consumptions);

  const orders = getFlexibleOrders().filter((o) => o.clientId !== id);
  setItem('mp_orders', orders);

  const points = getPointTransactions().filter((p) => p.clientId !== id);
  setItem('mp_points', points);

  const redemptions = getRedemptions().filter((r) => r.clientId !== id);
  setItem('mp_redemptions', redemptions);
}

export function clearAllDemoData(): void {
  localStorage.removeItem('mp_clients');
  localStorage.removeItem('mp_plans');
  localStorage.removeItem('mp_consumptions');
  localStorage.removeItem('mp_orders');
  localStorage.removeItem('mp_points');
  localStorage.removeItem('mp_redemptions');
  localStorage.removeItem('mp_rewards');
}

// Alias por compatibilidad si alguna pantalla vieja lo llama
export function resetAllData(): void {
  clearAllDemoData();
}

// ======================================================
// PLANES / CONTRATOS
// ======================================================

export function getPlans(): Plan[] {
  return getItem('mp_plans', []);
}

export function getActivePlan(clientId: string): Plan | undefined {
  return getPlans().find((p) => p.clientId === clientId && p.activo);
}

export function getClientPlans(clientId: string): Plan[] {
  return getPlans().filter((p) => p.clientId === clientId);
}

export function createPlan(data: Omit<Plan, 'id' | 'activo'>): Plan {
  const plans = getPlans();

  // Desactivamos planes anteriores del cliente
  plans.forEach((p) => {
    if (p.clientId === data.clientId) p.activo = false;
  });

  // Compatibilidad:
  // si el código viejo manda cantidadUsada, la tomo como ajusteInicialUsadas
  const ajusteInicialUsadas =
    data.ajusteInicialUsadas ??
    data.cantidadUsada ??
    data.viandasUsadas ??
    0;

  const cantidadContratada = data.cantidadContratada ?? data.tipo ?? 0;

  const plan: Plan = {
    ...data,
    id: generateId(),
    activo: true,
    cantidadContratada,
    ajusteInicialUsadas,
    // aliases para no romper código viejo
    tipo: cantidadContratada,
    cantidadUsada: ajusteInicialUsadas,
    viandasUsadas: ajusteInicialUsadas,
  };

  plans.push(plan);
  setItem('mp_plans', plans);
  return plan;
}

export function updatePlan(id: string, data: Partial<Plan>): Plan | undefined {
  const plans = getPlans();
  const index = plans.findIndex((p) => p.id === id);

  if (index === -1) return undefined;

  const merged: Plan = {
    ...plans[index],
    ...data,
  };

  // Mantener aliases consistentes
  const cantidadContratada = merged.cantidadContratada ?? merged.tipo ?? 0;
  const ajusteInicialUsadas =
    merged.ajusteInicialUsadas ??
    merged.cantidadUsada ??
    merged.viandasUsadas ??
    0;

  merged.cantidadContratada = cantidadContratada;
  merged.tipo = cantidadContratada;
  merged.ajusteInicialUsadas = ajusteInicialUsadas;
  merged.cantidadUsada = ajusteInicialUsadas;
  merged.viandasUsadas = ajusteInicialUsadas;

  plans[index] = merged;
  setItem('mp_plans', plans);
  return plans[index];
}

// ======================================================
// CONSUMOS
// ======================================================

export function getConsumptions(): Consumption[] {
  return getItem('mp_consumptions', []);
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

// ======================================================
// CÁLCULO REAL DE USADAS Y DISPONIBLES
// ======================================================
// IMPORTANTE:
// Las usadas se calculan SIEMPRE desde:
// - ajusteInicialUsadas
// - + historial real de consumos retirados
// Así evitamos duplicar cuentas.
// ======================================================

export function getCantidadUsada(plan?: Plan | null): number {
  if (!plan) return 0;

  const ajusteInicial =
    plan.ajusteInicialUsadas ??
    plan.cantidadUsada ??
    plan.viandasUsadas ??
    0;

  const consumidoEnHistorial = getPlanConsumptions(plan.id)
    .filter((c) => normalizeConsumptionStatus(c.status) === 'retirado')
    .reduce((acc, c) => acc + (c.cantidad || 0), 0);

  return ajusteInicial + consumidoEnHistorial;
}

export function getDisponibles(plan?: Plan | null): number {
  if (!plan) return 0;
  const usadas = getCantidadUsada(plan);
  return Math.max(plan.cantidadContratada - usadas, 0);
}

// Crea un consumo / movimiento
export function createConsumption(data: Omit<Consumption, 'id' | 'createdAt'>): Consumption {
  const consumptions = getConsumptions();

  const consumption: Consumption = {
    ...data,
    cantidad: data.cantidad || 1,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };

  consumptions.push(consumption);
  setItem('mp_consumptions', consumptions);

  // Si es retirado/consumido, suma puntos
  if (normalizeConsumptionStatus(consumption.status) === 'retirado') {
    addPoints(consumption.clientId, consumption.cantidad, `Consumo registrado (${consumption.fecha})`);
  }

  return consumption;
}

export function updateConsumption(id: string, status: ConsumptionStatus): void {
  const consumptions = getConsumptions();
  const index = consumptions.findIndex((c) => c.id === id);

  if (index === -1) return;

  const prev = consumptions[index];
  const next = { ...prev, status };
  consumptions[index] = next;
  setItem('mp_consumptions', consumptions);

  const prevNormalized = normalizeConsumptionStatus(prev.status);
  const nextNormalized = normalizeConsumptionStatus(next.status);

  if (prevNormalized !== 'retirado' && nextNormalized === 'retirado') {
    addPoints(next.clientId, next.cantidad, `Consumo registrado (${next.fecha})`);
  }

  if (prevNormalized === 'retirado' && nextNormalized !== 'retirado') {
    addPoints(next.clientId, -next.cantidad, `Corrección de consumo (${next.fecha})`);
  }
}

export function deleteConsumption(id: string): void {
  const consumptions = getConsumptions();
  const consumption = consumptions.find((c) => c.id === id);

  if (!consumption) return;

  if (normalizeConsumptionStatus(consumption.status) === 'retirado') {
    addPoints(consumption.clientId, -consumption.cantidad, `Eliminación de consumo (${consumption.fecha})`);
  }

  setItem(
    'mp_consumptions',
    consumptions.filter((c) => c.id !== id)
  );
}

// ======================================================
// PEDIDOS FLEXIBLES
// ======================================================

export function getFlexibleOrders(): FlexibleOrder[] {
  return getItem('mp_orders', []);
}

export function getPendingOrders(): FlexibleOrder[] {
  return getFlexibleOrders().filter((o) => o.status === 'pendiente');
}

export function getTomorrowOrders(): FlexibleOrder[] {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  return getFlexibleOrders().filter((o) => o.fechaEntrega === tomorrowStr);
}

export function createOrder(
  data: Omit<FlexibleOrder, 'id' | 'fechaPedido' | 'status'>
): FlexibleOrder {
  const orders = getFlexibleOrders();

  const order: FlexibleOrder = {
    ...data,
    id: generateId(),
    fechaPedido: new Date().toISOString(),
    status: 'pendiente',
  };

  orders.push(order);
  setItem('mp_orders', orders);
  return order;
}

// Alias por compatibilidad
export const createFlexibleOrder = createOrder;

export function updateOrderStatus(id: string, status: OrderStatus): void {
  const orders = getFlexibleOrders();
  const index = orders.findIndex((o) => o.id === id);

  if (index === -1) return;

  orders[index].status = status;
  setItem('mp_orders', orders);
}

// Alias por compatibilidad
export function confirmOrder(id: string): void {
  updateOrderStatus(id, 'confirmado');
}

export function cancelOrder(id: string): void {
  updateOrderStatus(id, 'cancelado');
}

// ======================================================
// PUNTOS
// ======================================================

export function getPointTransactions(): PointTransaction[] {
  return getItem('mp_points', []);
}

export function getClientPoints(clientId: string): PointTransaction[] {
  return getPointTransactions()
    .filter((p) => p.clientId === clientId)
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
}

export function addPoints(clientId: string, puntos: number, motivo: string): void {
  const transactions = getPointTransactions();

  transactions.push({
    id: generateId(),
    clientId,
    puntos,
    motivo,
    fecha: new Date().toISOString(),
  });

  setItem('mp_points', transactions);

  const client = getClient(clientId);
  if (!client) return;

  updateClient(clientId, {
    puntos: Math.max((client.puntos || 0) + puntos, 0),
  });
}

// ======================================================
// RECOMPENSAS / CANJES
// ======================================================

export function getRewards(): Reward[] {
  return getItem('mp_rewards', [
    {
      id: '1',
      nombre: '1 Vianda Gratis',
      puntosRequeridos: 10,
      descripcion: 'Canjeá por una vianda gratis',
    },
    {
      id: '2',
      nombre: 'Producto Especial',
      puntosRequeridos: 20,
      descripcion: 'Canjeá por un producto especial',
    },
  ]);
}

export function getRedemptions(): Redemption[] {
  return getItem('mp_redemptions', []);
}

export function redeemReward(clientId: string, rewardId: string): boolean {
  const client = getClient(clientId);
  const reward = getRewards().find((r) => r.id === rewardId);

  if (!client || !reward || client.puntos < reward.puntosRequeridos) return false;

  const redemptions = getRedemptions();
  redemptions.push({
    id: generateId(),
    clientId,
    rewardId,
    fecha: new Date().toISOString(),
    puntosUsados: reward.puntosRequeridos,
  });
  setItem('mp_redemptions', redemptions);

  addPoints(clientId, -reward.puntosRequeridos, `Canje: ${reward.nombre}`);
  return true;
}

// ======================================================
// RANKING
// ======================================================

export function getRanking(): { client: Client; puntos: number }[] {
  return getClients()
    .map((c) => ({ client: c, puntos: c.puntos || 0 }))
    .sort((a, b) => b.puntos - a.puntos);
}

// ======================================================
// HELPERS DE NEGOCIO
// ======================================================

export function canOrderTomorrow(clientId: string): { can: boolean; reason?: string } {
  const plan = getActivePlan(clientId);

  if (!plan) return { can: false, reason: 'No tenés un plan activo' };
  if (plan.modalidad !== 'flexible') return { can: false, reason: 'Tu plan es fijo' };
  if (getDisponibles(plan) <= 0) return { can: false, reason: 'Ya no te quedan viandas disponibles' };

  const now = new Date();
  const horaLimite = plan.horaLimite || '20:00';
  const [h, m] = horaLimite.split(':').map(Number);

  if (now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m)) {
    return { can: false, reason: `La hora límite de pedido es ${horaLimite}` };
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const existing = getFlexibleOrders().find(
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

export function getFixedClientsForToday(): { client: Client; plan: Plan }[] {
  const today = getTodayDayName();
  const clients = getClients();
  const plans = getPlans();

  const result: { client: Client; plan: Plan }[] = [];

  clients.forEach((client) => {
    const plan = plans.find(
      (p) => p.clientId === client.id && p.activo && p.modalidad === 'fijo'
    );

    if (plan && plan.diasFijos?.includes(today) && getDisponibles(plan) > 0) {
      result.push({ client, plan });
    }
  });

  return result;
}

// ======================================================
// DASHBOARD
// ======================================================

export function getDashboardStats() {
  const clients = getClients();
  const activePlans = getPlans().filter((p) => p.activo);
  const todayConsumptions = getTodayConsumptions().filter(
    (c) => normalizeConsumptionStatus(c.status) === 'retirado'
  );
  const pendingOrders = getPendingOrders();

  return {
    clientsCount: clients.length,
    activePlansCount: activePlans.length,
    todayRetirados: todayConsumptions.length,
    pendingOrdersCount: pendingOrders.length,
  };
}

export function getActiveClientsCount(): number {
  return getClients().length;
}

export function getActivePlansCount(): number {
  return getPlans().filter((p) => p.activo).length;
}