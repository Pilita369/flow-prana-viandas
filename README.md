# Mundo Prana · Viandas

Panel de Mundo Prana para gestionar clientes, contratos de viandas, consumos diarios, saldos a favor y puntos.

## Tecnología

- Vite + React + TypeScript
- Tailwind CSS y componentes shadcn/ui
- Supabase (base de datos)
- Publicado en Vercel (se despliega al subir a la rama `main`)

## Desarrollo local

```sh
npm install
npm run dev      # servidor local
npm test         # pruebas automáticas
npm run build    # compilación de producción
```

Variables necesarias en `.env.local`:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

## Base de datos

Las migraciones están en `supabase/migrations/`.

## Fechas

"Hoy" y las fechas de consumo se calculan siempre en hora de Argentina
(`America/Argentina/Buenos_Aires`), sin importar la zona horaria del dispositivo.
