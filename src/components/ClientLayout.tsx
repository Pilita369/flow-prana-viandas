import { ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, CalendarCheck, History, Award, Trophy, Users, Palette, Sun, Moon, Smartphone, Contrast, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useClientTheme, type ClientThemeMode } from '@/hooks/useClientTheme';

const MODOS: { value: ClientThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Tema claro', icon: Sun },
  { value: 'dark', label: 'Tema oscuro', icon: Moon },
  { value: 'system', label: 'Usar el del dispositivo', icon: Smartphone },
];

export default function ClientLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { accessLink } = useParams();
  const base = `/cliente/${accessLink}`;
  const { mode, setMode, contrast, setContrast } = useClientTheme();

  const navItems = [
    { to: base, icon: Home, label: 'Inicio' },
    { to: `${base}/plan`, icon: CalendarCheck, label: 'Mi plan' },
    { to: `${base}/historial`, icon: History, label: 'Historial' },
    { to: `${base}/puntos`, icon: Award, label: 'Puntos' },
    { to: `${base}/ranking`, icon: Trophy, label: 'Ranking' },
    { to: `${base}/referidos`, icon: Users, label: 'Referidos' },
  ];

  return (
    <div className="min-h-screen pb-24 bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <img src="/logo.cuchara.webp" alt="Mundo Prana" className="w-8 h-8 object-contain" />
          <h1 className="font-display font-bold text-lg flex-1">Mundo Prana</h1>

          {/* Apariencia: claro / oscuro / del dispositivo y alto contraste */}
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border-2 border-primary-foreground/60 px-3 h-11 text-sm font-medium"
                aria-label="Apariencia: tema y contraste">
                <Palette className="w-5 h-5" /><span>Apariencia</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-3 space-y-3">
              <p className="font-semibold">Apariencia</p>
              <div role="radiogroup" aria-label="Tema" className="space-y-1.5">
                {MODOS.map(m => {
                  const on = mode === m.value;
                  return (
                    <button key={m.value} type="button" role="radio" aria-checked={on} onClick={() => setMode(m.value)}
                      className={`w-full min-h-[3rem] rounded-lg border-2 px-3 flex items-center gap-3 text-left ${on ? 'border-primary bg-primary/15 font-semibold' : 'border-border hover:bg-muted'}`}>
                      <m.icon className="w-5 h-5 shrink-0" />
                      <span className="flex-1">{m.label}</span>
                      {on && <Check className="w-5 h-5 shrink-0" aria-hidden />}
                    </button>
                  );
                })}
              </div>
              <button type="button" role="switch" aria-checked={contrast} onClick={() => setContrast(!contrast)}
                className={`w-full min-h-[3rem] rounded-lg border-2 px-3 flex items-center gap-3 text-left ${contrast ? 'border-primary bg-primary/15 font-semibold' : 'border-border hover:bg-muted'}`}>
                <Contrast className="w-5 h-5 shrink-0" />
                <span className="flex-1">Alto contraste</span>
                <span className="text-sm font-semibold">{contrast ? 'Activado' : 'Desactivado'}</span>
              </button>
              <p className="text-xs text-muted-foreground">Se guarda en este dispositivo.</p>
            </PopoverContent>
          </Popover>
        </div>
      </header>

      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="max-w-lg mx-auto p-4"
      >
        {children}
      </motion.div>

      {/* Bottom nav: la sección actual se marca con color, línea y texto en negrita */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t-2 border-border" aria-label="Secciones">
        <div className="max-w-lg mx-auto flex">
          {navItems.map(item => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={`relative flex-1 flex flex-col items-center justify-center min-h-[3.75rem] py-1.5 text-[11px] leading-tight transition-colors ${
                  active ? 'text-primary font-bold' : 'text-muted-foreground font-medium'
                }`}
              >
                {active && <span className="absolute top-0 inset-x-2 h-1 rounded-b bg-primary" aria-hidden />}
                <item.icon className="w-5 h-5 mb-0.5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
