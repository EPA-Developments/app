// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import type { Patient, Questionnaire, QuestionnaireItem } from '@medplum/fhirtypes';
import { intakeQuestionnaire } from '../pages/intake.questionnaire';
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

test('v1.1.0: la hipertensión solo en Antecedentes y sin contacto de emergencia', () => {
  const ids = linkIds(intakeQuestionnaire.item);
  expect(intakeQuestionnaire.version).toBe('1.1.0');
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
