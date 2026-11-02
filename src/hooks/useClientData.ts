import { useEffect, useState } from 'react';
import { getClientByLink, getClientConsumptions, getClientPlans, getCreditNotes } from '@/lib/store';
import type { Client, Consumption, CreditNote, Plan } from '@/types';

/** Datos de la vista del cliente (solo lectura): cliente, contratos, consumos y ajustes. */
export function useClientData(accessLink?: string) {
  const [state, setState] = useState<{
    loading: boolean;
    client: Client | null;
    plans: Plan[];
    consumptions: Consumption[];
    creditNotes: CreditNote[];
  }>({ loading: true, client: null, plans: [], consumptions: [], creditNotes: [] });

  useEffect(() => {
    if (!accessLink) return;
    let cancel = false;
    (async () => {
      try {
        const client = (await getClientByLink(accessLink)) || null;
        if (!client) { if (!cancel) setState(s => ({ ...s, loading: false })); return; }
        const [plans, consumptions, creditNotes] = await Promise.all([
          getClientPlans(client.id),
          getClientConsumptions(client.id),
          getCreditNotes(client.id).catch(() => [] as CreditNote[]),
        ]);
        if (!cancel) setState({ loading: false, client, plans, consumptions, creditNotes });
      } catch (e) {
        console.error(e);
        if (!cancel) setState(s => ({ ...s, loading: false }));
      }
    })();
    return () => { cancel = true; };
  }, [accessLink]);

  const activePlan = state.plans.find(p => p.activo) || null;
  return { ...state, activePlan };
}
