// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Marca blanca: con otra marca (como si el deploy definiera las variables MARCA_*), la
// landing, el contenido CKM, el consentimiento de teleconsulta y la solicitud muestran esa
// marca y no queda ningún rastro de la marca por defecto (ni su nombre ni su dominio).
import { MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { TEXTO_CONSENTIMIENTO_TELECONSULTA } from '../fhir/agenda';
import type * as ModuloMarca from '../marca';
import { PLAN_BIENESTAR_CKM } from './ckm/ckm.contenido';
import { LandingPage } from './landing';
import { MiSegundaOpinion } from './MiSegundaOpinion';
import { SolicitarSOM } from './SolicitarSOM';

vi.mock('../marca', async (importOriginal) => {
  const real = await importOriginal<typeof ModuloMarca>();
  return {
    ...real,
    MARCA: real.armarMarca({
      MARCA_NOMBRE: 'Clínica del Sur',
      MARCA_PRODUCTO: 'Revisión Experta',
      MARCA_RESPONSABLE: 'Dra. Ana Pérez',
      MARCA_DIRECCION: 'Av. Siempreviva 742, Córdoba',
      MARCA_EMAIL: 'hola@clinicadelsur.com.ar',
    }),
  };
});

// La marca por defecto (la de marca.json), para comprobar que no aparece.
async function marcaPorDefecto(): Promise<{ nombre: string; dominio: string }> {
  const { MARCA } = await vi.importActual<typeof ModuloMarca>('../marca');
  return { nombre: MARCA.nombre, dominio: MARCA.email.split('@')[1] };
}

function renderizar(ui: ReactNode): HTMLElement {
  return render(
    <MemoryRouter>
      <MedplumProvider medplum={new MockClient()}>
        <MantineProvider>{ui}</MantineProvider>
      </MedplumProvider>
    </MemoryRouter>
  ).container;
}

async function sinMarcaPorDefecto(html: string): Promise<void> {
  const { nombre, dominio } = await marcaPorDefecto();
  expect(nombre).not.toBe('Clínica del Sur');
  expect(html).not.toContain(nombre);
  expect(html).not.toContain(dominio);
}

test('landing con otra marca', async () => {
  const pantalla = renderizar(<LandingPage />);
  expect(screen.getByAltText('Análisis de datos clínicos en Clínica del Sur')).toBeInTheDocument();
  expect(screen.getByAltText('Cardiólogo de Clínica del Sur')).toBeInTheDocument();
  expect(screen.getByText('Revisión Experta Cardiológica')).toBeInTheDocument();
  expect(screen.getByText(/recibí un informe de segunda opinión del equipo de Clínica del Sur\.$/)).toBeInTheDocument();
  expect(screen.getAllByText('hola@clinicadelsur.com.ar').length).toBeGreaterThan(0);
  await sinMarcaPorDefecto(pantalla.innerHTML);
});

test('CKM y teleconsulta con otra marca', async () => {
  expect(PLAN_BIENESTAR_CKM.parrafos[0]).toMatch(/de un profesional de la red Clínica del Sur\.$/);
  expect(TEXTO_CONSENTIMIENTO_TELECONSULTA).toMatch(/^Acepto recibir .* de los profesionales de Clínica del Sur\. /);
  await sinMarcaPorDefecto(PLAN_BIENESTAR_CKM.parrafos.join('\n') + TEXTO_CONSENTIMIENTO_TELECONSULTA);
});

test('solicitud y Mi Revisión Experta con otra marca', async () => {
  const solicitud = renderizar(<SolicitarSOM />);
  expect(screen.getByRole('heading', { name: 'Solicitar una Revisión Experta Médica' })).toBeInTheDocument();
  expect(screen.getByText(/disponible en "Mi Revisión Experta"\.$/)).toBeInTheDocument();
  expect(await screen.findByText(/^Antes de pedir tu Revisión Experta necesitamos/)).toBeInTheDocument();
  await sinMarcaPorDefecto(solicitud.innerHTML);

  const mia = renderizar(<MiSegundaOpinion />);
  expect(screen.getByRole('heading', { name: 'Mi Revisión Experta' })).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: 'Solicitar una Revisión Experta' })).toBeInTheDocument();
  await sinMarcaPorDefecto(mia.innerHTML);
});
