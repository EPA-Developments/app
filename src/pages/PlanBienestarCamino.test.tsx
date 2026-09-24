// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// El portal está enfocado en el Plan Bienestar · 100 días: ninguna opción ofrece la
// Segunda Opinión, y el camino de Bienvenida sigue en el consentimiento y en
// Mi salud cardiovascular (Life's Essential 8).
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import type { JSX } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { BottomNav } from '../components/BottomNav';
import { indexarDefinicionesFhir } from '../fhir/__fixtures__/glp1';
import { LE8_QUESTIONNAIRES } from '../le8';
import { CkmEducacion } from './ckm/CkmEducacion';
import { InformedConsent } from './health-record/InformedConsent';
import { HomePage } from './HomePage';
import { LE8QuestionnairePage } from './LE8QuestionnairePage';
import { Welcome } from './Welcome';

function Marca({ texto }: { texto: string }): JSX.Element {
  return <div>{texto}</div>;
}

async function renderEn(medplum: MockClient, ruta: string): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[ruta]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Suspense fallback={<div>cargando</div>}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/nav" element={<BottomNav />} />
                <Route path="/bienvenida" element={<Welcome />} />
                <Route path="/ckm" element={<CkmEducacion />} />
                <Route path="/health-record/consent" element={<InformedConsent />} />
                <Route path="/health-record/cuestionarios/:slug" element={<LE8QuestionnairePage />} />
                <Route path="/health-record/cuestionarios" element={<Marca texto="Mi salud cardiovascular" />} />
              </Routes>
            </Suspense>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

async function paciente(): Promise<MockClient> {
  indexarDefinicionesFhir();
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Ana'], family: 'García' }],
    birthDate: '1972-05-10',
  });
  medplum.setProfile(patient);
  return medplum;
}

const OFRECE_SOM = /Segunda Opinión/;

describe('ninguna opción ofrece la Segunda Opinión', () => {
  test('Inicio lleva al Plan Bienestar y a Mi salud cardiovascular', async () => {
    await renderEn(await paciente(), '/');
    expect(screen.getAllByText('Ver mi Plan Bienestar').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mi salud cardiovascular').length).toBeGreaterThan(0);
    expect(document.body).not.toHaveTextContent(OFRECE_SOM);
  });

  test('las acciones rápidas del menú inferior', async () => {
    await renderEn(await paciente(), '/nav');
    fireEvent.click(screen.getByLabelText('Acciones rápidas'));
    expect(await screen.findByText('Mi Plan Bienestar')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(OFRECE_SOM);
  });

  test('la guía CKM lleva al Plan Bienestar', async () => {
    await renderEn(await paciente(), '/ckm');
    expect(screen.getByText('Ir a mi Plan Bienestar')).toBeInTheDocument();
    expect(screen.queryByText(/Pedir.*Segunda Opinión/)).not.toBeInTheDocument();
  });
});

describe('camino de Bienvenida → consentimiento → Mi salud cardiovascular', () => {
  test('la Bienvenida anuncia Mi salud cardiovascular como tercer paso', async () => {
    await renderEn(await paciente(), '/bienvenida');
    expect(screen.getByText('3. Completá Mi salud cardiovascular')).toBeInTheDocument();
    expect(screen.getByText('Plan Bienestar · 100 días')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(OFRECE_SOM);
  });

  test('la primera firma del consentimiento sigue en Mi salud cardiovascular', async () => {
    await renderEn(await paciente(), '/health-record/consent');
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText(/^DNI/), { target: { value: '12345678' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Firmar y aceptar' }));
    });
    expect(await screen.findByText('Mi salud cardiovascular')).toBeInTheDocument();
  });

  test('los cuestionarios LE8 muestran en qué paso estás', async () => {
    const medplum = await paciente();
    const ultimo = LE8_QUESTIONNAIRES[LE8_QUESTIONNAIRES.length - 1];
    await renderEn(medplum, `/health-record/cuestionarios/${ultimo.slug}`);
    expect(
      await screen.findByText(`Mi salud cardiovascular · ${LE8_QUESTIONNAIRES.length} de ${LE8_QUESTIONNAIRES.length}`)
    ).toBeInTheDocument();
  });
});
