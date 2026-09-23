// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Consentimiento informado del servicio: el paciente lo firma como DocumentReference
// (LOINC 59284-0 "Patient Consent") en su compartimento. Es requisito para pedir una
// Segunda Opinión: el portal lo exige antes de enviar datos clínicos, y el bot
// `som-solicitar` debe volver a verificarlo del lado del servidor.
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
