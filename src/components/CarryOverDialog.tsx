import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { applyCarryOver } from '@/lib/store';
import { formatCurrencyAR, formatDateAR } from '@/lib/business';
import { toast } from 'sonner';
import type { Plan } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName: string;
  fromPlan: Plan;
  toPlan: Plan;
  /** Viandas que realmente quedaron sin consumir en el contrato de origen. */
  sobrante: number;
  /** Corrección de un saldo ya aplicado (conciliación). */
  conciliacion?: boolean;
  onApplied: () => void;
}

export default function CarryOverDialog({
  open, onOpenChange, clientName, fromPlan, toPlan, sobrante, conciliacion = false, onApplied,
}: Props) {
  const yaAplicado = toPlan.saldoOrigenPlanId === fromPlan.id ? toPlan.saldoAnteriorAplicado || 0 : 0;
  const [cantidad, setCantidad] = useState(sobrante);
  const [reducirCompra, setReducirCompra] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setCantidad(sobrante); setReducirCompra(false); }
  }, [open, sobrante]);

  const valido = Number.isInteger(cantidad) && cantidad >= 0 && cantidad <= sobrante;
  const delta = cantidad - yaAplicado;
  const compraFinal = reducirCompra ? Math.max(toPlan.cantidadContratada - delta, 0) : toPlan.cantidadContratada;
  const totalDisponible = compraFinal + cantidad;

  const handleConfirm = async () => {
    if (!valido) return;
    setSaving(true);
    try {
      await applyCarryOver({
        fromPlan, toPlan, cantidad, reducirCompra,
        motivo: conciliacion ? 'conciliación por corrección de consumos' : undefined,
        respaldar: conciliacion,
      });
      toast.success(conciliacion ? 'Saldo conciliado' : 'Saldo aplicado al contrato siguiente');
      onOpenChange(false);
      onApplied();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{conciliacion ? 'Conciliar saldo aplicado' : 'Aplicar saldo a favor'}</DialogTitle>
          <DialogDescription>
            {clientName}: contrato {formatDateAR(fromPlan.fechaInicio)} – {formatDateAR(fromPlan.fechaFin)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-lg bg-muted/50 p-3 space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Quedaron sin consumir</span><strong>{sobrante}</strong></div>
            {yaAplicado > 0 && (
              <div className="flex justify-between"><span className="text-muted-foreground">Ya aplicado al siguiente</span><strong>{yaAplicado}</strong></div>
            )}
          </div>

          <div>
            <Label className="text-xs">Viandas a aplicar al contrato {formatDateAR(toPlan.fechaInicio)} – {formatDateAR(toPlan.fechaFin)}</Label>
            <Input
              type="number" inputMode="numeric" min={0} max={sobrante} step={1}
              value={Number.isNaN(cantidad) ? '' : cantidad}
              onChange={e => setCantidad(e.target.value === '' ? NaN : Number(e.target.value))}
              className="mt-1 h-11 text-base"
            />
            {!valido && <p className="text-xs text-destructive mt-1">Ingresá un número entero entre 0 y {sobrante}.</p>}
          </div>

          {conciliacion ? (
            <div className="text-xs bg-warning/15 rounded px-2 py-1.5 space-y-1" data-testid="conciliacion-detalle">
              <p>Se corrigieron consumos del contrato anterior: al cierre quedan <strong>{sobrante}</strong> a favor y se habían trasladado <strong>{yaAplicado}</strong>.</p>
              <p>Diferencia: <strong>{yaAplicado > sobrante ? `${yaAplicado - sobrante} trasladada(s) de más` : `${sobrante - yaAplicado} sin trasladar`}</strong>.
                Al confirmar, el contrato siguiente queda con {Number.isNaN(cantidad) ? 0 : cantidad} recibida(s) (su disponible cambia {delta > 0 ? '+' : ''}{Number.isNaN(delta) ? 0 : delta}).</p>
              <p>No se modifican viandas compradas, precios ni pagos, y no se generan créditos nuevos. Antes se guarda un respaldo de ambos contratos.</p>
            </div>
          ) : (
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={reducirCompra} onChange={e => setReducirCompra(e.target.checked)} />
              <span>
                Descontarlas de las viandas a comprar del contrato siguiente
                <span className="block text-xs text-muted-foreground">
                  Usalo si acordaste con el cliente que compra menos. Si no lo marcás, el saldo se suma a lo ya comprado.
                </span>
              </span>
            </label>
          )}

          <div className="rounded-lg border border-border p-3 space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Viandas compradas</span>
              <strong>{toPlan.cantidadContratada}{compraFinal !== toPlan.cantidadContratada && <> → {compraFinal}</>}</strong>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Saldo anterior aplicado</span><strong>{cantidad || 0}</strong></div>
            <div className="flex justify-between border-t border-border pt-1"><span>Total disponible del contrato</span><strong>{totalDisponible || 0}</strong></div>
            {compraFinal !== toPlan.cantidadContratada && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Nuevo total del contrato</span><span>{formatCurrencyAR(compraFinal * toPlan.precioUnitario)}</span>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">El cambio queda anotado en las observaciones del contrato siguiente.</p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!valido || saving}>{saving ? 'Guardando…' : 'Confirmar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
