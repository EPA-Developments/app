// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import type { Goal, Patient, ServiceRequest, Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { cargarFixtureGlp1, indexarDefinicionesFhir } from './__fixtures__/glp1';
import type { MetaGlp1, SeguimientoGlp1Activo } from './glp1';
import {
  INDICACION_GLP1_CODE,
  NOMBRES_ESTUDIOS,
  TASK_TIPO_SYSTEM,
  cargarSeguimientoGlp1,
  controlDeRevision,
  esCarePlanGlp1,
  formatearFecha,
  formatearInstante,
  formatearTurno,
  hoyArgentina,
  leerMeta,
  proximoControl,
  semanasTranscurridas,
  textoEstado,
  textoMeta,
  textoSemanas,
  textoVentana,
} from './glp1';

async function cargarActivo(): Promise<{ medplum: MockClient; patient: Patient; s: SeguimientoGlp1Activo }> {
  const medplum = new MockClient();
  const patient = await cargarFixtureGlp1(medplum);
  const s = await cargarSeguimientoGlp1(medplum, patient);
  if (s?.estado !== 'activo') {
    throw new Error(`Se esperaba un programa activo, llegó ${JSON.stringify(s)}`);
  }
  return { medplum, patient, s };
}

describe('fechas sin corrimiento de zona horaria', () => {
  test('los tests corren en hora argentina', () => {
    // UTC-3 todo el año (Argentina no tiene horario de verano).
    expect(new Date(2026, 9, 5).getTimezoneOffset()).toBe(180);
    // Justamente acá `new Date('AAAA-MM-DD')` cae el día anterior.
    expect(new Date('2026-10-05').getDate()).toBe(4);
  });

  test('formatearFecha no corre el día', () => {
    expect(formatearFecha('2026-10-05')).toBe('05/10/2026');
    expect(formatearFecha('2027-01-04', false)).toBe('04/01');
    expect(formatearFecha(undefined)).toBe('');
  });

  test('hoyArgentina usa la fecha local de Buenos Aires', () => {
    expect(hoyArgentina(new Date('2026-10-05T02:30:00Z'))).toBe('2026-10-04');
    expect(hoyArgentina(new Date('2026-10-05T03:30:00Z'))).toBe('2026-10-05');
    expect(formatearInstante('2026-10-05T02:30:00Z')).toBe('04/10/2026');
  });

  test('semanas transcurridas: días / 7 para abajo, negativo antes de empezar', () => {
    expect(semanasTranscurridas('2026-10-05', '2026-10-04')).toBe(-1);
    expect(semanasTranscurridas('2026-10-05', '2026-10-05')).toBe(0);
    expect(semanasTranscurridas('2026-10-05', '2026-10-11')).toBe(0);
    expect(semanasTranscurridas('2026-10-05', '2026-10-12')).toBe(1);
    expect(semanasTranscurridas('2026-10-05', '2026-12-28')).toBe(12);
  });

  test('el turno se muestra en hora argentina', () => {
    expect(formatearTurno('2026-09-30T13:00:00.000Z')).toBe('mié 30/09 10:00');
  });
});

