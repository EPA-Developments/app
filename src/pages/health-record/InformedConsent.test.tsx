// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import type { DocumentReference, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AvisoConsentimiento } from '../../components/AvisoConsentimiento';
import { indexarDefinicionesFhir } from '../../fhir/__fixtures__/glp1';
import {
  CONSENT_TYPE_CODE,
  CONSENT_TYPE_SYSTEM,
  CONSENT_VERSION_SYSTEM,
  buscarConsentimiento,
  consentimientoAlDia,
  versionFirmada,
} from '../../fhir/consentimiento';
import { InformedConsent } from './InformedConsent';
import { NOVEDADES_VERSION, VERSION_CONSENTIMIENTO } from './InformedConsent.data';

// Las notificaciones de Mantine viven en un store global: no pasan de un test a otro.
afterEach(() => {
  notifications.clean();
});

function Marca({ texto }: { texto: string }): JSX.Element {
  return <div>{texto}</div>;
}

async function paciente(firmado?: { version?: string }): Promise<{ medplum: MockClient; patient: Patient }> {
  indexarDefinicionesFhir();
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Ana'], family: 'García' }],
    birthDate: '1972-05-10',
    telecom: [{ system: 'email', value: 'ana@example.com' }],
  });
  if (firmado) {
    await medplum.createResource<DocumentReference>({
      resourceType: 'DocumentReference',
      status: 'current',
      type: { coding: [{ system: CONSENT_TYPE_SYSTEM, code: CONSENT_TYPE_CODE }] },
      subject: { reference: `Patient/${patient.id}` },
      date: '2026-09-20T12:00:00.000Z',
      ...(firmado.version ? { identifier: [{ system: CONSENT_VERSION_SYSTEM, value: firmado.version }] } : {}),
      content: [{ attachment: { contentType: 'text/plain', data: 'ZmlybWFkbw==' } }],
    });
  }
  medplum.setProfile(patient);
  return { medplum, patient };
}

async function renderEn(medplum: MockClient, ruta: string): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[ruta]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/health-record/consent" element={<InformedConsent />} />
              <Route path="/health-record/cuestionarios" element={<Marca texto="Mi salud cardiovascular" />} />
              <Route path="/inicio" element={<AvisoConsentimiento />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

const decodificar = (base64: string): string =>
  new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));

test('al firmar se guarda la versión del texto, y el texto firmado dice qué servicios, IA y datos acepta', async () => {
  const { medplum, patient } = await paciente();
  await renderEn(medplum, '/health-record/consent');
  expect(screen.getByRole('heading', { name: '1. Tus datos' })).toBeInTheDocument();
  expect(screen.getByText('10/05/1972')).toBeInTheDocument();
  expect(screen.queryByText(/Datos del cliente/)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByLabelText(/^DNI/), { target: { value: '12345678' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Firmar y aceptar' })));
  expect(await screen.findByText('Mi salud cardiovascular')).toBeInTheDocument();

  const firmado = (await buscarConsentimiento(medplum, patient)) as DocumentReference;
  expect(versionFirmada(firmado)).toBe(VERSION_CONSENTIMIENTO);
  expect(consentimientoAlDia(firmado, VERSION_CONSENTIMIENTO)).toBe(true);
  expect(firmado.description).toContain(`versión ${VERSION_CONSENTIMIENTO}`);
  const texto = decodificar(firmado.content[0].attachment.data as string);
  expect(texto).toContain(`Versión del documento: ${VERSION_CONSENTIMIENTO}`);
  expect(texto).toContain('1. TUS DATOS');
  expect(texto).toContain('Fecha de nacimiento: 10/05/1972');
  expect(texto).toContain('Plan Bienestar · 100 días');
  expect(texto).toContain('Leer los informes de laboratorio que subo en PDF');
  expect(texto).toContain('Soy mayor de 18 años.');
  expect(texto).toContain('AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA');
});

test('quien firmó una versión anterior ve qué cambió y lo vuelve a firmar', async () => {
  const { medplum, patient } = await paciente({});
  await renderEn(medplum, '/health-record/consent');
  expect(await screen.findByText('Actualizamos el consentimiento informado')).toBeInTheDocument();
  for (const novedad of NOVEDADES_VERSION) {
    expect(screen.getByText(novedad)).toBeInTheDocument();
  }
  expect(screen.queryByText(/Firmaste este consentimiento el/)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByLabelText(/^DNI/), { target: { value: '12345678' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Firmar y aceptar' })));
  expect(await screen.findByText(/Firmaste este consentimiento el/)).toBeInTheDocument();
  expect(versionFirmada((await buscarConsentimiento(medplum, patient)) as DocumentReference)).toBe(
    VERSION_CONSENTIMIENTO
  );
});

test('con la versión vigente firmada, el aviso verde (con el email bien separado)', async () => {
  const { medplum } = await paciente({ version: VERSION_CONSENTIMIENTO });
  await renderEn(medplum, '/health-record/consent');
  expect(await screen.findByText(/Firmaste este consentimiento el/)).toBeInTheDocument();
  expect(screen.getByText(/escribí a info@segundaopinionmedica\.org\./)).toBeInTheDocument();
  expect(screen.queryByText('Actualizamos el consentimiento informado')).not.toBeInTheDocument();
});

describe('aviso en el inicio', () => {
  test('a quien firmó una versión anterior le pide revisarlo y firmarlo', async () => {
    const { medplum } = await paciente({ version: '2026-06' });
    await renderEn(medplum, '/inicio');
    expect(await screen.findByText('Actualizamos el consentimiento informado')).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Revisar y firmar' })));
    expect(await screen.findByRole('heading', { name: '1. Tus datos' })).toBeInTheDocument();
  });

  test('no aparece con la versión vigente ni a quien nunca firmó (eso lo lleva la Bienvenida)', async () => {
    for (const firmado of [{ version: VERSION_CONSENTIMIENTO }, undefined]) {
      const { medplum } = await paciente(firmado);
      const { unmount } = render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <MantineProvider>
              <AvisoConsentimiento />
            </MantineProvider>
          </MedplumProvider>
        </MemoryRouter>
      );
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(screen.queryByText('Actualizamos el consentimiento informado')).not.toBeInTheDocument();
      unmount();
    }
  });
});
