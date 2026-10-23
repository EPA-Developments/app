// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { forbidden, OperationOutcomeError } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { indexarDefinicionesFhir } from '../../fhir/__fixtures__/glp1';
import { TEXTO_NO_SE_PUDO_GUARDAR } from '../../fhir/guardarPatient';
import { Profile } from './Profile';

beforeAll(() => {
  // jsdom no implementa scroll; Mis datos vuelve arriba al guardar.
  window.scrollTo = vi.fn();
});

beforeEach(() => {
  // Las notificaciones de Mantine viven en un store global: cada test ve sólo las suyas.
  notifications.clean();
});

async function renderMisDatos(telecom: Patient['telecom']): Promise<{ medplum: MockClient; patient: Patient }> {
  indexarDefinicionesFhir();
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Ana'], family: 'García' }],
    telecom,
  });
  medplum.setProfile(patient);
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Profile />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
  return { medplum, patient };
}

function guardarContacto(): void {
  const boton = screen.getAllByRole('button', { name: 'Guardar' })[1];
  fireEvent.click(boton);
}

test('Mis datos muestra el WhatsApp de la Bienvenida y lo guarda normalizado a +549, sin pisar el email', async () => {
  const { medplum, patient } = await renderMisDatos([
    { system: 'email', value: 'ana@example.com' },
    { system: 'phone', use: 'mobile', value: '+5491155551234' },
  ]);
  const campo = screen.getByLabelText(/Celular \(WhatsApp\)/);
  expect(campo).toHaveValue('+5491155551234');

  fireEvent.change(campo, { target: { value: '+54 9 11 6931-5830' } });
  await act(async () => {
    guardarContacto();
  });
  expect(await screen.findByText('Perfil actualizado')).toBeInTheDocument();
  const guardado = await medplum.readResource('Patient', patient.id as string, { cache: 'no-cache' });
  expect(guardado.telecom).toEqual([
    { system: 'email', value: 'ana@example.com' },
    { system: 'phone', use: 'mobile', value: '+5491169315830' },
  ]);
  // El campo muestra el número como quedó guardado.
  expect(screen.getByLabelText(/Celular \(WhatsApp\)/)).toHaveValue('+5491169315830');
});

test('Mis datos no guarda un WhatsApp inválido', async () => {
  const { medplum, patient } = await renderMisDatos([{ system: 'phone', use: 'mobile', value: '+5491155551234' }]);
  fireEvent.change(screen.getByLabelText(/Celular \(WhatsApp\)/), { target: { value: '1234' } });
  await act(async () => {
    guardarContacto();
  });
  expect(await screen.findByText('Revisá tu celular (WhatsApp)')).toBeInTheDocument();
  const guardado = await medplum.readResource('Patient', patient.id as string, { cache: 'no-cache' });
  expect(guardado.telecom?.[0]?.value).toBe('+5491155551234');
});

const CKM_STAGE = 'https://seguimiento.medplum.com.ar/fhir/StructureDefinition/CKMStage';

test('si el bot del equipo escribió el Patient después del login, guardar no lo pisa', async () => {
  const { medplum, patient } = await renderMisDatos([{ system: 'phone', use: 'mobile', value: '+5491155551234' }]);
  // ckm-recalculate escribe el estadío en el Patient; el perfil del login no lo tiene.
  await medplum.updateResource<Patient>({ ...patient, extension: [{ url: CKM_STAGE, valueInteger: 2 }] });
  const guardar = vi.spyOn(medplum, 'updateResource');

  fireEvent.change(screen.getByLabelText(/Celular \(WhatsApp\)/), { target: { value: '+54 9 11 6931-5830' } });
  await act(async () => {
    guardarContacto();
  });
  expect(await screen.findByText('Perfil actualizado')).toBeInTheDocument();

  const guardado = await medplum.readResource('Patient', patient.id as string, { cache: 'no-cache' });
  expect(guardado.extension).toEqual([{ url: CKM_STAGE, valueInteger: 2 }]);
  expect(guardado.telecom?.[0]?.value).toBe('+5491169315830');
  expect(guardar.mock.calls[0][1]).toMatchObject({ headers: { 'If-Match': expect.stringMatching(/^W\/"/) } });
});

test('si no se puede guardar, lo dice y no pierde lo que cargó', async () => {
  const { medplum } = await renderMisDatos([{ system: 'phone', use: 'mobile', value: '+5491155551234' }]);
  vi.spyOn(medplum, 'updateResource').mockRejectedValue(new OperationOutcomeError(forbidden));

  fireEvent.change(screen.getByLabelText(/Celular \(WhatsApp\)/), { target: { value: '+54 9 11 6931-5830' } });
  await act(async () => {
    guardarContacto();
  });
  expect(await screen.findByText(TEXTO_NO_SE_PUDO_GUARDAR)).toBeInTheDocument();
  expect(screen.getByLabelText(/Celular \(WhatsApp\)/)).toHaveValue('+54 9 11 6931-5830');
});
