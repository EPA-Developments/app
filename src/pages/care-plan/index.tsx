// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Container, Group } from '@mantine/core';
import { Suspense } from 'react';
import type { JSX } from 'react';
import { Outlet } from 'react-router';
import { Loading } from '../../components/Loading';
import { SideMenu } from '../../components/SideMenu';

const sideMenu = {
  title: 'Plan de Cuidado',
  menu: [
    { name: 'Pasos del plan', href: '/care-plan/action-items' },
    { name: 'Plan Bienestar 100 Días', href: '/care-plan/plan-100-dias' },
  ],
};

export function CarePlanPage(): JSX.Element {
  return (
    <Container size="lg">
      <Group align="flex-start" gap="xl" wrap="wrap">
        <SideMenu {...sideMenu} />
        <div style={{ flex: 1, minWidth: 0, maxWidth: 820 }}>
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </div>
      </Group>
    </Container>
  );
}
