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
    { name: 'Perfil', href: '/account/profile' },
    { name: 'Médico de cabecera', href: '/account/provider' },
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
