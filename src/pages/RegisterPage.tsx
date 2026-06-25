// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { BackgroundImage, Box, SimpleGrid } from '@mantine/core';
import { RegisterForm } from '@medplum/react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';

const HERO_IMG =
  'https://images.unsplash.com/photo-1556761175-4b46a572b786?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=1567&q=80';

export function RegisterPage(): JSX.Element {
  const navigate = useNavigate();
  return (
    <>
      {/* Mobile: imagen arriba como banner; el formulario va debajo, a lo ancho. */}
      <BackgroundImage src={HERO_IMG} h={150} hiddenFrom="sm" />
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={0}>
        <Box px="md" pt={{ base: 24, sm: 100 }} pb={{ base: 48, sm: 200 }}>
          <RegisterForm
            type="patient"
            projectId={import.meta.env.MEDPLUM_PROJECT_ID}
            googleClientId={import.meta.env.GOOGLE_CLIENT_ID}
            clientId={import.meta.env.MEDPLUM_CLIENT_ID}
            recaptchaSiteKey={import.meta.env.RECAPTCHA_SITE_KEY}
            onSuccess={() => navigate('/')?.catch(console.error)}
          >
            <h2>Crear cuenta en BioWellness</h2>
          </RegisterForm>
        </Box>
        {/* Desktop: imagen al lateral (split). */}
        <BackgroundImage src={HERO_IMG} visibleFrom="sm" />
      </SimpleGrid>
    </>
  );
}
