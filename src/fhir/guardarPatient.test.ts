// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Guardar el Patient sobre la versión más nueva: se relee sin caché, se guarda con If-Match,
// un 412 se reintenta una vez y un 403 avisa. La Bienvenida, por el mismo camino, no pisa lo
// que escribió el bot del equipo después del login. Pacientes sintéticas, sin nombre.
import { forbidden, OperationOutcomeError, preconditionFailed, badRequest } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { guardarPatient, TEXTO_NO_SE_PUDO_GUARDAR } from './guardarPatient';
import {
  conOnboardingCompleto,
  isOnboardingDone,
  marcarOnboardingCompleto,
  ONBOARDING_COMPLETED_EXT,
} from './onboarding';

const CKM_STAGE = 'https://seguimiento.medplum.com.ar/fhir/StructureDefinition/CKMStage';
const HGRAPH_DATA = 'https://seguimiento.medplum.com.ar/fhir/StructureDefinition/hGraphData';

/** Una paciente del login (el perfil viejo) y la misma después de que el bot escribió en ella. */
async function pacienteConBotDespuesDelLogin(): Promise<{ medplum: MockClient; delLogin: Patient }> {
  const medplum = new MockClient();
  const delLogin = await medplum.createResource<Patient>({ resourceType: 'Patient', gender: 'female' });
  await medplum.updateResource<Patient>({
    ...delLogin,
    extension: [
      { url: CKM_STAGE, valueInteger: 2 },
      { url: HGRAPH_DATA, valueString: '{"metrics":[]}' },
    ],
  });
  return { medplum, delLogin };
}

describe('guardarPatient', () => {
  test('relee sin caché, aplica sobre lo leído y guarda con If-Match de esa versión', async () => {
    const { medplum, delLogin } = await pacienteConBotDespuesDelLogin();
    const leer = vi.spyOn(medplum, 'readResource');
    const guardar = vi.spyOn(medplum, 'updateResource');

    const guardado = await guardarPatient(medplum, delLogin.id as string, (p) => ({ ...p, birthDate: '1975-05-05' }));

    expect(leer).toHaveBeenCalledWith('Patient', delLogin.id, expect.objectContaining({ cache: 'no-cache' }));
    const leido = await leer.mock.results[0].value;
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(guardar.mock.calls[0][1]).toMatchObject({ headers: { 'If-Match': `W/"${leido.meta.versionId}"` } });
    // Lo que escribió el bot después del login sigue ahí.
    expect(guardado.extension?.find((e) => e.url === CKM_STAGE)?.valueInteger).toBe(2);
    expect(guardado.extension?.find((e) => e.url === HGRAPH_DATA)).toBeDefined();
    expect(guardado.birthDate).toBe('1975-05-05');
  });

  test('un 412 relee y reintenta una vez', async () => {
    const { medplum, delLogin } = await pacienteConBotDespuesDelLogin();
    const leer = vi.spyOn(medplum, 'readResource');
    const original = medplum.updateResource.bind(medplum);
    const guardar = vi
      .spyOn(medplum, 'updateResource')
      .mockRejectedValueOnce(new OperationOutcomeError(preconditionFailed))
      .mockImplementation(original as never);

    const guardado = await guardarPatient(medplum, delLogin.id as string, (p) => ({ ...p, gender: 'other' }));

    expect(guardado.gender).toBe('other');
    expect(leer).toHaveBeenCalledTimes(2);
    expect(guardar).toHaveBeenCalledTimes(2);
  });

  test('un segundo 412 avisa sin reintentar más', async () => {
    const { medplum, delLogin } = await pacienteConBotDespuesDelLogin();
    const guardar = vi
      .spyOn(medplum, 'updateResource')
      .mockRejectedValue(new OperationOutcomeError(preconditionFailed));

    await expect(guardarPatient(medplum, delLogin.id as string, (p) => p)).rejects.toThrow(TEXTO_NO_SE_PUDO_GUARDAR);
    expect(guardar).toHaveBeenCalledTimes(2);
  });

  test('un 403 avisa con el mismo texto, sin reintentar', async () => {
    const { medplum, delLogin } = await pacienteConBotDespuesDelLogin();
    const guardar = vi.spyOn(medplum, 'updateResource').mockRejectedValue(new OperationOutcomeError(forbidden));

    await expect(guardarPatient(medplum, delLogin.id as string, (p) => p)).rejects.toThrow(TEXTO_NO_SE_PUDO_GUARDAR);
    expect(guardar).toHaveBeenCalledTimes(1);
  });

  test('otro error sube tal cual', async () => {
    const { medplum, delLogin } = await pacienteConBotDespuesDelLogin();
    vi.spyOn(medplum, 'updateResource').mockRejectedValue(new OperationOutcomeError(badRequest('Dato inválido')));

    await expect(guardarPatient(medplum, delLogin.id as string, (p) => p)).rejects.toThrow('Dato inválido');
  });
});

describe('la Bienvenida', () => {
  test('agrega onboarding-completed sin tocar CKMStage ni hGraphData', async () => {
    const { medplum, delLogin } = await pacienteConBotDespuesDelLogin();
    const guardar = vi.spyOn(medplum, 'updateResource');

    const guardado = await marcarOnboardingCompleto(medplum, delLogin.id as string, (p) => ({
      ...p,
      birthDate: '1972-03-01',
    }));

    expect(isOnboardingDone(guardado)).toBe(true);
    expect(guardado.birthDate).toBe('1972-03-01');
    expect(guardado.extension?.find((e) => e.url === CKM_STAGE)?.valueInteger).toBe(2);
    expect(guardado.extension?.find((e) => e.url === HGRAPH_DATA)?.valueString).toBe('{"metrics":[]}');
    expect(guardar.mock.calls[0][1]).toMatchObject({ headers: { 'If-Match': expect.stringMatching(/^W\/"/) } });
  });

  test('conOnboardingCompleto reemplaza la marca anterior y deja las demás extensiones', () => {
    const p: Patient = {
      resourceType: 'Patient',
      extension: [
        { url: ONBOARDING_COMPLETED_EXT, valueDateTime: '2026-01-01T00:00:00.000Z' },
        { url: CKM_STAGE, valueInteger: 3 },
      ],
    };
    const r = conOnboardingCompleto(p, new Date('2026-10-23T12:00:00.000Z'));
    expect(r.extension).toEqual([
      { url: CKM_STAGE, valueInteger: 3 },
      { url: ONBOARDING_COMPLETED_EXT, valueDateTime: '2026-10-23T12:00:00.000Z' },
    ]);
  });
});
