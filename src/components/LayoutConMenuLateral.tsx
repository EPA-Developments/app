// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Layout de las secciones con menú lateral ("Mi cuenta", "Salud"). En web el menú va a
// la izquierda. En smartphone NO se muestra (quedaba arriba, encima del contenido): la
// pantalla de inicio de la sección lleva a cada opción, y las demás pantallas tienen
// "‹ <sección>" para volver a ella.
import { Anchor, Box, Container, Group } from '@mantine/core';
import { IconChevronLeft } from '@tabler/icons-react';
import { Suspense } from 'react';
import type { JSX } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { Loading } from './Loading';
import { SideMenu } from './SideMenu';
import type { SideMenuProps } from './SideMenu';

export interface LayoutConMenuLateralProps {
  readonly menu: SideMenuProps;
  /** Pantalla de inicio de la sección en smartphone (a donde lleva "‹ volver"). */
  readonly inicio: string;
  /** Texto del "‹ volver", p. ej. "Mi cuenta". */
  readonly volver: string;
  /** Otras rutas que también son la pantalla de inicio (p. ej. la raíz de la sección). */
  readonly otrasRutasDeInicio?: readonly string[];
}

export function LayoutConMenuLateral({
  menu,
  inicio,
  volver,
  otrasRutasDeInicio = [],
}: LayoutConMenuLateralProps): JSX.Element {
  const { pathname } = useLocation();
  const ruta = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const enInicio = ruta === inicio || otrasRutasDeInicio.includes(ruta);
  return (
    <Container size="lg">
      <Group align="flex-start" gap="xl" wrap="wrap">
        <Box visibleFrom="sm">
          <SideMenu {...menu} />
        </Box>
        <div style={{ flex: 1, minWidth: 0, maxWidth: 820 }}>
          {!enInicio && (
            <Box hiddenFrom="sm" pt="md">
              <Anchor component={Link} to={inicio} size="sm" fw={500}>
                <Group gap={2} wrap="nowrap">
                  <IconChevronLeft size={16} />
                  {volver}
                </Group>
              </Anchor>
            </Box>
          )}
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </div>
      </Group>
    </Container>
  );
}
