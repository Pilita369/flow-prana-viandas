import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getClientByLink } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Copy, Send } from 'lucide-react';
import { toast } from 'sonner';
import type { Client } from '@/types';

export default function ClientReferrals() {
  const { accessLink } = useParams();
  const [client, setClient] = useState<Client | null>(null);

  useEffect(() => {
    if (!accessLink) return;
    const c = getClientByLink(accessLink);
    if (c) setClient(c);
  }, [accessLink]);

  if (!client) return null;

  const refLink = `Usá mi código ${client.codigoReferido} en Mundo Prana Viandas y sumá puntos!`;

  const copy = () => { navigator.clipboard.writeText(client.codigoReferido); toast.success('Código copiado'); };
  const share = () => {
    const msg = encodeURIComponent(refLink);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  return (
    <div>
      <h2 className="text-xl font-display font-bold mb-4">Referidos</h2>
      <div className="glass-card p-5 text-center space-y-4">
        <p className="text-sm text-muted-foreground">Compartí tu código y ganá 5 puntos por cada referido que compre un plan</p>
        <div className="text-3xl font-bold font-mono tracking-widest text-primary">{client.codigoReferido}</div>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={copy}><Copy className="w-4 h-4 mr-2" /> Copiar</Button>
          <Button onClick={share}><Send className="w-4 h-4 mr-2" /> WhatsApp</Button>
        </div>
      </div>
    </div>
  );
}
