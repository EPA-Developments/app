// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// El camino del Plan Bienestar · 100 días: la Bienvenida sigue en el consentimiento, el
// Cuestionario de ingreso y Mi salud cardiovascular (Life's Essential 8), y el menú inferior y
// la guía CKM no ofrecen la Segunda Opinión. En el Inicio (la Home D, «Salidas y llegadas»,
// para quien no ve la E), el Cuestionario de ingreso es el próximo paso de la puerta para
// quien ya firmó el consentimiento y todavía no lo respondió.
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { DocumentReference, Patient, QuestionnaireResponse } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import type { JSX } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { BottomNav } from '../components/BottomNav';
import { CONSENT_TYPE_CODE, CONSENT_TYPE_SYSTEM, CONSENT_VERSION_SYSTEM } from '../fhir/consentimiento';
import { indexarDefinicionesFhir } from '../fhir/__fixtures__/glp1';
import { LE8_QUESTIONNAIRES } from '../le8';
import { CkmEducacion } from './ckm/CkmEducacion';
import { InformedConsent } from './health-record/InformedConsent';
import { VERSION_CONSENTIMIENTO } from './health-record/InformedConsent.data';
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

/** El paciente ya firmó la versión vigente del consentimiento. */
async function conConsentimiento(medplum: MockClient): Promise<MockClient> {
  const patient = medplum.getProfile() as Patient;
  await medplum.createResource<DocumentReference>({
    resourceType: 'DocumentReference',
    status: 'current',
    type: { coding: [{ system: CONSENT_TYPE_SYSTEM, code: CONSENT_TYPE_CODE }] },
    subject: { reference: `Patient/${patient.id}` },
    date: '2026-08-08T15:00:00.000Z',
    identifier: [{ system: CONSENT_VERSION_SYSTEM, value: VERSION_CONSENTIMIENTO }],
    content: [{ attachment: { contentType: 'text/plain', data: 'ZmlybWFkbw==' } }],
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
const ESPERA = { timeout: 10000 };

describe('el Cuestionario de ingreso como próximo paso del Inicio', () => {
  test('quien firmó el consentimiento y no lo respondió lo tiene en la puerta y va a completarlo', async () => {
    await renderEn(await conConsentimiento(await paciente()), '/');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ana, contanos tus antecedentes.' }, ESPERA)
    ).toBeInTheDocument();
    const completar = screen.getAllByRole('link', { name: 'Completar ahora' })[0];
    expect(completar).toHaveAttribute('href', '/health-record/ingreso');
    await act(async () => fireEvent.click(completar));
    expect(await screen.findByText('Cuestionario de ingreso')).toBeInTheDocument();
  });

  test('quien ya lo respondió no lo ve', async () => {
    await renderEn(await conIngreso(await conConsentimiento(await paciente())), '/');
    const titulo = await screen.findByRole('heading', { level: 1, name: /^Ana, / }, ESPERA);
    expect(titulo).not.toHaveTextContent('contanos tus antecedentes');
    expect(screen.queryByRole('link', { name: 'Completar ahora' })).not.toBeInTheDocument();
  });
});

// El Inicio ya no entra acá: desde la Home D (y la E), el camino 2 es pedir la Segunda Opinión
// (decisión del negocio, src/pages/inicio/caminos.ts). El menú inferior y la guía CKM no cambian.
describe('ninguna opción ofrece la Segunda Opinión', () => {
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
