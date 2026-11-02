import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatCurrencyAR, formatDateAR } from '@/lib/business';
import type { RecalculoContrato } from '@/lib/habiles';

export interface RecalcItem {
  rec: RecalculoContrato;
  clientName: string;
}

interface Props {
  /** Qué cambió, por ejemplo "12/10/2026 marcado como feriado". */
  cambio: string | null;
  items: RecalcItem[];
  /** Consumos registrados ese día en este cliente (se conservan). */
  consumoDelDia?: number | null;
  onConfirm: (items: RecalcItem[]) => Promise<void>;
  onClose: () => void;
}

/**
 * Muestra cómo quedarían los contratos ya confirmados después de cambiar un feriado o día excluido.
 * No cambia nada hasta que se confirma. Ninguno viene marcado: hay que elegir cuáles actualizar
 * (un contrato puede haber tenido en cuenta ese feriado al venderse).
 */
export default function ContractRecalcDialog({ cambio, items, consumoDelDia, onConfirm, onClose }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  useEffect(() => { setSelected(new Set()); }, [items]);

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const confirm = async () => {
    setSaving(true);
    try { await onConfirm(items.filter(i => selected.has(i.rec.plan.id))); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={!!cambio && items.length > 0} onOpenChange={open => { if (!open && !saving) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>¿Actualizar el contrato?</DialogTitle>
          <DialogDescription>
            {cambio}. La fecha ya quedó guardada. Marcá los contratos que querés actualizar; los demás quedan como están.
            Si al venderlo ya habías descontado ese día, no lo marques.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {items.map(({ rec, clientName }) => {
            const diff = rec.cantidadDespues - rec.cantidadAntes;
            return (
              <label key={rec.plan.id} className="flex items-start gap-3 rounded-lg border-2 border-border p-3 cursor-pointer">
                <input type="checkbox" className="mt-1 h-5 w-5 accent-[hsl(var(--primary))]" checked={selected.has(rec.plan.id)} onChange={() => toggle(rec.plan.id)} />
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="block font-semibold">{clientName} · {formatDateAR(rec.plan.fechaInicio)} al {formatDateAR(rec.plan.fechaFin)}</span>
                  <span className="grid grid-cols-3 gap-2 text-sm">
                    <Cell label="Días hábiles" antes={String(rec.habilesAntes)} despues={String(rec.habilesDespues)} />
                    <Cell label="Viandas compradas" antes={String(rec.cantidadAntes)} despues={String(rec.cantidadDespues)} />
                    <Cell label="Importe" antes={formatCurrencyAR(rec.totalAntes)} despues={formatCurrencyAR(rec.totalDespues)} />
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {diff < 0 ? `${-diff} vianda(s) menos` : `${diff} vianda(s) más`} a {formatCurrencyAR(rec.plan.precioUnitario)} cada una.
                  </span>
                </span>
              </label>
            );
          })}
          {consumoDelDia !== null && consumoDelDia !== undefined && consumoDelDia > 0 && (
            <p className="text-sm rounded-lg bg-muted px-3 py-2">
              Ese día tiene {consumoDelDia} vianda(s) registradas. Se conservan: marcar un feriado no borra consumos.
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button variant="outline" className="h-12" onClick={onClose} disabled={saving}>Dejar el contrato como está</Button>
          <Button className="h-12" onClick={confirm} disabled={saving || selected.size === 0}>
            {saving ? 'Guardando…' : selected.size > 1 ? `Actualizar ${selected.size} contratos` : 'Actualizar contrato'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Cell({ label, antes, despues }: { label: string; antes: string; despues: string }) {
  return (
    <span className="block rounded-md bg-muted/50 p-1.5">
      <span className="block text-[11px] leading-tight text-muted-foreground">{label}</span>
      <span className="block tabular-nums"><span className="text-muted-foreground line-through">{antes}</span> <strong>{despues}</strong></span>
    </span>
  );
}
