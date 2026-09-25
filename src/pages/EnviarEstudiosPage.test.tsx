// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { AppShell, MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { DocumentReference, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { vi } from 'vitest';
import { BottomNav } from '../components/BottomNav';
import { Header } from '../components/Header';
import { indexarDefinicionesFhir } from '../fhir/__fixtures__/glp1';
import { CONSENT_TYPE_CODE, CONSENT_TYPE_SYSTEM } from '../fhir/consentimiento';
import { cargarEstudiosEnviados } from '../fhir/estudios';
import { EnviarEstudiosPage } from './EnviarEstudiosPage';

function Marca({ texto }: { texto: string }): JSX.Element {
  return <div>{texto}</div>;
}

async function paciente(firmoConsentimiento = true): Promise<{ medplum: MockClient; patient: Patient }> {
  indexarDefinicionesFhir();
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Ana'], family: 'García' }],
  });
  medplum.setProfile(patient);
  if (firmoConsentimiento) {
    await medplum.createResource<DocumentReference>({
      resourceType: 'DocumentReference',
      status: 'current',
      type: { coding: [{ system: CONSENT_TYPE_SYSTEM, code: CONSENT_TYPE_CODE }] },
      subject: { reference: `Patient/${patient.id}` },
      date: new Date().toISOString(),
      content: [{ attachment: { contentType: 'text/plain', data: 'ZmlybWFkbw==' } }],
    });
  }
  return { medplum, patient };
}

async function renderEn(medplum: MockClient, ruta: string): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[ruta]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <AppShell header={{ height: 60 }}>
              <Header />
              <Routes>
                <Route path="/" element={<Marca texto="inicio" />} />
                <Route path="/enviar-estudios" element={<EnviarEstudiosPage />} />
                <Route path="/health-record/consent" element={<Marca texto="pantalla de consentimiento" />} />
                <Route path="/health-record/biomarkers" element={<Marca texto="pantalla de biomarcadores" />} />
              </Routes>
              <BottomNav />
            </AppShell>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

function elegirArchivo(file: File): void {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

function pdf(nombre: string): File {
  return new File([new TextEncoder().encode('%PDF-1.7\n%resultado')], nombre, { type: 'application/pdf' });
}

// Hay dos "+": el central del menú inferior (smartphone) y el del Header (web). Abren
// la misma hoja de opciones.
test.each([
  ['smartphone', 1],
  ['web', 0],
])('el "+" ofrece "Enviar estudios en PDF" (%s)', async (_, indice) => {
  const { medplum } = await paciente();
  await renderEn(medplum, '/');
  const botones = screen.getAllByRole('button', { name: 'Acciones rápidas' });
  expect(botones).toHaveLength(2);
  await act(async () => fireEvent.click(botones[indice]));
  expect(await screen.findByText('¿Qué querés hacer?')).toBeInTheDocument();
  expect(screen.getByText('Cargar resultado')).toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByText('Enviar estudios en PDF')));
  expect(await screen.findByText(/Subí el informe de tu laboratorio/)).toBeInTheDocument();
});

test('sin consentimiento informado, pide firmarlo antes de subir nada', async () => {
  const { medplum } = await paciente(false);
  await renderEn(medplum, '/enviar-estudios');
  expect(await screen.findByText('Falta tu consentimiento informado')).toBeInTheDocument();
  expect(document.querySelector('input[type="file"]')).toBeNull();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Firmar el consentimiento' })));
  expect(await screen.findByText('pantalla de consentimiento')).toBeInTheDocument();
});

test('sube el PDF solo con la autorización tildada y lo lista como enviado', async () => {
  const { medplum, patient } = await paciente();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  await renderEn(medplum, '/enviar-estudios');

  const enviar = await screen.findByRole('button', { name: 'Enviar PDF' });
  expect(enviar).toBeDisabled();
  await act(async () => elegirArchivo(pdf('perfil-lipidico.pdf')));
  expect(enviar).toBeDisabled();
  await act(async () => fireEvent.click(screen.getByRole('checkbox')));
  expect(enviar).toBeEnabled();

  await act(async () => fireEvent.click(enviar));
  expect(await screen.findByText('¡Recibimos tu estudio!')).toBeInTheDocument();
  expect(await screen.findByText('perfil-lipidico.pdf')).toBeInTheDocument();
  expect(screen.getByText('En proceso')).toBeInTheDocument();

  const enviados = await cargarEstudiosEnviados(medplum, patient);
  expect(enviados).toHaveLength(1);
  expect(await medplum.searchResources('Consent', `patient=Patient/${patient.id}`)).toHaveLength(1);

  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Ver mis biomarcadores' })));
  expect(await screen.findByText('pantalla de biomarcadores')).toBeInTheDocument();
});

test('si el archivo no es un PDF, avisa y no crea el documento', async () => {
  const { medplum, patient } = await paciente();
  await renderEn(medplum, '/enviar-estudios');
  await act(async () => elegirArchivo(new File(['hola'], 'foto.pdf', { type: 'application/pdf' })));
  const autorizo = await screen.findByRole('checkbox');
  await act(async () => fireEvent.click(autorizo));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Enviar PDF' })));
  expect(await screen.findByText(/no es un PDF/)).toBeInTheDocument();
  expect(await cargarEstudiosEnviados(medplum, patient)).toHaveLength(0);
});

test('un estudio ya procesado lleva a sus resultados', async () => {
  const { medplum, patient } = await paciente();
  await medplum.createResource<DocumentReference>({
    resourceType: 'DocumentReference',
    status: 'current',
    type: { coding: [{ system: 'http://loinc.org', code: '11502-2' }] },
    category: [
      {
        coding: [
          { system: 'https://segundaopinionmedica.org/fhir/CodeSystem/documento', code: 'resultado-laboratorio' },
        ],
      },
    ],
    subject: { reference: `Patient/${patient.id}` },
    date: new Date().toISOString(),
    context: { related: [{ reference: 'DiagnosticReport/dr1' }] },
    content: [{ attachment: { contentType: 'application/pdf', title: 'hemograma.pdf', url: 'Binary/b1' } }],
  });
  await renderEn(medplum, '/enviar-estudios');
  expect(await screen.findByText('hemograma.pdf')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ver resultados' })).toBeInTheDocument();
});
