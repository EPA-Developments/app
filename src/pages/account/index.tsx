// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Container, Group } from '@mantine/core';
import { Suspense } from 'react';
import type { JSX } from 'react';
import { Outlet } from 'react-router';
import { SideMenu } from '../../components/SideMenu';

const sideMenu = {
  title: 'Mi cuenta',
  menu: [
    { name: 'Resumen', href: '/account/resumen' },
    { name: 'Mis datos', href: '/account/profile' },
    { name: 'Mi equipo de salud', href: '/account/equipo' },
    { name: 'Membresía', href: '/membership' },
    { name: 'Consentimiento y privacidad', href: '/health-record/consent' },
  ],
};

export function AccountPage(): JSX.Element {
  return (
    <Container size="lg">
      <Group align="flex-start" gap="xl" wrap="wrap">
        <SideMenu {...sideMenu} />
        <div style={{ flex: 1, minWidth: 0, maxWidth: 820 }}>
          <Suspense fallback={<div>Cargando...</div>}>
            <Outlet />
          </Suspense>
        </div>
      </Group>
    </Container>
  );
}
