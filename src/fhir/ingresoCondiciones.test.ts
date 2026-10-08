// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { condicionesDelPortal, etapaRegistrada, INGRESO_LINKIDS } from '@epa/careplan-menopausia';
import { getReferenceString } from '@medplum/core';
import type { Condition, Patient, QuestionnaireResponse, QuestionnaireResponseItem } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { ETAPA_MENSTRUAL, INGRESO_SALUD_MUJER_SYSTEM, INTAKE_QUESTIONNAIRE_URL } from '../pages/intake.questionnaire';
import { indexarDefinicionesFhir } from './__fixtures__/glp1';
import { etapaDelIngreso, registrarEtapaDelIngreso } from './ingresoCondiciones';

beforeAll(() => indexarDefinicionesFhir());

const SNOMED = 'http://snomed.info/sct';

async function preparar(): Promise<{ medplum: MockClient; patient: Patient }> {
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    gender: 'female',
    name: [{ given: ['Ana'], family: 'García' }],
  });
  return { medplum, patient };
}

/** El grupo «Salud de la mujer» con la etapa (código de ETAPA_MENSTRUAL) y, si va, la edad. */
function grupo(etapa?: string, edad?: number): QuestionnaireResponseItem {
  const item: QuestionnaireResponseItem[] = [];
  if (etapa) {
    item.push({
      linkId: INGRESO_LINKIDS.etapaMenstrual,
      answer: [{ valueCoding: { system: INGRESO_SALUD_MUJER_SYSTEM, code: etapa } }],
    });
  }
  if (edad !== undefined) {
    item.push({ linkId: INGRESO_LINKIDS.edadUltimaMenstruacion, answer: [{ valueInteger: edad }] });
  }
  return { linkId: INGRESO_LINKIDS.grupoSaludMujer, item };
}

async function responder(
  medplum: MockClient,
  patient: Patient,
  saludMujer: QuestionnaireResponseItem | undefined,
  authored = '2026-10-08T12:00:00.000Z'
): Promise<QuestionnaireResponse> {
  return medplum.createResource<QuestionnaireResponse>({
    resourceType: 'QuestionnaireResponse',
    status: 'completed',
    questionnaire: INTAKE_QUESTIONNAIRE_URL,
    subject: { reference: getReferenceString(patient) },
    authored,
    item: [
      { linkId: 'factores-riesgo', item: [{ linkId: 'fr-diabetes', answer: [{ valueBoolean: false }] }] },
      ...(saludMujer ? [saludMujer] : []),
      { linkId: 'declaracion', answer: [{ valueBoolean: true }] },
    ],
  });
}

async function condicionesDe(medplum: MockClient, patient: Patient): Promise<Condition[]> {
  return medplum.searchResources('Condition', { subject: getReferenceString(patient) }, { cache: 'no-cache' });
}

const codigo = (c: Condition): string | undefined => c.code?.coding?.find((k) => k.system === SNOMED)?.code;
const clinico = (c: Condition): string | undefined => c.clinicalStatus?.coding?.[0]?.code;

describe('cada etapa a su SNOMED (LIFE_STAGES del core)', () => {
  test.each([
    ['perimenopausia', ETAPA_MENSTRUAL.perimenopausia, undefined, 'perimenopausia', '307409000'],
    ['posmenopausia', ETAPA_MENSTRUAL.posmenopausia, undefined, 'posmenopausia', '76498008'],
    ['posmenopausia a los 52', ETAPA_MENSTRUAL.posmenopausia, 52, 'posmenopausia', '76498008'],
    ['posmenopausia justo a los 40', ETAPA_MENSTRUAL.posmenopausia, 40, 'posmenopausia', '76498008'],
    ['menopausia antes de los 40 (prematura)', ETAPA_MENSTRUAL.posmenopausia, 38, 'menopausia-prematura', '373717006'],
    ['quirúrgica', ETAPA_MENSTRUAL.quirurgica, undefined, 'menopausia-quirurgica', '67207009'],
    [
      'quirúrgica antes de los 40 (sigue quirúrgica)',
      ETAPA_MENSTRUAL.quirurgica,
      35,
      'menopausia-quirurgica',
      '67207009',
    ],
  ])('%s', async (_nombre, etapa, edad, stage, snomed) => {
    const { medplum, patient } = await preparar();
    const respuesta = await responder(medplum, patient, grupo(etapa, edad));

    expect(etapaDelIngreso(respuesta)).toBe(stage);
    const resultado = await registrarEtapaDelIngreso(medplum, patient, respuesta);
    expect(resultado).toMatchObject({ etapa: stage, creada: true, inactivadas: [] });

    const condiciones = await condicionesDe(medplum, patient);
    expect(condiciones).toHaveLength(1);
    const [condition] = condiciones;
    expect(codigo(condition)).toBe(snomed);
    expect(clinico(condition)).toBe('active');
    expect(condition.verificationStatus?.coding?.[0]?.code).toBe('unconfirmed');
    expect(condition.subject?.reference).toBe(getReferenceString(patient));
    expect(condition.asserter?.reference).toBe(getReferenceString(patient));
    expect(condition.recordedDate).toBe(respuesta.authored);
    expect(condition.evidence?.[0]?.detail?.[0]?.reference).toBe(getReferenceString(respuesta));

    // El core la lee igual: da la etapa y activa la condición «menopausia».
    expect(etapaRegistrada(condiciones)?.stage).toBe(stage);
    expect(condicionesDelPortal(condiciones, [respuesta])).toContain('menopausia');
  });
});

