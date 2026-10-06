// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { DiagnosticReport, DocumentReference, Observation, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { indexarDefinicionesFhir } from '../../fhir/__fixtures__/glp1';
import { CONSENT_TYPE_CODE, CONSENT_TYPE_SYSTEM } from '../../fhir/consentimiento';
import { CATEGORIA_LABORATORIO, DOCUMENTO_CATEGORY_SYSTEM } from '../../fhir/estudios';
import { DatosDeSalud } from './DatosDeSalud';

beforeEach(() => {
  // jsdom no implementa el scroll.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function Marca({ texto }: { texto: string }): JSX.Element {
  return <div>{texto}</div>;
}

async function paciente(): Promise<{ medplum: MockClient; patient: Patient }> {
  indexarDefinicionesFhir();
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Ana'], family: 'Prueba' }],
    gender: 'female',
    birthDate: '1976-03-10',
  });
  // El consentimiento informado (paso 2) ya está firmado.
  await medplum.createResource<DocumentReference>({
    resourceType: 'DocumentReference',
    status: 'current',
    type: { coding: [{ system: CONSENT_TYPE_SYSTEM, code: CONSENT_TYPE_CODE }] },
    subject: { reference: `Patient/${patient.id}` },
    date: new Date().toISOString(),
    content: [{ attachment: { contentType: 'text/plain', data: 'ZmlybWFkbw==' } }],
  });
  medplum.setProfile(patient);
  return { medplum, patient };
}

async function renderPaso(medplum: MockClient): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/care-plan/plan-100-dias/mis-datos']}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/care-plan/plan-100-dias/mis-datos" element={<DatosDeSalud />} />
              <Route path="/care-plan/plan-100-dias/tablero" element={<Marca texto="tablero de 8 hábitos" />} />
              <Route path="/care-plan/plan-100-dias" element={<Marca texto="mi plan" />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

const escribir = async (label: string | RegExp, valor: string): Promise<void> => {
  await act(async () => fireEvent.change(screen.getByLabelText(label), { target: { value: valor } }));
};
const guardar = async (): Promise<void> => {
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Guardar' })));
};
const guardadas = async (medplum: MockClient, patient: Patient): Promise<Observation[]> =>
  medplum.searchResources('Observation', { subject: `Patient/${patient.id}`, _count: '100' });
const codigo = (o: Observation) => o.code?.coding?.[0]?.code;

function pdf(nombre = 'laboratorio.pdf'): File {
  const contenido = new Uint8Array(64);
  contenido.set(new TextEncoder().encode('%PDF-1.7\n'));
  return new File([contenido], nombre, { type: 'application/pdf' });
}

test('paso 5 de 5: lo de casa con un solo Guardar, y el cierre del Plan Bienestar', async () => {
  const { medplum, patient } = await paciente();
  await renderPaso(medplum);

  expect(screen.getByText('Plan Bienestar · paso 5 de 5')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Tus datos de salud' })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Guardar' })).toHaveLength(1);

  await escribir('Peso', '68');
  await escribir('Altura', '162');
  await escribir('Máxima (sistólica)', '124');
  await escribir('Mínima (diastólica)', '78');
  expect(screen.getByText(/Índice de masa corporal: 25,9/)).toBeInTheDocument();
  await guardar();

  expect(await screen.findByRole('heading', { name: 'Tu Plan Bienestar está listo' })).toBeInTheDocument();
  expect(screen.getByText(/Guardamos 4 datos/)).toBeInTheDocument();
  const obs = await guardadas(medplum, patient);
  expect(obs.map(codigo).sort()).toEqual(['29463-7', '39156-5', '8302-2', '85354-9']);

  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Ver mi tablero de 8 hábitos' })));
  expect(await screen.findByText('tablero de 8 hábitos')).toBeInTheDocument();
});

test('sin datos ni PDF no guarda; los errores se marcan en el campo', async () => {
  const { medplum, patient } = await paciente();
  await renderPaso(medplum);
  await guardar();
  expect(screen.getByText('Cargá al menos un dato o subí el PDF de tu laboratorio.')).toBeInTheDocument();

  await escribir('Altura', '1,62');
  await guardar();
  expect(screen.getByText('La altura va en centímetros (p. ej. 162).')).toBeInTheDocument();
  expect(await guardadas(medplum, patient)).toHaveLength(0);
});

