import type { Appointment } from '@medplum/fhirtypes';
import type { RolTeleconsulta } from './turno.js';

export type EstadoTurno = NonNullable<Appointment['status']>;

/** Statuses that let a participant into the room. */
export const ESTADOS_CON_ACCESO: readonly EstadoTurno[] = ['booked', 'arrived', 'checked-in'];

/** Patient-facing label and color of each Appointment status. */
export const ETIQUETA_ESTADO: Record<EstadoTurno, { texto: string; color: string }> = {
  proposed: { texto: 'Propuesto', color: 'gray' },
  pending: { texto: 'Pendiente de pago', color: 'yellow' },
  booked: { texto: 'Confirmado', color: 'teal' },
  arrived: { texto: 'En sala de espera', color: 'blue' },
  'checked-in': { texto: 'En curso', color: 'blue' },
  fulfilled: { texto: 'Finalizado', color: 'gray' },
  cancelled: { texto: 'Cancelado', color: 'red' },
  noshow: { texto: 'Ausente', color: 'red' },
  'entered-in-error': { texto: 'Anulado', color: 'gray' },
  waitlist: { texto: 'En lista de espera', color: 'yellow' },
};

export function etiquetaEstado(estado: EstadoTurno | undefined): { texto: string; color: string } {
  return (estado && ETIQUETA_ESTADO[estado]) || { texto: 'Sin estado', color: 'gray' };
}

/**
 * Next status when a participant joins the room (`videoConferenceJoined`):
 * the patient moves `booked` to `arrived` (waiting); the professional moves
 * `booked`/`arrived` to `checked-in` (consultation in progress). Returns the
 * same status when there is nothing to change.
 */
export function estadoAlEntrar(estado: EstadoTurno, rol: RolTeleconsulta): EstadoTurno {
  if (rol === 'paciente') {
    return estado === 'booked' ? 'arrived' : estado;
  }
  return estado === 'booked' || estado === 'arrived' ? 'checked-in' : estado;
}

/** True when the appointment is over for good (no more actions). */
export function esEstadoFinal(estado: EstadoTurno | undefined): boolean {
  return estado === 'fulfilled' || estado === 'cancelled' || estado === 'noshow' || estado === 'entered-in-error';
}