test.each([
  ['«Menstrúo con regularidad»', grupo(ETAPA_MENSTRUAL.regular)],
  ['«No sé»', grupo(ETAPA_MENSTRUAL.noSe)],
  ['el grupo sin la etapa', grupo()],
  ['una respuesta sin el grupo (v1.1.0)', undefined],
])('%s no escribe nada', async (_nombre, saludMujer) => {
  const { medplum, patient } = await preparar();
  const respuesta = await responder(medplum, patient, saludMujer);
  const crear = vi.spyOn(medplum, 'createResource');
  const actualizar = vi.spyOn(medplum, 'updateResource');

  expect(etapaDelIngreso(respuesta)).toBeUndefined();
  expect(await registrarEtapaDelIngreso(medplum, patient, respuesta)).toEqual({ creada: false, inactivadas: [] });
  expect(crear).not.toHaveBeenCalled();
  expect(actualizar).not.toHaveBeenCalled();
  expect(await condicionesDe(medplum, patient)).toHaveLength(0);
});

test('«No sé» o «regular» después de una etapa no tocan la que ya estaba', async () => {
  const { medplum, patient } = await preparar();
  await registrarEtapaDelIngreso(
    medplum,
    patient,
    await responder(medplum, patient, grupo(ETAPA_MENSTRUAL.perimenopausia))
  );
  await registrarEtapaDelIngreso(medplum, patient, await responder(medplum, patient, grupo(ETAPA_MENSTRUAL.noSe)));
  await registrarEtapaDelIngreso(medplum, patient, await responder(medplum, patient, grupo(ETAPA_MENSTRUAL.regular)));

  const condiciones = await condicionesDe(medplum, patient);
  expect(condiciones.map((c) => [codigo(c), clinico(c)])).toEqual([['307409000', 'active']]);
});

test('no duplica: la misma etapa declarada otra vez no escribe otra Condition', async () => {
  const { medplum, patient } = await preparar();
  const primera = await responder(medplum, patient, grupo(ETAPA_MENSTRUAL.posmenopausia, 51));
  const r1 = await registrarEtapaDelIngreso(medplum, patient, primera);
  // La misma respuesta procesada dos veces, y una respuesta nueva con la misma etapa.
  const r2 = await registrarEtapaDelIngreso(medplum, patient, primera);
  const r3 = await registrarEtapaDelIngreso(
    medplum,
    patient,
    await responder(medplum, patient, grupo(ETAPA_MENSTRUAL.posmenopausia, 50), '2026-11-01T12:00:00.000Z')
  );

  expect(r1.creada).toBe(true);
  expect(r2).toMatchObject({ creada: false, inactivadas: [] });
  expect(r3).toMatchObject({ creada: false, inactivadas: [] });
  expect(r2.condition?.id).toBe(r1.condition?.id);
  expect(r3.condition?.id).toBe(r1.condition?.id);
  expect(await condicionesDe(medplum, patient)).toHaveLength(1);
});

test('no duplica una etapa que ya registró el equipo con el mismo SNOMED', async () => {
  const { medplum, patient } = await preparar();
  const delEquipo = await medplum.createResource<Condition>({
    resourceType: 'Condition',
    subject: { reference: getReferenceString(patient) },
    clinicalStatus: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
    },
    verificationStatus: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }],
    },
    code: { coding: [{ system: SNOMED, code: '76498008' }] },
    asserter: { reference: 'Practitioner/medica' },
  });

  const resultado = await registrarEtapaDelIngreso(
    medplum,
    patient,
    await responder(medplum, patient, grupo(ETAPA_MENSTRUAL.posmenopausia))
  );
  expect(resultado).toMatchObject({ etapa: 'posmenopausia', creada: false, inactivadas: [] });
  expect(resultado.condition?.id).toBe(delEquipo.id);
  expect(await condicionesDe(medplum, patient)).toHaveLength(1);
});

