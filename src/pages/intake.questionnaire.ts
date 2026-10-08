// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Cuestionario de ingreso de SOM (enfoque cardiovascular).
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
//
// v1.2.0: grupo «Salud de la mujer» (etapa menstrual, edad de la última menstruación,
// antecedentes obstétricos y ancestría), APAGADO detrás de INGRESO_SALUD_MUJER hasta que lo
// firmen los médicos (docs/plan-bienestar-ckm-items.md del monorepo, 8.4, n.º 14 a 18). Con
// la constante apagada `ingresoParaPaciente` lo quita, también de la copia del server, y la
// paciente ve exactamente la v1.1.0. Los linkId son los de INGRESO_LINKIDS del core: el
// perfil del plan lee el grupo por esos linkId. A un hombre no se le muestra.
import { INGRESO_ANCESTRIA, INGRESO_LINKIDS } from '@epa/careplan-menopausia';
import type { Coding, Questionnaire, QuestionnaireItem, QuestionnaireItemAnswerOption } from '@medplum/fhirtypes';

/** URL canónica del cuestionario de ingreso (compartida con la app clínica vía Medplum). */
export const INTAKE_QUESTIONNAIRE_URL = 'https://segundaopinionmedica.org/Questionnaire/intake-clinico';

/**
 * Grupo «Salud de la mujer» del ingreso. APAGADO hasta la firma médica: las preguntas y sus
 * textos, si alcanza lo autodeclarado (la Condition de etapa se escribe sin confirmar), los
 * SNOMED de las etapas y la ancestría dentro del grupo están a decidir. Con la constante en
 * false el grupo no se muestra a nadie y al guardar no se escribe ninguna Condition.
 */
export const INGRESO_SALUD_MUJER = false;

/** Sistema de los códigos de las opciones del grupo «Salud de la mujer». */
export const INGRESO_SALUD_MUJER_SYSTEM = 'https://segundaopinionmedica.org/CodeSystem/intake-salud-mujer';

/**
 * Códigos de las opciones de `etapa-menstrual`. El texto de cada opción está a firmar; la
 * etapa que se registra sale del código (src/fhir/ingresoCondiciones.ts), no del texto.
 */
export const ETAPA_MENSTRUAL = {
  regular: 'menstrua-regular',
  perimenopausia: 'perimenopausia',
  posmenopausia: 'posmenopausia',
  quirurgica: 'quirurgica',
  noSe: 'no-se',
} as const;

function codigo(code: string, display: string): Coding {
  return { system: INGRESO_SALUD_MUJER_SYSTEM, code, display };
}

function opcion(code: string, display: string): QuestionnaireItemAnswerOption {
  return { valueCoding: codigo(code, display) };
}

const OPCIONES_ETAPA = {
  regular: opcion(ETAPA_MENSTRUAL.regular, 'Menstrúo con regularidad'),
  perimenopausia: opcion(ETAPA_MENSTRUAL.perimenopausia, 'Mis ciclos cambiaron (irregulares) o tengo sofocos'),
  posmenopausia: opcion(ETAPA_MENSTRUAL.posmenopausia, 'Hace 12 meses o más que no menstrúo'),
  quirurgica: opcion(ETAPA_MENSTRUAL.quirurgica, 'Me sacaron los ovarios o el útero y los ovarios'),
  noSe: opcion(ETAPA_MENSTRUAL.noSe, 'No sé'),
};

/**
 * «Salud de la mujer» (v1.2.0). Textos a firmar. La ancestría usa los códigos de
 * INGRESO_ANCESTRIA del core; las preguntas obstétricas son de sí o no (`boolean`), como
 * el resto del ingreso.
 */
const GRUPO_SALUD_MUJER: QuestionnaireItem = {
  linkId: INGRESO_LINKIDS.grupoSaludMujer,
  text: 'Salud de la mujer',
  type: 'group',
  item: [
    {
      linkId: INGRESO_LINKIDS.etapaMenstrual,
      text: '¿En qué momento estás con tu menstruación?',
      type: 'choice',
      answerOption: Object.values(OPCIONES_ETAPA),
    },
    {
      linkId: INGRESO_LINKIDS.edadUltimaMenstruacion,
      text: '¿A qué edad tuviste tu última menstruación? (si ya no menstruás)',
      type: 'integer',
      enableWhen: [
        {
          question: INGRESO_LINKIDS.etapaMenstrual,
          operator: '=',
          answerCoding: OPCIONES_ETAPA.posmenopausia.valueCoding,
        },
        {
          question: INGRESO_LINKIDS.etapaMenstrual,
          operator: '=',
          answerCoding: OPCIONES_ETAPA.quirurgica.valueCoding,
        },
      ],
      enableBehavior: 'any',
    },
    {
      linkId: INGRESO_LINKIDS.obstPreeclampsia,
      text: '¿Tuviste preeclampsia o presión alta durante algún embarazo?',
      type: 'boolean',
    },
    {
      linkId: INGRESO_LINKIDS.obstDmg,
      text: '¿Tuviste diabetes gestacional (diabetes durante el embarazo)?',
      type: 'boolean',
    },
    {
      linkId: INGRESO_LINKIDS.obstPrematuro,
      text: '¿Tuviste algún parto prematuro (antes de las 37 semanas)?',
      type: 'boolean',
    },
    {
      linkId: INGRESO_LINKIDS.ancestriaAsiatica,
      text: '¿Tu familia es de origen asiático (por ejemplo de India, China, Japón, Corea o el sudeste de Asia)?',
      type: 'choice',
      answerOption: [
        opcion(INGRESO_ANCESTRIA.si, 'Sí'),
        opcion(INGRESO_ANCESTRIA.no, 'No'),
        opcion(INGRESO_ANCESTRIA.noSe, 'No sé'),
      ],
    },
    {
      linkId: 'salud-mujer-aclaracion',
      text: 'Lo que declares lo revisa el equipo médico; nos sirve para sumar a tu plan los pasos que corresponden a esta etapa.',
      type: 'display',
    },
  ],
};

// Definición local: se usa como fallback si el Questionnaire no está cargado en el server.
// La fuente de verdad es el recurso Questionnaire en Medplum (mismo url canónico).
export const intakeQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  url: INTAKE_QUESTIONNAIRE_URL,
  version: '1.2.0',
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
    GRUPO_SALUD_MUJER,
    {
      linkId: 'declaracion',
      text: 'Declaro que la información provista es completa y veraz.',
      type: 'boolean',
      required: true,
    },
  ],
};
