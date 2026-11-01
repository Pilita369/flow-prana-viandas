import { useCallback, useEffect, useRef, useState } from 'react';
import { setDailyConsumption } from '@/lib/store';
import type { Consumption } from '@/types';

/**
 * Guardado de casillas de consumo, compartido por la planilla general y la ficha del cliente.
 * Ambas vistas usan setDailyConsumption, que fija el total del día (reemplaza, no suma),
 * así que trabajan sobre los mismos registros sin duplicar ni descontar dos veces.
 */

export interface CellState {
  status: 'saving' | 'saved' | 'error';
  cantidad: number | null;
  notas?: string | null;
  planId: string;
  error?: string;
}

export const cellKey = (clientId: string, fecha: string) => `${clientId}|${fecha}`;

interface SaveParams {
  clientId: string;
  planId: string;
  fecha: string;
  cantidad: number | null;
  notas?: string | null;
}

interface Callbacks {
  /** Se llama con los registros del día tal como quedaron en la base. `latest` = es el último valor pedido para esa casilla. */
  onSaved: (args: SaveParams & { rows: Consumption[]; latest: boolean }) => void;
  onFailed?: (args: SaveParams & { error: string }) => void;
}

export function useConsumptionSaver(callbacks: Callbacks) {
  const [cells, setCells] = useState<Record<string, CellState>>({});
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const queues = useRef(new Map<string, Promise<void>>());
  const versions = useRef(new Map<string, number>());
  const cb = useRef(callbacks);
  cb.current = callbacks;

  const save = useCallback((p: SaveParams) => {
    const key = cellKey(p.clientId, p.fecha);
    const version = (versions.current.get(key) || 0) + 1;
    versions.current.set(key, version);
    setCells(s => ({ ...s, [key]: { status: 'saving', cantidad: p.cantidad, notas: p.notas, planId: p.planId } }));

    // Una cola por casilla: los guardados de un mismo día nunca se pisan entre sí.
    const prev = queues.current.get(key) || Promise.resolve();
    const run = prev.then(async () => {
      try {
        const rows = await setDailyConsumption(p);
        const latest = versions.current.get(key) === version;
        cb.current.onSaved({ ...p, rows, latest });
        if (!latest) return;
        setCells(s => ({ ...s, [key]: { status: 'saved', cantidad: p.cantidad, planId: p.planId } }));
        setLastSavedAt(new Date());
        setTimeout(() => {
          if (versions.current.get(key) !== version) return;
          setCells(s => { const { [key]: _omit, ...rest } = s; return rest; });
        }, 1400);
      } catch (e) {
        if (versions.current.get(key) !== version) return;
        const error = (e as Error).message || 'Error desconocido';
        setCells(s => ({ ...s, [key]: { status: 'error', cantidad: p.cantidad, notas: p.notas, planId: p.planId, error } }));
        cb.current.onFailed?.({ ...p, error });
      }
    });
    queues.current.set(key, run);
  }, []);

  const retry = useCallback((clientId: string, fecha: string) => {
    const st = cells[cellKey(clientId, fecha)];
    if (st) save({ clientId, fecha, planId: st.planId, cantidad: st.cantidad, notas: st.notas });
  }, [cells, save]);

  const errorKeys = Object.entries(cells).filter(([, v]) => v.status === 'error').map(([k]) => k);
  const savingCount = Object.values(cells).filter(v => v.status === 'saving').length;

  const retryAll = () => {
    for (const k of errorKeys) {
      const [clientId, fecha] = k.split('|');
      retry(clientId, fecha);
    }
  };

  // Avisar antes de cerrar la página si hay casillas sin guardar.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (savingCount > 0 || errorKeys.length > 0) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [savingCount, errorKeys.length]);

  return { cells, lastSavedAt, save, retry, retryAll, errorCount: errorKeys.length, savingCount, busy: savingCount > 0 || errorKeys.length > 0 };
}

/** Vuelve a leer los datos cuando se vuelve a la pestaña (por si se cargaron desde otra vista o dispositivo). */
export function useRefreshOnReturn(refresh: () => void, enabled: boolean) {
  const ref = useRef(refresh);
  ref.current = refresh;
  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => { if (document.visibilityState === 'visible') ref.current(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled]);
}
