import type { Identifier } from '@medplum/fhirtypes';

/**
 * Canonical base for every EPA-owned code system, extension and identifier
 * used by the teleconsulta module. Nothing here belongs to a third party.
 */
export const EPA_FHIR_BASE = 'https://epa-bienestar.ar/fhir';

export const TC = {
  /** Care modality of an Appointment: `presencial` | `virtual`. */
  modalidad: `${EPA_FHIR_BASE}/CodeSystem/modalidad-atencion`,
  /** Appointment extension (valueString `tc-<uuid>`): the Jitsi room. */
  extSala: `${EPA_FHIR_BASE}/StructureDefinition/teleconsulta-sala`,
  /** Appointment extension (valueInteger): moves already used. */
  extMovimientos: `${EPA_FHIR_BASE}/StructureDefinition/teleconsulta-movimientos`,
  /** HealthcareService complex extension: the move/cancel/access/price policy. */
  extPolitica: `${EPA_FHIR_BASE}/StructureDefinition/teleconsulta-politica`,
  /** Appointment identifier: the Mercado Pago payment that confirmed it. */
  pagoMercadoPago: `${EPA_FHIR_BASE}/Identifier/mercadopago-pago`,
  /** Appointment identifier: the Mercado Pago refund issued on cancellation. */
  reintegroMercadoPago: `${EPA_FHIR_BASE}/Identifier/mercadopago-reintegro`,
  /** HealthcareService identifier: business code of the service. */
  servicio: `${EPA_FHIR_BASE}/CodeSystem/servicio`,
  /** Practitioner identifier: business code of the professional. */
  medico: `${EPA_FHIR_BASE}/CodeSystem/medico`,
  /** DocumentReference category (e.g. `informe-consulta`). */
  documento: `${EPA_FHIR_BASE}/CodeSystem/documento-paciente`,
  /** Task code for notices to the care team (e.g. `agendar-control`). */
  taskTipo: `${EPA_FHIR_BASE}/CodeSystem/task-tipo`,
  /** Task business identifier (idempotency keys). */
  identificadorTask: `${EPA_FHIR_BASE}/Identifier/task`,
  /** Bot identifier: apps call bots by this, never by server id. */
  bot: `${EPA_FHIR_BASE}/CodeSystem/bot`,
  /** HL7 v3 ActCode (Encounter.class `VR` = virtual). */
  v3ActCode: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
  /** HL7 appointment cancellation reasons (`pat` = patient). */
  motivoCancelacion: 'http://terminology.hl7.org/CodeSystem/appointment-cancellation-reason',
} as const;

/** Business names of the teleconsulta bots (Bot.identifier value). */
export const BOTS = {
  token: 'epa-teleconsulta-token',
  presencia: 'epa-teleconsulta-presencia',
  cerrar: 'epa-teleconsulta-cerrar',
  mover: 'epa-teleconsulta-mover',
  cancelar: 'epa-teleconsulta-cancelar',
  pago: 'epa-teleconsulta-pago',
  webhookMercadoPago: 'epa-teleconsulta-webhook-mp',
} as const;

export type NombreBot = (typeof BOTS)[keyof typeof BOTS];

/** The Identifier apps pass to `medplum.executeBot()` to reach a bot. */
export function identificadorBot(nombre: NombreBot): Identifier {
  return { system: TC.bot, value: nombre };
}

/** Default timezone for patient-facing dates (bots run in UTC). */
export const ZONA_HORARIA_DEFAULT = 'America/Argentina/Buenos_Aires';
