// src/lib/supabase.ts
// ============================================================
// CLIENTE DE SUPABASE — MUNDO PRANA VIANDAS
//
// Las claves se leen desde las variables de entorno.
// En desarrollo: archivo .env.local en la raíz del proyecto.
// En producción (Vercel): configuradas en el panel de Vercel.
//
// NUNCA hardcodees las claves acá directamente.
// ============================================================

import { createClient } from '@supabase/supabase-js';

// Leer las variables de entorno de Vite
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// Validar que estén configuradas
if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '❌ Faltan las variables de entorno de Supabase.\n' +
    'Asegurate de tener un archivo .env.local con:\n' +
    '  VITE_SUPABASE_URL=https://xxxx.supabase.co\n' +
    '  VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...'
  );
}

// Crear y exportar el cliente de Supabase
export const supabase = createClient(supabaseUrl, supabaseAnonKey);