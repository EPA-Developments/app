// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Con la marca por defecto (src/marca.json), la landing, el contenido CKM, el consentimiento
// de teleconsulta y la solicitud de Segunda Opinión se ven igual que cuando tenían la marca
// escrita a mano. La otra cara (otra marca, sin rastros de esta) está en OtraMarca.test.tsx.
import { MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { TEXTO_CONSENTIMIENTO_TELECONSULTA } from '../fhir/agenda';
import { PLAN_BIENESTAR_CKM } from './ckm/ckm.contenido';
import { LandingPage } from './landing';
import { MiSegundaOpinion } from './MiSegundaOpinion';
import { SolicitarSOM } from './SolicitarSOM';

function renderizar(ui: ReactNode): void {
  render(
    <MemoryRouter>
      <MedplumProvider medplum={new MockClient()}>
        <MantineProvider>{ui}</MantineProvider>
      </MedplumProvider>
    </MemoryRouter>
  );
}

test('landing: el nombre de la marca en las imágenes y el cierre, y el servicio en su tarjeta', () => {
  renderizar(<LandingPage />);
  expect(screen.getByAltText('Análisis de datos clínicos en Segunda Opinión Médica')).toBeInTheDocument();
  expect(screen.getByAltText('Cardiólogo de Segunda Opinión Médica')).toBeInTheDocument();
  expect(screen.getByText('Segunda Opinión Cardiológica')).toBeInTheDocument();
  expect(
    screen.getByText(
      'Creá tu cuenta, cargá tu caso y tus estudios, y recibí un informe de segunda opinión del equipo de Segunda Opinión Médica.'
    )
  ).toBeInTheDocument();
});

test('CKM y teleconsulta: el prestador es la marca', () => {
  expect(PLAN_BIENESTAR_CKM.parrafos[0]).toMatch(
    /con el acompañamiento de un profesional de la red Segunda Opinión Médica\.$/
  );
  expect(TEXTO_CONSENTIMIENTO_TELECONSULTA).toMatch(
    /^Acepto recibir atención por videollamada \(teleconsulta\) de los profesionales de Segunda Opinión Médica\. /
  );
});

test('solicitud: el título, la explicación y el aviso de consentimiento nombran el servicio', async () => {
  renderizar(<SolicitarSOM />);
  expect(screen.getByRole('heading', { name: 'Solicitar una Segunda Opinión Médica' })).toBeInTheDocument();
  expect(
    screen.getByText(
      'Cargá el motivo de consulta y tus datos clínicos. Nuestro equipo prepara un informe de Segunda Opinión cardiológica y te avisamos cuando esté disponible en "Mi Segunda Opinión".'
    )
  ).toBeInTheDocument();
  expect(
    await screen.findByText(/^Antes de pedir tu Segunda Opinión necesitamos que firmes el consentimiento informado\./)
  ).toBeInTheDocument();
});

test('Mi Segunda Opinión: el título y el estado vacío', async () => {
  renderizar(<MiSegundaOpinion />);
  expect(screen.getByRole('heading', { name: 'Mi Segunda Opinión' })).toBeInTheDocument();
  expect(
    await screen.findByText(
      'Cuando pidas una Segunda Opinión vas a ver acá su estado y, al completarse, el informe y el PDF.'
    )
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Solicitar una Segunda Opinión' })).toBeInTheDocument();
});
