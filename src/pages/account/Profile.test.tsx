// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { indexarDefinicionesFhir } from '../../fhir/__fixtures__/glp1';
import { Profile } from './Profile';

beforeAll(() => {
  // jsdom no implementa scroll; Mis datos vuelve arriba al guardar.
  window.scrollTo = vi.fn();
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

test('Mis datos muestra el WhatsApp que se cargó en la Bienvenida y lo actualiza sin pisar el email', async () => {
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
    { system: 'phone', use: 'mobile', value: '+54 9 11 6931-5830' },
  ]);
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
