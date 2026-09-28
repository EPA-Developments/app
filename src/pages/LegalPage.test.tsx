// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { SECCIONES_PRIVACIDAD, SECCIONES_TERMINOS } from './health-record/InformedConsent.data';
import { LegalPage } from './LegalPage';

test('/legal muestra los términos y la privacidad de la marca con sus anclas', () => {
  render(
    <MemoryRouter>
      <MedplumProvider medplum={new MockClient({ profile: null })}>
        <MantineProvider>
          <LegalPage />
        </MantineProvider>
      </MedplumProvider>
    </MemoryRouter>
  );
  expect(SECCIONES_TERMINOS.map((s) => s.heading)).toEqual(['2. Descripción del servicio', '3. Alcance y limitaciones']);
  expect(SECCIONES_PRIVACIDAD.map((s) => s.heading)).toEqual([
    '4. Uso de inteligencia artificial',
    '6. Privacidad y tratamiento de datos personales',
  ]);
  expect(screen.getByRole('heading', { name: 'Términos del servicio' }).closest('#terminos')).not.toBeNull();
  expect(screen.getByRole('heading', { name: 'Política de privacidad' }).closest('#privacidad')).not.toBeNull();
  expect(screen.getByRole('heading', { name: 'Alcance y limitaciones' })).toBeInTheDocument();
  expect(screen.getByText(/Ley N° 25\.326/)).toBeInTheDocument();
  expect(screen.getByText(/Segunda Opinión Médica · Dr\. Alejandro Barbagelata/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'info@segundaopinionmedica.org' })).toHaveAttribute(
    'href',
    'mailto:info@segundaopinionmedica.org'
  );
});
