// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Box, Container, Group } from '@mantine/core';
import { IconChevronLeft } from '@tabler/icons-react';
import { Suspense } from 'react';
import type { JSX } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { SideMenu } from '../../components/SideMenu';

const RUTA_RESUMEN = '/account/resumen';

const sideMenu = {
  title: 'Mi cuenta',
  menu: [
    { name: 'Resumen', href: RUTA_RESUMEN },
    { name: 'Mis datos', href: '/account/profile' },
    { name: 'Mi equipo de salud', href: '/account/equipo' },
    { name: 'Membresía', href: '/membership' },
    { name: 'Consentimiento y privacidad', href: '/health-record/consent' },
  ],
};

export function AccountPage(): JSX.Element {
  const { pathname } = useLocation();
  const enResumen = pathname === '/account' || pathname === RUTA_RESUMEN;
  return (
    <Container size="lg">
      <Group align="flex-start" gap="xl" wrap="wrap">
        {/* En smartphone el Resumen ya lleva a cada opción: el menú lateral sería repetido. */}
        <Box visibleFrom="sm">
          <SideMenu {...sideMenu} />
        </Box>
        <div style={{ flex: 1, minWidth: 0, maxWidth: 820 }}>
          {!enResumen && (
            <Box hiddenFrom="sm" pt="md">
              <Anchor component={Link} to={RUTA_RESUMEN} size="sm" fw={500}>
                <Group gap={2} wrap="nowrap">
                  <IconChevronLeft size={16} />
                  Mi cuenta
                </Group>
              </Anchor>
            </Box>
          )}
          <Suspense fallback={<div>Cargando...</div>}>
            <Outlet />
          </Suspense>
        </div>
      </Group>
    </Container>
  );
}
