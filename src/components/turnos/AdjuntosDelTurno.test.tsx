// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// «Estudios para esta consulta», el componente suelto: los estados que no se ven en las
// páginas (errores de red, archivos que no sirven, turnos cancelados, adjuntos embebidos o de
// otra categoría). Lo que se escribe en FHIR lo fijan src/fhir/adjuntosTurno.test.ts y los
// recorridos completos, src/pages/Teleconsulta.test.tsx.
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Appointment, DocumentReference, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { JSX } from 'react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { armarAdjuntoTurno, cargarAdjuntosDelTurno, MENSAJE_TIPO_NO_ADMITIDO } from '../../fhir/adjuntosTurno';
import { CONSENT_TYPE_CODE, CONSENT_TYPE_SYSTEM } from '../../fhir/consentimiento';
import { indexarDefinicionesFhir } from '../../fhir/__fixtures__/glp1';
import { AdjuntosDelTurno, AdjuntosDelTurnoPlegables } from './AdjuntosDelTurno';

const DIA = 24 * 3_600_000;

interface Escenario {
  medplum: MockClient;
  patient: WithId<Patient>;
  turno: WithId<Appointment>;
}

async function escenario(cambios: Partial<Appointment> = {}): Promise<Escenario> {
  indexarDefinicionesFhir();
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({ resourceType: 'Patient', name: [{ given: ['Alex'] }] });
  medplum.setProfile(patient);
  await medplum.createResource<DocumentReference>({
    resourceType: 'DocumentReference',
    status: 'current',
    type: { coding: [{ system: CONSENT_TYPE_SYSTEM, code: CONSENT_TYPE_CODE }] },
    subject: { reference: `Patient/${patient.id}` },
    date: new Date().toISOString(),
    content: [{ attachment: { contentType: 'text/plain', data: 'ZmlybWFkbw==' } }],
  });
  const inicio = new Date(Date.now() + 2 * DIA);
  const turno = await medplum.createResource<Appointment>({
    resourceType: 'Appointment',
    status: 'booked',
    start: inicio.toISOString(),
    end: new Date(inicio.getTime() + 30 * 60_000).toISOString(),
    participant: [{ actor: { reference: `Patient/${patient.id}` }, status: 'accepted' }],
    ...cambios,
  });
  return { medplum, patient, turno };
}

async function mostrar(medplum: MockClient, ui: JSX.Element): Promise<HTMLElement> {
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>{ui}</MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
  return screen.findByRole('region', { name: 'Estudios para esta consulta' });
}