test('un cambio de etapa inactiva la que había declarado antes y la nueva es la que toma el core', async () => {
  const { medplum, patient } = await preparar();
  const antes = await registrarEtapaDelIngreso(
    medplum,
    patient,
    await responder(medplum, patient, grupo(ETAPA_MENSTRUAL.perimenopausia), '2026-03-01T12:00:00.000Z')
  );
  const despues = await registrarEtapaDelIngreso(
    medplum,
    patient,
    await responder(medplum, patient, grupo(ETAPA_MENSTRUAL.posmenopausia, 51), '2026-10-08T12:00:00.000Z')
  );

  expect(despues).toMatchObject({ etapa: 'posmenopausia', creada: true });
  expect(despues.inactivadas.map((c) => c.id)).toEqual([antes.condition?.id]);

  const condiciones = await condicionesDe(medplum, patient);
  const porCodigo = Object.fromEntries(condiciones.map((c) => [codigo(c), clinico(c)]));
  expect(porCodigo).toEqual({ '307409000': 'inactive', '76498008': 'active' });
  expect(etapaRegistrada(condiciones)?.stage).toBe('posmenopausia');

  // Volver a la etapa anterior escribe una nueva (la inactiva queda en la historia).
  const otraVez = await registrarEtapaDelIngreso(
    medplum,
    patient,
    await responder(medplum, patient, grupo(ETAPA_MENSTRUAL.perimenopausia), '2026-12-01T12:00:00.000Z')
  );
  expect(otraVez).toMatchObject({ etapa: 'perimenopausia', creada: true });
  expect(otraVez.inactivadas.map((c) => codigo(c))).toEqual(['76498008']);
  expect((await condicionesDe(medplum, patient)).filter((c) => clinico(c) === 'active').map(codigo)).toEqual([
    '307409000',
  ]);
});

test('no inactiva lo que no declaró la persona: la menopausia del plan anterior ni la etapa del equipo', async () => {
  const { medplum, patient } = await preparar();
  const subject = { reference: getReferenceString(patient) };
  const activa = { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] };
  // El plan anterior de menopausia escribe 289903006 sin asserter.
  const delPlanAnterior = await medplum.createResource<Condition>({
    resourceType: 'Condition',
    subject,
    clinicalStatus: activa,
    code: { coding: [{ system: SNOMED, code: '289903006' }] },
  });
  const delEquipo = await medplum.createResource<Condition>({
    resourceType: 'Condition',
    subject,
    clinicalStatus: activa,
    code: { coding: [{ system: SNOMED, code: '307409000' }] },
    asserter: { reference: 'Practitioner/medica' },
  });

  const resultado = await registrarEtapaDelIngreso(
    medplum,
    patient,
    await responder(medplum, patient, grupo(ETAPA_MENSTRUAL.quirurgica))
  );
  expect(resultado).toMatchObject({ etapa: 'menopausia-quirurgica', creada: true, inactivadas: [] });

  const condiciones = await condicionesDe(medplum, patient);
  expect(condiciones.find((c) => c.id === delPlanAnterior.id)?.clinicalStatus?.coding?.[0]?.code).toBe('active');
  expect(condiciones.find((c) => c.id === delEquipo.id)?.clinicalStatus?.coding?.[0]?.code).toBe('active');
});

test('una etapa descartada por el equipo no cuenta como la vigente: se escribe de nuevo', async () => {
  const { medplum, patient } = await preparar();
  await medplum.createResource<Condition>({
    resourceType: 'Condition',
    subject: { reference: getReferenceString(patient) },
    clinicalStatus: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
    },
    verificationStatus: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'entered-in-error' }],
    },
    code: { coding: [{ system: SNOMED, code: '307409000' }] },
    asserter: { reference: getReferenceString(patient) },
  });

  const resultado = await registrarEtapaDelIngreso(
    medplum,
    patient,
    await responder(medplum, patient, grupo(ETAPA_MENSTRUAL.perimenopausia))
  );
  expect(resultado).toMatchObject({ creada: true, inactivadas: [] });
  expect(await condicionesDe(medplum, patient)).toHaveLength(2);
});

test('busca sólo las Condition del paciente con los 5 SNOMED que le permite escribir la AccessPolicy', async () => {
  const { medplum, patient } = await preparar();
  const buscar = vi.spyOn(medplum, 'searchResources');
  await registrarEtapaDelIngreso(
    medplum,
    patient,
    await responder(medplum, patient, grupo(ETAPA_MENSTRUAL.perimenopausia))
  );

  const [tipo, params] = buscar.mock.calls[0] as [string, Record<string, string>];
  expect(tipo).toBe('Condition');
  expect(params.subject).toBe(getReferenceString(patient));
  expect(params.code.split(',').sort()).toEqual(
    ['289903006', '373717006', '307409000', '76498008', '67207009'].map((c) => `${SNOMED}|${c}`).sort()
  );
});
