import { useEffect, useState } from 'react';
import { loadConsumptions, loadPlans, getClients } from '@/lib/store';
import { formatCurrencyAR } from '@/lib/business';
import type { Consumption, Plan, Client } from '@/types';

function normalizeStatus(status: string): string {
  if (status === 'consumido') return 'retirado';
  if (status === 'no_retiro') return 'no_retirado';
  return status;
}

function getMonthKey(dateStr: string): string {
  return dateStr.substring(0, 7); // "YYYY-MM"
}

function formatMonthLabel(key: string): string {
  const [year, month] = key.split('-');
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${months[parseInt(month) - 1]} ${year}`;
}

export default function AdminStats() {
  const [consumptions, setConsumptions] = useState<Consumption[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // Mes seleccionado (YYYY-MM)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [c, p, cl] = await Promise.all([loadConsumptions(), loadPlans(), getClients()]);
      setConsumptions(c);
      setPlans(p);
      setClients(cl);
      setLoading(false);
    })();
  }, []);

  // Meses disponibles (de los consumos y planes)
  const availableMonths = Array.from(
    new Set([
      ...consumptions.map(c => getMonthKey(c.fecha)),
      ...plans.map(p => getMonthKey(p.fechaInicio)),
    ])
  ).sort().reverse();

  // --- Stats del mes seleccionado ---
  const consMonth = consumptions.filter(c => getMonthKey(c.fecha) === selectedMonth);
  const viandardasConsumidas = consMonth
    .filter(c => normalizeStatus(c.status) === 'retirado')
    .reduce((acc, c) => acc + c.cantidad, 0);
  const noRetiraron = consMonth.filter(c => normalizeStatus(c.status) === 'no_retirado').length;

  // Planes iniciados ese mes = renovaciones/altas ese mes
  const planesEseMes = plans.filter(p => getMonthKey(p.fechaInicio) === selectedMonth);
  const ingresosMes = planesEseMes.reduce((acc, p) => acc + p.totalCalculado, 0);

  // Clientes activos = que tienen al menos un consumo ese mes
  const clientesActivosMes = new Set(consMonth.map(c => c.clientId)).size;

  // Top clientes por consumo ese mes
  const consumosPorCliente = consMonth
    .filter(c => normalizeStatus(c.status) === 'retirado')
    .reduce((acc, c) => {
      acc[c.clientId] = (acc[c.clientId] || 0) + c.cantidad;
      return acc;
    }, {} as Record<string, number>);

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]));
  const topClientes = Object.entries(consumosPorCliente)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([clientId, cantidad]) => ({ client: clientMap[clientId], cantidad }))
    .filter(x => x.client);

  // --- Evolución mensual (últimos 6 meses) ---
  const last6Months = availableMonths.slice(0, 6).reverse();
  const evolucion = last6Months.map(month => {
    const cons = consumptions.filter(c => getMonthKey(c.fecha) === month);
    const consumidas = cons.filter(c => normalizeStatus(c.status) === 'retirado').reduce((acc, c) => acc + c.cantidad, 0);
    const nuevosPlanes = plans.filter(p => getMonthKey(p.fechaInicio) === month).length;
    const ingresos = plans.filter(p => getMonthKey(p.fechaInicio) === month).reduce((acc, p) => acc + p.totalCalculado, 0);
    return { month, consumidas, nuevosPlanes, ingresos };
  });

  const maxConsumidas = Math.max(...evolucion.map(e => e.consumidas), 1);

  if (loading) return <p className="p-4 text-muted-foreground">Cargando estadísticas...</p>;

  return (
    <div>
      <div className="page-header mb-6">
        <h1 className="page-title">Estadísticas</h1>
        <p className="page-subtitle">Seguimiento mensual de consumo, renovaciones e ingresos</p>
      </div>

      {/* Selector de mes */}
      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm font-medium">Mes:</label>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
        >
          {availableMonths.map(m => (
            <option key={m} value={m}>{formatMonthLabel(m)}</option>
          ))}
          {availableMonths.length === 0 && (
            <option value={selectedMonth}>{formatMonthLabel(selectedMonth)}</option>
          )}
        </select>
      </div>

      {/* Cards resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="glass-card p-5 text-center">
          <p className="text-3xl font-bold">{viandardasConsumidas}</p>
          <p className="text-sm text-muted-foreground mt-1">Viandas consumidas</p>
        </div>
        <div className="glass-card p-5 text-center">
          <p className="text-3xl font-bold">{planesEseMes.length}</p>
          <p className="text-sm text-muted-foreground mt-1">Planes iniciados</p>
        </div>
        <div className="glass-card p-5 text-center">
          <p className="text-2xl font-bold">{formatCurrencyAR(ingresosMes)}</p>
          <p className="text-sm text-muted-foreground mt-1">Ingresos estimados</p>
        </div>
        <div className="glass-card p-5 text-center">
          <p className="text-3xl font-bold">{clientesActivosMes}</p>
          <p className="text-sm text-muted-foreground mt-1">Clientes activos</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Evolución mensual */}
        <div className="glass-card p-5">
          <h3 className="font-semibold mb-4">Viandas consumidas — últimos meses</h3>
          {evolucion.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin datos suficientes.</p>
          ) : (
            <div className="space-y-3">
              {evolucion.map(e => (
                <div key={e.month}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className={e.month === selectedMonth ? 'font-semibold' : 'text-muted-foreground'}>
                      {formatMonthLabel(e.month)}
                    </span>
                    <span className="font-medium">{e.consumidas}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${(e.consumidas / maxConsumidas) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Resumen del mes detallado */}
        <div className="glass-card p-5">
          <h3 className="font-semibold mb-4">Detalle — {formatMonthLabel(selectedMonth)}</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-muted-foreground">Viandas retiradas</span>
              <span className="font-medium">{viandardasConsumidas}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-muted-foreground">Días sin retiro</span>
              <span className="font-medium">{noRetiraron}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-muted-foreground">Planes nuevos / renovaciones</span>
              <span className="font-medium">{planesEseMes.length}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-muted-foreground">Ingresos estimados</span>
              <span className="font-semibold">{formatCurrencyAR(ingresosMes)}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-muted-foreground">Clientes con movimiento</span>
              <span className="font-medium">{clientesActivosMes}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top clientes del mes */}
      <div className="glass-card p-5 mb-6">
        <h3 className="font-semibold mb-4">Top clientes por consumo — {formatMonthLabel(selectedMonth)}</h3>
        {topClientes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin consumos registrados este mes.</p>
        ) : (
          <div className="space-y-2">
            {topClientes.map(({ client, cantidad }, idx) => (
              <div key={client.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                <span className="text-sm font-bold text-muted-foreground w-6">#{idx + 1}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium">{client.nombre} {client.apellido}</p>
                  {client.alias && <p className="text-xs text-muted-foreground">{client.alias}</p>}
                </div>
                <span className="font-semibold">{cantidad} vianda{cantidad !== 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Planes iniciados ese mes */}
      {planesEseMes.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="font-semibold mb-4">Planes iniciados en {formatMonthLabel(selectedMonth)}</h3>
          <div className="space-y-2">
            {planesEseMes.map(p => {
              const client = clientMap[p.clientId];
              return (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 text-sm">
                  <div>
                    <p className="font-medium">{client ? `${client.nombre} ${client.apellido}` : 'Cliente desconocido'}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.cantidadContratada} viandas · {p.modalidad} · desde {p.fechaInicio}
                    </p>
                  </div>
                  <span className="font-semibold">{formatCurrencyAR(p.totalCalculado)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
