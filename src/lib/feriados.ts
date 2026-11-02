// Feriados del negocio guardados en Supabase, para verlos igual desde cualquier dispositivo.
// Se copian también a la configuración local para que las funciones existentes (isHoliday, etc.)
// sigan funcionando igual.
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import { getBusinessConfig, saveBusinessConfig } from '@/lib/business';

const MIGRATION_KEY = 'mp_feriados_supabase_v1';
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function readLocal(): string[] {
  try { return getBusinessConfig().feriados.filter(f => ISO.test(f)); } catch { return []; }
}

let current: string[] = Array.from(new Set(readLocal())).sort();
let loading: Promise<string[]> | null = null;
const listeners = new Set<() => void>();

function publish(list: string[]) {
  current = Array.from(new Set(list)).sort();
  try { saveBusinessConfig({ ...getBusinessConfig(), feriados: current }); } catch { /* sin almacenamiento local */ }
  listeners.forEach(l => l());
}

/** Lee los feriados de Supabase. La primera vez en cada dispositivo sube los que había guardados en él (sin duplicar). */
export function loadFeriados(force = false, soloLectura = false): Promise<string[]> {
  if (loading && !force) return loading;
  loading = (async () => {
    // La vista del cliente solo lee: nunca sube feriados desde su dispositivo
    if (!soloLectura && !localStorage.getItem(MIGRATION_KEY)) {
      const local = readLocal();
      if (local.length > 0) {
        const { error } = await supabase
          .from('feriados')
          .upsert(local.map(fecha => ({ fecha, descripcion: 'Copiado de la configuración de un dispositivo' })), { onConflict: 'fecha', ignoreDuplicates: true });
        if (error) throw error;
      }
      localStorage.setItem(MIGRATION_KEY, 'true');
    }
    const { data, error } = await supabase.from('feriados').select('fecha').order('fecha');
    if (error) throw error;
    publish((data || []).map(r => String(r.fecha)));
    return current;
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

/** Marca o desmarca un feriado (vale para todos los clientes). No toca consumos. */
export async function setFeriado(fecha: string, marcado: boolean, descripcion?: string): Promise<void> {
  if (!ISO.test(fecha)) throw new Error('Fecha inválida');
  if (marcado) {
    const { error } = await supabase.from('feriados').upsert({ fecha, descripcion: descripcion || null }, { onConflict: 'fecha' });
    if (error) throw error;
    publish([...current, fecha]);
  } else {
    const { error } = await supabase.from('feriados').delete().eq('fecha', fecha);
    if (error) throw error;
    publish(current.filter(f => f !== fecha));
  }
}

export function getFeriadosActuales(): Set<string> {
  return new Set(current);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Feriados actuales; se actualizan al marcar o desmarcar desde cualquier pantalla. */
export function useFeriados(opts: { soloLectura?: boolean } = {}): { feriados: Set<string>; lista: string[] } {
  const lista = useSyncExternalStore(subscribe, () => current, () => current);
  const soloLectura = !!opts.soloLectura;
  useEffect(() => { loadFeriados(false, soloLectura).catch(e => console.error('No se pudieron leer los feriados:', e)); }, [soloLectura]);
  const feriados = useMemo(() => new Set(lista), [lista]);
  return { feriados, lista };
}
