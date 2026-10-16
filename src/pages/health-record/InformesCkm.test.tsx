// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// «Informes de tu médico»: la paciente ve los informes CKM que firmó el médico y los baja en
// PDF. Pacientes sintéticas, sin nombre.
import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { DocumentReference, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { indexarDefinicionesFhir } from '../../fhir/__fixtures__/glp1';
import { informeCkm } from '../../fhir/__fixtures__/informesCkm';
import { ERROR_DESCARGA } from '../../utils/adjuntos';
import { InformesCkm } from './InformesCkm';

// El MockClient solo filtra DocumentReference por `subject`, `category` y `status` con las
// definiciones FHIR indexadas.
beforeAll(() => indexarDefinicionesFhir());

afterEach(() => {
  vi.restoreAllMocks();
});

/** Una paciente con un informe firmado por cada fecha (AAAA-MM-DD), con estadío 1, 2, … */
async function paciente(fechas: readonly string[] = []): Promise<MockClient> {
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({ resourceType: 'Patient' });
  for (const [i, fecha] of fechas.entries()) {
    await medplum.createResource(informeCkm(patient, { fecha, estadio: String(i + 1) }));
  }
  medplum.setProfile(patient);
  return medplum;
}

async function renderInformes(medplum: MockClient): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <InformesCkm />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

test('lista los informes firmados, del más nuevo al más viejo, con su fecha', async () => {
  await renderInformes(await paciente(['2026-08-10', '2026-10-14']));

  expect(screen.getByRole('heading', { name: 'Informes de tu médico' })).toBeInTheDocument();
  expect(await screen.findByText('Informe CKM · estadío 2')).toBeInTheDocument();
  expect(screen.getByText('Informe CKM · estadío 1')).toBeInTheDocument();
  // Firmado a las 15:00 UTC: las 12:00 de Argentina.
  expect(screen.getByText('14 de octubre de 2026, 12:00')).toBeInTheDocument();
  expect(screen.getByText('10 de agosto de 2026, 12:00')).toBeInTheDocument();
  const texto = document.body.textContent ?? '';
  expect(texto.indexOf('estadío 2')).toBeLessThan(texto.indexOf('estadío 1'));
  expect(screen.getAllByRole('button', { name: /Descargar PDF/ })).toHaveLength(2);
  expect(screen.queryByText(/Todavía no tenés informes/)).not.toBeInTheDocument();
});

test('sin informes, lo dice', async () => {
  await renderInformes(await paciente());
  expect(await screen.findByText(/Todavía no tenés informes de tu médico/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Descargar PDF/ })).not.toBeInTheDocument();
});

/** jsdom no trae URL.createObjectURL ni navega con el click del link: se reemplazan. */
function capturarDescargas(): string[] {
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:informe'), revokeObjectURL: vi.fn() });
  const nombres: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    nombres.push(this.download);
  });
  return nombres;
}

const PDF_OK = (): Response => new Response(new Blob(['%PDF-1.7'], { type: 'application/pdf' }), { status: 200 });

test('«Descargar PDF» vuelve a leer el informe y baja el archivo con el link fresco', async () => {
  const medplum = await paciente(['2026-10-14']);
  const leer = vi.spyOn(medplum, 'readResource');
  const bajar = vi.spyOn(medplum, 'downloadResponse').mockImplementation(async () => PDF_OK());
  const nombres = capturarDescargas();

  await renderInformes(medplum);
  const boton = await screen.findByRole('button', { name: /Descargar PDF/ });
  // El server firma de nuevo el link en cada lectura: el del listado puede estar vencido.
  const [doc] = await medplum.searchResources('DocumentReference', {});
  await medplum.updateResource<DocumentReference>({
    ...doc,
    content: [{ attachment: { ...doc.content[0].attachment, url: 'https://storage.ejemplo.test/informe?Expires=2' } }],
  });
  await act(async () => fireEvent.click(boton));

  await waitFor(() => expect(nombres).toEqual(['informe-ckm-2026-10-14.pdf']));
  expect(leer).toHaveBeenCalledWith('DocumentReference', doc.id, expect.objectContaining({ cache: 'no-cache' }));
  expect(bajar).toHaveBeenCalledWith('https://storage.ejemplo.test/informe?Expires=2');
});

test('si el server no da el archivo, avisa y no guarda nada', async () => {
  const medplum = await paciente(['2026-10-14']);
  vi.spyOn(medplum, 'downloadResponse').mockImplementation(
    async () => new Response('<Error>AccessDenied</Error>', { status: 403, headers: { 'Content-Type': 'application/xml' } })
  );
  const avisos = vi.spyOn(notifications, 'show');
  const nombres = capturarDescargas();

  await renderInformes(medplum);
  await act(async () => fireEvent.click(await screen.findByRole('button', { name: /Descargar PDF/ })));

  await waitFor(() => expect(avisos).toHaveBeenCalledWith(expect.objectContaining({ message: ERROR_DESCARGA })));
  expect(nombres).toEqual([]);
});

test('cada «Descargar PDF» dice de qué informe es', async () => {
  await renderInformes(await paciente(['2026-08-10', '2026-10-14']));
  await screen.findByText('Informe CKM · estadío 2');
  const [nuevo, viejo] = screen.getAllByRole('button', { name: 'Descargar PDF' });
  expect(nuevo).toHaveAccessibleDescription('14 de octubre de 2026, 12:00 Informe CKM · estadío 2');
  expect(viejo).toHaveAccessibleDescription('10 de agosto de 2026, 12:00 Informe CKM · estadío 1');
});
