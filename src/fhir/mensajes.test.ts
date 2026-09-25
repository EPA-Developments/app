// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Communication, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { indexarDefinicionesFhir } from './__fixtures__/glp1';
import {
  cargarConversaciones,
  cargarMensajes,
  crearConversacion,
  enviarMensaje,
  esNoLeido,
  marcarRecibidos,
  MOTIVO_MENSAJE_SYSTEM,
  motivoDe,
} from './mensajes';
import { NOTIFICACION_SYSTEM } from './notificaciones';

const DRA = { reference: 'Practitioner/dra', display: 'Dra. Laura Pérez' };

async function paciente(): Promise<{ medplum: MockClient; patient: WithId<Patient> }> {
  indexarDefinicionesFhir();
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Ana'], family: 'García' }],
    generalPractitioner: [DRA],
  });
  medplum.setProfile(patient);
  return { medplum, patient };
}

/** Lo que escribe el equipo desde su bandeja (ThreadChat de Medplum). */
async function respuestaDelEquipo(
  medplum: MockClient,
  topic: WithId<Communication>,
  texto: string,
  sent: string
): Promise<WithId<Communication>> {
  return medplum.createResource<Communication>({
    resourceType: 'Communication',
    status: 'in-progress',
    subject: topic.subject,
    sender: DRA,
    recipient: [topic.subject ?? {}],
    partOf: [{ reference: `Communication/${topic.id}` }],
    sent,
    payload: [{ contentString: texto }],
  });
}

test('el motivo y el mensaje son obligatorios', async () => {
  const { medplum, patient } = await paciente();
  await expect(crearConversacion(medplum, patient, 'cualquiera', 'Hola')).rejects.toThrow(/motivo/);
  await expect(crearConversacion(medplum, patient, 'turnos', '   ')).rejects.toThrow(/mensaje/);
});

test('una conversación nueva tiene su motivo y su primer mensaje, como la espera la bandeja de Recepción', async () => {
  const { medplum, patient } = await paciente();
  const topic = await crearConversacion(medplum, patient, 'turnos', '  Quiero cambiar mi turno.  ');

  // Conversación (topic): sin partOf, con el motivo codificado y su texto (título del ThreadInbox).
  expect(topic.partOf).toBeUndefined();
  expect(topic.status).toBe('in-progress');
  expect(topic.subject?.reference).toBe(`Patient/${patient.id}`);
  expect(topic.topic).toEqual({
    coding: [{ system: MOTIVO_MENSAJE_SYSTEM, code: 'turnos', display: 'Turnos y reservas' }],
    text: 'Turnos y reservas',
  });
  expect(topic.recipient?.map((r) => r.reference)).toEqual([`Patient/${patient.id}`, 'Practitioner/dra']);
  expect(MOTIVO_MENSAJE_SYSTEM).toBe('https://segundaopinionmedica.org/fhir/CodeSystem/motivo-mensaje');

  // Primer mensaje: hijo de la conversación (sin él, la bandeja no la listaría).
  const [primero] = await cargarMensajes(medplum, topic);
  expect(primero).toMatchObject({
    status: 'in-progress',
    sender: { reference: `Patient/${patient.id}` },
    recipient: [{ reference: 'Practitioner/dra' }],
    partOf: [{ reference: `Communication/${topic.id}` }],
    payload: [{ contentString: 'Quiero cambiar mi turno.' }],
  });
  expect(primero.sent).toBeDefined();
});

test('la lista: sin Novedades ni otros pacientes, la más activa primero, con el último mensaje y los no leídos', async () => {
  const { medplum, patient } = await paciente();
  const pagos = await crearConversacion(medplum, patient, 'pagos', 'No veo mi seña.');
  const estudios = await crearConversacion(medplum, patient, 'estudios', 'Subí mi laboratorio.');
  await respuestaDelEquipo(medplum, pagos, 'Ya la registramos, gracias.', '2099-01-01T10:00:00.000Z');
  // Una Novedad (campanita): Communication sin partOf ni hijas → no es una conversación.
  await medplum.createResource<Communication>({
    resourceType: 'Communication',
    status: 'in-progress',
    subject: { reference: `Patient/${patient.id}` },
    recipient: [{ reference: `Patient/${patient.id}` }],
    sent: '2099-02-01T10:00:00.000Z',
    category: [{ coding: [{ system: NOTIFICACION_SYSTEM, code: 'general' }] }],
    payload: [{ contentString: 'Aviso' }],
  });

  const lista = await cargarConversaciones(medplum, patient);
  expect(lista.map((c) => c.titulo)).toEqual(['Pagos y membresía', 'Estudios y resultados']);
  expect(lista[0].noLeidos).toBe(1);
  expect(lista[0].ultimo?.payload?.[0]?.contentString).toBe('Ya la registramos, gracias.');
  expect(lista[1]).toMatchObject({ motivo: 'estudios', noLeidos: 0 });
  expect(lista[1].topic.id).toBe(estudios.id);
});

test('responder y marcar leído lo del equipo (lo propio no se toca)', async () => {
  const { medplum, patient } = await paciente();
  const topic = await crearConversacion(medplum, patient, 'consulta-salud', '¿Puedo tomar el remedio de noche?');
  await respuestaDelEquipo(medplum, topic, 'Sí, sin problema.', '2099-01-01T10:00:00.000Z');

  const respuesta = await enviarMensaje(medplum, patient, topic, 'Gracias!');
  expect(respuesta.recipient?.map((r) => r.reference)).toEqual(['Practitioner/dra']);
  expect(respuesta.partOf?.[0]?.reference).toBe(`Communication/${topic.id}`);

  const antes = await cargarMensajes(medplum, topic);
  expect(antes.filter((m) => esNoLeido(m, patient))).toHaveLength(1);
  await marcarRecibidos(medplum, patient, antes);
  const despues = await cargarMensajes(medplum, topic);
  expect(despues.filter((m) => esNoLeido(m, patient))).toHaveLength(0);
  const delEquipo = despues.find((m) => m.sender?.reference === 'Practitioner/dra');
  expect(delEquipo).toMatchObject({ status: 'completed' });
  expect(delEquipo?.received).toBeDefined();
  expect(
    despues.filter((m) => m.sender?.reference === `Patient/${patient.id}`).every((m) => m.status === 'in-progress')
  ).toBe(true);
});

test('una conversación que abrió el equipo sin código muestra su texto', () => {
  expect(
    motivoDe({ resourceType: 'Communication', status: 'in-progress', topic: { text: 'Control de presión' } })
  ).toEqual({
    titulo: 'Control de presión',
  });
});
