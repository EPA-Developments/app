// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Patient, QuestionnaireResponse } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { indexarDefinicionesFhir } from '../../fhir/__fixtures__/glp1';
import { INTAKE_QUESTIONNAIRE_URL } from '../intake.questionnaire';
import { CuestionarioIngreso } from './CuestionarioIngreso';

beforeAll(() => indexarDefinicionesFhir());

async function preparar(
  conRespuesta: boolean,
  datos: Partial<Patient> = { gender: 'female' }
): Promise<{ medplum: MockClient; patient: Patient }> {
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Ana'], family: 'García' }],
    ...datos,
  });
  medplum.setProfile(patient);
  if (conRespuesta) {
    await medplum.createResource<QuestionnaireResponse>({
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      questionnaire: INTAKE_QUESTIONNAIRE_URL,
      subject: { reference: `Patient/${patient.id}` },
      authored: '2026-09-01T13:00:00.000Z',
      item: [
        {
          linkId: 'factores-riesgo',
          item: [{ linkId: 'fr-diabetes', answer: [{ valueBoolean: true }] }],
        },
      ],
    });
  }
  return { medplum, patient };
}

async function mostrar(medplum: MockClient): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <CuestionarioIngreso />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

test('sin completar: muestra el formulario, sin superposiciones', async () => {
  const { medplum } = await preparar(false);
  await mostrar(medplum);
  expect(await screen.findByText('¿Tenés diabetes?')).toBeInTheDocument();
  expect(screen.queryByText(/Lo completaste el/)).not.toBeInTheDocument();
  // La hipertensión va solo en Antecedentes médicos; el contacto de emergencia, en Mi perfil.
  expect(screen.queryByText('¿Tenés hipertensión arterial?')).not.toBeInTheDocument();
  expect(screen.queryByText(/Contacto de emergencia \(nombre y teléfono\)/)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Mi perfil' })).toHaveAttribute('href', '/account/profile');
  // Mujer: se le pregunta por embarazo.
  expect(screen.getByText('¿Estás o podrías estar embarazada?')).toBeInTheDocument();
});

test('a un hombre no se le pregunta por embarazo', async () => {
  const { medplum } = await preparar(false, { gender: 'male' });
  await mostrar(medplum);
  expect(await screen.findByText('¿Tenés diabetes?')).toBeInTheDocument();
  expect(screen.queryByText('¿Estás o podrías estar embarazada?')).not.toBeInTheDocument();
  expect(screen.queryByText('Otros datos')).not.toBeInTheDocument();
});

test('con el contacto de emergencia cargado en Mi perfil, no se sugiere', async () => {
  const { medplum } = await preparar(false, {
    gender: 'female',
    contact: [
      {
        relationship: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0131', code: 'C' }] }],
        name: { given: ['Luis'] },
        telecom: [{ system: 'phone', value: '+5491155551234' }],
      },
    ],
  });
  await mostrar(medplum);
  expect(await screen.findByText('¿Tenés diabetes?')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Mi perfil' })).not.toBeInTheDocument();
});

test('completado: dice cuándo, deja ver las respuestas y actualizarlas con lo anterior precargado', async () => {
  const { medplum } = await preparar(true);
  await mostrar(medplum);

  expect(await screen.findByText(/Lo completaste el/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Ver mis respuestas' }).getAttribute('href')).toMatch(
    /^\/health-record\/questionnaire-responses\/.+/
  );
  expect(screen.getByRole('link', { name: 'Historial de cuestionarios' })).toHaveAttribute(
    'href',
    '/health-record/questionnaire-responses'
  );

  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Actualizar mis respuestas' })));
  expect(await screen.findByText(/Cargamos tus respuestas anteriores/)).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: '¿Tenés diabetes?' })).toBeChecked();
});

test('al guardar crea la respuesta del paciente y sigue con Mi salud cardiovascular', async () => {
  const { medplum, patient } = await preparar(false);
  const crear = vi.spyOn(medplum, 'createResource');
  await mostrar(medplum);

  await screen.findByText('¿Tenés diabetes?');
  fireEvent.click(screen.getByRole('checkbox', { name: '¿Tenés diabetes?' }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Declaro que la información provista es completa y veraz/ }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Guardar' })));

  expect(crear).toHaveBeenCalledWith(
    expect.objectContaining({
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      subject: expect.objectContaining({ reference: `Patient/${patient.id}` }),
    })
  );
  expect(await screen.findByText('¡Gracias por completar tu cuestionario!')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Seguí con Mi salud cardiovascular/ })).toHaveAttribute(
    'href',
    '/health-record/cuestionarios'
  );
});
