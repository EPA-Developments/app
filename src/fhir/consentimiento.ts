// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Consentimiento informado del servicio: el paciente lo firma como DocumentReference
// (LOINC 59284-0 "Patient Consent") en su compartimento, con la versión del texto que
// firmó. Es el paso 2 del Plan Bienestar y requisito para enviar estudios en PDF y para
// pedir una Segunda Opinión: el portal lo exige antes de enviar datos clínicos, y los bots
// (`som-solicitar`, `som-procesar-laboratorio`) lo vuelven a verificar del lado del servidor.
import type { MedplumClient } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { DocumentReference, Patient } from '@medplum/fhirtypes';

export const CONSENT_TYPE_SYSTEM = 'http://loinc.org';
export const CONSENT_TYPE_CODE = '59284-0';

/** Último consentimiento vigente del paciente, o undefined si nunca firmó. */
export async function buscarConsentimiento(
  medplum: MedplumClient,
  patient: Patient
): Promise<DocumentReference | undefined> {
  const tipo = `${CONSENT_TYPE_SYSTEM}|${CONSENT_TYPE_CODE}`;
  return medplum.searchOne(
    'DocumentReference',
    `subject=${getReferenceString(patient)}&type=${tipo}&status=current&_sort=-date`,
    { cache: 'no-cache' }
  );
}

/** Versión del texto que firmó la persona (`DocumentReference.identifier`). */
export const CONSENT_VERSION_SYSTEM = 'https://segundaopinionmedica.org/fhir/Identifier/consentimiento-version';

/** La versión firmada; undefined en los firmados antes de versionar el texto. */
export function versionFirmada(doc: DocumentReference): string | undefined {
  return doc.identifier?.find((i) => i.system === CONSENT_VERSION_SYSTEM)?.value;
}

/** ¿El consentimiento firmado es el del texto vigente? */
export function consentimientoAlDia(doc: DocumentReference | undefined, vigente: string): boolean {
  return Boolean(doc && versionFirmada(doc) === vigente);
}
