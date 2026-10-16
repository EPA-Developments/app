// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Informes CKM que firma el médico en el dashboard: el portal trae solo los de la paciente,
// de nuestra categoría, vigentes y firmados, del más nuevo al más viejo. Pacientes
// sintéticas, sin nombre.
import type { WithId } from '@medplum/core';
import type { DocumentReference, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { vi } from 'vitest';
import { indexarDefinicionesFhir } from './__fixtures__/glp1';
import { informeCkm } from './__fixtures__/informesCkm';
import { armarDocumentoLaboratorio, DOCUMENTO_CATEGORY_SYSTEM, PDF } from './estudios';
import { CATEGORIA_INFORME_CKM, cargarInformesCkm } from './informesCkm';

async function paciente(): Promise<{ medplum: MockClient; patient: WithId<Patient> }> {
  indexarDefinicionesFhir();
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({ resourceType: 'Patient' });
  medplum.setProfile(patient);
  return { medplum, patient };
}

test('trae solo los informes CKM vigentes y firmados por el médico, del más nuevo al más viejo', async () => {
  const { medplum, patient } = await paciente();
  // Se cargan del más viejo al más nuevo: el orden lo tiene que dar la búsqueda.
  const viejo = await medplum.createResource(informeCkm(patient, { fecha: '2026-08-10', estadio: '1' }));
  const nuevo = await medplum.createResource(informeCkm(patient, { fecha: '2026-10-14', estadio: '2' }));
  // Un borrador que el médico todavía no firmó.
  await medplum.createResource(informeCkm(patient, { fecha: '2026-10-15', docStatus: 'preliminary' }));
  // Uno que el médico anuló.
  await medplum.createResource(informeCkm(patient, { fecha: '2026-09-01', status: 'entered-in-error' }));
  // El PDF de laboratorio que mandó la paciente: es otra categoría, aunque esté firmado.
  await medplum.createResource<DocumentReference>({
    ...armarDocumentoLaboratorio(
      patient,
      { contentType: PDF, url: 'Binary/laboratorio', title: 'laboratorio.pdf' },
      new Date('2026-10-16T12:00:00.000Z')
    ),
    docStatus: 'final',
  });
  // Uno con la categoría del informe pero escrito por ella: no es «de tu médico».
  await medplum.createResource<DocumentReference>({
    ...informeCkm(patient, { fecha: '2026-10-16' }),
    author: [{ reference: `Patient/${patient.id}` }],
    authenticator: undefined,
  });
  // El informe de otra paciente.
  const otra = await medplum.createResource<Patient>({ resourceType: 'Patient' });
  await medplum.createResource(informeCkm(otra, { fecha: '2026-10-13' }));

  const buscar = vi.spyOn(medplum, 'searchResources');
  const informes = await cargarInformesCkm(medplum, patient);

  expect(informes.map((d) => d.id)).toEqual([nuevo.id, viejo.id]);
  expect(informes[0].description).toBe('Informe CKM · estadío 2');
  // Siempre fresco: un informe recién firmado tiene que aparecer al volver a entrar.
  expect(buscar).toHaveBeenCalledWith(
    'DocumentReference',
    expect.objectContaining({
      subject: `Patient/${patient.id}`,
      category: `${DOCUMENTO_CATEGORY_SYSTEM}|${CATEGORIA_INFORME_CKM}`,
      status: 'current',
    }),
    expect.objectContaining({ cache: 'no-cache' })
  );
});

test('sin informes, devuelve la lista vacía', async () => {
  const { medplum, patient } = await paciente();
  expect(await cargarInformesCkm(medplum, patient)).toEqual([]);
});
