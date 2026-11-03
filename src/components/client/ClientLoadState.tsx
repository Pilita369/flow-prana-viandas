import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Carga de la vista del cliente: nunca queda "Cargando..." sin salida; si falla, se puede reintentar. */
export default function ClientLoadState({ loading, error, onRetry }: { loading: boolean; error: string | null; onRetry: () => void }) {
  if (loading) return <div className="text-center py-12 text-muted-foreground" role="status">Cargando...</div>;
  return (
    <div className="glass-card p-6 text-center space-y-3" role="alert">
      <p className="font-semibold">No se pudieron cargar tus datos</p>
      {error && <p className="text-sm text-muted-foreground">{error}</p>}
      <Button onClick={onRetry} className="h-12"><RefreshCw className="w-4 h-4 mr-2" />Reintentar</Button>
    </div>
  );
}
