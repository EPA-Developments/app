// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import type { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MENSAJE_SIN_CONSENTIMIENTO, crearSolicitudSOM } from './som';

test('crearSolicitudSOM no envía nada si el paciente no firmó el consentimiento', async () => {
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({ resourceType: 'Patient', name: [{ family: 'Test' }] });
  const createSpy = vi.spyOn(medplum, 'createResource');
  const executeSpy = vi.spyOn(medplum, 'executeBot');

  const r = await crearSolicitudSOM(medplum, patient, { motivo: 'Control', origin: 'self' }, []);

  expect(r).toEqual({ ok: false, mensaje: MENSAJE_SIN_CONSENTIMIENTO });
  expect(createSpy).not.toHaveBeenCalled();
  expect(executeSpy).not.toHaveBeenCalled();
});
