// ==============================================
// TIPOS GENERALES DE LA APLICACIÓN
// ==============================================

export type PlanModality = 'fijo' | 'flexible';

export type DayOfWeek = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes';

export type DeliveryType = 'retiro' | 'envio';

export type ConsumptionStatus =
  | 'retirado'
  | 'no_retirado'
  | 'reprogramado'
  | 'consumido'
  | 'no_retiro'
  | 'pendiente';

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

  // Link público único del cliente
  accessLink: string;

  // Si más adelante querés login completo
  hasAccount: boolean;
  password?: string;

  // Alias opcional para ranking
  alias?: string;

  createdAt: string;
}

// ==============================================
// PLAN / CONTRATO
// ==============================================
export interface Plan {
  id: string;
  clientId: string;

  // Cantidad total de viandas contratadas
  cantidadContratada: number;

  // Ajuste inicial opcional por si no cargás todo el historial
  ajusteInicialUsadas?: number;

  modalidad: PlanModality;

  // Precio por cada vianda
  precioUnitario: number;

  // Total calculado automáticamente = cantidadContratada * precioUnitario
  totalCalculado: number;

  fechaInicio: string;
  fechaFin: string;

  tipoEntrega: DeliveryType;
  direccionEnvio?: string;

  // Cuántas viandas se descuentan cada vez que marcás "retiró"
  // Ejemplo: 2 si una familia se lleva dos por día
  unidadesPorRetiro: number;

  activo: boolean;

  // Para plan fijo
  diasFijos?: DayOfWeek[];

  // Para plan flexible
  cantidadSemanal?: number;
  horaLimite?: string;

  // Fechas particulares que NO deben contarse para este cliente
  // Ejemplo: feriado extra, viaje, ausencia, etc.
  fechasExcluidas?: string[];

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

  // Cantidad de viandas de ese movimiento
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
  descripcion: string;
  puntosRequeridos: number;
  activo?: boolean;
}

export interface Redemption {
  id: string;
  clientId: string;
  rewardId: string;
  fecha: string;
  puntosUsados: number;
}