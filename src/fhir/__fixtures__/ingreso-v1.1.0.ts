// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Copia congelada del cuestionario de ingreso v1.1.0 (src/pages/intake.questionnaire.ts en
// 1f4a279), tal como estaba antes del grupo «Salud de la mujer». Con INGRESO_SALUD_MUJER
// apagada, lo que ve la paciente tiene que ser exactamente esto: ingreso.test.ts lo compara.
// No se edita: si cambia el ingreso, se agrega otra copia con la versión nueva.
import type { Questionnaire } from '@medplum/fhirtypes';

export const intakeQuestionnaireV110: Questionnaire = {
  resourceType: 'Questionnaire',
  url: 'https://segundaopinionmedica.org/Questionnaire/intake-clinico',
  version: '1.1.0',
  status: 'active',
  name: 'som-intake-clinico',
  title: 'Cuestionario de ingreso',
  subjectType: ['Patient'],
  item: [
    {
      linkId: 'antecedentes',
      text: 'Antecedentes médicos',
      type: 'group',
      item: [
        {
          linkId: 'antecedentes-cardiovasculares',
          text: '¿Tenés diagnóstico de alguna enfermedad cardiovascular (hipertensión, arritmia, insuficiencia cardíaca, enfermedad coronaria, valvulopatía, etc.)?',
          type: 'boolean',
        },
        {
          linkId: 'antecedentes-cv-detalle',
          text: 'Contanos el detalle de tus antecedentes cardiovasculares',
          type: 'text',
          enableWhen: [{ question: 'antecedentes-cardiovasculares', operator: '=', answerBoolean: true }],
        },
        {
          linkId: 'antecedentes-otros',
          text: '¿Tenés otras enfermedades crónicas relevantes (renal, respiratoria, oncológica, etc.)? Detallá.',
          type: 'text',
        },
      ],
    },
    {
      linkId: 'factores-riesgo',
      text: 'Factores de riesgo cardiovascular',
      type: 'group',
      item: [
        { linkId: 'fr-diabetes', text: '¿Tenés diabetes?', type: 'boolean' },
        { linkId: 'fr-dislipemia', text: '¿Tenés colesterol alto (dislipemia)?', type: 'boolean' },
        {
          linkId: 'fr-tabaquismo',
          text: '¿Fumás?',
          type: 'choice',
          answerOption: [{ valueString: 'Sí' }, { valueString: 'No' }, { valueString: 'Ex fumador/a' }],
        },
        {
          linkId: 'fr-familiares',
          text: '¿Tenés antecedentes familiares de enfermedad cardiovascular (infarto, ACV o muerte súbita en familiares directos)?',
          type: 'boolean',
        },
      ],
    },
    {
      linkId: 'cirugias',
      text: 'Cirugías y procedimientos',
      type: 'group',
      item: [
        {
          linkId: 'cirugias-cardiacas',
          text: '¿Te realizaron alguna cirugía o procedimiento cardiovascular (angioplastia, stent, bypass, cirugía valvular, marcapasos/CDI)?',
          type: 'boolean',
        },
        {
          linkId: 'cirugias-detalle',
          text: 'Detalle de tus cirugías o procedimientos (cuáles y cuándo)',
          type: 'text',
          enableWhen: [{ question: 'cirugias-cardiacas', operator: '=', answerBoolean: true }],
        },
      ],
    },
    {
      linkId: 'medicacion',
      text: 'Medicación',
      type: 'group',
      item: [
        {
          linkId: 'medicacion-toma',
          text: '¿Tomás alguna medicación actualmente? (incluí anticoagulantes, antiagregantes y suplementos)',
          type: 'boolean',
        },
        {
          linkId: 'medicacion-detalle',
          text: 'Detalle de tu medicación y dosis',
          type: 'text',
          enableWhen: [{ question: 'medicacion-toma', operator: '=', answerBoolean: true }],
        },
      ],
    },
    {
      linkId: 'alergias',
      text: 'Alergias',
      type: 'group',
      item: [
        { linkId: 'alergias-tiene', text: '¿Tenés alergias conocidas?', type: 'boolean' },
        {
          linkId: 'alergias-detalle',
          text: 'Detalle de tus alergias',
          type: 'text',
          enableWhen: [{ question: 'alergias-tiene', operator: '=', answerBoolean: true }],
        },
      ],
    },
    {
      linkId: 'general',
      text: 'Otros datos',
      type: 'group',
      item: [
        {
          linkId: 'embarazo',
          text: '¿Estás o podrías estar embarazada?',
          type: 'choice',
          answerOption: [{ valueString: 'Sí' }, { valueString: 'No' }, { valueString: 'No aplica' }],
        },
      ],
    },
    {
      linkId: 'declaracion',
      text: 'Declaro que la información provista es completa y veraz.',
      type: 'boolean',
      required: true,
    },
  ],
};
