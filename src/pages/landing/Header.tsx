// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AppShell, Button, Container, Group } from '@mantine/core';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { Logo } from '../../components/Logo';
import classes from './Header.module.css';

export function Header(): JSX.Element {
  const navigate = useNavigate();

  return (
    <AppShell.Header className={classes.header} withBorder={false}>
      <Container size="lg" h="100%">
        <Group h="100%" justify="space-between" wrap="nowrap">
          <Logo width={205} />

          {/* Escritorio: iniciar sesión + crear cuenta */}
          <Group gap="xs" visibleFrom="sm">
            <Button variant="subtle" color="gray" onClick={() => navigate('/signin')?.catch(console.error)}>
              Iniciar sesión
            </Button>
            <Button radius="xl" onClick={() => navigate('/register')?.catch(console.error)}>
              Crear cuenta
            </Button>
          </Group>

          {/* Móvil: un solo botón (el hero ya ofrece crear cuenta) */}
          <Button hiddenFrom="sm" radius="xl" size="sm" onClick={() => navigate('/signin')?.catch(console.error)}>
            Ingresar
          </Button>
        </Group>
      </Container>
    </AppShell.Header>
  );
}
