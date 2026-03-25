import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { getClients, getActivePlan, getDisponibles, getCantidadUsada, deleteClient } from '@/lib/store';
import { formatCurrencyAR } from '@/lib/business';
import { toast } from 'sonner';
import type { Client, Plan } from '@/types';

type ClientWithPlan = Client & { plan?: Plan };

export default function ClientList() {
  const [clients, setClients] = useState<ClientWithPlan[]>([]);
  const [search, setSearch] = useState('');

  const load = () => {
    const all = getClients().map((client) => ({
      ...client,
      plan: getActivePlan(client.id),
    }));
    setClients(all);
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = (id: string, nombre: string) => {
    const ok = window.confirm(`¿Seguro que querés eliminar a ${nombre}?`);
    if (!ok) return;

    deleteClient(id);
    toast.success('Cliente eliminado');
    load();
  };

  const filtered = clients.filter((c) =>
    `${c.nombre} ${c.apellido} ${c.email} ${c.telefono}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-subtitle">{clients.length} clientes registrados</p>
        </div>

        <Link to="/admin/clientes/nuevo">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Crear cliente
          </Button>
        </Link>
      </div>

      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, email o teléfono..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-muted-foreground">No hay clientes para mostrar.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((client) => {
            const plan = client.plan;
            const usadas = getCantidadUsada(plan);
            const disponibles = getDisponibles(plan);

            const precioUnitario = Number(plan?.precioUnitario ?? 0);
            const totalCalculado = Number(plan?.totalCalculado ?? 0);
            const unidadesPorRetiro = Number(plan?.unidadesPorRetiro ?? 1);

            return (
              <div
                key={client.id}
                className="glass-card p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <Link to={`/admin/clientes/${client.id}`} className="flex-1">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                      {client.nombre[0]}
                      {client.apellido[0]}
                    </div>

                    <div className="space-y-1">
                      <p className="font-semibold text-sm">
                        {client.nombre} {client.apellido}
                      </p>
                      <p className="text-xs text-muted-foreground">{client.telefono}</p>

                      {plan ? (
                        <div className="space-y-1">
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {plan.modalidad}
                            </Badge>

                            <Badge variant="outline" className="text-xs">
                              {plan.tipoEntrega}
                            </Badge>

                            <Badge variant="outline" className="text-xs">
                              {unidadesPorRetiro} por retiro
                            </Badge>
                          </div>

                          <p className="text-xs text-muted-foreground">
                            Contratadas: <strong>{plan.cantidadContratada}</strong> · Usadas:{' '}
                            <strong>{usadas}</strong> · Disponibles:{' '}
                            <strong>{disponibles}</strong>
                          </p>

                          <p className="text-xs text-muted-foreground">
                            Valor unitario: <strong>{formatCurrencyAR(precioUnitario)}</strong> ·
                            Total: <strong>{formatCurrencyAR(totalCalculado)}</strong>
                          </p>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Sin contrato activo
                        </Badge>
                      )}
                    </div>
                  </div>
                </Link>

                <div className="flex gap-2">
                  <Link to={`/admin/clientes/${client.id}`}>
                    <Button variant="outline" size="sm">
                      Ver detalle
                    </Button>
                  </Link>

                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(client.id, `${client.nombre} ${client.apellido}`)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Eliminar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}