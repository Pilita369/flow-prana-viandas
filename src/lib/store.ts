import { Client, Plan, Consumption, FlexibleOrder, PointTransaction, Reward, Redemption } from '@/types';

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

function generateReferralCode(nombre: string): string {
  return (nombre.substring(0, 3).toUpperCase() + generateId().substring(0, 5)).toUpperCase();
}

function getItem<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch { return fallback; }
}

function setItem<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// Admin credentials
const ADMIN_EMAIL = 'admin@mundoprana.com';
const ADMIN_PASSWORD = 'prana2024';

export function authenticateAdmin(email: string, password: string): boolean {
  return email === ADMIN_EMAIL && password === ADMIN_PASSWORD;
}

// Clients
export function getClients(): Client[] { return getItem('mp_clients', []); }
export function getClient(id: string): Client | undefined { return getClients().find(c => c.id === id); }
export function getClientByLink(link: string): Client | undefined { return getClients().find(c => c.accessLink === link); }
export function getClientByEmail(email: string): Client | undefined { return getClients().find(c => c.email === email); }

export function createClient(data: Omit<Client, 'id' | 'codigoReferido' | 'puntos' | 'accessLink' | 'hasAccount' | 'createdAt'>): Client {
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
  const idx = clients.findIndex(c => c.id === id);
  if (idx === -1) return undefined;
  clients[idx] = { ...clients[idx], ...data };
  setItem('mp_clients', clients);
  return clients[idx];
}

// Plans
export function getPlans(): Plan[] { return getItem('mp_plans', []); }
export function getActivePlan(clientId: string): Plan | undefined {
  return getPlans().find(p => p.clientId === clientId && p.activo);
}
export function getClientPlans(clientId: string): Plan[] {
  return getPlans().filter(p => p.clientId === clientId);
}

export function createPlan(data: Omit<Plan, 'id' | 'viandasUsadas' | 'activo'>): Plan {
  const plans = getPlans();
  // Deactivate previous active plans
  plans.forEach(p => { if (p.clientId === data.clientId) p.activo = false; });
  const plan: Plan = { ...data, id: generateId(), viandasUsadas: 0, activo: true };
  plans.push(plan);
  setItem('mp_plans', plans);
  return plan;
}

export function updatePlan(id: string, data: Partial<Plan>): void {
  const plans = getPlans();
  const idx = plans.findIndex(p => p.id === id);
  if (idx !== -1) { plans[idx] = { ...plans[idx], ...data }; setItem('mp_plans', plans); }
}

// Consumptions
export function getConsumptions(): Consumption[] { return getItem('mp_consumptions', []); }
export function getClientConsumptions(clientId: string): Consumption[] {
  return getConsumptions().filter(c => c.clientId === clientId);
}
export function getTodayConsumptions(): Consumption[] {
  const today = new Date().toISOString().split('T')[0];
  return getConsumptions().filter(c => c.fecha === today);
}

export function createConsumption(data: Omit<Consumption, 'id'>): Consumption {
  const consumptions = getConsumptions();
  const consumption: Consumption = { ...data, id: generateId() };
  consumptions.push(consumption);
  setItem('mp_consumptions', consumptions);
  // Update plan usage
  if (data.status === 'retirado') {
    const plans = getPlans();
    const plan = plans.find(p => p.id === data.planId);
    if (plan) {
      plan.viandasUsadas++;
      setItem('mp_plans', plans);
      addPoints(data.clientId, 1, 'Vianda consumida');
    }
  }
  return consumption;
}

export function updateConsumption(id: string, status: ConsumptionStatus): void {
  const consumptions = getConsumptions();
  const idx = consumptions.findIndex(c => c.id === id);
  if (idx !== -1) {
    const prev = consumptions[idx].status;
    consumptions[idx].status = status;
    setItem('mp_consumptions', consumptions);
    // Adjust points and usage
    if (prev !== 'retirado' && status === 'retirado') {
      const plan = getPlans().find(p => p.id === consumptions[idx].planId);
      if (plan) { updatePlan(plan.id, { viandasUsadas: plan.viandasUsadas + 1 }); }
      addPoints(consumptions[idx].clientId, 1, 'Vianda consumida');
    }
  }
}

// Orders
export function getFlexibleOrders(): FlexibleOrder[] { return getItem('mp_orders', []); }
export function getPendingOrders(): FlexibleOrder[] {
  return getFlexibleOrders().filter(o => o.status === 'pendiente');
}
export function getTomorrowOrders(): FlexibleOrder[] {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tStr = tomorrow.toISOString().split('T')[0];
  return getFlexibleOrders().filter(o => o.fechaEntrega === tStr);
}