describe('cargarSeguimientoGlp1 con el ejemplo de recepcionistas', () => {
  test('lee el programa: molécula, esquema e inicio', async () => {
    const { s } = await cargarActivo();
    expect(s.carePlanId).toBe('careplan-3');
    expect(s.molecula).toBe('Semaglutida');
    expect(s.esquema).toContain('0,25 mg semanal');
    expect(s.inicio).toBe('2026-10-05');
    expect(JSON.stringify(s)).not.toContain('Antes de concluir que no responde');
  });

  test('AC-2: controles de las semanas 0, 4, 12, 20 y 26, en orden, con estado y ventana', async () => {
    const { s } = await cargarActivo();
    expect(s.controles.map((c) => c.semana)).toEqual([0, 4, 12, 20, 26]);
    const [basal, ...resto] = s.controles;
    expect(basal.nombre).toBe('Control inicial');
    expect(basal.estado).toBe('agendado');
    expect(basal.turno?.status).toBe('pending');
    expect(formatearTurno(basal.turno?.start as string)).toBe('mié 30/09 10:00');
    expect(resto.every((c) => c.estado === 'por-agendar')).toBe(true);
    const semana12 = s.controles.find((c) => c.semana === 12);
    expect(formatearFecha(semana12?.ventana.inicio)).toBe('28/12/2026');
    expect(formatearFecha(semana12?.ventana.fin)).toBe('04/01/2027');
  });

  test('AC-3: la semana 20 es la revisión de respuesta, con meta ≤ 87,4 kg al 22/02/2027', async () => {
    const { s } = await cargarActivo();
    const revision = controlDeRevision(s.controles);
    expect(revision?.semana).toBe(20);
    expect(revision?.nombre).toBe('Revisión de tu respuesta al tratamiento');
    expect(s.controles.filter((c) => c.esRevision)).toHaveLength(1);
    expect(s.meta).toEqual({ tipo: 'kg', valor: 87.4, fecha: '2027-02-22' });
    expect(textoMeta(s.meta as MetaGlp1)).toBe('Llegar a 87,4 kg o menos para el 22/02/2027');
  });

  test('AC-4: el basal lleva los 12 estudios con nombre visible; la semana 4, ninguno', async () => {
    const { s } = await cargarActivo();
    const [basal, semana4] = s.controles;
    expect(basal.requiereLaboratorio).toBe(true);
    expect(basal.estudios).toHaveLength(12);
    expect(basal.estudios.map((e) => e.nombre).sort()).toEqual(Object.values(NOMBRES_ESTUDIOS).sort());
    expect(semana4.requiereLaboratorio).toBe(false);
    expect(semana4.estudios).toEqual([]);
    expect(s.controles.find((c) => c.semana === 20)?.estudios.map((e) => e.slug)).toEqual([
      'hba1c',
      'glucosa-en-ayunas',
      'creatinina',
      'egfr-tfg-estimada',
    ]);
  });

  test('AC-5: no aparecen tareas canceladas ni pedidos revocados', async () => {
    const medplum = new MockClient();
    const patient = await cargarFixtureGlp1(medplum);
    const tarea = (await medplum.readResource('Task', 'task-33')) as Task;
    await medplum.createResource<Task>({ ...tarea, id: undefined, status: 'cancelled', input: [
      { type: { text: 'semana' }, valueInteger: 8 },
    ] });
    const pedido = (await medplum.readResource('ServiceRequest', 'servicerequest-4')) as ServiceRequest;
    await medplum.createResource<ServiceRequest>({
      ...pedido,
      id: undefined,
      status: 'revoked',
      requisition: { ...pedido.requisition, value: 'careplan-3:semana-4' },
    });

    const s = (await cargarSeguimientoGlp1(medplum, patient)) as SeguimientoGlp1Activo;
    expect(s.controles.map((c) => c.semana)).toEqual([0, 4, 12, 20, 26]);
    expect(s.controles.find((c) => c.semana === 4)?.estudios).toEqual([]);
  });

  test('próximo control: el basal antes del turno; después, la semana 4', async () => {
    const { s } = await cargarActivo();
    expect(proximoControl(s.controles, new Date('2026-09-23T12:00:00Z'))?.semana).toBe(0);
    expect(proximoControl(s.controles, new Date('2026-10-01T12:00:00Z'))?.semana).toBe(4);
  });

  test('esCarePlanGlp1 distingue el programa de otros planes', async () => {
    const { medplum } = await cargarActivo();
    expect(esCarePlanGlp1(await medplum.readResource('CarePlan', 'careplan-3'))).toBe(true);
    expect(esCarePlanGlp1({ resourceType: 'CarePlan', status: 'active', intent: 'plan', subject: {} })).toBe(false);
  });
});

describe('estados vacíos', () => {
  beforeAll(indexarDefinicionesFhir);

  test('AC-6: sin programa devuelve undefined', async () => {
    const medplum = new MockClient();
    const patient = await medplum.createResource<Patient>({ resourceType: 'Patient', name: [{ family: 'Sin' }] });
    expect(await cargarSeguimientoGlp1(medplum, patient)).toBeUndefined();
  });

  test('AC-6: inscripto sin plan → indicación pendiente', async () => {
    const medplum = new MockClient();
    const patient = await medplum.createResource<Patient>({ resourceType: 'Patient', name: [{ family: 'Nuevo' }] });
    await medplum.createResource<Task>({
      resourceType: 'Task',
      status: 'requested',
      intent: 'order',
      code: { coding: [{ system: TASK_TIPO_SYSTEM, code: INDICACION_GLP1_CODE }] },
      for: { reference: `Patient/${patient.id}` },
    });
    expect(await cargarSeguimientoGlp1(medplum, patient)).toEqual({ estado: 'indicacion-pendiente' });
  });
});

test('leerMeta: meta relativa al peso basal', () => {
  const goal: Goal = {
    resourceType: 'Goal',
    lifecycleStatus: 'active',
    description: { text: 'meta' },
    subject: {},
    target: [
      {
        measure: { coding: [{ system: 'http://loinc.org', code: '29463-7' }] },
        detailString: '≤ 95 % del peso basal',
        dueDate: '2027-02-22',
      },
    ],
  };
  const meta = leerMeta(goal);
  expect(meta).toEqual({ tipo: 'porcentaje', porcentaje: 5, fecha: '2027-02-22' });
  expect(textoMeta(meta as MetaGlp1)).toBe('Bajar al menos un 5 % de tu peso inicial para el 22/02/2027');
});

describe('textos para el paciente', () => {
  test('semanas de tratamiento', () => {
    expect(textoSemanas('2026-10-05', '2026-09-23')).toBe('Empezás el 05/10');
    expect(textoSemanas('2026-10-05', '2026-10-07')).toBe('Estás en tu primera semana de tratamiento');
    expect(textoSemanas('2026-10-05', '2026-10-12')).toBe('Llevás 1 semana de tratamiento');
    expect(textoSemanas('2026-10-05', '2027-01-01')).toBe('Llevás 12 semanas de tratamiento');
  });

  test('ventana y estado de cada control', async () => {
    const { s } = await cargarActivo();
    const [basal, semana4, semana12] = s.controles;
    expect(textoVentana(semana12, '2026-09-23')).toBe('Entre el 28/12 y el 04/01/2027');
    expect(textoVentana(semana4, '2026-09-23')).toBe('Entre el 02/11 y el 09/11');
    expect(textoEstado(basal)).toBe('Agendado: mié 30/09 10:00 · Reservado');
    expect(textoEstado(semana4)).toBe('Por agendar: Recepción te va a contactar');
    expect(textoEstado({ ...basal, estado: 'realizado' })).toBe('Realizado');
  });
});
