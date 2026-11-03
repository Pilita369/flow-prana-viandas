import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan variables de entorno de Supabase');
}

/** Tiempo máximo de cada consulta. Sin límite, una conexión trabada deja la pantalla "Cargando..." o "Guardando" sin fin. */
export const TIEMPO_LIMITE_MS = 20000;

/** fetch con tiempo límite: si la consulta no responde, falla con un mensaje claro y se puede reintentar. */
export const fetchConLimite: typeof fetch = (input, init: RequestInit = {}) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIEMPO_LIMITE_MS);
  const externo = init.signal;
  if (externo) {
    if (externo.aborted) ctrl.abort();
    else externo.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  return fetch(input, { ...init, signal: ctrl.signal })
    .catch(e => {
      if (ctrl.signal.aborted && !externo?.aborted) {
        throw new Error(`La conexión tardó más de ${TIEMPO_LIMITE_MS / 1000} segundos. Revisá internet y reintentá.`);
      }
      throw e;
    })
    .finally(() => clearTimeout(timer));
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: { fetch: fetchConLimite },
});
