// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { INGRESO_LINKIDS } from '@epa/careplan-menopausia';
import type { Patient, Questionnaire, QuestionnaireItem } from '@medplum/fhirtypes';
import { INGRESO_SALUD_MUJER, intakeQuestionnaire } from '../pages/intake.questionnaire';
import { intakeQuestionnaireV110 } from './__fixtures__/ingreso-v1.1.0';
import { ingresoParaPaciente } from './ingreso';

function linkIds(items: QuestionnaireItem[] | undefined): string[] {
  return (items ?? []).flatMap((i) => [i.linkId, ...linkIds(i.item)]);
}

const hombre: Patient = { resourceType: 'Patient', gender: 'male' };
const mujer: Patient = { resourceType: 'Patient', gender: 'female' };
const sinSexo: Patient = { resourceType: 'Patient' };

/** Preguntas que traía la v1.0.0, por grupo. */
const EXTRAS_V1: Record<string, QuestionnaireItem[]> = {
  'factores-riesgo': [{ linkId: 'fr-hipertension', text: '¿Tenés hipertensión arterial?', type: 'boolean' }],
  general: [{ linkId: 'contacto-emergencia', text: 'Contacto de emergencia', type: 'string' }],
};

/** Una copia vieja (v1.0.0) del server, con las preguntas que ya no van. */
const copiaVieja: Questionnaire = {
  ...intakeQuestionnaire,
  version: '1.0.0',
  item: intakeQuestionnaire.item?.map((g) => (EXTRAS_V1[g.linkId] ? { ...g, item: [...EXTRAS_V1[g.linkId], ...(g.item ?? [])] } : g)),
};

test('v1.2.0: la hipertensión solo en Antecedentes y sin contacto de emergencia', () => {
  const ids = linkIds(intakeQuestionnaire.item);
  expect(intakeQuestionnaire.version).toBe('1.2.0');
  expect(ids).not.toContain('fr-hipertension');
  expect(ids).not.toContain('contacto-emergencia');
  const antecedentes = intakeQuestionnaire.item?.find((i) => i.linkId === 'antecedentes');
  expect(antecedentes?.item?.find((i) => i.linkId === 'antecedentes-cardiovasculares')?.text).toMatch(/hipertensión/);
  // Los demás factores de riesgo siguen.
  expect(ids).toEqual(expect.arrayContaining(['fr-diabetes', 'fr-dislipemia', 'fr-tabaquismo', 'fr-familiares']));
});

test.each([
  ['la definición local', intakeQuestionnaire],
  ['una copia vieja del server', copiaVieja],
])('%s: nadie ve las preguntas retiradas', (_nombre, q) => {
  for (const p of [hombre, mujer, sinSexo]) {
    const ids = linkIds(ingresoParaPaciente(q, p).item);
    expect(ids).not.toContain('fr-hipertension');
    expect(ids).not.toContain('contacto-emergencia');
  }
});

test('a un hombre no se le pregunta por embarazo (y el grupo vacío no se muestra)', () => {
  const ids = linkIds(ingresoParaPaciente(intakeQuestionnaire, hombre).item);
  expect(ids).not.toContain('embarazo');
  expect(ids).not.toContain('general');
  expect(ids).toContain('declaracion');
});

test('a una mujer o a quien no cargó el sexo, sí', () => {
  for (const p of [mujer, sinSexo, { ...sinSexo, gender: 'other' as const }]) {
    const ids = linkIds(ingresoParaPaciente(intakeQuestionnaire, p).item);
    expect(ids).toEqual(expect.arrayContaining(['general', 'embarazo']));
  }
});

test('no modifica el cuestionario original', () => {
  const antes = JSON.stringify(copiaVieja);
  ingresoParaPaciente(copiaVieja, hombre);
  expect(JSON.stringify(copiaVieja)).toBe(antes);
});

// ---------------------------------------------------------------------------
// v1.2.0: grupo «Salud de la mujer», apagado hasta la firma médica
// ---------------------------------------------------------------------------

