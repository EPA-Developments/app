// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Fechas con hora que ve la persona: siempre en castellano y en hora de Argentina, no en el
// idioma ni en la zona del navegador. `formatDateTime` de Medplum sigue al navegador, y con uno
// en inglés el turno salía «10/13/2026, 7:30:00 PM».
//
// Las partes se arman a mano (`formatToParts`) y no con el texto que devuelve Intl: según la
// versión de ICU, es-AR pone una coma después del día de la semana o un «p. m.» si falta
// `hour12: false`, y eso no tiene que cambiar lo que lee la persona.
import { TZ } from './agenda';

const FECHA_SOLA = /^\d{4}-\d{2}-\d{2}$/;

const PARTES_CON_HORA = new Intl.DateTimeFormat('es-AR', {
  timeZone: TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

interface Partes {
  semana: string;
  dia: string;
  mes: string;
  anio: string;
  hora: string;
}

/** Las partes de una fecha FHIR en hora de Argentina, o undefined si no se entiende. */
function partesDe(valor: string | undefined): (Partes & { conHora: boolean }) | undefined {
  if (!valor) {
    return undefined;
  }
  const conHora = !FECHA_SOLA.test(valor);
  // Una fecha sin hora es un día de Argentina: al mediodía de allá no se corre de día.
  const ms = Date.parse(conHora ? valor : `${valor}T12:00:00-03:00`);
  if (!Number.isFinite(ms)) {
    return undefined;
  }
  const partes = PARTES_CON_HORA.formatToParts(new Date(ms));
  const parte = (tipo: Intl.DateTimeFormatPartTypes): string => partes.find((p) => p.type === tipo)?.value ?? '';
  // Algunas versiones de ICU dan «24» para la medianoche con hour12: false.
  const hora = parte('hour') === '24' ? '00' : parte('hour');
  return {
    semana: parte('weekday'),
    dia: parte('day'),
    mes: parte('month'),
    anio: parte('year'),
    hora: `${hora}:${parte('minute')}`,
    conHora,
  };
}

/** «13 de octubre de 2026, 19:30» (sin hora si la fecha no la tiene). Vacío si no se entiende. */
export function fechaYHora(valor: string | undefined): string {
  const p = partesDe(valor);
  if (!p) {
    return '';
  }
  const fecha = `${p.dia} de ${p.mes} de ${p.anio}`;
  return p.conHora ? `${fecha}, ${p.hora}` : fecha;
}

/** «martes 13 de octubre de 2026, 19:30»: para un turno, con el día de la semana. */
export function fechaDelTurno(valor: string | undefined): string {
  const p = partesDe(valor);
  if (!p) {
    return '';
  }
  const fecha = `${p.semana} ${p.dia} de ${p.mes} de ${p.anio}`;
  return p.conHora ? `${fecha}, ${p.hora}` : fecha;
}
