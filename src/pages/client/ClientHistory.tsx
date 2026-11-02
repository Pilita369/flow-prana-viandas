import { useParams } from 'react-router-dom';
import { useClientData } from '@/hooks/useClientData';
import ClientPeriodHistory from '@/components/client/ClientPeriodHistory';

/** Historial del cliente: todos los períodos y sus consumos, en un solo lugar. */
export default function ClientHistory() {
  const { accessLink } = useParams();
  const { loading, client, plans, consumptions, creditNotes } = useClientData(accessLink);

  if (loading) return <div className="text-center py-12 text-muted-foreground">Cargando...</div>;
  if (!client) return <div className="text-center py-12 text-muted-foreground">Cliente no encontrado</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-display font-bold">Historial</h2>
      <ClientPeriodHistory plans={plans} consumptions={consumptions} creditNotes={creditNotes} />
    </div>
  );
}
