// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AppShell, Container, Group, Menu, UnstyledButton, useMantineTheme } from '@mantine/core';
import { ResourceAvatar, useMedplumProfile } from '@medplum/react';
import { IconChevronDown, IconLogout, IconSettings, IconUserCircle } from '@tabler/icons-react';
import cx from 'clsx';
import { useState } from 'react';
import type { JSX } from 'react';
import { Link, useNavigate } from 'react-router';
import classes from './Header.module.css';
import { Logo } from './Logo';

// Nav de desktop alineada con los 3 ejes (en mobile manda el menú inferior).
const navigation = [
  { name: 'Salud', href: '/health-record' },
  { name: 'Membresía', href: '/membership' },
  { name: 'Mensajes', href: '/Communication' },
  { name: 'Reservar', href: '/get-care' },
];

export function Header(): JSX.Element {
  const navigate = useNavigate();
  const profile = useMedplumProfile();
  const theme = useMantineTheme();
  const [userMenuOpened, setUserMenuOpened] = useState(false);

  return (
    <AppShell.Header className={classes.header} withBorder={false}>
      <Container size="lg" h="100%">
        <div className={classes.inner}>
          <UnstyledButton
            className={classes.logoButton}
            onClick={() => navigate('/')?.catch(console.error)}
            aria-label="Inicio"
          >
            <Logo width={205} />
          </UnstyledButton>

          <Group gap={2} className={classes.links}>
            {navigation.map((link) => (
              <Link key={link.name} to={link.href} className={classes.link}>
                {link.name}
              </Link>
            ))}
          </Group>

          <Menu
            width={240}
            shadow="md"
            radius="md"
            position="bottom-end"
            transitionProps={{ transition: 'pop-top-right' }}
            onClose={() => setUserMenuOpened(false)}
            onOpen={() => setUserMenuOpened(true)}
          >
            <Menu.Target>
              <UnstyledButton className={cx(classes.user, { [classes.userActive]: userMenuOpened })}>
                <Group gap={7}>
                  <ResourceAvatar radius="xl" size={32} value={profile} />
                  <IconChevronDown size={12} stroke={1.5} />
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconUserCircle size={16} color="var(--mantine-primary-color-filled)" stroke={1.5} />}
                onClick={() => navigate('/account/profile')?.catch(console.error)}
              >
                Mi perfil
              </Menu.Item>
              <Menu.Item
                leftSection={<IconSettings size={16} color={theme.colors.blue[6]} stroke={1.5} />}
                onClick={() => navigate('/account/profile')?.catch(console.error)}
              >
                Configuración
              </Menu.Item>
              <Menu.Item
                leftSection={<IconLogout size={16} color={theme.colors.gray[6]} stroke={1.5} />}
                onClick={() => navigate('/signout')?.catch(console.error)}
              >
                Cerrar sesión
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      </Container>
    </AppShell.Header>
  );
}
