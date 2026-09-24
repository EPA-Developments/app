// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { CareTeam, Organization, Patient, Practitioner, ServiceRequest } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { JSX } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { indexarDefinicionesFhir } from '../../fhir/__fixtures__/glp1';
import { esCentro, miembrosDelPlan } from '../../fhir/equipo';
import { SOM_SERVICE_CODE, SOM_SERVICE_SYSTEM } from '../../fhir/som';
import { MiEquipoDeSalud } from './MiEquipoDeSalud';
import { Resumen } from './Resumen';

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
            <Routes>
              <Route path="/account/resumen" element={<Resumen />} />
              <Route path="/account/equipo" element={<MiEquipoDeSalud />} />
              <Route path="/signout" element={<Marca texto="saliendo" />} />
              <Route path="/Communication" element={<Marca texto="pantalla de mensajes" />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

async function paciente(extra: Partial<Patient> = {}): Promise<{ medplum: MockClient; patient: Patient }> {
  indexarDefinicionesFhir();
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Ana'], family: 'García' }],
    telecom: [{ system: 'email', value: 'ana@example.com' }],
    ...extra,
  });
  medplum.setProfile(patient);
  return { medplum, patient };
}

async function medico(medplum: MockClient, given: string, family: string): Promise<Practitioner> {
  return medplum.createResource<Practitioner>({ resourceType: 'Practitioner', name: [{ given: [given], family }] });
}

describe('Resumen', () => {
  test('agrupa por Usuario, Cliente y Paciente, y lleva a cerrar sesión', async () => {
    const { medplum } = await paciente();
    await renderEn(medplum, '/account/resumen');
    expect(screen.getByText('Ana García')).toBeInTheDocument();
    expect(screen.getByText('ana@example.com')).toBeInTheDocument();
    for (const titulo of ['Mis datos', 'Mi equipo de salud', 'Membresía', 'Historia de salud', 'Mi Plan Bienestar']) {
      expect(screen.getByText(titulo)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByText('Cerrar sesión'));
    expect(await screen.findByText('saliendo')).toBeInTheDocument();
  });
});

describe('Mi equipo de salud', () => {
  test('sin médico de cabecera, el paciente lo elige y queda guardado', async () => {
    const { medplum, patient } = await paciente();
    await medico(medplum, 'Laura', 'Zeta Test');
    await renderEn(medplum, '/account/equipo');

    const cabecera = within(await screen.findByTestId('cabecera'));
    expect(cabecera.getByText('Elegí quién te acompaña en tu plan:')).toBeInTheDocument();
    const fila = (await cabecera.findByText('Laura Zeta Test')).closest('.mantine-Card-root') as HTMLElement;
    await act(async () => {
      fireEvent.click(within(fila).getByRole('button', { name: 'Elegir' }));
    });

    expect(await screen.findByRole('button', { name: 'Escribile' })).toBeInTheDocument();
    const guardado = await medplum.readResource('Patient', patient.id as string, { cache: 'no-cache' });
    expect(guardado.generalPractitioner?.[0]?.reference).toMatch(/^Practitioner\//);
    expect(guardado.name?.[0]?.family).toBe('García');
  });

  test('si el médico de cabecera es un centro, se presenta como "Tu centro"', async () => {
    indexarDefinicionesFhir();
    const medplum = new MockClient();
    const centro = await medplum.createResource<Organization>({ resourceType: 'Organization', name: 'Centro Test' });
    const patient = await medplum.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ family: 'García' }],
      generalPractitioner: [{ reference: `Organization/${centro.id}` }],
    });
    medplum.setProfile(patient);
    await renderEn(medplum, '/account/equipo');
    expect(await screen.findByText('Tu centro')).toBeInTheDocument();
    expect(await screen.findByText('Centro Test')).toBeInTheDocument();
  });

  test('muestra el equipo del plan y, solo si hay solicitud, la segunda opinión', async () => {
    const { medplum, patient } = await paciente();
    const nutri = await medico(medplum, 'Nora', 'Nutri');
    const cardio = await medico(medplum, 'Carlos', 'Cardio');
    await medplum.createResource<CareTeam>({
      resourceType: 'CareTeam',
      status: 'active',
      subject: { reference: `Patient/${patient.id}` },
      participant: [
        { member: { reference: `Patient/${patient.id}` } },
        { member: { reference: `Practitioner/${nutri.id}` }, role: [{ text: 'Nutrición' }] },
      ],
    });
    await renderEn(medplum, '/account/equipo');
    const plan = within(await screen.findByTestId('equipo-plan'));
    expect(await plan.findByText('Nora Nutri')).toBeInTheDocument();
    expect(plan.getByText('Nutrición')).toBeInTheDocument();
    expect(screen.queryByTestId('segunda-opinion')).not.toBeInTheDocument();

    await medplum.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      code: { coding: [{ system: SOM_SERVICE_SYSTEM, code: SOM_SERVICE_CODE }] },
      subject: { reference: `Patient/${patient.id}` },
      performer: [{ reference: `Practitioner/${cardio.id}` }],
    });
    document.body.innerHTML = '';
    await renderEn(medplum, '/account/equipo');
    const som = within(await screen.findByTestId('segunda-opinion'));
    expect(await som.findByText('Carlos Cardio')).toBeInTheDocument();
  });
});

test('miembrosDelPlan: sin pacientes, sin repetidos y sin el médico de cabecera', () => {
  const equipo: CareTeam[] = [
    {
      resourceType: 'CareTeam',
      status: 'active',
      participant: [
        { member: { reference: 'Patient/p1' } },
        { member: { reference: 'Practitioner/cabecera' } },
        { member: { reference: 'Practitioner/a' }, role: [{ coding: [{ display: 'Cardiología' }] }] },
      ],
    },
    { resourceType: 'CareTeam', status: 'active', participant: [{ member: { reference: 'Practitioner/a' } }] },
    { resourceType: 'CareTeam', status: 'inactive', participant: [{ member: { reference: 'Practitioner/b' } }] },
  ];
  expect(miembrosDelPlan(equipo, { reference: 'Practitioner/cabecera' })).toEqual([
    { ref: { reference: 'Practitioner/a' }, rol: 'Cardiología' },
  ]);
  expect(esCentro({ reference: 'Organization/x' })).toBe(true);
  expect(esCentro({ reference: 'Practitioner/x' })).toBe(false);
});
