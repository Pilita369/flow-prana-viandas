import { ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Users, CalendarCheck, ShoppingBag, Trophy, Award, LogOut, Menu, Settings, BarChart2, Moon, Sun
} from 'lucide-react';
import { useAdminTheme } from '@/hooks/useAdminTheme';

const navItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/clientes', icon: Users, label: 'Clientes' },
  { to: '/admin/consumos', icon: CalendarCheck, label: 'Consumos' },
  { to: '/admin/pedidos', icon: ShoppingBag, label: 'Pedidos flexibles' },
  { to: '/admin/puntos', icon: Award, label: 'Puntos y canjes' },
  { to: '/admin/ranking', icon: Trophy, label: 'Ranking' },
  { to: '/admin/estadisticas', icon: BarChart2, label: 'Estadísticas' },
  { to: '/admin/configuracion', icon: Settings, label: 'Configuración' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { theme, toggle } = useAdminTheme();

  const handleLogout = () => {
    sessionStorage.removeItem('mp_admin');
    navigate('/admin/login');
  };

  return (
    <div className="flex min-h-screen">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed md:sticky top-0 left-0 z-50 h-screen w-64 bg-sidebar text-sidebar-foreground flex flex-col transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="p-5 flex items-center gap-3 border-b border-sidebar-border">
          <img src="/logo.cuchara.webp" alt="Mundo Prana" className="w-9 h-9 rounded-lg object-contain" />
          <div>
            <h1 className="text-base font-bold font-display text-sidebar-foreground">Mundo Prana</h1>
            <p className="text-xs text-sidebar-foreground/60">Panel Admin</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(item => {
            const active = location.pathname === item.to || (item.to !== '/admin' && location.pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-[0.95rem] font-medium transition-colors border-l-4 ${
                  active ? 'bg-sidebar-accent text-sidebar-primary border-sidebar-primary' : 'border-transparent text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                }`}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-sidebar-border space-y-1">
          <button
            onClick={toggle}
            className="flex items-center gap-3 px-3 py-3 rounded-lg text-[0.95rem] font-medium text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors w-full"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            {theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-3 rounded-lg text-[0.95rem] font-medium text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors w-full"
          >
            <LogOut className="w-5 h-5" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 min-h-screen">
        <div className="md:hidden sticky top-0 z-30 flex items-center justify-between px-2 py-1.5 border-b-2 border-border bg-card">
          <button onClick={() => setSidebarOpen(true)} className="h-11 w-11 inline-flex items-center justify-center rounded-lg hover:bg-muted" aria-label="Abrir menú">
            <Menu className="w-6 h-6 text-foreground" />
          </button>
          <div className="flex items-center gap-2">
            <img src="/logo.cuchara.webp" alt="Mundo Prana" className="w-6 h-6 object-contain" />
            <span className="font-display font-bold text-sm">Mundo Prana</span>
          </div>
          <button onClick={toggle} className="h-11 w-11 inline-flex items-center justify-center rounded-lg hover:bg-muted" aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema oscuro'}>
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="px-3 py-4 sm:p-5 lg:p-8 max-w-[1680px] mx-auto"
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}