const GRUPO = INGRESO_LINKIDS.grupoSaludMujer;
const PREGUNTAS_DEL_GRUPO = [
  INGRESO_LINKIDS.etapaMenstrual,
  INGRESO_LINKIDS.edadUltimaMenstruacion,
  INGRESO_LINKIDS.obstPreeclampsia,
  INGRESO_LINKIDS.obstDmg,
  INGRESO_LINKIDS.obstPrematuro,
  INGRESO_LINKIDS.ancestriaAsiatica,
];

/** Lo que el paciente ve, sin la versión (la v1.2.0 lleva otro número aunque se vea igual). */
function loQueVe(q: Questionnaire, p: Patient, saludMujer?: boolean): Omit<Questionnaire, 'version'> {
  const { version: _version, ...resto } = ingresoParaPaciente(q, p, saludMujer === undefined ? {} : { saludMujer });
  return resto;
}

test('INGRESO_SALUD_MUJER sigue apagada hasta que firmen los médicos', () => {
  expect(INGRESO_SALUD_MUJER).toBe(false);
});

test('el grupo usa los linkId de INGRESO_LINKIDS del core, que es como lo lee el perfil del plan', () => {
  const grupo = intakeQuestionnaire.item?.find((i) => i.linkId === GRUPO);
  expect(grupo?.text).toBe('Salud de la mujer');
  expect(linkIds(grupo?.item)).toEqual(expect.arrayContaining(PREGUNTAS_DEL_GRUPO));
});

test.each([
  ['la definición local', intakeQuestionnaire],
  ['una copia del server que ya trae el grupo', { ...intakeQuestionnaire, id: 'del-server' }],
])('con la constante apagada, %s: nadie ve el grupo', (_nombre, q) => {
  for (const p of [hombre, mujer, sinSexo, { ...sinSexo, gender: 'other' as const }]) {
    const ids = linkIds(ingresoParaPaciente(q, p).item);
    expect(ids).not.toContain(GRUPO);
    for (const linkId of PREGUNTAS_DEL_GRUPO) {
      expect(ids).not.toContain(linkId);
    }
  }
});

test('con la constante apagada, el ingreso es idéntico a la v1.1.0 para cualquiera', () => {
  for (const p of [mujer, hombre, sinSexo]) {
    expect(loQueVe(intakeQuestionnaire, p)).toEqual(loQueVe(intakeQuestionnaireV110, p));
  }
});

test('con la constante prendida, una mujer o quien no cargó el sexo ve el grupo antes de la declaración', () => {
  for (const p of [mujer, sinSexo, { ...sinSexo, gender: 'other' as const }]) {
    const visto = ingresoParaPaciente(intakeQuestionnaire, p, { saludMujer: true });
    const ids = linkIds(visto.item);
    expect(ids).toEqual(expect.arrayContaining([GRUPO, ...PREGUNTAS_DEL_GRUPO]));
    const raiz = (visto.item ?? []).map((i) => i.linkId);
    expect(raiz.indexOf(GRUPO)).toBe(raiz.indexOf('declaracion') - 1);
  }
});

test('con la constante prendida, a un hombre no se le muestra el grupo', () => {
  const ids = linkIds(ingresoParaPaciente(intakeQuestionnaire, hombre, { saludMujer: true }).item);
  expect(ids).not.toContain(GRUPO);
  for (const linkId of PREGUNTAS_DEL_GRUPO) {
    expect(ids).not.toContain(linkId);
  }
  // Lo demás que ve es lo mismo que con la constante apagada.
  expect(loQueVe(intakeQuestionnaire, hombre, true)).toEqual(loQueVe(intakeQuestionnaire, hombre, false));
});

test('la edad de la última menstruación sólo se pregunta a quien ya no menstrúa', () => {
  const grupo = intakeQuestionnaire.item?.find((i) => i.linkId === GRUPO);
  const edad = grupo?.item?.find((i) => i.linkId === INGRESO_LINKIDS.edadUltimaMenstruacion);
  expect(edad?.type).toBe('integer');
  expect(edad?.enableBehavior).toBe('any');
  expect(edad?.enableWhen?.map((e) => e.answerCoding?.code)).toEqual(['posmenopausia', 'quirurgica']);
});
