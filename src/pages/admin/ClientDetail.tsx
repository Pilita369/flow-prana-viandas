import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getClient, getActivePlan, getClientConsumptions, getClientPoints } from '@/lib/store';
import { ArrowLeft, Copy, Send, CalendarCheck, Award } from 'lucide-react';
import { toast } from 'sonner';
import type { Client, Plan, Consumption, PointTransaction } from '@/types';

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [consumptions, setConsumptions] = useState<Consumption[]>([]);
  const [points, setPoints] = useState<PointTransaction[]>([]);

  useEffect(() => {
    if (!id) return;
    const c = getClient(id);
    if (!c) { navigate('/admin/clientes'); return; }
    setClient(c);
    setPlan(getActivePlan(id) || null);
    setConsumptions(getClientConsumptions(id));
    setPoints(getClientPoints(id));
  }, [id, navigate]);

  if (!client) return null;

  const link = `${window.location.origin}/cliente/${client.accessLink}`;
  const copyLink = () => { navigator.clipboard.writeText(link); toast.success('Link copiado'); };
  const sendWhatsApp = () => {
    const msg = encodeURIComponent(`¡Hola ${client.nombre}! Acá podés ver tu plan de viandas en Mundo Prana: ${link}`);
    window.open(`https://wa.me/${client.telefono.replace(/\D/g, '')}?text=${msg}`, '_blank');
  };

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => navigate('/admin/clientes')} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-2" /> Volver
      </Button>

      <div className="page-header flex items-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-display font-bold text-xl">
          {client.nombre[0]}{client.apellido[0]}
        </div>
        <div>
          <h1 className="page-title">{client.nombre} {client.apellido}</h1>
          <p className="page-subtitle">{client.email} · {client.telefono}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        {/* Plan */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <CalendarCheck className="w-4 h-4" /> Plan activo
          </h3>
          {plan ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">{plan.tipo}</span>
                <span className="text-muted-foreground text-sm">viandas</span>
                <Badge variant="secondary" className="ml-auto">{plan.modalidad}</Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>Usadas: {plan.viandasUsadas} / {plan.tipo}</p>
                <p>Período: {plan.fechaInicio} → {plan.fechaFin}</p>
                <p>Abonado: ${plan.importeAbonado.toLocaleString()}</p>
                {plan.diasFijos && <p>Días: {plan.diasFijos.join(', ')}</p>}
              </div>
              <div className="w-full bg-muted rounded-full h-2 mt-2">
                <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${(plan.viandasUsadas / plan.tipo) * 100}%` }} />
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Sin plan activo</p>
          )}
        </div>

        {/* Puntos */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Award className="w-4 h-4" /> Puntos
          </h3>
          <div className="text-2xl font-bold">{client.puntos} pts</div>
          <p className="text-xs text-muted-foreground mt-1">Código referido: {client.codigoReferido}</p>
        </div>
      </div>

      {/* Access link */}
      <div className="glass-card p-5 mb-6">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Link de acceso</h3>
        <div className="flex gap-2 flex-wrap">
          <code className="flex-1 bg-muted px-3 py-2 rounded-lg text-xs overflow-x-auto">{link}</code>
          <Button variant="outline" size="sm" onClick={copyLink}><Copy className="w-4 h-4" /></Button>
          <Button size="sm" onClick={sendWhatsApp}><Send className="w-4 h-4 mr-2" /> WhatsApp</Button>
        </div>
      </div>

      {/* Recent consumptions */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Últimos consumos</h3>
        {consumptions.length === 0 ? (
          <p className="text-muted-foreground text-sm">Sin consumos registrados</p>
        ) : (
          <div className="space-y-2">
            {consumptions.slice(-10).reverse().map(c => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <span className="text-sm">{c.fecha}</span>
                <Badge variant={c.status === 'retirado' ? 'default' : 'outline'}>
                  {c.status === 'retirado' ? '✓ Retirado' : c.status === 'no_retirado' ? '✗ No retiró' : '↻ Reprogramado'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
