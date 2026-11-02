// Pagos registrados de cada contrato (tabla pagos_contrato). Nunca se borran: se anulan con motivo.
import { supabase } from '@/lib/supabase';

export interface PagoContrato {
  id: string;
  clientId: string;
  planId?: string;
  fecha: string;
  monto: number;
  medio?: string;
  nota?: string;
  anulado: boolean;
  anuladoMotivo?: string;
  anuladoAt?: string;
  createdAt: string;
}

function rowToPago(r: Record<string, unknown>): PagoContrato {
  return {
    id: String(r.id),
    clientId: String(r.client_id),
    planId: (r.plan_id as string) || undefined,
    fecha: String(r.fecha),
    monto: Number(r.monto) || 0,
    medio: (r.medio as string) || undefined,
    nota: (r.nota as string) || undefined,
    anulado: !!r.anulado,
    anuladoMotivo: (r.anulado_motivo as string) || undefined,
    anuladoAt: (r.anulado_at as string) || undefined,
    createdAt: String(r.created_at),
  };
}

export async function getPagosCliente(clientId: string): Promise<PagoContrato[]> {
  const { data, error } = await supabase.from('pagos_contrato').select('*').eq('client_id', clientId).order('fecha', { ascending: false });
  if (error) throw error;
  return (data || []).map(r => rowToPago(r as Record<string, unknown>));
}

export async function registrarPago(p: { clientId: string; planId: string; fecha: string; monto: number; medio?: string; nota?: string }): Promise<PagoContrato> {
  const monto = Number(p.monto);
  if (!(monto > 0)) throw new Error('El monto tiene que ser mayor a 0');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fecha)) throw new Error('Fecha inválida');
  const { data, error } = await supabase
    .from('pagos_contrato')
    .insert({ client_id: p.clientId, plan_id: p.planId, fecha: p.fecha, monto, medio: p.medio || null, nota: p.nota?.trim() || null })
    .select('*')
    .single();
  if (error) throw error;
  return rowToPago(data as Record<string, unknown>);
}

/** Anula un pago cargado por error: deja de contar, pero queda visible con su motivo. */
export async function anularPago(id: string, motivo: string): Promise<void> {
  const { error } = await supabase
    .from('pagos_contrato')
    .update({ anulado: true, anulado_motivo: motivo.trim() || null, anulado_at: new Date().toISOString() })
    .eq('id', id)
    .eq('anulado', false);
  if (error) throw error;
}
