import type { Appointment } from '@medplum/fhirtypes';
import type { PoliticaTeleconsulta } from './politica.js';
import { horarioDelTurno } from './turno.js';

export type EstadoVentana = 'antes' | 'abierta' | 'terminada';

export interface VentanaDeAcceso {
  /** When the room opens for both participants. */
  abre: Date;
  /** When the room closes (and tokens expire). */
  cierra: Date;
  estado: EstadoVentana;
}

/**
 * The access window of a virtual appointment: from `minutosAntesAcceso` before
 * the start to `minutosDespuesAcceso` after the end. The same rule gates the
 * patient, the professional and the token bot, so the button never promises
 * what the bot will refuse.
 */
export function ventanaDeAcceso(
  turno: Appointment,
  politica: PoliticaTeleconsulta,
  ahora: Date = new Date(),
): VentanaDeAcceso | undefined {
  const horario = horarioDelTurno(turno, politica.duracionMinutos);
  if (!horario) return undefined;
  const abre = new Date(horario.inicio.getTime() - politica.minutosAntesAcceso * 60_000);
  const cierra = new Date(horario.fin.getTime() + politica.minutosDespuesAcceso * 60_000);
  const t = ahora.getTime();
  const estado: EstadoVentana = t < abre.getTime() ? 'antes' : t > cierra.getTime() ? 'terminada' : 'abierta';
  return { abre, cierra, estado };
}
