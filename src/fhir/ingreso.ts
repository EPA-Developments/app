// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Cuestionario de ingreso: ¿el paciente ya lo respondió? (cada respuesta es un
// QuestionnaireResponse del paciente con `questionnaire` = la URL canónica del ingreso) y
// qué preguntas le corresponden.
import { INGRESO_LINKIDS } from '@epa/careplan-menopausia';
import type { MedplumClient } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { Patient, Questionnaire, QuestionnaireItem, QuestionnaireResponse } from '@medplum/fhirtypes';
import { INGRESO_SALUD_MUJER, INTAKE_QUESTIONNAIRE_URL } from '../pages/intake.questionnaire';

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

/**
 * Preguntas que ya no van en el ingreso (v1.1.0), aunque una copia vieja del Questionnaire
 * en el server todavía las traiga: la hipertensión ya se pregunta en "Antecedentes médicos"
 * (el detalle lo indaga el profesional) y el contacto de emergencia se carga en Mi perfil.
 */
export const PREGUNTAS_RETIRADAS: ReadonlySet<string> = new Set(['fr-hipertension', 'contacto-emergencia']);

/**
 * Preguntas que no se le hacen a un hombre: la de embarazo y el grupo «Salud de la mujer»
 * (etapa menstrual, antecedentes obstétricos y ancestría).
 */
const SOLO_SI_NO_ES_HOMBRE: ReadonlySet<string> = new Set(['embarazo', INGRESO_LINKIDS.grupoSaludMujer]);

export interface OpcionesIngreso {
  /**
   * Si se muestra el grupo «Salud de la mujer». Por defecto, `INGRESO_SALUD_MUJER` (apagado
   * hasta la firma médica). Se pasa explícito sólo en los tests.
   */
  saludMujer?: boolean;
}

function filtrar(items: QuestionnaireItem[] | undefined, quitar: (linkId: string) => boolean): QuestionnaireItem[] | undefined {
  if (!items) {
    return undefined;
  }
  const out: QuestionnaireItem[] = [];
  for (const item of items) {
    if (quitar(item.linkId)) {
      continue;
    }
    const hijos = filtrar(item.item, quitar);
    // Un grupo que se quedó sin preguntas no se muestra.
    if (item.type === 'group' && item.item?.length && !hijos?.length) {
      continue;
    }
    out.push(hijos ? { ...item, item: hijos } : item);
  }
  return out;
}

/**
 * El cuestionario de ingreso que ve este paciente: sin las preguntas retiradas; si es
 * hombre (`Patient.gender = male`), sin la de embarazo ni el grupo «Salud de la mujer»; y,
 * mientras `INGRESO_SALUD_MUJER` esté apagada, sin ese grupo para nadie (aunque la copia
 * del server lo traiga). Con sexo sin cargar, otro o desconocido, se mantienen.
 */
export function ingresoParaPaciente(
  questionnaire: Questionnaire,
  patient: Patient,
  { saludMujer = INGRESO_SALUD_MUJER }: OpcionesIngreso = {}
): Questionnaire {
  const esHombre = patient.gender === 'male';
  return {
    ...questionnaire,
    item: filtrar(
      questionnaire.item,
      (linkId) =>
        PREGUNTAS_RETIRADAS.has(linkId) ||
        (esHombre && SOLO_SI_NO_ES_HOMBRE.has(linkId)) ||
        (!saludMujer && linkId === INGRESO_LINKIDS.grupoSaludMujer)
    ),
  };
}
