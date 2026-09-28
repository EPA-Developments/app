// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { MemoryRouter } from 'react-router';
import { traducirMensaje } from './errores';
import { IngresoForm } from './IngresoForm';
import { RegistroForm } from './RegistroForm';

async function renderizar(medplum: MockClient, ui: JSX.Element): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>{ui}</MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

async function enviar(boton: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: boton }));
  });
}

describe('IngresoForm', () => {
  test('pide email y contraseña en castellano, traduce el error y avisa el ingreso', async () => {
    const medplum = new MockClient({ profile: null });
    const onSuccess = vi.fn();
    await renderizar(medplum, <IngresoForm projectId="p1" onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ana@example.com' } });
    await enviar('Continuar');

    expect(screen.getByLabelText(/^Contraseña/)).toBeInTheDocument();
    expect(screen.getByLabelText('Recordarme en este dispositivo')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Contraseña/), { target: { value: 'otra' } });
    await enviar('Ingresar');
    expect(await screen.findByText('El email o la contraseña no son correctos.')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/^Contraseña/), { target: { value: 'password' } });
    await enviar('Ingresar');
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  test('permite cambiar el email e ir a crear una cuenta', async () => {
    const onRegister = vi.fn();
    await renderizar(new MockClient({ profile: null }), <IngresoForm projectId="p1" onRegister={onRegister} />);
    fireEvent.click(screen.getByRole('button', { name: 'Creala acá' }));
    expect(onRegister).toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ana@example.com' } });
    await enviar('Continuar');
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Cambiar el email'));
    });
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument();
  });
});

describe('RegistroForm', () => {
  test('muestra el alta en castellano y lleva a iniciar sesión', async () => {
    const onSignIn = vi.fn();
    await renderizar(
      new MockClient({ profile: null }),
      <RegistroForm projectId="p1" onSuccess={vi.fn()} onSignIn={onSignIn} />
    );
    for (const campo of [/^Nombre/, /^Apellido/, /^Email/, /^Contraseña/]) {
      expect(screen.getByLabelText(campo)).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeInTheDocument();
    expect(screen.queryByText(/Register|First name|Sign In/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Iniciá sesión' }));
    expect(onSignIn).toHaveBeenCalled();
  });

  test('los términos y la privacidad son los de la marca, no los de Medplum', async () => {
    await renderizar(new MockClient({ profile: null }), <RegistroForm projectId="p1" onSuccess={vi.fn()} />);
    expect(screen.getByRole('link', { name: /Términos\sdel\sservicio/ })).toHaveAttribute('href', '/legal#terminos');
    expect(screen.getByRole('link', { name: /Política\sde\sprivacidad/ })).toHaveAttribute('href', '/legal#privacidad');
    expect(screen.getByText(/de Segunda Opinión Médica\./)).toBeInTheDocument();
    expect(document.body.innerHTML).not.toMatch(/medplum\.com|de Medplum/);
  });

  test('si el servidor rechaza el alta, muestra el error', async () => {
    await renderizar(new MockClient({ profile: null }), <RegistroForm projectId="p1" onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/^Apellido/), { target: { value: 'García' } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ana@example.com' } });
    fireEvent.change(screen.getByLabelText(/^Contraseña/), { target: { value: 'una-clave-larga' } });
    await enviar('Crear cuenta');
    expect(await screen.findByText('Invalid')).toBeInTheDocument();
  });
});

test.each([
  ['Email or password is invalid', 'El email o la contraseña no son correctos.'],
  ['Email already registered', 'Ya existe una cuenta con ese email. Probá iniciar sesión.'],
  ['Password found in breach database', 'Esa contraseña apareció en filtraciones de datos. Elegí otra.'],
  ['Recaptcha failed', 'No pudimos verificar que no seas un robot. Probá de nuevo.'],
  ['Algo que no conocemos', 'Algo que no conocemos'],
])('traducirMensaje("%s")', (original, esperado) => {
  expect(traducirMensaje(original)).toBe(esperado);
});
