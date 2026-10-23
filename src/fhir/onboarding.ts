// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Patient Journey — origen del paciente y estado del onboarding.
//
// - `patient-origin` la setea el BACKEND (Recepción o colega al invitar); el portal solo
//   la lee. Ausente = paciente auto-registrado.
// - `onboarding-completed` la escribe el PORTAL cuando el paciente termina la pantalla de
//   Bienvenida/Onboarding (la AccessPolicy le permite escribir su propio Patient). Se guarda
//   sobre el Patient releído (guardarPatient), no sobre el perfil del login: así no se pisan
//   las extensiones que escribe el bot del equipo después de que inició sesión.
import type { MedplumClient } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { guardarPatient } from './guardarPatient';

/** Extensión canónica: origen del paciente (la setea el backend al invitar). */
export const PATIENT_ORIGIN_EXT = 'https://segundaopinionmedica.org/fhir/StructureDefinition/patient-origin';
/** Extensión canónica: fecha en que el paciente completó la Bienvenida/Onboarding. */
export const ONBOARDING_COMPLETED_EXT =
  'https://segundaopinionmedica.org/fhir/StructureDefinition/onboarding-completed';

/** Origen del paciente: auto-registrado, invitado por Recepción o derivado por un colega. */
export type PatientOrigin = 'self' | 'reception' | 'referral';

/** Lee el origen del paciente desde la extensión; sin marcador = auto-registrado. */
export function getPatientOrigin(patient: Patient): PatientOrigin {
  const code = patient.extension?.find((e) => e.url === PATIENT_ORIGIN_EXT)?.valueCode;
  return code === 'reception' || code === 'referral' ? code : 'self';
}

/** ¿Ya completó la Bienvenida/Onboarding? */
export function isOnboardingDone(patient: Patient): boolean {
  return Boolean(patient.extension?.some((e) => e.url === ONBOARDING_COMPLETED_EXT && e.valueDateTime));
}

// El profile de MedplumClient se cachea al iniciar sesión y no expone un setter; este
// flag cubre la sesión actual (tras recargar, el Patient ya viene con la extensión).
let completadoEnEstaSesion = false;

/** El Patient con `onboarding-completed` en `ahora` (reemplaza la que tuviera). Pura. */
export function conOnboardingCompleto(patient: Patient, ahora: Date = new Date()): Patient {
  const rest = patient.extension?.filter((e) => e.url !== ONBOARDING_COMPLETED_EXT) ?? [];
  return {
    ...patient,
    extension: [...rest, { url: ONBOARDING_COMPLETED_EXT, valueDateTime: ahora.toISOString() }],
  };
}

/**
 * Marca el onboarding como completado, en una sola escritura con los cambios de la pantalla
 * (`aplicar`, p. ej. la demografía de la Bienvenida), sobre el Patient releído.
 */
export async function marcarOnboardingCompleto(
  medplum: MedplumClient,
  patientId: string,
  aplicar: (patient: Patient) => Patient = (patient) => patient
): Promise<Patient> {
  const updated = await guardarPatient(medplum, patientId, (leido) => conOnboardingCompleto(aplicar(leido)));
  completadoEnEstaSesion = true;
  return updated;
}

/** ¿Debe ver la pantalla de Bienvenida/Onboarding? (gate del router) */
export function necesitaOnboarding(patient: Patient): boolean {
  return !completadoEnEstaSesion && !isOnboardingDone(patient);
}
