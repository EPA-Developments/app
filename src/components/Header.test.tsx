// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { AppShell, MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Header } from './Header';

function renderHeader(soloCerrarSesion: boolean): void {
  render(
    <MemoryRouter>
      <MedplumProvider medplum={new MockClient()}>
        <MantineProvider>
          <AppShell header={{ height: 60 }}>
            <Header soloCerrarSesion={soloCerrarSesion} />
          </AppShell>
        </MantineProvider>
      </MedplumProvider>
    </MemoryRouter>
  );
}

test('Header muestra la navegación fuera de la Bienvenida', () => {
  renderHeader(false);
  expect(screen.getByText('Salud')).toBeInTheDocument();
  expect(screen.getByLabelText('Inicio')).toBeInTheDocument();
});

test('la navegación lleva al Plan Bienestar y no ofrece Segunda Opinión', () => {
  renderHeader(false);
  expect(screen.getByRole('link', { name: 'Plan Bienestar' })).toHaveAttribute('href', '/care-plan/plan-100-dias');
  expect(screen.queryByRole('link', { name: /Segunda Opinión/ })).not.toBeInTheDocument();
});

test('Header oculta la navegación durante la Bienvenida', () => {
  renderHeader(true);
  expect(screen.queryByText('Salud')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Inicio')).not.toBeInTheDocument();
});
