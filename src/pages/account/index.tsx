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
    { name: 'Membresía y Facturación', href: '/account/membership-and-billing' },
  ],
};

export function AccountPage(): JSX.Element {
  return (
    <Container>
      <Group align="top">
        <SideMenu {...sideMenu} />
        <div style={{ width: 800, flex: 800 }}>
          <Suspense fallback={<div>Cargando...</div>}>
            <Outlet />
          </Suspense>
        </div>
      </Group>
    </Container>
  );
}
