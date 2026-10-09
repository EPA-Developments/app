// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { App } from './App';
import { indexarDefinicionesFhir } from './fhir/__fixtures__/glp1';
import { ONBOARDING_COMPLETED_EXT } from './fhir/onboarding';

test('App renders', async () => {
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={new MockClient()}>
          <MantineProvider theme={{}}>
            <App />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
});

describe('un link del portal pasa por el ingreso y vuelve a su página', () => {
  const RUTA = '/health-record/consent/teleconsulta';

  function Ubicacion(): JSX.Element {
    const { pathname, search } = useLocation();
    return <div data-testid="ubicacion">{`${pathname}${search}`}</div>;
  }

  async function renderApp(medplum: MockClient, ruta: string): Promise<void> {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={[ruta]}>
          <MedplumProvider medplum={medplum}>
            <MantineProvider theme={{}}>
              <App />
              <Ubicacion />
            </MantineProvider>
          </MedplumProvider>
        </MemoryRouter>
      );
    });
  }

  test('sin sesión, va al ingreso con el destino en `next`', async () => {
    await renderApp(new MockClient({ profile: null }), RUTA);
    expect(await screen.findByRole('heading', { name: /^Iniciar sesión en / })).toBeInTheDocument();
    expect(screen.getByTestId('ubicacion').textContent).toBe('/signin?next=%2Fhealth-record%2Fconsent%2Fteleconsulta');
  });

  test('con sesión, `/signin?next=…` sigue al destino', async () => {
    indexarDefinicionesFhir();
    const medplum = new MockClient();
    const patient = await medplum.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Ana'], family: 'García' }],
      extension: [{ url: ONBOARDING_COMPLETED_EXT, valueDateTime: '2026-09-01T12:00:00.000Z' }],
    });
    medplum.setProfile(patient);
    await renderApp(medplum, `/signin?next=${encodeURIComponent(RUTA)}`);
    expect(await screen.findByRole('heading', { name: 'Consentimiento de teleconsulta', level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId('ubicacion').textContent).toBe(RUTA);
  });
});
