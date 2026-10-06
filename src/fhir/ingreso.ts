// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Cuestionario de ingreso: ¿el paciente ya lo respondió? Cada respuesta es un
// QuestionnaireResponse del paciente con `questionnaire` = la URL canónica del ingreso.
import type { MedplumClient } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { Patient, QuestionnaireResponse } from '@medplum/fhirtypes';
import { INTAKE_QUESTIONNAIRE_URL } from '../pages/intake.questionnaire';

/** La última respuesta completa del paciente al cuestionario de ingreso, si la hay. */
export async function buscarUltimoIngreso(medplum: MedplumClient, patient: Patient): Promise<QuestionnaireResponse | undefined> {
  const respuestas = await medplum.searchResources(
    'QuestionnaireResponse',
    { subject: getReferenceString(patient), _sort: '-authored', _count: '50' },
    { cache: 'no-cache' }
  );
  return respuestas
    .filter((r) => r.questionnaire === INTAKE_QUESTIONNAIRE_URL && r.status === 'completed')
    .sort((a, b) => (b.authored ?? '').localeCompare(a.authored ?? ''))[0];
}
