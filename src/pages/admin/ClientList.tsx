import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { getClients, getActivePlan } from '@/lib/store';
import type { Client, Plan } from '@/types';

export default function ClientList() {
  const [clients, setClients] = useState<(Client & { plan?: Plan })[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const all = getClients().map(c => ({ ...c, plan: getActivePlan(c.id) }));
    setClients(all);
  }, []);

  const filtered = clients.filter(c =>
    `${c.nombre} ${c.apellido} ${c.email}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-subtitle">{clients.length} clientes registrados</p>
        </div>
        <Link to="/admin/clientes/nuevo">
          <Button><Plus className="w-4 h-4 mr-2" /> Crear cliente</Button>
        </Link>
      </div>

      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar cliente..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-muted-foreground">No hay clientes{search ? ' con esa búsqueda' : ' todavía'}.</p>
          {!search && (
            <Link to="/admin/clientes/nuevo">
              <Button variant="outline" className="mt-4"><Plus className="w-4 h-4 mr-2" /> Crear primer cliente</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(c => (
            <Link key={c.id} to={`/admin/clientes/${c.id}`} className="glass-card p-4 flex items-center justify-between hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                  {c.nombre[0]}{c.apellido[0]}
                </div>
                <div>
                  <p className="font-semibold text-sm">{c.nombre} {c.apellido}</p>
                  <p className="text-xs text-muted-foreground">{c.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {c.plan ? (
                  <Badge variant="secondary" className="text-xs">
                    {c.plan.tipo} viandas · {c.plan.modalidad}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">Sin plan</Badge>
                )}
                <ExternalLink className="w-4 h-4 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
