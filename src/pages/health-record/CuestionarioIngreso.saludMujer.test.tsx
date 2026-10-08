// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// El ingreso con INGRESO_SALUD_MUJER prendida (hoy apagada hasta la firma médica): cómo se
// vería el grupo «Salud de la mujer» y qué se escribe al guardar. La constante se prende
// sólo en este archivo, con un mock del módulo.
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { getReferenceString } from '@medplum/core';
import type { Condition, Patient, QuestionnaireResponse } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { indexarDefinicionesFhir } from '../../fhir/__fixtures__/glp1';
import { ETAPA_MENSTRUAL, INGRESO_SALUD_MUJER_SYSTEM, INTAKE_QUESTIONNAIRE_URL } from '../intake.questionnaire';
import { CuestionarioIngreso } from './CuestionarioIngreso';

vi.mock('../intake.questionnaire', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../intake.questionnaire')>()),
  INGRESO_SALUD_MUJER: true,
}));

beforeAll(() => indexarDefinicionesFhir());

async function preparar(gender: Patient['gender']): Promise<{ medplum: MockClient; patient: Patient }> {
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Ana'], family: 'García' }],
    gender,
  });
  medplum.setProfile(patient);
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

test('a una mujer se le muestra el grupo, y la edad sólo si ya no menstrúa', async () => {
  const { medplum } = await preparar('female');
  await mostrar(medplum);

  expect(await screen.findByText('Salud de la mujer')).toBeInTheDocument();
  expect(screen.getByText('¿En qué momento estás con tu menstruación?')).toBeInTheDocument();
  expect(
    screen.getByText(
      '¿Tu familia es de origen asiático (por ejemplo de India, China, Japón, Corea o el sudeste de Asia)?'
    )
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      'Lo que declares lo revisa el equipo médico; nos sirve para sumar a tu plan los pasos que corresponden a esta etapa.'
    )
  ).toBeInTheDocument();
  expect(screen.queryByText(/¿A qué edad tuviste tu última menstruación\?/)).not.toBeInTheDocument();

  await act(async () => fireEvent.click(screen.getByLabelText('Mis ciclos cambiaron (irregulares) o tengo sofocos')));
  expect(screen.queryByText(/¿A qué edad tuviste tu última menstruación\?/)).not.toBeInTheDocument();

  await act(async () => fireEvent.click(screen.getByLabelText('Hace 12 meses o más que no menstrúo')));
  expect(screen.getByText(/¿A qué edad tuviste tu última menstruación\?/)).toBeInTheDocument();
});

test('a un hombre no se le muestra el grupo', async () => {
  const { medplum } = await preparar('male');
  await mostrar(medplum);

  expect(await screen.findByText('¿Tenés diabetes?')).toBeInTheDocument();
  expect(screen.queryByText('Salud de la mujer')).not.toBeInTheDocument();
  expect(screen.queryByText('¿En qué momento estás con tu menstruación?')).not.toBeInTheDocument();
});

test('al guardar, después de la respuesta escribe la Condition de la etapa sin confirmar', async () => {
  const { medplum, patient } = await preparar('female');
  const crear = vi.spyOn(medplum, 'createResource');
  await mostrar(medplum);

  await screen.findByText('Salud de la mujer');
  await act(async () => fireEvent.click(screen.getByLabelText('Hace 12 meses o más que no menstrúo')));
  const edad = screen.getByLabelText(/¿A qué edad tuviste tu última menstruación\?/);
  await act(async () => fireEvent.change(edad, { target: { value: '38' } }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Declaro que la información provista es completa y veraz/ }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Guardar' })));

  expect(await screen.findByText('¡Gracias por completar tu cuestionario!')).toBeInTheDocument();
  expect(crear.mock.calls.map(([r]) => r.resourceType)).toEqual(['QuestionnaireResponse', 'Condition']);

  const [respuesta] = await medplum.searchResources('QuestionnaireResponse', { subject: getReferenceString(patient) });
  const condiciones = await medplum.searchResources('Condition', { subject: getReferenceString(patient) });
  expect(condiciones).toHaveLength(1);
  const condition = condiciones[0] as Condition;
  // Menopausia antes de los 40: prematura.
  expect(condition.code?.coding?.[0]?.code).toBe('373717006');
  expect(condition.verificationStatus?.coding?.[0]?.code).toBe('unconfirmed');
  expect(condition.evidence?.[0]?.detail?.[0]?.reference).toBe(getReferenceString(respuesta as QuestionnaireResponse));
});

test('si la Condition no se puede escribir, la respuesta igual queda guardada y no se muestra un error', async () => {
  const { medplum, patient } = await preparar('female');
  const original = medplum.createResource.bind(medplum);
  vi.spyOn(medplum, 'createResource').mockImplementation(async (recurso, ...resto) => {
    if (recurso.resourceType === 'Condition') {
      throw new Error('Forbidden');
    }
    return original(recurso, ...resto);
  });
  const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  await mostrar(medplum);

  await screen.findByText('Salud de la mujer');
  await act(async () => fireEvent.click(screen.getByLabelText('Mis ciclos cambiaron (irregulares) o tengo sofocos')));
  fireEvent.click(screen.getByRole('checkbox', { name: /Declaro que la información provista es completa y veraz/ }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Guardar' })));

  expect(await screen.findByText('¡Gracias por completar tu cuestionario!')).toBeInTheDocument();
  expect(screen.queryByText('Forbidden')).not.toBeInTheDocument();
  expect(aviso).toHaveBeenCalled();
  expect(await medplum.searchResources('QuestionnaireResponse', { subject: getReferenceString(patient) })).toHaveLength(
    1
  );
  expect(await medplum.searchResources('Condition', { subject: getReferenceString(patient) })).toHaveLength(0);
  aviso.mockRestore();
});

test('al actualizar, lo declarado en el grupo vuelve precargado', async () => {
  const { medplum, patient } = await preparar('female');
  await medplum.createResource<QuestionnaireResponse>({
    resourceType: 'QuestionnaireResponse',
    status: 'completed',
    questionnaire: INTAKE_QUESTIONNAIRE_URL,
    subject: { reference: getReferenceString(patient) },
    authored: '2026-09-01T13:00:00.000Z',
    item: [
      {
        linkId: 'salud-mujer',
        item: [
          {
            linkId: 'etapa-menstrual',
            answer: [
              {
                valueCoding: {
                  system: INGRESO_SALUD_MUJER_SYSTEM,
                  code: ETAPA_MENSTRUAL.posmenopausia,
                  display: 'Hace 12 meses o más que no menstrúo',
                },
              },
            ],
          },
          { linkId: 'edad-ultima-menstruacion', answer: [{ valueInteger: 51 }] },
        ],
      },
    ],
  });
  await mostrar(medplum);

  await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Actualizar mis respuestas' })));
  expect(await screen.findByText(/Cargamos tus respuestas anteriores/)).toBeInTheDocument();
  expect(screen.getByLabelText('Hace 12 meses o más que no menstrúo')).toBeChecked();
  expect(screen.getByLabelText(/¿A qué edad tuviste tu última menstruación\?/)).toHaveValue(51);
});
