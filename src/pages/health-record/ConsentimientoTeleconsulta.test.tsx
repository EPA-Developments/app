// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Consentimiento de teleconsulta fuera de la reserva (R-21): la página que abre el link que
// Recepción manda por WhatsApp, la Novedad de la campanita y el menú de Salud. La que acepta es
// siempre la paciente, con el mismo Consent y el mismo texto legal que la reserva.
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import type { Communication, Consent, DocumentReference, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { JSX } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { indexarDefinicionesFhir } from '../../fhir/__fixtures__/glp1';
import {
  CONSENTIMIENTO_TELECONSULTA,
  RUTA_CONSENTIMIENTO_TELECONSULTA,
  SYSTEM_CONSENTIMIENTO,
  TEXTO_CONSENTIMIENTO_TELECONSULTA,
  construirConsentimientoTeleconsulta,
} from '../../fhir/agenda';
import { CONSENT_TYPE_CODE, CONSENT_TYPE_SYSTEM } from '../../fhir/consentimiento';
import { NOTIFICACION_SYSTEM } from '../../fhir/notificaciones';
import { ConsentimientoTeleconsulta } from './ConsentimientoTeleconsulta';

const CASILLA = 'Leí y acepto el consentimiento de teleconsulta';

// El MockClient solo filtra Consent por `status` y Communication por `category` con las
// definiciones FHIR indexadas.
beforeAll(() => indexarDefinicionesFhir());

// Las notificaciones de Mantine viven en un store global: no pasan de un test a otro.
afterEach(() => {
  notifications.clean();
});

function Ubicacion(): JSX.Element {
  const { pathname, search } = useLocation();
  return <div>{`estás en ${pathname}${search}`}</div>;
}

interface Escenario {
  /** Ya aceptó el consentimiento de teleconsulta. */
  teleconsulta?: boolean;
  /** Firmó el consentimiento informado. */
  general?: boolean;
}

async function paciente(e: Escenario = {}): Promise<{ medplum: MockClient; patient: Patient }> {
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Ana'], family: 'García' }],
  });
  if (e.general) {
    await medplum.createResource<DocumentReference>({
      resourceType: 'DocumentReference',
      status: 'current',
      type: { coding: [{ system: CONSENT_TYPE_SYSTEM, code: CONSENT_TYPE_CODE }] },
      subject: { reference: `Patient/${patient.id}` },
      date: '2026-09-20T12:00:00.000Z',
      content: [{ attachment: { contentType: 'text/plain', data: 'ZmlybWFkbw==' } }],
    });
  }
  if (e.teleconsulta) {
    await medplum.createResource(construirConsentimientoTeleconsulta(patient, new Date('2026-10-01T15:00:00.000Z')));
  }
  medplum.setProfile(patient);
  return { medplum, patient };
}

/** La Novedad que deja Recepción al pedirle el consentimiento (bot de recepcionistas). */
async function novedad(medplum: MockClient, patient: Patient, code: string): Promise<Communication> {
  const ref = `Patient/${patient.id}`;
  return medplum.createResource<Communication>({
    resourceType: 'Communication',
    status: 'in-progress',
    subject: { reference: ref },
    recipient: [{ reference: ref }],
    sent: '2026-10-09T12:00:00.000Z',
    category: [{ coding: [{ system: NOTIFICACION_SYSTEM, code, display: 'Consentimiento de teleconsulta' }] }],
    payload: [{ contentString: 'Para atenderte por videollamada, leé y aceptá el consentimiento de teleconsulta.' }],
  });
}

async function consents(medplum: MockClient, patient?: Patient): Promise<Consent[]> {
  return medplum.searchResources('Consent', patient ? `patient=Patient/${patient.id}` : '_count=100', {
    cache: 'no-cache',
  });
}

async function estado(medplum: MockClient, c: Communication): Promise<string | undefined> {
  return (await medplum.readResource('Communication', c.id as string, { cache: 'no-cache' })).status;
}

