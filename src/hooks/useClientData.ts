import { useEffect, useState } from 'react';
import { getClientByLink, getClientConsumptions, getClientPlans, getCreditNotes } from '@/lib/store';
import type { Client, Consumption, CreditNote, Plan } from '@/types';
import { getPagosCliente, type PagoContrato } from '@/lib/pagos';

/** Datos de la vista del cliente (solo lectura): cliente, contratos, consumos y ajustes. */
export function useClientData(accessLink?: string) {
  const [state, setState] = useState<{
    loading: boolean;
    client: Client | null;
    plans: Plan[];
    consumptions: Consumption[];
    creditNotes: CreditNote[];
    pagos: PagoContrato[];
  }>({ loading: true, client: null, plans: [], consumptions: [], creditNotes: [], pagos: [] });

  useEffect(() => {
    if (!accessLink) return;
    let cancel = false;
    (async () => {
      try {
        const client = (await getClientByLink(accessLink)) || null;
        if (!client) { if (!cancel) setState(s => ({ ...s, loading: false })); return; }
        const [plans, consumptions, creditNotes, pagos] = await Promise.all([
          getClientPlans(client.id),
          getClientConsumptions(client.id),
          getCreditNotes(client.id).catch(() => [] as CreditNote[]),
          getPagosCliente(client.id).catch(() => [] as PagoContrato[]),
        ]);
        if (!cancel) setState({ loading: false, client, plans, consumptions, creditNotes, pagos });
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
