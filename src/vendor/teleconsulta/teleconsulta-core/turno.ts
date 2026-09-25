import type { Appointment, Reference } from '@medplum/fhirtypes';
import { TC } from './terminologia.js';

export type RolTeleconsulta = 'paciente' | 'profesional';

/** True when the Appointment's native appointmentType says `virtual`. */
export function esTurnoVirtual(turno: Appointment): boolean {
  return (turno.appointmentType?.coding ?? []).some((c) => c.system === TC.modalidad && c.code === 'virtual');
}

/** The Jitsi room of the appointment (`tc-<uuid>`), if it has one. */
export function salaDelTurno(turno: Appointment): string | undefined {
  return turno.extension?.find((e) => e.url === TC.extSala)?.valueString;
}

/** Moves already used on this appointment. */
export function movimientosUsados(turno: Appointment): number {
  return turno.extension?.find((e) => e.url === TC.extMovimientos)?.valueInteger ?? 0;
}

/** Mercado Pago payment id that confirmed the appointment, if paid online. */
export function pagoDelTurno(turno: Appointment): string | undefined {
  return turno.identifier?.find((i) => i.system === TC.pagoMercadoPago)?.value;
}

function actorPorTipo(turno: Appointment, tipo: string): Reference | undefined {
  return turno.participant?.find((p) => p.actor?.reference?.startsWith(`${tipo}/`))?.actor;
}

export function referenciaPaciente(turno: Appointment): Reference | undefined {
  return actorPorTipo(turno, 'Patient');
}

export function referenciaProfesional(turno: Appointment): Reference | undefined {
  return actorPorTipo(turno, 'Practitioner');
}

export function referenciaServicio(turno: Appointment): Reference | undefined {
  return actorPorTipo(turno, 'HealthcareService');
}

/**
 * Role of an authenticated caller on this appointment, or undefined when the
 * caller is not a participant. Identity MUST come from the authenticated
 * requester (bot `event.requester`), never from client input.
 */
export function rolEnElTurno(turno: Appointment, requester: string | undefined): RolTeleconsulta | undefined {
  if (!requester) return undefined;
  const esParticipante = (turno.participant ?? []).some((p) => p.actor?.reference === requester);
  if (!esParticipante) return undefined;
  if (requester.startsWith('Patient/')) return 'paciente';
  if (requester.startsWith('Practitioner/')) return 'profesional';
  return undefined;
}

/** Patient-facing title: "Teleconsulta — Dr. ..." from serviceType or description. */
export function tituloDelTurno(turno: Appointment): string {
  const tipo = turno.serviceType?.[0];
  return tipo?.text ?? tipo?.coding?.[0]?.display ?? turno.description ?? 'Teleconsulta';
}

/** Start and end as Dates, using `duracionMinutos` when the end is missing. */
export function horarioDelTurno(
  turno: Appointment,
  duracionMinutos: number,
): { inicio: Date; fin: Date } | undefined {
  if (!turno.start) return undefined;
  const inicio = new Date(turno.start);
  if (Number.isNaN(inicio.getTime())) return undefined;
  const fin = turno.end ? new Date(turno.end) : new Date(inicio.getTime() + duracionMinutos * 60_000);
  return { inicio, fin: Number.isNaN(fin.getTime()) ? new Date(inicio.getTime() + duracionMinutos * 60_000) : fin };
}