test('laboratorio a mano: colesterol, creatinina, y el no-HDL y el eGFR calculados', async () => {
  const { medplum, patient } = await paciente();
  await renderPaso(medplum);
  await act(async () => fireEvent.click(screen.getByText('Prefiero cargarlo a mano')));
  await escribir('Fecha del laboratorio', '2026-09-18');
  await escribir('Colesterol total', '210');
  await escribir('Colesterol HDL', '55');
  await escribir('Creatinina', '0,8');
  await guardar();

  expect(await screen.findByText(/Guardamos 5 datos/)).toBeInTheDocument();
  const obs = await guardadas(medplum, patient);
  expect(obs.map(codigo).sort()).toEqual(['2085-9', '2093-3', '2160-0', '43396-1', '62238-1']);
  const egfr = obs.find((o) => codigo(o) === '62238-1');
  expect(egfr?.valueQuantity?.value).toBe(90);
  expect(egfr?.effectiveDateTime).toBe('2026-09-18');
});

test('el PDF del laboratorio: pide la autorización y se envía con el mismo Guardar', async () => {
  const { medplum, patient } = await paciente();
  await renderPaso(medplum);
  const archivo = document.querySelector('input[type="file"]') as HTMLInputElement;
  await act(async () => fireEvent.change(archivo, { target: { files: [pdf('Stamboulian.pdf')] } }));
  await guardar();
  expect(await screen.findByText('Marcá la autorización para que podamos leer tu PDF.')).toBeInTheDocument();

  await act(async () => fireEvent.click(screen.getByRole('checkbox', { name: /Autorizo/ })));
  await guardar();
  expect(await screen.findByRole('heading', { name: 'Tu Plan Bienestar está listo' })).toBeInTheDocument();
  expect(screen.getByText(/Recibimos tu laboratorio/)).toBeInTheDocument();
  const enviados = await medplum.searchResources('DocumentReference', {
    subject: `Patient/${patient.id}`,
    category: `${DOCUMENTO_CATEGORY_SYSTEM}|${CATEGORIA_LABORATORIO}`,
  });
  expect(enviados.map((d) => d.content?.[0]?.attachment?.title)).toEqual(['Stamboulian.pdf']);
});

test('si ya mandó su laboratorio, lo muestra hecho; y el último peso como referencia', async () => {
  const { medplum, patient } = await paciente();
  const informe = await medplum.createResource<DiagnosticReport>({
    resourceType: 'DiagnosticReport',
    status: 'final',
    code: { coding: [{ system: 'http://loinc.org', code: '11502-2' }] },
    subject: { reference: `Patient/${patient.id}` },
    effectiveDateTime: '2026-09-18',
    result: [{ reference: 'Observation/a' }, { reference: 'Observation/b' }],
  });
  await medplum.createResource<DocumentReference>({
    resourceType: 'DocumentReference',
    status: 'current',
    date: '2026-09-24T23:32:58Z',
    category: [{ coding: [{ system: DOCUMENTO_CATEGORY_SYSTEM, code: CATEGORIA_LABORATORIO }] }],
    subject: { reference: `Patient/${patient.id}` },
    content: [{ attachment: { contentType: 'application/pdf', url: 'Binary/b1', title: 'lab.pdf' } }],
    context: { related: [{ reference: `DiagnosticReport/${informe.id}` }] },
  });
  await medplum.createResource<Observation>({
    resourceType: 'Observation',
    status: 'final',
    code: { coding: [{ system: 'http://loinc.org', code: '29463-7' }] },
    subject: { reference: `Patient/${patient.id}` },
    effectiveDateTime: '2026-09-20',
    valueQuantity: { value: 69, unit: 'kg' },
  });
  await renderPaso(medplum);
  expect(await screen.findByText(/Ya tenemos tu laboratorio del 18\/09\/2026 \(2 valores\)/)).toBeInTheDocument();
  expect(screen.getByText('¿Tenés uno más nuevo? Subilo y lo leemos por vos.')).toBeInTheDocument();
  expect(await screen.findByText('Último: 69 kg (20/09/2026)')).toBeInTheDocument();
});

test('"Lo completo después" vuelve al plan sin guardar nada', async () => {
  const { medplum } = await paciente();
  await renderPaso(medplum);
  await act(async () => fireEvent.click(screen.getByText('Lo completo después')));
  expect(await screen.findByText('mi plan')).toBeInTheDocument();
});
