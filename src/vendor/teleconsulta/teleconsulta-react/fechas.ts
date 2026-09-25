/** Wall-clock parts of an instant in a timezone. */
function partesEn(fecha: Date, zona: string): { y: number; m: number; d: number; h: number; min: number; s: number } {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(fecha)) if (x.type !== 'literal') p[x.type] = Number(x.value);
  const n = (k: string): number => p[k] ?? 0;
  return { y: n('year'), m: n('month'), d: n('day'), h: n('hour'), min: n('minute'), s: n('second') };
}

/** Offset (ms) of a timezone at an instant: wall clock minus UTC. */
function desfase(fecha: Date, zona: string): number {
  const p = partesEn(fecha, zona);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(fecha.getTime() / 1000) * 1000;
}

/** Midnight of the day `fecha` falls on, in `zona`, as an instant. */
export function inicioDelDia(fecha: Date, zona: string): Date {
  const p = partesEn(fecha, zona);
  const medianocheComoUtc = Date.UTC(p.y, p.m - 1, p.d);
  return new Date(medianocheComoUtc - desfase(new Date(medianocheComoUtc), zona));
}

/** The same wall-clock day shifted by `dias` (calendar days, DST-safe enough for agendas). */
export function sumarDias(fecha: Date, dias: number, zona: string): Date {
  return inicioDelDia(new Date(inicioDelDia(fecha, zona).getTime() + dias * 86_400_000 + 12 * 3_600_000), zona);
}

/** Whole years between a FHIR `birthDate` and now. */
export function edad(birthDate: string | undefined, ahora: Date = new Date()): number | undefined {
  if (!birthDate) return undefined;
  const [y, m, d] = birthDate.split('-').map(Number);
  if (!y) return undefined;
  let anios = ahora.getFullYear() - y;
  const antesDelCumple = ahora.getMonth() + 1 < (m ?? 1) || (ahora.getMonth() + 1 === (m ?? 1) && ahora.getDate() < (d ?? 1));
  if (antesDelCumple) anios -= 1;
  return anios;
}
