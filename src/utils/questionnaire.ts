// SPDX-FileCopyrightText: Copyright BioWellness
// SPDX-License-Identifier: Apache-2.0
//
// Normaliza una QuestionnaireResponse antes de guardarla.
// El <input type="time"> que usa QuestionnaireForm emite "HH:mm", pero el tipo FHIR
// `time` exige "HH:mm:ss". Sin los segundos el server rechaza con "Invalid time format"
// (p. ej. la pregunta de hora de acostarse del cuestionario de sueño / PSQI). Acá le
// agregamos los segundos a esas respuestas, recorriendo ítems y subítems.
import type { QuestionnaireResponseItem, QuestionnaireResponseItemAnswer } from '@medplum/fhirtypes';

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

function fixAnswer(answer: QuestionnaireResponseItemAnswer): QuestionnaireResponseItemAnswer {
  let next = answer;
  if (typeof answer.valueTime === 'string' && HH_MM.test(answer.valueTime)) {
    next = { ...next, valueTime: `${answer.valueTime}:00` };
  }
  if (next.item) {
    next = { ...next, item: fixQuestionnaireResponseTimes(next.item) };
  }
  return next;
}

/** Devuelve los ítems con las respuestas de tipo `time` normalizadas a HH:mm:ss. */
export function fixQuestionnaireResponseTimes(
  items: QuestionnaireResponseItem[] | undefined
): QuestionnaireResponseItem[] | undefined {
  if (!items) {
    return items;
  }
  return items.map((item) => {
    let next = item;
    if (item.answer) {
      next = { ...next, answer: item.answer.map(fixAnswer) };
    }
    if (item.item) {
      next = { ...next, item: fixQuestionnaireResponseTimes(item.item) };
    }
    return next;
  });
}
