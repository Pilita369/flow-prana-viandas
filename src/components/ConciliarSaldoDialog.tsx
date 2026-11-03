import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { conciliarTraslado } from '@/lib/store';
import { formatCurrencyAR, formatDateAR } from '@/lib/business';
import { computePlanBalance, todayISO } from '@/lib/consumo';
import type { Consumption, Plan } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName: string;
  fromPlan: Plan;
  toPlan: Plan;
  plans: Plan[];
  consumptions: Consumption[];
  onDone: () => void | Promise<void>;
}

const periodo = (p: Plan) => `${formatDateAR(p.fechaInicio)} al ${formatDateAR(p.fechaFin)}`;

/**
 * "Conciliar saldo": muestra el antes y el después de los dos contratos y, al confirmar,
 * fija lo trasladado al saldo real al cierre. No cambia compras, importes ni pagos.
 */
export default function ConciliarSaldoDialog({ open, onOpenChange, clientName, fromPlan, toPlan, plans, consumptions, onDone }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = todayISO();
  const origen = computePlanBalance(fromPlan, consumptions, plans, today);
  const destino = computePlanBalance(toPlan, consumptions, plans, today);
  const sobrante = Math.max(origen.restante, 0);
  const antes = toPlan.saldoAnteriorAplicado || 0;
  const delta = sobrante - antes;
  const totalAntes = destino.compradas + antes + destino.ajusteManual - destino.ajusteInicial;

  const confirmar = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await conciliarTraslado({ fromPlanId: fromPlan.id, toPlanId: toPlan.id, cantidad: sobrante });
      toast.success(r.cambio ? `Saldo conciliado: ${r.antes} → ${r.despues} trasladadas` : 'Ya estaba conciliado: no se cambió nada');
      onOpenChange(false);
      await onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const fila = (label: string, a: string | number, d: string | number, testId?: string) => (
    <tr className="border-t border-border">
      <td className="py-1.5 pr-2 text-muted-foreground">{label}</td>
      <td className="py-1.5 px-2 text-right tabular-nums">{a}</td>
      <td className={`py-1.5 pl-2 text-right tabular-nums ${a !== d ? 'font-bold' : ''}`} data-testid={testId}>{d}</td>
    </tr>
  );

  return (
    <Dialog open={open} onOpenChange={o => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Conciliar saldo</DialogTitle>
          <DialogDescription>{clientName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p>
            Al cierre, el contrato {periodo(fromPlan)} quedó con <strong>{sobrante}</strong> a favor
            ({origen.compradas}{origen.saldoAnteriorAplicado ? ` + ${origen.saldoAnteriorAplicado}` : ''} − {origen.consumidas} consumidas{origen.ajusteManual ? ` + ${origen.ajusteManual} de ajustes` : ''}),
            pero se trasladaron <strong>{antes}</strong>.
          </p>

          <table className="w-full text-sm" data-testid="conciliar-tabla">
            <thead>
              <tr className="text-xs text-muted-foreground"><th className="text-left font-medium" /><th className="text-right font-medium px-2">Antes</th><th className="text-right font-medium pl-2">Después</th></tr>
            </thead>
            <tbody>
              <tr><td colSpan={3} className="pt-2 font-semibold">Origen: {periodo(fromPlan)}</td></tr>
              {fila('Saldo al cierre', sobrante, sobrante)}
              {fila('Trasladadas', antes, sobrante, 'conciliar-trasladadas')}
              <tr><td colSpan={3} className="pt-3 font-semibold">Destino: {periodo(toPlan)}</td></tr>
              {fila('Compradas', destino.compradas, destino.compradas)}
              {fila('Recibidas del anterior', antes, sobrante, 'conciliar-recibidas')}
              {destino.ajusteManual > 0 && fila('Ajustes a favor', destino.ajusteManual, destino.ajusteManual)}
              {fila('Total para usar', totalAntes, totalAntes + delta)}
              {fila('Consumidas', destino.consumidas, destino.consumidas)}
              {fila('Disponibles', destino.disponible, destino.disponible + delta, 'conciliar-disponibles')}
              {fila('Importe', formatCurrencyAR(toPlan.totalCalculado), formatCurrencyAR(toPlan.totalCalculado))}
            </tbody>
          </table>

          <p className="text-xs text-muted-foreground">
            No se modifican compras, importes, pagos ni consumos, y no se generan créditos nuevos. Antes se guarda un respaldo de ambos contratos
            y el cambio queda anotado en los dos. Si se repite, no vuelve a descontar.
          </p>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button className="h-11" onClick={confirmar} disabled={saving || delta === 0}>
            {saving ? 'Conciliando…' : error ? 'Reintentar' : 'Conciliar saldo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
