// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Bundle, Communication, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import type { MockSubscriptionManager } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { vi } from 'vitest';
import { indexarDefinicionesFhir } from '../fhir/__fixtures__/glp1';
import { criteriaNotificaciones, NOTIFICACION_SYSTEM } from '../fhir/notificaciones';
import { CampanitaNovedades } from './CampanitaNovedades';

function Marca({ texto }: { texto: string }): JSX.Element {
  return <div>{texto}</div>;
}

async function paciente(): Promise<{ medplum: MockClient; patient: Patient }> {
  indexarDefinicionesFhir();
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Ana'], family: 'García' }],
  });
  medplum.setProfile(patient);
  return { medplum, patient };
}

function novedad(patient: Patient, code: string, texto: string, extra: Partial<Communication> = {}): Communication {
  const ref = { reference: `Patient/${patient.id}` };
  return {
    resourceType: 'Communication',
    status: 'in-progress',
    subject: ref,
    recipient: [ref],
    sent: new Date().toISOString(),
    category: [{ coding: [{ system: NOTIFICACION_SYSTEM, code }] }],
    payload: [{ contentString: texto }],
    ...extra,
  };
}

async function renderCampanita(medplum: MockClient): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <CampanitaNovedades />
            <Routes>
              <Route path="/" element={<Marca texto="inicio" />} />
              <Route path="/membership" element={<Marca texto="pantalla de membresía" />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

test('sin novedades: campanita sin badge y panel vacío', async () => {
  const { medplum } = await paciente();
  await renderCampanita(medplum);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Novedades' })));
  expect(await screen.findByText('No tenés novedades por ahora.')).toBeInTheDocument();
});

test('badge con las no leídas; tocar una la marca leída y lleva a su pantalla', async () => {
  const { medplum, patient } = await paciente();
  const turno = await medplum.createResource(
    novedad(patient, 'reserva-confirmada', '¡Tu turno quedó confirmado para el miércoles 30/09 a las 10:00!', {
      about: [{ reference: 'Appointment/a1' }],
    })
  );
  await medplum.createResource(novedad(patient, 'general', 'Cambió el horario de atención.'));
  await medplum.createResource(novedad(patient, 'pago-recibido', 'Ya registramos tu pago.', { status: 'completed' }));
  await renderCampanita(medplum);

  const campanita = await screen.findByRole('button', { name: 'Novedades: 2 sin leer' });
  expect(await screen.findByText('2')).toBeInTheDocument();

  await act(async () => fireEvent.click(campanita));
  expect(await screen.findByText('Turno confirmado')).toBeInTheDocument();
  expect(screen.getByText('Pago recibido')).toBeInTheDocument();
  expect(screen.getByText('Cambió el horario de atención.')).toBeInTheDocument();

  await act(async () => fireEvent.click(screen.getByText(/Tu turno quedó confirmado/)));
  expect(await screen.findByText('pantalla de membresía')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Novedades: 1 sin leer' })).toBeInTheDocument();
  const leida = await medplum.readResource('Communication', turno.id);
  expect(leida.status).toBe('completed');
  expect(leida.received).toBeDefined();
});

test('marcar todas como leídas apaga el badge', async () => {
  const { medplum, patient } = await paciente();
  await medplum.createResource(novedad(patient, 'recordatorio', 'Mañana tenés turno.'));
  await medplum.createResource(novedad(patient, 'general', 'Novedades del centro.'));
  await renderCampanita(medplum);

  await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Novedades: 2 sin leer' })));
  await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Marcar todas como leídas' })));
  expect(await screen.findByRole('button', { name: 'Novedades' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Marcar todas como leídas' })).not.toBeInTheDocument();
});

test('al volver a la app se actualiza el badge (sin tiempo real no hay suscripción)', async () => {
  const { medplum, patient } = await paciente();
  await renderCampanita(medplum);
  expect(await screen.findByRole('button', { name: 'Novedades' })).toBeInTheDocument();
  expect((medplum.getSubscriptionManager() as MockSubscriptionManager).getCriteriaCount()).toBe(0);

  await medplum.createResource(novedad(patient, 'resultados-listos', 'Ya están tus resultados.'));
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  expect(await screen.findByRole('button', { name: 'Novedades: 1 sin leer' })).toBeInTheDocument();
});

test('con MEDPLUM_TIEMPO_REAL, una novedad nueva enciende el badge al instante', async () => {
  vi.stubEnv('MEDPLUM_TIEMPO_REAL', 'true');
  const { medplum, patient } = await paciente();
  await renderCampanita(medplum);
  expect(await screen.findByRole('button', { name: 'Novedades' })).toBeInTheDocument();

  const nueva = await medplum.createResource(novedad(patient, 'pago-recibido', 'Recibimos tu seña.'));
  const evento: Bundle = { resourceType: 'Bundle', type: 'history', entry: [{ resource: nueva }] };
  await act(async () => {
    (medplum.getSubscriptionManager() as MockSubscriptionManager).emitEventForCriteria(
      criteriaNotificaciones(`Patient/${patient.id}`),
      { type: 'message', payload: evento }
    );
  });
  expect(await screen.findByRole('button', { name: 'Novedades: 1 sin leer' })).toBeInTheDocument();
});
