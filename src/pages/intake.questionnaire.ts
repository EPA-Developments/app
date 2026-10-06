// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Cuestionario de ingreso de Segunda Opinión Médica (enfoque cardiovascular).
// Registra antecedentes, factores de riesgo cardiovascular, medicación, cirugías/
// procedimientos cardíacos y alergias declarados por el paciente. El médico valida y
// firma; este cuestionario solo registra lo declarado.
//
// Nota: los linkId son descriptivos; el mapeo a códigos del modelo FHIR se puede agregar
// más adelante.
//
// v1.1.0 (06/10/2026, decisión de SOM): sin superposiciones.
//  - La hipertensión se pregunta una sola vez, en "Antecedentes médicos" (enfermedad
//    cardiovascular); el detalle lo indaga el profesional. Sale `fr-hipertension`.
//  - El contacto de emergencia se carga en Mi perfil (Patient.contact). Sale
//    `contacto-emergencia`.
//  - La pregunta de embarazo no se muestra a hombres: lo resuelve `ingresoParaPaciente`
//    (src/fhir/ingreso.ts), que depende del paciente y vale también para la copia del server.
import type { Questionnaire } from '@medplum/fhirtypes';

/** URL canónica del cuestionario de ingreso (compartida con la app clínica vía Medplum). */
export const INTAKE_QUESTIONNAIRE_URL = 'https://segundaopinionmedica.org/Questionnaire/intake-clinico';

// Definición local: se usa como fallback si el Questionnaire no está cargado en el server.
// La fuente de verdad es el recurso Questionnaire en Medplum (mismo url canónico).
export const intakeQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  url: INTAKE_QUESTIONNAIRE_URL,
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
