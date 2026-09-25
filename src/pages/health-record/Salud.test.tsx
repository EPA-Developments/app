// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { vi } from 'vitest';
import { LE8_QUESTIONNAIRES } from '../../le8';
import { biomarkerPanels } from './Biomarkers.data';
import { HealthRecord } from './index';
import { measurementsMeta } from './Measurement.data';
import { MENU_LATERAL_SALUD } from './Salud.data';
import { SaludInicio } from './SaludInicio';

function Marca({ texto }: { texto: string }): JSX.Element {
  return <div>{texto}</div>;
}

function simularPantalla(web: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: web && query.includes('min-width'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as MediaQueryList
  );
}

async function renderSalud(ruta: string): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[ruta]}>
        <MedplumProvider medplum={new MockClient()}>
          <MantineProvider>
            <Routes>
              <Route path="/health-record" element={<HealthRecord />}>
                <Route index element={<SaludInicio />} />
                <Route path="biomarkers" element={<Marca texto="inicio de biomarcadores" />} />
                <Route path="biomarkers/:panelId" element={<Marca texto="panel de biomarcadores" />} />
                <Route path="vitals/:measurementId" element={<Marca texto="medición" />} />
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

test('el menú lateral de web no cambia: mismas secciones y sub-opciones', () => {
  expect(MENU_LATERAL_SALUD.title).toBe('Historia Clínica');
  expect(MENU_LATERAL_SALUD.menu.map((m) => m.name)).toEqual([
    'Mi salud cardiovascular',
    'Biomarcadores',
    'Signos Vitales',
    'Cuestionarios',
    'Consentimiento Informado',
  ]);
  expect(MENU_LATERAL_SALUD.menu[0].subMenu).toHaveLength(LE8_QUESTIONNAIRES.length);
  expect(MENU_LATERAL_SALUD.menu[1].subMenu).toHaveLength(Object.keys(biomarkerPanels).length);
  expect(MENU_LATERAL_SALUD.menu[2].subMenu).toHaveLength(Object.keys(measurementsMeta).length);
});

test('smartphone: el inicio de Salud muestra cada sección en tarjetas, sin el menú arriba', async () => {
  simularPantalla(false);
  await renderSalud('/health-record');

  // El menú lateral existe solo para web.
  expect(
    screen.getByRole('heading', { name: 'Historia Clínica', level: 4 }).closest('.mantine-visible-from-sm')
  ).not.toBeNull();
  // En el inicio no hay "volver".
  expect(screen.queryByRole('link', { name: 'Salud' })).not.toBeInTheDocument();

  for (const grupo of ['Mi salud cardiovascular', 'Biomarcadores', 'Signos Vitales', 'Registros']) {
    expect(screen.getAllByText(grupo).length).toBeGreaterThan(0);
  }
  for (const q of LE8_QUESTIONNAIRES) {
    expect(screen.getByRole('button', { name: new RegExp(q.label) })).toBeInTheDocument();
  }
  for (const panel of Object.values(biomarkerPanels)) {
    expect(screen.getByRole('button', { name: new RegExp(panel.title) })).toBeInTheDocument();
  }
  expect(screen.getByRole('button', { name: /Consentimiento Informado/ })).toBeInTheDocument();

  await act(async () => fireEvent.click(screen.getByRole('button', { name: /Cardiometabólico/ })));
  expect(await screen.findByText('panel de biomarcadores')).toBeInTheDocument();

  const volver = screen.getByRole('link', { name: 'Salud' });
  expect(volver).toHaveAttribute('href', '/health-record');
  expect(volver.closest('.mantine-hidden-from-sm')).not.toBeNull();
  await act(async () => fireEvent.click(volver));
  expect(await screen.findByRole('button', { name: /Presión arterial/ })).toBeInTheDocument();
});

test('web: el inicio de Salud sigue siendo Biomarcadores', async () => {
  simularPantalla(true);
  await renderSalud('/health-record');
  expect(await screen.findByText('inicio de biomarcadores')).toBeInTheDocument();
  expect(screen.queryByText('Registros')).not.toBeInTheDocument();
});
