import type { Questionnaire } from '@medplum/fhirtypes';
import {
  MENOPAUSE_QUESTIONNAIRE_ITEMS,
  MENOPAUSE_QUESTIONNAIRE_URL,
} from '../content/menopausia/questionnaire.js';

export interface QuestionnaireContext {
  id?: string;
  now?: string;
}

/** Builds the menopause cardiovascular screening Questionnaire. */
export function buildMenopauseQuestionnaire(ctx: QuestionnaireContext = {}): Questionnaire {
  const questionnaire: Questionnaire = {
    resourceType: 'Questionnaire',
    url: MENOPAUSE_QUESTIONNAIRE_URL,
    name: 'MenopausiaCardiovascular',
    title: 'Cuestionario de salud cardiovascular en menopausia',
    status: 'active',
    subjectType: ['Patient'],
    item: MENOPAUSE_QUESTIONNAIRE_ITEMS,
  };

  if (ctx.id) questionnaire.id = ctx.id;
  if (ctx.now) questionnaire.date = ctx.now;

  return questionnaire;
}
