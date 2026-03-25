// ==============================================
// TIPOS GENERALES DE LA APLICACIÓN
// ==============================================

// Modalidad del contrato
export type PlanModality = 'fijo' | 'flexible';

// Días hábiles del negocio
export type DayOfWeek = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes';

// Tipo de entrega
export type DeliveryType = 'retiro' | 'envio';

// Estado de un consumo / movimiento
// Incluyo estados nuevos y viejos para evitar romper código anterior.
export type ConsumptionStatus =
  | 'retirado'
  | 'no_retirado'
  | 'reprogramado'
  | 'consumido'
  | 'no_retiro'
  | 'pendiente';

// Estado de pedido flexible
export type OrderStatus = 'pendiente' | 'confirmado' | 'cancelado' | 'entregado';

// ==============================================
// CLIENTE
// ==============================================
export interface Client {
  id: string;
  nombre: string;
  apellido: string;
  telefono: string;
  email: string;
  direccion?: string;

  codigoReferido: string;
  referidoPor?: string;

  puntos: number;

  // Token/link público para acceso cliente
  accessLink: string;

  // Si más adelante querés cuenta propia
  hasAccount: boolean;
  password?: string;

  createdAt: string;
}

// ==============================================
// PLAN / CONTRATO
// ==============================================
// IMPORTANTE:
// Agrego campos nuevos y mantengo algunos "viejos"
// para no romper pantallas previas del proyecto.
export interface Plan {
  id: string;
  clientId: string;

  // Cantidad total contratada
  cantidadContratada: number;

  // AJUSTE inicial opcional
  // Sirve si querés arrancar con saldo histórico
  ajusteInicialUsadas?: number;

  // Campos heredados para compatibilidad con código viejo
  tipo?: number; // alias viejo de cantidadContratada
  cantidadUsada?: number; // alias viejo
  viandasUsadas?: number; // alias viejo

  modalidad: PlanModality;

  precioUnitario: number;
  importeAbonado: number;

  fechaInicio: string;
  fechaFin: string;

  tipoEntrega: DeliveryType;
  direccionEnvio?: string;

  activo: boolean;

  diasFijos?: DayOfWeek[];
  cantidadSemanal?: number;
  horaLimite?: string;

  observaciones?: string;
}

// ==============================================
// CONSUMOS / MOVIMIENTOS
// ==============================================
export interface Consumption {
  id: string;
  clientId: string;
  planId: string;
  fecha: string;

  status: ConsumptionStatus;

  // fijo / flexible / manual
  tipo: 'fijo' | 'flexible' | 'manual';

  // cantidad de viandas en ese movimiento
  cantidad: number;

  notas?: string;
  createdAt: string;
}

// ==============================================
// PEDIDOS FLEXIBLES
// ==============================================
export interface FlexibleOrder {
  id: string;
  clientId: string;
  planId: string;
  fechaPedido: string;
  fechaEntrega: string;
  status: OrderStatus;
  creadoPor: 'cliente' | 'admin';
}

// ==============================================
// PUNTOS
// ==============================================
export interface PointTransaction {
  id: string;
  clientId: string;
  puntos: number;
  motivo: string;
  fecha: string;
}

export interface Reward {
  id: string;
  nombre: string;
  puntosRequeridos: number;
  descripcion: string;
}

export interface Redemption {
  id: string;
  clientId: string;
  rewardId: string;
  fecha: string;
  puntosUsados: number;
}