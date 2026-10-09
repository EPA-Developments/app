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
import { simularPantalla } from '../../testing/pantalla';
import { biomarkerPanels } from './Biomarkers.data';
import { HealthRecord } from './index';
import { measurementsMeta } from './Measurement.data';
import { MENU_LATERAL_SALUD } from './Salud.data';
import { SaludInicio } from './SaludInicio';

function Marca({ texto }: { texto: string }): JSX.Element {
  return <div>{texto}</div>;
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
                <Route path="ingreso" element={<Marca texto="cuestionario de ingreso" />} />
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

test('menú lateral de web: el Cuestionario de ingreso primero y Signos Vitales antes de Biomarcadores', () => {
  expect(MENU_LATERAL_SALUD.title).toBe('Historia Clínica');
  expect(MENU_LATERAL_SALUD.menu.map((m) => m.name)).toEqual([
    'Cuestionario de ingreso',
    'Mi salud cardiovascular',
    'Signos Vitales',
    'Biomarcadores',
    'Consentimiento Informado',
    'Consentimiento de teleconsulta',
  ]);
  expect(MENU_LATERAL_SALUD.menu[0].href).toBe('/health-record/ingreso');
  // El de teleconsulta, suelto (sin sub-opciones): el link de WhatsApp de Recepción abre esta ruta.
  expect(MENU_LATERAL_SALUD.menu[5].href).toBe('/health-record/consent/teleconsulta');
  expect(MENU_LATERAL_SALUD.menu[5].subMenu).toBeUndefined();
  expect(MENU_LATERAL_SALUD.menu[0].subMenu).toBeUndefined();
  expect(MENU_LATERAL_SALUD.menu[1].subMenu).toHaveLength(LE8_QUESTIONNAIRES.length);
  expect(MENU_LATERAL_SALUD.menu[2].subMenu).toHaveLength(Object.keys(measurementsMeta).length);
  expect(MENU_LATERAL_SALUD.menu[3].subMenu).toHaveLength(Object.keys(biomarkerPanels).length);
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

  // Mismo orden que en web: el Cuestionario de ingreso arriba de todo.
  const tarjetas = screen.getAllByRole('button').map((b) => b.textContent ?? '');
  expect(tarjetas[0]).toMatch(/^Cuestionario de ingreso/);
  const texto = document.body.textContent ?? '';
  expect(texto.indexOf('Signos Vitales')).toBeLessThan(texto.indexOf('Biomarcadores'));
  for (const grupo of ['Mi salud cardiovascular', 'Biomarcadores', 'Signos Vitales']) {
    expect(screen.getAllByText(grupo).length).toBeGreaterThan(0);
  }
  for (const q of LE8_QUESTIONNAIRES) {
    expect(screen.getByRole('button', { name: new RegExp(q.label) })).toBeInTheDocument();
  }
  for (const panel of Object.values(biomarkerPanels)) {
    expect(screen.getByRole('button', { name: new RegExp(panel.title) })).toBeInTheDocument();
  }
  expect(screen.getByRole('button', { name: /Consentimiento Informado/ })).toBeInTheDocument();

  await act(async () => fireEvent.click(screen.getByRole('button', { name: /Perfil básico y riesgo cardiovascular/ })));
  expect(await screen.findByText('panel de biomarcadores')).toBeInTheDocument();

  const volver = screen.getByRole('link', { name: 'Salud' });
  expect(volver).toHaveAttribute('href', '/health-record');
  expect(volver.closest('.mantine-hidden-from-sm')).not.toBeNull();
  await act(async () => fireEvent.click(volver));
  expect(await screen.findByRole('button', { name: /Presión arterial/ })).toBeInTheDocument();
});

test('web: Salud abre el Cuestionario de ingreso', async () => {
  simularPantalla(true);
  await renderSalud('/health-record');
  expect(await screen.findByText('cuestionario de ingreso')).toBeInTheDocument();
});
