import { ZONA_HORARIA_DEFAULT } from './terminologia.js';

function partes(fecha: Date, zona: string): Record<string, string> {
  const formato = new Intl.DateTimeFormat('es-AR', {
    timeZone: zona,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const out: Record<string, string> = {};
  for (const p of formato.formatToParts(fecha)) out[p.type] = p.value;
  return out;
}

/** `02/10/2026` in the given timezone. */
export function formatearFecha(fecha: Date, zona = ZONA_HORARIA_DEFAULT): string {
  const p = partes(fecha, zona);
  return `${p.day}/${p.month}/${p.year}`;
}

/** `18:00` in the given timezone. */
export function formatearHora(fecha: Date, zona = ZONA_HORARIA_DEFAULT): string {
  const p = partes(fecha, zona);
  return `${p.hour}:${p.minute}`;
}

/** `02/10/2026, 18:00` in the given timezone. */
export function formatearFechaHora(fecha: Date, zona = ZONA_HORARIA_DEFAULT): string {
  return `${formatearFecha(fecha, zona)}, ${formatearHora(fecha, zona)}`;
}

/** `desde las 18:45` when it is today, `desde el 16/10/2026 a las 17:45` otherwise. */
export function textoDesde(fecha: Date, ahora: Date, zona = ZONA_HORARIA_DEFAULT): string {
  if (formatearFecha(fecha, zona) === formatearFecha(ahora, zona)) {
    return `desde las ${formatearHora(fecha, zona)}`;
  }
  return `desde el ${formatearFecha(fecha, zona)} a las ${formatearHora(fecha, zona)}`;
}
