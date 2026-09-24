// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Coverage, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Profile } from '../pages/account/Profile';
import { indexarDefinicionesFhir } from './__fixtures__/glp1';
import { armarCoverage, buscarCobertura, esCoberturaDeSalud, guardarCobertura, leerDatosCobertura } from './cobertura';
import { cargarSesiones } from './membership';

async function paciente(): Promise<{ medplum: MockClient; patient: Patient }> {
  indexarDefinicionesFhir();
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({ resourceType: 'Patient', name: [{ given: ['Ana'], family: 'García' }] });
  medplum.setProfile(patient);
  return { medplum, patient };
}

const OSDE = { financiador: 'OSDE', plan: '210', numeroAfiliado: '60456789012' };

test('arma un Coverage HIP con obra social, plan y afiliado', () => {
  const c = armarCoverage({ resourceType: 'Patient', id: 'p1' }, OSDE);
  expect(esCoberturaDeSalud(c)).toBe(true);
  expect(c).toMatchObject({
    status: 'active',
    beneficiary: { reference: 'Patient/p1' },
    payor: [{ display: 'OSDE' }],
    subscriberId: '60456789012',
  });
  expect(leerDatosCobertura(c)).toEqual(OSDE);
  // Sin plan ni afiliado no se mandan elementos vacíos.
  const minima = armarCoverage({ resourceType: 'Patient', id: 'p1' }, { financiador: 'PAMI', plan: ' ', numeroAfiliado: '' });
  expect(minima.class).toBeUndefined();
  expect(minima.subscriberId).toBeUndefined();
});

test('al actualizar conserva lo que el formulario no maneja', () => {
  const existente: Coverage = {
    ...armarCoverage({ resourceType: 'Patient', id: 'p1' }, OSDE),
    id: 'c1',
    relationship: { coding: [{ code: 'self' }] },
    class: [{ type: { coding: [{ code: 'group' }] }, value: 'G1' }],
  };
  const c = armarCoverage({ resourceType: 'Patient', id: 'p1' }, { ...OSDE, plan: '310' }, existente);
  expect(c.id).toBe('c1');
  expect(c.relationship?.coding?.[0]?.code).toBe('self');
  expect(c.class?.map((k) => k.value)).toEqual(['G1', '310']);
});

test('guarda, encuentra y actualiza la cobertura, sin mezclarla con los planes de membresía', async () => {
  const { medplum, patient } = await paciente();
  expect(await buscarCobertura(medplum, patient)).toBeUndefined();
  const creada = await guardarCobertura(medplum, patient, OSDE);
  const encontrada = await buscarCobertura(medplum, patient);
  expect(encontrada?.id).toBe(creada.id);
  const actualizada = await guardarCobertura(medplum, patient, { ...OSDE, plan: '310' }, encontrada);
  expect(actualizada.id).toBe(creada.id);
  expect(leerDatosCobertura(await buscarCobertura(medplum, patient)).plan).toBe('310');
  expect(await cargarSesiones(medplum, patient)).toEqual([]);
});

test('Mis datos: el paciente carga su cobertura', async () => {
  const { medplum, patient } = await paciente();
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Profile />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
  expect(screen.getByText('Datos de cobertura')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Obra social o prepaga/), { target: { value: 'OSDE' } });
  fireEvent.change(screen.getByLabelText('Plan'), { target: { value: '210' } });
  fireEvent.change(screen.getByLabelText('Número de afiliado'), { target: { value: '60456789012' } });
  const guardar = screen.getAllByRole('button', { name: 'Guardar' }).at(-1) as HTMLElement;
  await act(async () => {
    fireEvent.click(guardar);
  });
  expect(await screen.findByText('Cobertura actualizada')).toBeInTheDocument();
  expect(leerDatosCobertura(await buscarCobertura(medplum, patient))).toEqual(OSDE);
});
