import { useCallback, useEffect, useRef, useState } from 'react';
import { getCreditNotes, loadClientByLinkOrThrow, loadClientConsumptionsOrThrow, loadClientPlansOrThrow } from '@/lib/store';
import type { Client, Consumption, CreditNote, Plan } from '@/types';
import { getPagosCliente, type PagoContrato } from '@/lib/pagos';

interface State {
  loading: boolean;
  /** La carga falló (sin conexión, tiempo límite): se ofrece reintentar en lugar de decir "no encontrado". */
  error: string | null;
  client: Client | null;
  plans: Plan[];
  consumptions: Consumption[];
  creditNotes: CreditNote[];
  pagos: PagoContrato[];
}

/** Datos de la vista del cliente (solo lectura): cliente, contratos, consumos y ajustes, leídos de la base. */
export function useClientData(accessLink?: string) {
  const [state, setState] = useState<State>({ loading: true, error: null, client: null, plans: [], consumptions: [], creditNotes: [], pagos: [] });
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!accessLink) return;
    const my = ++seq.current;
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const client = (await loadClientByLinkOrThrow(accessLink)) || null;
      if (!client) { if (seq.current === my) setState(s => ({ ...s, loading: false, client: null })); return; }
      const [plans, consumptions, creditNotes, pagos] = await Promise.all([
        // Directo de la base, solo de este cliente: los mismos registros que ve administración, al día
        loadClientPlansOrThrow(client.id),
        loadClientConsumptionsOrThrow(client.id),
        getCreditNotes(client.id).catch(() => [] as CreditNote[]),
        getPagosCliente(client.id).catch(() => [] as PagoContrato[]),
      ]);
      if (seq.current === my) setState({ loading: false, error: null, client, plans, consumptions, creditNotes, pagos });
    } catch (e) {
      console.error(e);
      if (seq.current === my) setState(s => ({ ...s, loading: false, error: (e as Error).message || 'No se pudieron cargar tus datos' }));
    }
  }, [accessLink]);

  useEffect(() => { void load(); return () => { seq.current++; }; }, [load]);

  const activePlan = state.plans.find(p => p.activo) || null;
  return { ...state, activePlan, reload: load };
}