async function renderPagina(medplum: MockClient): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[RUTA_CONSENTIMIENTO_TELECONSULTA]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path={RUTA_CONSENTIMIENTO_TELECONSULTA} element={<ConsentimientoTeleconsulta />} />
              <Route path="*" element={<Ubicacion />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

/** Deja correr las búsquedas pendientes (el MockClient resuelve en el próximo tick). */
async function esperar(): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

test('sin aceptarlo: lee el texto legal, acepta una vez y el pedido de la campanita queda leído', async () => {
  const { medplum, patient } = await paciente({ general: true });
  const pedido = await novedad(medplum, patient, 'consentimiento-teleconsulta');
  await renderPagina(medplum);

  expect(screen.getByRole('heading', { name: 'Consentimiento de teleconsulta', level: 1 })).toBeInTheDocument();
  expect(await screen.findByText(TEXTO_CONSENTIMIENTO_TELECONSULTA)).toBeInTheDocument();
  expect(screen.getByText('Para atenderte por videollamada. Lo aceptás una sola vez.')).toBeInTheDocument();
  const aceptar = screen.getByRole('button', { name: 'Aceptar' });
  expect(aceptar).toBeDisabled();
  // Mientras no lo acepta, el pedido sigue sin leer.
  expect(await estado(medplum, pedido)).toBe('in-progress');

  fireEvent.click(screen.getByRole('checkbox', { name: CASILLA }));
  expect(aceptar).toBeEnabled();
  await act(async () => fireEvent.click(aceptar));

  expect(await screen.findByText('Ya aceptaste el consentimiento de teleconsulta')).toBeInTheDocument();
  expect(screen.getByText('Consentimiento de teleconsulta aceptado')).toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

  // Un solo Consent, de la propia paciente, con el código y el texto legal del contrato.
  const lista = await consents(medplum, patient);
  expect(lista).toHaveLength(1);
  expect(lista[0].status).toBe('active');
  expect(lista[0].patient?.reference).toBe(`Patient/${patient.id}`);
  expect(lista[0].performer?.[0]?.reference).toBe(`Patient/${patient.id}`);
  expect(lista[0].policyRule?.coding).toEqual([
    expect.objectContaining({ system: SYSTEM_CONSENTIMIENTO, code: CONSENTIMIENTO_TELECONSULTA }),
  ]);
  expect(lista[0].policyRule?.text).toBe(TEXTO_CONSENTIMIENTO_TELECONSULTA);

  await waitFor(async () => expect(await estado(medplum, pedido)).toBe('completed'));
});

test('ya aceptado: lo que aceptó y cuándo, sin casilla ni un Consent de más', async () => {
  const { medplum, patient } = await paciente({ teleconsulta: true, general: true });
  await renderPagina(medplum);

  expect(await screen.findByText('Ya aceptaste el consentimiento de teleconsulta')).toBeInTheDocument();
  expect(screen.getByText(/^Lo aceptaste el .+\. Si querés revocarlo, escribinos por Mensajes\./)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Lo que aceptaste' })).toBeInTheDocument();
  expect(screen.getByText(TEXTO_CONSENTIMIENTO_TELECONSULTA)).toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Aceptar' })).not.toBeInTheDocument();
  expect(await consents(medplum, patient)).toHaveLength(1);

  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Reservar una teleconsulta' })));
  expect(await screen.findByText('estás en /get-care')).toBeInTheDocument();
});

test('«Escribir por Mensajes» abre un mensaje nuevo', async () => {
  const { medplum } = await paciente({ teleconsulta: true });
  await renderPagina(medplum);
  await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Escribir por Mensajes' })));
  expect(await screen.findByText('estás en /Communication/nuevo?motivo=otro')).toBeInTheDocument();
});

test('ya aceptado (p. ej. en la reserva): el pedido de la campanita queda leído; otras novedades no', async () => {
  const { medplum, patient } = await paciente({ teleconsulta: true });
  const pedido = await novedad(medplum, patient, 'consentimiento-teleconsulta');
  const otra = await novedad(medplum, patient, 'recordatorio');
  await renderPagina(medplum);

  expect(await screen.findByText('Ya aceptaste el consentimiento de teleconsulta')).toBeInTheDocument();
  await waitFor(async () => expect(await estado(medplum, pedido)).toBe('completed'));
  expect(await estado(medplum, otra)).toBe('in-progress');
});

test('sin el consentimiento informado, se lo recuerda (sin bloquear); con él, no', async () => {
  const sinGeneral = await paciente();
  await renderPagina(sinGeneral.medplum);
  const link = await screen.findByRole('link', { name: 'leelo y firmalo acá' });
  expect(link).toHaveAttribute('href', '/health-record/consent');
  expect(screen.getByRole('checkbox', { name: CASILLA })).toBeInTheDocument();
  cleanup();

  const conGeneral = await paciente({ general: true });
  await renderPagina(conGeneral.medplum);
  expect(await screen.findByRole('checkbox', { name: CASILLA })).toBeInTheDocument();
  await esperar();
  expect(screen.queryByRole('link', { name: 'leelo y firmalo acá' })).not.toBeInTheDocument();
});

test('un perfil del equipo (no paciente) no puede aceptarlo', async () => {
  const medplum = new MockClient(); // el perfil por defecto es una Practitioner
  const antes = (await consents(medplum)).length;
  await renderPagina(medplum);
  await esperar();

  expect(screen.getByText('Esta página es para pacientes del portal.')).toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Aceptar' })).not.toBeInTheDocument();
  expect(await consents(medplum)).toHaveLength(antes);
});
