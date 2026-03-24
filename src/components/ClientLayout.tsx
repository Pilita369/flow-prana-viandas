import { ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, CalendarCheck, History, Award, Trophy, Users, User, Leaf } from 'lucide-react';

export default function ClientLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { accessLink } = useParams();
  const base = `/cliente/${accessLink}`;

  const navItems = [
    { to: base, icon: Home, label: 'Inicio' },
    { to: `${base}/plan`, icon: CalendarCheck, label: 'Mi plan' },
    { to: `${base}/historial`, icon: History, label: 'Historial' },
    { to: `${base}/puntos`, icon: Award, label: 'Puntos' },
    { to: `${base}/ranking`, icon: Trophy, label: 'Ranking' },
    { to: `${base}/referidos`, icon: Users, label: 'Referidos' },
  ];

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <header className="bg-primary text-primary-foreground p-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Leaf className="w-6 h-6" />
          <h1 className="font-display font-bold text-lg">Mundo Prana</h1>
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

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border">
        <div className="max-w-lg mx-auto flex">
          {navItems.map(item => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex-1 flex flex-col items-center py-2 text-[10px] font-medium transition-colors ${
                  active ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
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
