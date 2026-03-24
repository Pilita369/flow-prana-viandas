export type PlanType = 10 | 15 | 20;
export type PlanModality = 'fijo' | 'flexible';
export type DayOfWeek = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes';
export type ConsumptionStatus = 'retirado' | 'no_retirado' | 'reprogramado';
export type OrderStatus = 'pendiente' | 'confirmado' | 'cancelado';

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
  accessLink: string;
  hasAccount: boolean;
  password?: string;
  createdAt: string;
}

export interface Plan {
  id: string;
  clientId: string;
  tipo: PlanType;
  modalidad: PlanModality;
  importeAbonado: number;
  fechaInicio: string;
  fechaFin: string;
  viandasUsadas: number;
  activo: boolean;
  // Fijo
  diasFijos?: DayOfWeek[];
  incluyeEnvio?: boolean;
  // Flexible
  cantidadSemanal?: number;
  horaLimite?: string;
}

export interface Consumption {
  id: string;
  clientId: string;
  planId: string;
  fecha: string;
  status: ConsumptionStatus;
  tipo: 'fijo' | 'flexible';
}

export interface FlexibleOrder {
  id: string;
  clientId: string;
  planId: string;
  fechaPedido: string;
  fechaEntrega: string;
  status: OrderStatus;
  creadoPor: 'cliente' | 'admin';
}

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
