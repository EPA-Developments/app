// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { vi } from 'vitest';
import { simularPantalla } from '../../testing/pantalla';
import { MENU_LATERAL_CUIDADO } from './Cuidado.data';
import { CuidadoInicio } from './CuidadoInicio';
import { CarePlanPage } from './index';

function Marca({ texto }: { texto: string }): JSX.Element {
  return <div>{texto}</div>;
}

async function renderCuidado(ruta: string): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[ruta]}>
        <MedplumProvider medplum={new MockClient()}>
          <MantineProvider>
            <Routes>
              <Route path="/care-plan" element={<CarePlanPage />}>
                <Route index element={<CuidadoInicio />} />
                <Route path="action-items" element={<Marca texto="pasos del plan" />} />
                <Route path="plan-100-dias/*" element={<Marca texto="plan bienestar" />} />
              </Route>
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

test('el menú lateral de web no cambia', () => {
  expect(MENU_LATERAL_CUIDADO).toEqual({
    title: 'Plan de Cuidado',
    menu: [
      { name: 'Pasos del plan', href: '/care-plan/action-items' },
      { name: 'Seguimiento GLP-1', href: '/care-plan/glp1' },
      { name: 'Plan Bienestar 100 Días', href: '/care-plan/plan-100-dias' },
      { name: 'Mis datos de salud', href: '/care-plan/plan-100-dias/mis-datos' },
    ],
  });
});

test('smartphone: el inicio muestra las opciones en tarjetas, sin el menú arriba, y cada pantalla vuelve', async () => {
  simularPantalla(false);
  await renderCuidado('/care-plan');

  expect(
    screen.getByRole('heading', { name: 'Plan de Cuidado', level: 4 }).closest('.mantine-visible-from-sm')
  ).not.toBeNull();
  expect(screen.queryByRole('link', { name: 'Plan de cuidado' })).not.toBeInTheDocument();
  for (const m of MENU_LATERAL_CUIDADO.menu) {
    expect(screen.getByRole('button', { name: new RegExp(m.name) })).toBeInTheDocument();
  }

  await act(async () => fireEvent.click(screen.getByRole('button', { name: /Plan Bienestar 100 Días/ })));
  expect(await screen.findByText('plan bienestar')).toBeInTheDocument();
  const volver = screen.getByRole('link', { name: 'Plan de cuidado' });
  expect(volver).toHaveAttribute('href', '/care-plan');
  expect(volver.closest('.mantine-hidden-from-sm')).not.toBeNull();
  await act(async () => fireEvent.click(volver));
  expect(await screen.findByRole('button', { name: /Seguimiento GLP-1/ })).toBeInTheDocument();
});

test('web: el inicio sigue siendo Pasos del plan', async () => {
  simularPantalla(true);
  await renderCuidado('/care-plan');
  expect(await screen.findByText('pasos del plan')).toBeInTheDocument();
});
