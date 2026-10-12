// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import type { Communication, DocumentReference, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { indexarDefinicionesFhir } from '../../fhir/__fixtures__/glp1';
import { RUTA_CONSENTIMIENTO_TELECONSULTA, construirConsentimientoTeleconsulta } from '../../fhir/agenda';
import { NOTIFICACION_SYSTEM } from '../../fhir/notificaciones';
import {
  CONSENT_TYPE_CODE,
  CONSENT_TYPE_SYSTEM,
  CONSENT_VERSION_SYSTEM,
  RUTA_CONSENTIMIENTO,
  buscarConsentimiento,
  consentimientoAlDia,
  versionFirmada,
} from '../../fhir/consentimiento';
import { HomePage } from '../HomePage';
import { InformedConsent } from './InformedConsent';
import { NOVEDADES_VERSION, VERSION_CONSENTIMIENTO } from './InformedConsent.data';

// Las notificaciones de Mantine viven en un store global: no pasan de un test a otro.
afterEach(() => {
  notifications.clean();
  vi.useRealTimers();
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
              <Route path="/health-record/ingreso" element={<Marca texto="Cuestionario de ingreso" />} />
              <Route
                path={RUTA_CONSENTIMIENTO_TELECONSULTA}
                element={<Marca texto="Página del consentimiento de teleconsulta" />}
              />
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
  // Sin Cuestionario de ingreso respondido, el camino sigue ahí.
  expect(await screen.findByText('Cuestionario de ingreso')).toBeInTheDocument();

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

describe('consentimiento de teleconsulta (R-21): se ofrece, una sola vez, a quien no lo aceptó', () => {
  const LEER = 'Leer el consentimiento de teleconsulta';

  /** Deja correr las búsquedas pendientes (el MockClient resuelve en el próximo tick). */
  async function esperar(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }
  }

  test('con la versión vigente firmada y sin el de teleconsulta, lo ofrece en el aviso verde', async () => {
    const { medplum } = await paciente({ version: VERSION_CONSENTIMIENTO });
    await renderEn(medplum, '/health-record/consent');
    expect(await screen.findByRole('button', { name: LEER })).toBeInTheDocument();
    expect(
      screen.getByText(/Antes de tu primera teleconsulta, leé y aceptá el consentimiento de teleconsulta/)
    ).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: LEER })));
    expect(await screen.findByText('Página del consentimiento de teleconsulta')).toBeInTheDocument();
  });

  test('a quien ya lo aceptó no se lo ofrece', async () => {
    const { medplum, patient } = await paciente({ version: VERSION_CONSENTIMIENTO });
    await medplum.createResource(construirConsentimientoTeleconsulta(patient));
    await renderEn(medplum, '/health-record/consent');
    expect(await screen.findByText(/Firmaste este consentimiento el/)).toBeInTheDocument();
    await esperar();
    expect(screen.queryByRole('button', { name: LEER })).not.toBeInTheDocument();
  });

  async function firmar(): Promise<void> {
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText(/^DNI/), { target: { value: '12345678' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Firmar y aceptar' })));
  }

  test('en la primera firma el camino sigue igual, y el aviso lo ofrece sin cerrarse solo', async () => {
    // Relojes falsos que igual avanzan: las búsquedas del MockClient resuelven solas.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { medplum } = await paciente();
    await renderEn(medplum, '/health-record/consent');
    await esperar();
    await firmar();
    // El camino no cambia: sigue en el Cuestionario de ingreso.
    expect(await screen.findByText('Cuestionario de ingreso')).toBeInTheDocument();
    expect(screen.getByText('Consentimiento firmado')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: LEER })).toBeInTheDocument();
    // Quien lee despacio (o en el celular, sin mouse que lo pause) no pierde el botón. Dos tandas
    // de reloj: si el aviso se cerrara, la segunda termina su transición de salida.
    for (let i = 0; i < 2; i++) {
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
    }
    await act(async () => fireEvent.click(screen.getByRole('button', { name: LEER })));
    expect(await screen.findByText('Página del consentimiento de teleconsulta')).toBeInTheDocument();
  });

  test('si Recepción se lo pidió (Novedad sin leer), la primera firma sigue en ese consentimiento', async () => {
    // Abrió el link de WhatsApp con la Bienvenida pendiente: el gate la llevó a la Bienvenida y
    // de ahí acá. El destino del link no se pierde.
    const { medplum, patient } = await paciente();
    await medplum.createResource<Communication>({
      resourceType: 'Communication',
      status: 'in-progress',
      subject: { reference: `Patient/${patient.id}` },
      recipient: [{ reference: `Patient/${patient.id}` }],
      sent: '2026-10-01T10:00:00.000Z',
      category: [{ coding: [{ system: NOTIFICACION_SYSTEM, code: 'consentimiento-teleconsulta' }] }],
      payload: [{ contentString: 'Te pedimos el consentimiento de teleconsulta.' }],
    });
    await renderEn(medplum, '/health-record/consent');
    await esperar();
    await firmar();
    expect(await screen.findByText('Página del consentimiento de teleconsulta')).toBeInTheDocument();
    expect(screen.queryByText('Cuestionario de ingreso')).not.toBeInTheDocument();
  });
});

