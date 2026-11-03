import { useEffect, useState } from 'react';
import { Minus, Plus, AlertTriangle, RotateCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { capFirst, parseISODate } from '@/lib/consumo';
import type { Consumption } from '@/types';

export interface CellEditorProps {
  clientName: string;
  fecha: string;
  rows: Consumption[];
  /** Total guardado del día (null = sin registro). */
  savedTotal: number | null;
  /** Valor que se está guardando o que falló. */
  pending?: { cantidad: number | null; status: 'saving' | 'saved' | 'error'; error?: string };
  habitual: number;
  /** Saldo disponible del contrato con lo que hay guardado hoy. */
  disponible: number | null;
  feriado: boolean;
  excluida: boolean;
  onSave: (cantidad: number | null, notas?: string | null, notaCliente?: string | null) => void;
  onRetry: () => void;
  onClose: () => void;
  /** Avisa si hay un cambio sin guardar (para no cerrar el editor y perderlo). */
  onDirtyChange?: (dirty: boolean) => void;
  /** Se intentó cerrar con un cambio sin guardar: mostrar el aviso. */
  avisoSinGuardar?: boolean;
  /** Contrato al que se imputa la fecha (se muestra si está cerrado). */
  contrato?: { desde: string; hasta: string; cerrado: boolean };
}

export default function ConsumptionCellEditor({
  clientName, fecha, rows, savedTotal, pending, habitual, disponible, feriado, excluida, onSave, onRetry, onClose,
  onDirtyChange, avisoSinGuardar = false, contrato,
}: CellEditorProps) {
  const currentNotes = Array.from(new Set(rows.map(r => r.notas?.trim()).filter(Boolean))).join(' | ');
  const currentClientNote = Array.from(new Set(rows.map(r => r.notaCliente?.trim()).filter(Boolean))).join(' | ');
  const shown = pending && pending.status !== 'saved' ? pending.cantidad : savedTotal;
  const inicial = shown ?? habitual;
  const [value, setValue] = useState<number>(inicial);
  const [notes, setNotes] = useState(currentNotes);
  const [showNotes, setShowNotes] = useState(!!currentNotes);
  const [clientNote, setClientNote] = useState(currentClientNote);
  const [showClientNote, setShowClientNote] = useState(!!currentClientNote);

  useEffect(() => {
    setValue(shown ?? habitual);
    setNotes(currentNotes);
    setShowNotes(!!currentNotes);
    setClientNote(currentClientNote);
    setShowClientNote(!!currentClientNote);
    // Solo al abrir otra casilla
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha, clientName]);

  const notesDirty = notes.trim() !== currentNotes;
  const notasArg = notesDirty ? notes.trim() || null : undefined;
  const clientNoteDirty = clientNote.trim() !== currentClientNote;
  const notaClienteArg = clientNoteDirty ? clientNote.trim() || null : undefined;
  // Cambio sin guardar: otro número (o, sin registro, cualquier número distinto del habitual sugerido) o notas editadas
  const dirty = value !== inicial || notesDirty || clientNoteDirty;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const quick = Array.from({ length: Math.max(5, habitual + 2) }, (_, i) => i);
  const saldoCon = (n: number) => (disponible === null ? null : disponible - (n - (savedTotal ?? 0)));

  const choose = (n: number) => { onDirtyChange?.(false); onSave(n, notasArg, notaClienteArg); onClose(); };

  const fechaLarga = capFirst(parseISODate(fecha).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }));
  const saldoElegido = saldoCon(value);

  return (
    <div className="space-y-3">
      <div>
        <p className="font-semibold text-sm leading-tight">{clientName}</p>
        <p className="text-xs text-muted-foreground">{fechaLarga}</p>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {feriado && <span className="text-[11px] rounded-full bg-amber-500/15 text-amber-800 px-2 py-0.5">Feriado</span>}
          {excluida && <span className="text-[11px] rounded-full bg-amber-500/15 text-amber-800 px-2 py-0.5">Fecha excluida del cliente</span>}
          <span className="text-[11px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
            {savedTotal === null ? 'Sin registro' : savedTotal === 0 ? 'Registrado: sin consumo' : `Registrado: ${savedTotal}`}
          </span>
        </div>
      </div>

      {contrato?.cerrado && (
        <p className="text-xs rounded border border-border bg-muted/50 px-2 py-1.5" data-testid="editor-contrato-cerrado">
          Fecha del contrato {contrato.desde} al {contrato.hasta} (cerrado). La corrección se imputa a ese contrato y queda registrada.
        </p>
      )}

      {avisoSinGuardar && dirty && (
        <div className="text-xs rounded border-2 border-warning bg-warning/15 px-2 py-1.5 space-y-1.5" role="alert" data-testid="aviso-sin-guardar">
          <p className="font-semibold">Hay un cambio sin guardar ({value}).</p>
          <div className="flex gap-2">
            <Button size="sm" className="h-9" onClick={() => choose(value)}>Guardar {value}</Button>
            <Button size="sm" variant="outline" className="h-9" onClick={() => { onDirtyChange?.(false); onClose(); }}>Descartar</Button>
          </div>
        </div>
      )}

      {rows.length > 1 && (
        <p className="text-xs rounded bg-amber-500/10 text-amber-800 px-2 py-1.5">
          Este día tiene {rows.length} registros (total {savedTotal}). Al guardar quedan unificados en uno con el total que elijas.
        </p>
      )}

      {pending?.status === 'error' && (
        <div className="text-xs rounded bg-destructive/10 text-destructive px-2 py-1.5 flex items-center justify-between gap-2">
          <span>No se guardó {pending.cantidad === null ? 'el borrado' : `“${pending.cantidad}”`}. {pending.error}</span>
          <Button size="sm" variant="outline" className="h-7 shrink-0" onClick={onRetry}><RotateCw className="w-3 h-3 mr-1" />Reintentar</Button>
        </div>
      )}

      <div className="grid grid-cols-5 gap-1.5">
        {quick.map(n => {
          const s = saldoCon(n);
          const excede = s !== null && s < 0 && n > (savedTotal ?? 0);
          const active = shown === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => choose(n)}
              className={`relative h-12 rounded-lg border text-base font-semibold tabular-nums transition-colors
                ${active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted border-border'}
                ${excede && !active ? 'border-amber-500' : ''}`}
              title={n === 0 ? 'Sin consumo' : `${n} vianda${n > 1 ? 's' : ''}`}
            >
              {n}
              {n === habitual && <span className={`absolute bottom-0.5 inset-x-0 text-[9px] font-normal ${active ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>habitual</span>}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground -mt-1">0 = sin consumo. La cantidad habitual es solo una referencia.</p>

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={() => setValue(v => Math.max(v - 1, 0))} aria-label="Restar">
          <Minus className="w-4 h-4" />
        </Button>
        <input
          type="number" inputMode="numeric" min={0} step={1}
          value={value}
          onChange={e => setValue(Math.max(Math.floor(Number(e.target.value) || 0), 0))}
          onKeyDown={e => { if (e.key === 'Enter') choose(value); }}
          className="h-11 w-full min-w-0 rounded-md border border-input bg-background text-center text-lg font-semibold tabular-nums"
          aria-label="Cantidad de viandas"
        />
        <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={() => setValue(v => v + 1)} aria-label="Sumar">
          <Plus className="w-4 h-4" />
        </Button>
        <Button type="button" className="h-11 shrink-0" onClick={() => choose(value)}>Guardar</Button>
      </div>

      {disponible !== null && (
        <p className={`text-xs flex items-center gap-1 ${saldoElegido !== null && saldoElegido < 0 ? 'text-amber-700' : 'text-muted-foreground'}`}>
          {saldoElegido !== null && saldoElegido < 0 && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
          Saldo del contrato con {value}: <strong>{saldoElegido}</strong>
          {saldoElegido !== null && saldoElegido < 0 && ' (supera lo comprado; no se modifica el contrato)'}
        </p>
      )}

      {showNotes ? (
        <div>
          <p className="text-[11px] font-medium text-muted-foreground mb-0.5">Nota interna (no la ve el cliente)</p>
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Nota opcional (ej: retiró un familiar)"
            className="text-sm min-h-[56px]"
            aria-label="Nota interna"
          />
        </div>
      ) : (
        <button type="button" className="text-xs text-primary underline-offset-2 hover:underline mr-4" onClick={() => setShowNotes(true)}>
          Agregar nota interna
        </button>
      )}
      {showClientNote ? (
        <div>
          <p className="text-[11px] font-medium text-muted-foreground mb-0.5">Nota para el cliente (la ve en su calendario)</p>
          <Textarea
            value={clientNote}
            onChange={e => setClientNote(e.target.value)}
            placeholder="Ej: se corrigió el registro de este día"
            className="text-sm min-h-[56px]"
            aria-label="Nota para el cliente"
          />
        </div>
      ) : (
        <button type="button" className="text-xs text-primary underline-offset-2 hover:underline" onClick={() => setShowClientNote(true)}>
          Agregar nota para el cliente
        </button>
      )}
      {(notesDirty || clientNoteDirty) && <p className="text-[11px] text-muted-foreground">Las notas se guardan al elegir la cantidad o tocar Guardar.</p>}

      {savedTotal !== null && (
        <div className="pt-2 border-t border-border">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
            onClick={() => {
              if ((currentNotes || currentClientNote) && !window.confirm('Este día tiene notas. ¿Quitar el registro y sus notas?')) return;
              onDirtyChange?.(false);
              onSave(null);
              onClose();
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />Quitar registro (dejar el día sin registrar)
          </button>
        </div>
      )}
    </div>
  );
}
