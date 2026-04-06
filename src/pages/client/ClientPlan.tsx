import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getClientByLink } from '@/lib/store';
import ClientPlanHistory from '@/components/ClientPlanHistory';
import type { Client } from '@/types';

export default function ClientPlan() {
  const { accessLink } = useParams();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessLink) return;
    (async () => {
      setLoading(true);
      try {
        const found = await getClientByLink(accessLink);
        if (found) setClient(found);
      } finally {
        setLoading(false);
      }
    })();
  }, [accessLink]);

  if (loading) return <div className="text-center py-12 text-muted-foreground">Cargando...</div>;
  if (!client) return <div className="text-center py-12 text-muted-foreground">Sin contrato activo</div>;

  return (
    <div>
      <h2 className="text-xl font-display font-bold mb-4">Mi plan</h2>
      <ClientPlanHistory clientId={client.id} showAdmin={false} />
    </div>
  );
}
