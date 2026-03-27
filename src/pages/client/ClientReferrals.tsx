import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getClientByLink } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Copy, Send } from 'lucide-react';
import { toast } from 'sonner';
import type { Client } from '@/types';

// Tiene que coincidir con el valor en CreateClient.tsx y AdminPoints
const PUNTOS_POR_REFERIDO = 40;

export default function ClientReferrals() {
  const { accessLink } = useParams();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessLink) return;
    (async () => {
      setLoading(true);
      try {
        const c = await getClientByLink(accessLink);
        if (c) setClient(c);
      } finally {
        setLoading(false);
      }
    })();
  }, [accessLink]);

  if (loading) return <div className="text-center py-12 text-muted-foreground">Cargando...</div>;
  if (!client) return null;

  const copy = () => {
    navigator.clipboard.writeText(client.codigoReferido);
    toast.success('Código copiado');
  };

  const share = () => {
    const msg = encodeURIComponent(
      `Hola! Me apunto a Mundo Prana Viandas, viandas saludables. Usá mi código ${client.codigoReferido} cuando te suscribas y los dos ganamos puntos!`
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-display font-bold">Referidos</h2>

      <div className="glass-card p-5 text-center space-y-4">
        <p className="text-sm text-muted-foreground">
          Compartí tu código y ganás <strong>{PUNTOS_POR_REFERIDO} puntos</strong> por cada persona que se sume a Mundo Prana con tu código
        </p>
        <div className="text-3xl font-bold font-mono tracking-widest text-primary">
          {client.codigoReferido}
        </div>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={copy}>
            <Copy className="w-4 h-4 mr-2" /> Copiar código
          </Button>
          <Button onClick={share}>
            <Send className="w-4 h-4 mr-2" /> Compartir por WhatsApp
          </Button>
        </div>
      </div>

      <div className="glass-card p-5 space-y-3">
        <h3 className="font-semibold text-sm">¿Cómo funciona?</h3>
        <ol className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center shrink-0 font-bold">1</span>
            Compartís tu código con quien quieras
          </li>
          <li className="flex gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center shrink-0 font-bold">2</span>
            Cuando se suman a Mundo Prana, dan tu código al momento de inscribirse
          </li>
          <li className="flex gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center shrink-0 font-bold">3</span>
            <strong className="text-foreground">¡Recibís {PUNTOS_POR_REFERIDO} puntos automáticamente!</strong>
          </li>
        </ol>
      </div>
    </div>
  );
}