export function createOrder(data: Omit<FlexibleOrder, 'id' | 'fechaPedido' | 'status'>): FlexibleOrder {
  const orders = getFlexibleOrders();
  const order: FlexibleOrder = { ...data, id: generateId(), fechaPedido: new Date().toISOString(), status: 'pendiente' };
  orders.push(order);
  setItem('mp_orders', orders);
  return order;
}

export function updateOrderStatus(id: string, status: OrderStatus): void {
  const orders = getFlexibleOrders();
  const idx = orders.findIndex(o => o.id === id);
  if (idx !== -1) { orders[idx].status = status; setItem('mp_orders', orders); }
}

// Points
export function getPointTransactions(): PointTransaction[] { return getItem('mp_points', []); }
export function getClientPoints(clientId: string): PointTransaction[] {
  return getPointTransactions().filter(p => p.clientId === clientId);
}

export function addPoints(clientId: string, puntos: number, motivo: string): void {
  const transactions = getPointTransactions();
  transactions.push({ id: generateId(), clientId, puntos, motivo, fecha: new Date().toISOString() });
  setItem('mp_points', transactions);
  const client = getClient(clientId);
  if (client) updateClient(clientId, { puntos: client.puntos + puntos });
}

// Rewards
export function getRewards(): Reward[] {
  return getItem('mp_rewards', [
    { id: '1', nombre: '1 Vianda Gratis', puntosRequeridos: 10, descripcion: 'Canjeá por una vianda gratis' },
    { id: '2', nombre: 'Producto Especial', puntosRequeridos: 20, descripcion: 'Canjeá por un producto especial' },
  ]);
}

// Redemptions
export function getRedemptions(): Redemption[] { return getItem('mp_redemptions', []); }
export function redeemReward(clientId: string, rewardId: string): boolean {
  const client = getClient(clientId);
  const reward = getRewards().find(r => r.id === rewardId);
  if (!client || !reward || client.puntos < reward.puntosRequeridos) return false;
  const redemptions = getRedemptions();
  redemptions.push({ id: generateId(), clientId, rewardId, fecha: new Date().toISOString(), puntosUsados: reward.puntosRequeridos });
  setItem('mp_redemptions', redemptions);
  addPoints(clientId, -reward.puntosRequeridos, `Canje: ${reward.nombre}`);
  return true;
}

// Rankings
export function getRanking(): { client: Client; puntos: number }[] {
  return getClients()
    .map(c => ({ client: c, puntos: c.puntos }))
    .sort((a, b) => b.puntos - a.puntos);
}

// Helpers
export function canOrderTomorrow(clientId: string): { can: boolean; reason?: string } {
  const plan = getActivePlan(clientId);
  if (!plan) return { can: false, reason: 'No tenés un plan activo' };
  if (plan.modalidad !== 'flexible') return { can: false, reason: 'Tu plan es fijo' };
  if (plan.viandasUsadas >= plan.tipo) return { can: false, reason: 'Ya usaste todas tus viandas' };
  
  const now = new Date();
  const horaLimite = plan.horaLimite || '20:00';
  const [h, m] = horaLimite.split(':').map(Number);
  if (now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m)) {
    return { can: false, reason: `La hora límite es ${horaLimite}` };
  }
  
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tStr = tomorrow.toISOString().split('T')[0];
  const existing = getFlexibleOrders().find(o => o.clientId === clientId && o.fechaEntrega === tStr && o.status !== 'cancelado');
  if (existing) return { can: false, reason: 'Ya pediste para mañana' };
  
  return { can: true };
}

export function getTodayDayName(): DayOfWeek {
  const days: DayOfWeek[] = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];
  const d = new Date().getDay();
  return days[(d + 6) % 7] || 'lunes';
}

import type { DayOfWeek, ConsumptionStatus, OrderStatus } from '@/types';

export function getFixedClientsForToday(): { client: Client; plan: Plan }[] {
  const today = getTodayDayName();
  const clients = getClients();
  const plans = getPlans();
  const result: { client: Client; plan: Plan }[] = [];
  clients.forEach(c => {
    const plan = plans.find(p => p.clientId === c.id && p.activo && p.modalidad === 'fijo');
    if (plan && plan.diasFijos?.includes(today)) {
      result.push({ client: c, plan });
    }
  });
  return result;
}
