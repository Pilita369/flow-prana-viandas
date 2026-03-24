// ===============================
// TIPOS GENERALES DE LA APP
// ===============================

// Modalidad del plan:
// - fijo: tiene días semanales sugeridos
// - flexible: pide cuando necesita
export type PlanModality = 'fijo' | 'flexible';

// Días hábiles contemplados por el negocio
export type DayOfWeek = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes';

// Estado del consumo cargado por el admin
export type ConsumptionStatus = 'retirado' | 'no_retirado' | 'reprogramado';

// Estado del pedido flexible
export type OrderStatus = 'pendiente' | 'confirmado' | 'cancelado';

// Tipo de entrega
export type DeliveryType = 'retiro' | 'envio';

// ===============================
// CLIENTE
// ===============================
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

// ===============================
// CONTRATO / PLAN
// ===============================
// OJO: acá ya no usamos 10 | 15 | 20.
// Ahora cada cliente puede tener la cantidad libre que vos quieras.
export interface Plan {
  id: string;
  clientId: string;

  // Cantidad total contratada por el cliente
  cantidadContratada: number;

  // Cantidad ya utilizada
  cantidadUsada: number;

  modalidad: PlanModality;

  // Valor por vianda (editable por cliente)
  precioUnitario: number;

  // Importe total que pagó
  importeAbonado: number;

  fechaInicio: string;
  fechaFin: string;

  // Retiro o envío
  tipoEntrega: DeliveryType;

  // Si querés guardar una dirección especial para envío
  direccionEnvio?: string;

  activo: boolean;

  // Datos opcionales para modalidad fija
  diasFijos?: DayOfWeek[];

  // Datos opcionales para modalidad flexible
  cantidadSemanal?: number;
  horaLimite?: string;

  // Observaciones internas del admin
  observaciones?: string;
}

// ===============================
// MOVIMIENTO DE CONSUMO
// ===============================
// Cada movimiento representa una acción del admin.
// Le agregamos "cantidad" porque a veces puede retirar 2 viandas.
export interface Consumption {
  id: string;
  clientId: string;
  planId: string;
  fecha: string;
  status: ConsumptionStatus;
  tipo: 'fijo' | 'flexible' | 'manual';
  cantidad: number;
  notas?: string;
  createdAt: string;
}

// ===============================
// PEDIDOS FLEXIBLES
// ===============================
export interface FlexibleOrder {
  id: string;
  clientId: string;
  planId: string;
  fechaPedido: string;
  fechaEntrega: string;
  status: OrderStatus;
  creadoPor: 'cliente' | 'admin';
}

// ===============================
// PUNTOS
// ===============================
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