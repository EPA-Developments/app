import type {
  Appointment,
  Encounter,
  HealthcareService,
  Patient,
  Practitioner,
  Reference,
  Slot,
} from '@medplum/fhirtypes';
import { extensionPolitica, type PoliticaTeleconsulta } from './politica.js';
import { TC } from './terminologia.js';
import { referenciaPaciente } from './turno.js';

/** A fresh Jitsi room name: `tc-<uuid>` (unguessable, one per appointment). */
export function nuevaSala(uuid?: string): string {
  const id = uuid ?? (globalThis as { crypto?: Crypto }).crypto?.randomUUID?.();
  if (!id) throw new Error('No hay generador de UUID disponible para crear la sala.');
  return `tc-${id}`;
}

export interface TurnoVirtualContext {
  paciente: Reference<Patient>;
  profesional: Reference<Practitioner>;
  /** The HealthcareService whose policy (price, moves, refund) applies. */
  servicio?: Reference<HealthcareService>;
  /** Patient-facing title, e.g. "Teleconsulta — Dr. Pérez". */
  titulo: string;
  /** ISO dateTime. */
  inicio: string;
  /** ISO dateTime. */
  fin: string;
  /** `pending` while awaiting online payment; `booked` once confirmed. */
  estado?: 'pending' | 'booked';
  sala?: string;
  slot?: Reference<Slot>;
}

/** Builds a virtual Appointment: appointmentType `virtual`, room extension, participants. */
export function buildTurnoVirtual(ctx: TurnoVirtualContext): Appointment {
  const participant: Appointment['participant'] = [
    { actor: ctx.paciente, status: 'accepted', required: 'required' },
    { actor: ctx.profesional, status: 'accepted', required: 'required' },
  ];
  if (ctx.servicio) participant.push({ actor: ctx.servicio, status: 'accepted', required: 'information-only' });

  const turno: Appointment = {
    resourceType: 'Appointment',
    status: ctx.estado ?? 'pending',
    appointmentType: {
      coding: [{ system: TC.modalidad, code: 'virtual', display: 'Virtual' }],
      text: 'Videollamada',
    },
    serviceType: [{ text: ctx.titulo }],
    start: ctx.inicio,
    end: ctx.fin,
    participant,
    extension: [
      { url: TC.extSala, valueString: ctx.sala ?? nuevaSala() },
      { url: TC.extMovimientos, valueInteger: 0 },
    ],
  };
  if (ctx.slot) turno.slot = [ctx.slot];
  return turno;
}

export interface ServicioTeleconsultaContext {
  /** Display name, e.g. "Teleconsulta — Dr. Pérez". */
  nombre: string;
  /** Business code, e.g. `TELECONSULTA_MED_PEREZ`. */
  codigo: string;
  politica?: Partial<PoliticaTeleconsulta>;
}

/** Builds the HealthcareService that carries the price and move/cancel policy. */
export function buildServicioTeleconsulta(ctx: ServicioTeleconsultaContext): HealthcareService {
  return {
    resourceType: 'HealthcareService',
    active: true,
    identifier: [{ system: TC.servicio, value: ctx.codigo }],
    name: ctx.nombre,
    type: [{ coding: [{ system: TC.modalidad, code: 'virtual', display: 'Virtual' }] }],
    extension: [extensionPolitica(ctx.politica ?? {})],
  };
}

/** Builds the virtual Encounter (class `VR`) opened when the patient joins. */
export function buildEncounterVirtual(turno: Appointment & { id: string }, inicio: string): Encounter {
  const paciente = referenciaPaciente(turno);
  const encounter: Encounter = {
    resourceType: 'Encounter',
    status: 'in-progress',
    class: { system: TC.v3ActCode, code: 'VR', display: 'virtual' },
    appointment: [{ reference: `Appointment/${turno.id}` }],
    period: { start: inicio },
  };
  if (paciente) encounter.subject = paciente as Reference<Patient>;
  if (turno.serviceType?.[0]) encounter.serviceType = turno.serviceType[0];
  return encounter;
}