// Quien firmó una versión anterior se entera en el Inicio: la puerta de la Home (paraHoy, regla
// 'consentimiento-actualizado') le propone actualizarlo. Ana no tiene sexo cargado: ve la Home D.
describe('el consentimiento en el Inicio', () => {
  const ESPERA = { timeout: 10000 };

  async function enElInicio(medplum: MockClient): Promise<void> {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <MedplumProvider medplum={medplum}>
            {/* env="test": sin transiciones de Mantine, cuyos timers podían disparar después de
                desmontar jsdom («window is not defined»). */}
            <MantineProvider env="test">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path={RUTA_CONSENTIMIENTO} element={<InformedConsent />} />
              </Routes>
            </MantineProvider>
          </MedplumProvider>
        </MemoryRouter>
      );
    });
  }

  test('a quien firmó una versión anterior la puerta le propone actualizarlo, y el botón lleva al texto', async () => {
    const { medplum } = await paciente({ version: '2026-06' });
    await enElInicio(medplum);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ana, actualizamos tu consentimiento.' }, ESPERA)
    ).toBeInTheDocument();
    // El botón de la puerta (el primero: la ruta puede repetir la acción más abajo).
    const revisar = screen.getAllByRole('link', { name: 'Revisar y firmar' })[0];
    expect(revisar).toHaveAttribute('href', RUTA_CONSENTIMIENTO);

    await act(async () => fireEvent.click(revisar));
    expect(await screen.findByRole('heading', { name: '1. Tus datos' })).toBeInTheDocument();
    expect(await screen.findByText('Actualizamos el consentimiento informado')).toBeInTheDocument();
  });

  test.each([
    {
      caso: 'con la versión vigente',
      firmado: { version: VERSION_CONSENTIMIENTO },
      titulo: 'Ana, contanos tus antecedentes.',
    },
    // A quien nunca firmó la puerta le pide la primera firma, no que lo actualice.
    { caso: 'a quien nunca firmó', firmado: undefined, titulo: 'Ana, tu ruta empieza con tu firma.' },
  ])('$caso no propone actualizarlo', async ({ firmado, titulo }) => {
    const { medplum } = await paciente(firmado);
    await enElInicio(medplum);
    // Terminó de cargar: la puerta ya eligió el próximo paso.
    expect(await screen.findByRole('heading', { level: 1, name: titulo }, ESPERA)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /actualizamos tu consentimiento/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Revisar y firmar' })).not.toBeInTheDocument();
    expect(screen.queryByText(/hay una versión nueva/)).not.toBeInTheDocument();
  });
});
