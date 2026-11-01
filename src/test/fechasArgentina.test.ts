import { describe, it, expect } from 'vitest';
import { addDaysISO, addMonthsISO, formatTimeAR, formatTimestampDateAR, partsInAR, todayISO, todayLabelAR } from '@/lib/consumo';

// Estas pruebas se corren además con TZ=Asia/Tokyo y TZ=America/Los_Angeles
// para comprobar que el resultado no depende de la zona del dispositivo.
describe('fechas en hora de Argentina', () => {
  it('a las 23:30 de Argentina sigue siendo el mismo día (en UTC ya es el siguiente)', () => {
    const instante = new Date('2026-11-02T02:30:00Z'); // 01/11 23:30 en Argentina
    expect(todayISO(instante)).toBe('2026-11-01');
    expect(todayLabelAR(instante)).toBe('01/11/2026');
    expect(formatTimeAR(instante)).toBe('23:30');
  });

  it('a las 00:10 de Argentina ya es el día siguiente', () => {
    const instante = new Date('2026-11-02T03:10:00Z'); // 02/11 00:10 en Argentina
    expect(todayISO(instante)).toBe('2026-11-02');
    expect(partsInAR(instante)).toEqual({ iso: '2026-11-02', hour: 0, minute: 10 });
  });

  it('fin de mes y fin de año', () => {
    expect(todayISO(new Date('2027-01-01T02:59:00Z'))).toBe('2026-12-31');
    expect(todayISO(new Date('2027-01-01T03:00:00Z'))).toBe('2027-01-01');
  });

  it('fecha de un movimiento guardado con hora UTC', () => {
    expect(formatTimestampDateAR('2026-11-02T01:00:00+00:00')).toBe('01/11/2026');
    expect(formatTimestampDateAR('no es fecha')).toBe('');
  });

  it('suma de días y meses sobre fechas sin hora', () => {
    expect(addDaysISO('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28');
    expect(addMonthsISO('2026-11-02', 1)).toBe('2026-12-02');
    expect(addMonthsISO('2026-12-15', 1)).toBe('2027-01-15');
  });
});
