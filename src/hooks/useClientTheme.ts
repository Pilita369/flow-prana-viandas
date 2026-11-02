import { useCallback, useLayoutEffect, useState } from 'react';

/** Apariencia de la vista del cliente: claro, oscuro o el del dispositivo, y alto contraste. Se guarda en este dispositivo. */
export type ClientThemeMode = 'light' | 'dark' | 'system';
const MODE_KEY = 'mp_client_theme';
const HC_KEY = 'mp_client_contrast';

function read<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

function readMode(): ClientThemeMode {
  return read(() => {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  }, 'system' as ClientThemeMode);
}

function prefersDark(): boolean {
  return read(() => window.matchMedia('(prefers-color-scheme: dark)').matches, false);
}

export function useClientTheme() {
  const [mode, setModeState] = useState<ClientThemeMode>(readMode);
  const [contrast, setContrastState] = useState<boolean>(() => read(() => localStorage.getItem(HC_KEY) === 'true', false));
  const [systemDark, setSystemDark] = useState(prefersDark);

  // Si eligió "del dispositivo", sigue los cambios del sistema
  useLayoutEffect(() => {
    if (mode !== 'system' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [mode]);

  const dark = mode === 'dark' || (mode === 'system' && systemDark);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add('client-ui');
    root.classList.toggle('dark', dark);
    root.classList.toggle('hc', contrast);
    return () => { root.classList.remove('client-ui', 'dark', 'hc'); };
  }, [dark, contrast]);

  const setMode = useCallback((m: ClientThemeMode) => {
    setModeState(m);
    read(() => localStorage.setItem(MODE_KEY, m), undefined);
  }, []);

  const setContrast = useCallback((v: boolean) => {
    setContrastState(v);
    read(() => localStorage.setItem(HC_KEY, String(v)), undefined);
  }, []);

  return { mode, setMode, contrast, setContrast, dark };
}
