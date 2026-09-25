// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import type { Communication } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { indexarDefinicionesFhir } from './__fixtures__/glp1';
import {
  adjuntoNotificacion,
  cargarNotificaciones,
  contarNoLeidas,
  criteriaNotificaciones,
  destinoNotificacion,
  esNoLeida,
  haceCuanto,
  marcarLeida,
  marcarTodasLeidas,
  NOTIFICACION_SYSTEM,
  textoNotificacion,
  tipoNotificacion,
} from './notificaciones';

const P1 = 'Patient/p1';

function novedad(code: string, extra: Partial<Communication> = {}): Communication {
  return {
    resourceType: 'Communication',
    status: 'in-progress',
    subject: { reference: P1 },
    recipient: [{ reference: P1 }],
    sent: '2026-09-20T10:00:00.000Z',
    category: [{ coding: [{ system: NOTIFICACION_SYSTEM, code }] }],
    payload: [{ contentString: `Aviso ${code}` }],
    ...extra,
  };
}

async function servidor(): Promise<MockClient> {
  indexarDefinicionesFhir();
  const medplum = new MockClient();
  // Chat: un topic y un mensaje del hilo (sin nuestra category) — nunca son novedades.
  const topic = await medplum.createResource<Communication>({
    resourceType: 'Communication',
    status: 'in-progress',
    subject: { reference: P1 },
    recipient: [{ reference: P1 }],
    sent: '2026-09-21T10:00:00.000Z',
    topic: { text: 'Consulta' },
  });
  await medplum.createResource<Communication>({
    resourceType: 'Communication',
    status: 'in-progress',
    subject: { reference: P1 },
    recipient: [{ reference: P1 }],
    sent: '2026-09-21T10:05:00.000Z',
    partOf: [{ reference: `Communication/${topic.id}` }],
    payload: [{ contentString: 'Hola' }],
  });
  // Novedad de otro paciente.
  await medplum.createResource(
    novedad('general', { subject: { reference: 'Patient/p2' }, recipient: [{ reference: 'Patient/p2' }] })
  );
  return medplum;
}

test('el system es de SOM, no de Biowellness', () => {
  expect(NOTIFICACION_SYSTEM).toBe('https://segundaopinionmedica.org/fhir/CodeSystem/notificacion');
  expect(criteriaNotificaciones(P1)).toBe(
    'Communication?recipient=Patient/p1&category=https://segundaopinionmedica.org/fhir/CodeSystem/notificacion|'
  );
});

test('carga solo las novedades del paciente (sin chat), de la más nueva a la más vieja, y cuenta las no leídas', async () => {
  const medplum = await servidor();
  await medplum.createResource(novedad('reserva-confirmada', { sent: '2026-09-22T10:00:00.000Z' }));
  await medplum.createResource(novedad('pago-recibido', { status: 'completed', sent: '2026-09-23T10:00:00.000Z' }));
  await medplum.createResource(novedad('recordatorio', { sent: '2026-09-24T10:00:00.000Z' }));

  const lista = await cargarNotificaciones(medplum, P1);
  expect(lista.map((c) => tipoNotificacion(c).tipo)).toEqual(['recordatorio', 'pago-recibido', 'reserva-confirmada']);
  expect(await contarNoLeidas(medplum, P1)).toBe(2);
});

test('marcar leída pasa a completed + received; marcar todas deja el contador en cero', async () => {
  const medplum = await servidor();
  const a = await medplum.createResource(novedad('general'));
  await medplum.createResource(novedad('recordatorio'));

  const leida = await marcarLeida(medplum, a);
  expect(leida.status).toBe('completed');
  expect(leida.received).toBeDefined();
  expect(esNoLeida(leida)).toBe(false);
  // Ya leída: no vuelve a escribir.
  expect((await marcarLeida(medplum, leida)).meta?.versionId).toBe(leida.meta?.versionId);
  expect(await contarNoLeidas(medplum, P1)).toBe(1);

  await marcarTodasLeidas(medplum, await cargarNotificaciones(medplum, P1));
  expect(await contarNoLeidas(medplum, P1)).toBe(0);
});

test('tipo y texto: un código desconocido se muestra como aviso con su display', () => {
  expect(tipoNotificacion(novedad('pago-recibido'))).toEqual({ tipo: 'pago-recibido', titulo: 'Pago recibido' });
  const nueva = novedad('x', {
    category: [{ coding: [{ system: NOTIFICACION_SYSTEM, code: 'teleconsulta-lista', display: 'Tu videollamada' }] }],
  });
  expect(tipoNotificacion(nueva)).toEqual({ tipo: 'general', titulo: 'Tu videollamada' });
  expect(textoNotificacion(novedad('general', { payload: [{ contentString: 'Uno' }, { contentString: 'Dos' }] }))).toBe(
    'Uno\nDos'
  );
});

test('adjunto: el comprobante del pago', () => {
  const c = novedad('pago-recibido', {
    payload: [
      { contentString: 'Recibimos tu pago' },
      { contentAttachment: { url: 'Binary/b1', contentType: 'application/pdf', title: 'Comprobante' } },
    ],
  });
  expect(adjuntoNotificacion(c)?.url).toBe('Binary/b1');
  expect(adjuntoNotificacion(novedad('general'))).toBeUndefined();
});

test.each([
  [{ about: [{ reference: 'Appointment/a1' }] }, '/membership'],
  [{ about: [{ reference: 'Invoice/i1' }] }, '/membership'],
  [{ about: [{ reference: 'DiagnosticReport/dr1' }] }, '/health-record/lab-results/dr1'],
  [{ about: [{ reference: 'MedicationRequest/m1' }] }, '/health-record/medications/m1'],
  [{ about: [{ reference: 'CarePlan/c1' }] }, '/care-plan'],
  [{ about: [{ reference: 'ServiceRequest/s1' }] }, '/mi-segunda-opinion'],
  [{ about: [{ reference: 'Task/t1' }] }, '/get-care'],
])('destino según el recurso real (%o)', (extra, destino) => {
  expect(destinoNotificacion(novedad('general', extra))).toBe(destino);
});

test('Mensaje nuevo (Recepción respondió) abre la conversación', () => {
  const c = novedad('mensaje-nuevo', { about: [{ reference: 'Communication/conv1' }] });
  expect(tipoNotificacion(c)).toEqual({ tipo: 'mensaje-nuevo', titulo: 'Mensaje nuevo' });
  expect(destinoNotificacion(c)).toBe('/Communication/conv1');
});

test('sin `about`, el destino sale del tipo; un aviso general no navega', () => {
  expect(destinoNotificacion(novedad('recordatorio'))).toBe('/membership');
  expect(destinoNotificacion(novedad('resultados-listos'))).toBe('/health-record/biomarkers');
  expect(destinoNotificacion(novedad('general'))).toBeUndefined();
});

test('haceCuanto', () => {
  const ahora = new Date('2026-09-25T12:00:00.000Z');
  expect(haceCuanto('2026-09-25T11:59:30.000Z', ahora)).toBe('recién');
  expect(haceCuanto('2026-09-25T11:55:00.000Z', ahora)).toBe('hace 5 minutos');
  expect(haceCuanto('2026-09-25T09:00:00.000Z', ahora)).toBe('hace 3 horas');
  expect(haceCuanto('2026-09-24T12:00:00.000Z', ahora)).toBe('ayer');
  expect(haceCuanto('2026-09-01T12:00:00.000Z', ahora)).toMatch(/1 sept?/);
});
