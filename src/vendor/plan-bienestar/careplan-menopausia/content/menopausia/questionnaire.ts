import type { QuestionnaireItem } from '@medplum/fhirtypes';
import { LOINC } from '../../terminology/loinc.js';
import { SYSTEM } from '../../terminology/systems.js';

/** Stable canonical URL for the menopause CV screening questionnaire. */
export const MENOPAUSE_QUESTIONNAIRE_URL =
  'https://epa-bienestar.ar/fhir/Questionnaire/menopausia-cardiovascular';

function option(code: string, display: string) {
  return { valueCoding: { system: SYSTEM.epa, code, display } };
}

/**
 * Items for the menopause cardiovascular screening questionnaire (Spanish).
 * Groups: etapa y sintomas, antecedentes, habitos y mediciones. Includes the
 * female-specific CV risk enhancers (preeclampsia, diabetes gestacional,
 * menopausia precoz) highlighted by the AHA.
 */
export const MENOPAUSE_QUESTIONNAIRE_ITEMS: QuestionnaireItem[] = [
  {
    linkId: 'etapa-sintomas',
    text: 'Etapa y sintomas',
    type: 'group',
    item: [
      {
        linkId: 'etapa',
        text: 'En que etapa de la menopausia te encontras?',
        type: 'choice',
        answerOption: [
          option('perimenopausia', 'Perimenopausia'),
          option('posmenopausia', 'Posmenopausia'),
          option('menopausia-prematura', 'Menopausia prematura'),
          option('menopausia-quirurgica', 'Menopausia quirurgica'),
        ],
      },
      {
        linkId: 'edad-ultima-menstruacion',
        text: 'A que edad tuviste tu ultima menstruacion? (si aplica)',
        type: 'integer',
      },
      {
        linkId: 'sintomas-vasomotores',
        text: 'Con que intensidad tenes sofocos o sudoraciones (sintomas vasomotores)?',
        type: 'choice',
        answerOption: [
          option('ninguno', 'Ninguno'),
          option('leves', 'Leves'),
          option('moderados', 'Moderados'),
          option('severos', 'Severos'),
        ],
      },
      {
        linkId: 'terapia-hormonal',
        text: 'Usas actualmente terapia hormonal de la menopausia?',
        type: 'boolean',
      },
    ],
  },
  {
    linkId: 'antecedentes',
    text: 'Antecedentes',
    type: 'group',
    item: [
      { linkId: 'antecedente-hta', text: 'Te diagnosticaron hipertension arterial?', type: 'boolean' },
      { linkId: 'antecedente-diabetes', text: 'Te diagnosticaron diabetes?', type: 'boolean' },
      { linkId: 'antecedente-dislipidemia', text: 'Te diagnosticaron colesterol o trigliceridos altos?', type: 'boolean' },
      {
        linkId: 'tabaquismo',
        text: 'Cual es tu situacion respecto del tabaco?',
        type: 'choice',
        code: [LOINC.smokingStatus],
        answerOption: [
          option('nunca-fumo', 'Nunca fumo'),
          option('fumador-actual', 'Fumador/a actual'),
          option('ex-fumador', 'Ex fumador/a'),
        ],
      },
      { linkId: 'antecedente-familiar-cv', text: 'Tenes antecedentes familiares de enfermedad cardiovascular temprana?', type: 'boolean' },
      { linkId: 'preeclampsia', text: 'Tuviste preeclampsia o hipertension durante el embarazo?', type: 'boolean' },
      { linkId: 'diabetes-gestacional', text: 'Tuviste diabetes gestacional?', type: 'boolean' },
      { linkId: 'menopausia-precoz', text: 'Tu menopausia ocurrio antes de los 45 anos?', type: 'boolean' },
    ],
  },
  {
    linkId: 'habitos-mediciones',
    text: 'Habitos y mediciones',
    type: 'group',
    item: [
      { linkId: 'actividad-fisica-min', text: 'Cuantos minutos de actividad fisica moderada haces por semana?', type: 'integer' },
      { linkId: 'sueno-horas', text: 'Cuantas horas dormis por noche habitualmente?', type: 'decimal' },
      { linkId: 'cintura-cm', text: 'Circunferencia de cintura (cm), si la conoces', type: 'decimal', code: [LOINC.waistCircumference] },
      { linkId: 'pas', text: 'Presion arterial sistolica (maxima), si la conoces', type: 'integer', code: [LOINC.systolicBloodPressure] },
      { linkId: 'pad', text: 'Presion arterial diastolica (minima), si la conoces', type: 'integer', code: [LOINC.diastolicBloodPressure] },
    ],
  },
];
