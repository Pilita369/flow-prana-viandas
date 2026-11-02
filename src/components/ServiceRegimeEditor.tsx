import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { tramosValidos } from '@/lib/habiles';
import type { Intervalo, Regimen } from '@/types';

export interface RegimenValor {
  regimen: Regimen;
  intervalos: Intervalo[];
}

const OPCIONES: { value: Regimen; label: string; detalle: string }[] = [
  { value: 'periodo', label: 'Mes completo', detalle: 'Todos los días de atención entre inicio y fin' },
  { value: 'intervalos', label: 'Intervalos', detalle: 'Uno o varios tramos de fechas' },
  { value: 'manual', label: 'Cantidad manual', detalle: 'Indicás el total de viandas' },
];

/** Tramos que se superponen entre sí (las fechas comunes se cuentan una sola vez). */
export function haySuperposicion(intervalos: Intervalo[]): boolean {
  const t = tramosValidos(intervalos);
  return t.some((a, i) => i > 0 && a.desde <= t[i - 1].hasta);
}

/**
 * Elección del régimen de servicio: mes completo, intervalos (agregar / quitar tramos) o cantidad manual.
 * Solo edita la propuesta; quien la usa decide cuándo guardar.
 */
export default function ServiceRegimeEditor({ value, onChange, inicioSugerido, finSugerido, idPrefix = 'reg' }: {
  value: RegimenValor;
  onChange: (v: RegimenValor) => void;
  inicioSugerido: string;
  finSugerido: string;
  idPrefix?: string;
}) {
  const setIntervalo = (i: number, campo: keyof Intervalo, v: string) =>
    onChange({ ...value, intervalos: value.intervalos.map((t, j) => (j === i ? { ...t, [campo]: v } : t)) });
  const agregar = () => {
    const ultimo = value.intervalos[value.intervalos.length - 1];
    onChange({ ...value, intervalos: [...value.intervalos, { desde: ultimo?.hasta || inicioSugerido, hasta: finSugerido }] });
  };
  const quitar = (i: number) => onChange({ ...value, intervalos: value.intervalos.filter((_, j) => j !== i) });
  const elegir = (r: Regimen) => onChange({
    regimen: r,
    intervalos: r === 'intervalos' && value.intervalos.length === 0 ? [{ desde: inicioSugerido, hasta: finSugerido }] : value.intervalos,
  });
  const invalidos = value.intervalos.filter(t => !t.desde || !t.hasta || t.desde > t.hasta).length;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1.5 rounded-xl border-2 border-border p-1.5" role="radiogroup" aria-label="Régimen de servicio">
        {OPCIONES.map(o => {
          const on = value.regimen === o.value;
          return (
            <button key={o.value} type="button" role="radio" aria-checked={on} title={o.detalle} onClick={() => elegir(o.value)}
              className={`min-h-[3rem] rounded-lg px-1.5 text-sm font-medium leading-tight ${on ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
              {o.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{OPCIONES.find(o => o.value === value.regimen)?.detalle}</p>

      {value.regimen === 'intervalos' && (
        <div className="space-y-2" data-testid={`${idPrefix}-intervalos`}>
          {value.intervalos.map((t, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <div>
                <label htmlFor={`${idPrefix}-desde-${i}`} className="text-xs text-muted-foreground">Desde (tramo {i + 1})</label>
                <Input id={`${idPrefix}-desde-${i}`} type="date" className="h-11" value={t.desde} onChange={e => setIntervalo(i, 'desde', e.target.value)} />
              </div>
              <div>
                <label htmlFor={`${idPrefix}-hasta-${i}`} className="text-xs text-muted-foreground">Hasta (inclusive)</label>
                <Input id={`${idPrefix}-hasta-${i}`} type="date" className="h-11" value={t.hasta} onChange={e => setIntervalo(i, 'hasta', e.target.value)} />
              </div>
              <Button type="button" variant="outline" size="icon" className="h-11 w-11" onClick={() => quitar(i)} aria-label={`Quitar tramo ${i + 1}`} disabled={value.intervalos.length <= 1}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" className="h-11 w-full" onClick={agregar}><Plus className="w-4 h-4 mr-1.5" />Agregar intervalo</Button>
          {invalidos > 0 && <p className="text-sm text-destructive">Hay {invalidos} tramo(s) con fechas incompletas o invertidas: no se cuentan.</p>}
          {haySuperposicion(value.intervalos) && <p className="text-sm">Hay tramos que se superponen: las fechas en común se cuentan una sola vez.</p>}
        </div>
      )}
    </div>
  );
}
