// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// El portal está enfocado en el Plan Bienestar · 100 días: ninguna opción ofrece la
// Segunda Opinión, y el camino de Bienvenida sigue en el consentimiento, el Cuestionario
// de ingreso y Mi salud cardiovascular (Life's Essential 8). En el Inicio, quien no
// respondió el Cuestionario de ingreso ve el aviso para completarlo.
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Patient, QuestionnaireResponse } from '@medplum/fhirtypes';
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
import { INTAKE_QUESTIONNAIRE_URL } from './intake.questionnaire';
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
                <Route path="/health-record/ingreso" element={<Marca texto="Cuestionario de ingreso" />} />
                <Route path="/health-record/cuestionarios/:slug" element={<LE8QuestionnairePage />} />
                <Route path="/health-record/cuestionarios" element={<Marca texto="Mi salud cardiovascular" />} />
                <Route path="/care-plan/plan-100-dias/mis-datos" element={<Marca texto="Tus datos de salud" />} />
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

/** El paciente ya respondió el Cuestionario de ingreso. */
async function conIngreso(medplum: MockClient): Promise<MockClient> {
  const patient = medplum.getProfile() as Patient;
  await medplum.createResource<QuestionnaireResponse>({
    resourceType: 'QuestionnaireResponse',
    status: 'completed',
    questionnaire: INTAKE_QUESTIONNAIRE_URL,
    subject: { reference: `Patient/${patient.id}` },
    authored: '2026-09-01T13:00:00.000Z',
  });
  return medplum;
}

async function firmarConsentimiento(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByLabelText(/^DNI/), { target: { value: '12345678' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Firmar y aceptar' }));
  });
}

const OFRECE_SOM = /Segunda Opinión/;

describe('aviso del Cuestionario de ingreso en el Inicio', () => {
  test('quien no lo respondió ve el aviso y va a completarlo', async () => {
    await renderEn(await paciente(), '/');
    const avisos = await screen.findAllByText('Completá tu cuestionario de ingreso');
    expect(avisos.length).toBeGreaterThan(0);
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Completar ahora' })[0]));
    expect(await screen.findByText('Cuestionario de ingreso')).toBeInTheDocument();
  });

  test('quien ya lo respondió no lo ve', async () => {
    await renderEn(await conIngreso(await paciente()), '/');
    expect(await screen.findAllByText('Ver mi Plan Bienestar')).not.toHaveLength(0);
    expect(screen.queryByText('Completá tu cuestionario de ingreso')).not.toBeInTheDocument();
  });
});

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

describe('camino de Bienvenida → consentimiento → Cuestionario de ingreso → Mi salud cardiovascular → Tus datos de salud', () => {
  test('la Bienvenida anuncia los 5 pasos del Plan Bienestar', async () => {
    await renderEn(await paciente(), '/bienvenida');
    for (const paso of [
      '1. Tus datos personales',
      '2. Tu consentimiento',
      '3. Tus antecedentes',
      '4. Tus hábitos',
      '5. Tus datos de salud',
    ]) {
      expect(screen.getByText(paso)).toBeInTheDocument();
    }
    expect(screen.getByText(/Mi salud cardiovascular: 4 cuestionarios/)).toBeInTheDocument();
    expect(screen.getByText('Plan Bienestar · 100 días')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(OFRECE_SOM);
  });

  test('la primera firma del consentimiento sigue en el Cuestionario de ingreso', async () => {
    await renderEn(await paciente(), '/health-record/consent');
    await firmarConsentimiento();
    expect(await screen.findByText('Cuestionario de ingreso')).toBeInTheDocument();
  });

  test('si ya respondió el Cuestionario de ingreso, la firma sigue en Mi salud cardiovascular', async () => {
    await renderEn(await conIngreso(await paciente()), '/health-record/consent');
    await firmarConsentimiento();
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

  test('el último cuestionario: en castellano, sin título repetido, y sigue en Tus datos de salud', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const medplum = await paciente();
    const ultimo = LE8_QUESTIONNAIRES[LE8_QUESTIONNAIRES.length - 1];
    await renderEn(medplum, `/health-record/cuestionarios/${ultimo.slug}`);
    const enviar = await screen.findByRole('button', { name: 'Enviar respuestas' });
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Tabaco y nicotina' })).toHaveLength(1);
    // La pregunta de sí/no no es obligatoria (tampoco con la copia local del cuestionario).
    expect(screen.getByRole('checkbox')).not.toBeRequired();

    await act(async () => fireEvent.click(screen.getByLabelText('Nunca fumé (ni vapeo)')));
    await act(async () => fireEvent.click(enviar));
    expect(await screen.findByText('¡Completaste Mi salud cardiovascular!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver mi tablero de 8 hábitos' })).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Siguiente: tus datos de salud/ })));
    expect(await screen.findByText('Tus datos de salud')).toBeInTheDocument();
  });
});
