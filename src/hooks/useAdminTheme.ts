import { useCallback, useLayoutEffect, useState } from 'react';

/** Tema del panel de administración: oscuro por defecto; la elección queda guardada en este dispositivo. */
export type AdminTheme = 'dark' | 'light';
const KEY = 'mp_admin_theme';

function readTheme(): AdminTheme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function useAdminTheme() {
  const [theme, setTheme] = useState<AdminTheme>(readTheme);

  // useLayoutEffect: al cambiar de pantalla dentro del panel no se ve un parpadeo claro
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add('admin-ui');
    root.classList.toggle('dark', theme === 'dark');
    return () => {
      // Al salir del panel (vista del cliente), vuelve el tema claro
      root.classList.remove('admin-ui', 'dark');
    };
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme(t => {
      const next = t === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch { /* sin almacenamiento: solo esta sesión */ }
      return next;
    });
  }, []);

  return { theme, toggle };
}