function elegirArchivo(zona: HTMLElement, file: File): void {
  fireEvent.change(zona.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
}

const pdf = (nombre: string): File =>
  new File([new TextEncoder().encode('%PDF-1.7\n')], nombre, { type: 'application/pdf' });

test('el título es del nivel que se pide y nombra la sección', async () => {
  const { medplum, turno } = await escenario();
  const zona = await mostrar(medplum, <AdjuntosDelTurno appointment={turno} nivel={2} />);
  expect(within(zona).getByRole('heading', { level: 2, name: 'Estudios para esta consulta' })).toBeInTheDocument();
  expect(within(zona).getByText(/Lo que adjuntes lo ve el profesional que te atiende/)).toBeInTheDocument();
  expect(await within(zona).findByText(/PDF o foto \(JPG o PNG\), de hasta 15 MB/)).toBeInTheDocument();
});

test('un archivo que no es PDF ni foto: lo dice y no adjunta nada', async () => {
  const { medplum, turno } = await escenario();
  const zona = await mostrar(medplum, <AdjuntosDelTurno appointment={turno} />);
  await within(zona).findByRole('button', { name: 'Subir un PDF o una foto' });
  await act(async () => elegirArchivo(zona, new File(['hola'], 'notas.jpg', { type: 'image/jpeg' })));
  expect(await within(zona).findByRole('alert')).toHaveTextContent(MENSAJE_TIPO_NO_ADMITIDO);
  expect(await cargarAdjuntosDelTurno(medplum, turno.id)).toHaveLength(0);
});

test('si no se pudo leer la lista, lo dice (no «no adjuntaste nada») y deja reintentar', async () => {
  const { medplum, patient, turno } = await escenario();
  await medplum.createResource(
    armarAdjuntoTurno(patient, turno, { contentType: 'application/pdf', data: 'JVBERi0=', title: 'a.pdf' })
  );
  const buscar = medplum.searchResources.bind(medplum);
  type Buscar = typeof medplum.searchResources;
  const fallar = vi
    .spyOn(medplum, 'searchResources')
    .mockImplementation(((...args: Parameters<Buscar>) =>
      args[0] === 'DocumentReference' && JSON.stringify(args[1]).includes('related')
        ? Promise.reject(new Error('Failed to fetch'))
        : buscar(...args)) as Buscar);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

  const zona = await mostrar(medplum, <AdjuntosDelTurno appointment={turno} />);
  expect(await within(zona).findByText('No pudimos traer los estudios adjuntos a esta consulta.')).toBeInTheDocument();
  expect(within(zona).queryByText('Todavía no adjuntaste estudios a esta consulta.')).not.toBeInTheDocument();
  // Igual se puede adjuntar.
  expect(await within(zona).findByRole('button', { name: 'Subir un PDF o una foto' })).toBeInTheDocument();

  fallar.mockRestore();
  await act(async () => fireEvent.click(within(zona).getByRole('button', { name: 'Reintentar' })));
  expect(await within(zona).findByText('a.pdf')).toBeInTheDocument();
});

test('si adjuntar falla por la red: el mensaje, y la lista sigue', async () => {
  const { medplum, patient, turno } = await escenario();
  await medplum.createResource(
    armarAdjuntoTurno(patient, turno, {
      contentType: 'application/pdf',
      url: 'https://example.com/binary/b1',
      title: 'ya.pdf',
    })
  );
  vi.spyOn(medplum, 'createAttachment').mockRejectedValue(new Error('Failed to fetch'));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

  const zona = await mostrar(medplum, <AdjuntosDelTurno appointment={turno} />);
  await within(zona).findByRole('button', { name: 'Subir un PDF o una foto' });
  await act(async () => elegirArchivo(zona, pdf('nuevo.pdf')));
  expect(await within(zona).findByRole('alert')).toHaveTextContent(/No pudimos adjuntar el estudio/);
  expect(within(zona).getByRole('link', { name: /ya\.pdf/ })).toBeInTheDocument();
  expect(within(zona).getByRole('button', { name: 'Subir un PDF o una foto' })).toBeEnabled();
});

test('un adjunto embebido (sin URL) se lista como texto; uno de otra categoría, sin «Quitar»', async () => {
  const { medplum, patient, turno } = await escenario();
  await medplum.createResource(
    armarAdjuntoTurno(patient, turno, { contentType: 'image/jpeg', data: '/9j/', title: 'foto.jpg', size: 3 })
  );
  // Lo que otro (p. ej. el equipo) asoció al turno: se ve, pero la persona no lo quita.
  await medplum.createResource<DocumentReference>({
    resourceType: 'DocumentReference',
    status: 'current',
    subject: { reference: `Patient/${patient.id}` },
    date: new Date().toISOString(),
    description: 'Indicaciones previas',
    content: [{ attachment: { contentType: 'application/pdf', url: 'javascript:alert(1)' } }],
    context: { related: [{ reference: `Appointment/${turno.id}` }] },
  });

  const zona = await mostrar(medplum, <AdjuntosDelTurno appointment={turno} />);
  expect(await within(zona).findByText('foto.jpg')).toBeInTheDocument();
  expect(within(zona).queryByRole('link', { name: /foto\.jpg/ })).not.toBeInTheDocument();
  expect(within(zona).getByRole('button', { name: 'Quitar foto.jpg' })).toBeInTheDocument();
  // Una URL que no es https no se linkea.
  expect(within(zona).getByText('Indicaciones previas')).toBeInTheDocument();
  expect(within(zona).queryByRole('link', { name: /Indicaciones previas/ })).not.toBeInTheDocument();
  expect(within(zona).queryByRole('button', { name: 'Quitar Indicaciones previas' })).not.toBeInTheDocument();
});

test('si quitar falla, lo dice en el diálogo y el estudio sigue adjunto', async () => {
  const { medplum, patient, turno } = await escenario();
  await medplum.createResource(
    armarAdjuntoTurno(patient, turno, {
      contentType: 'application/pdf',
      url: 'https://example.com/binary/b1',
      title: 'eco.pdf',
    })
  );
  vi.spyOn(medplum, 'updateResource').mockRejectedValue(new Error('Failed to fetch'));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

  const zona = await mostrar(medplum, <AdjuntosDelTurno appointment={turno} />);
  await act(async () => fireEvent.click(await within(zona).findByRole('button', { name: 'Quitar eco.pdf' })));
  const dialogo = await screen.findByRole('dialog', { name: '¿Quitar este estudio de la consulta?' });
  await act(async () => fireEvent.click(within(dialogo).getByRole('button', { name: 'Sí, quitarlo' })));
  expect(await within(dialogo).findByRole('alert')).toHaveTextContent(/No pudimos quitar el estudio/);
  await act(async () => fireEvent.click(within(dialogo).getByRole('button', { name: 'No, dejarlo' })));
  expect(within(zona).getByRole('link', { name: /eco\.pdf/ })).toBeInTheDocument();
  expect(await cargarAdjuntosDelTurno(medplum, turno.id)).toHaveLength(1);
});

test('«Elegir de los que ya mandaste» sin PDFs enviados lo dice', async () => {
  const { medplum, turno } = await escenario();
  const zona = await mostrar(medplum, <AdjuntosDelTurno appointment={turno} />);
  await act(async () =>
    fireEvent.click(await within(zona).findByRole('button', { name: 'Elegir de los que ya mandaste' }))
  );
  expect(await within(zona).findByText('Todavía no mandaste estudios en PDF.')).toBeInTheDocument();
});

test('un turno cancelado no admite estudios y lo dice', async () => {
  const { medplum, turno } = await escenario({ status: 'cancelled' });
  const zona = await mostrar(medplum, <AdjuntosDelTurno appointment={turno} />);
  expect(within(zona).getByText('Este turno se canceló: no se pueden sumar más estudios.')).toBeInTheDocument();
  expect(await within(zona).findByText('No se adjuntaron estudios a esta consulta.')).toBeInTheDocument();
  expect(within(zona).queryAllByRole('button')).toHaveLength(0);
});

test('plegado: el botón dice cuántos hay y se actualiza al quitar', async () => {
  const { medplum, patient, turno } = await escenario();
  for (const titulo of ['uno.pdf', 'dos.pdf']) {
    await medplum.createResource(
      armarAdjuntoTurno(patient, turno, {
        contentType: 'application/pdf',
        url: `https://example.com/binary/${titulo}`,
        title: titulo,
      })
    );
  }
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <AdjuntosDelTurnoPlegables appointment={turno} patient={patient} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
  const boton = await screen.findByRole('button', { name: 'Adjuntar estudios (2)' });
  expect(boton).toHaveAttribute('aria-controls');
  await act(async () => fireEvent.click(boton));
  await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Quitar uno.pdf' })));
  await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Sí, quitarlo' })));
  expect(await screen.findByRole('button', { name: 'Adjuntar estudios (1)' })).toHaveAttribute('aria-expanded', 'true');
});
