// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, AppShell, Container, Group, Menu, UnstyledButton, useMantineTheme } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { ResourceAvatar, useMedplumProfile } from '@medplum/react';
import { IconChevronDown, IconLogout, IconPlus, IconUserCircle } from '@tabler/icons-react';
import cx from 'clsx';
import { useState } from 'react';
import type { JSX } from 'react';
import { Link, useNavigate } from 'react-router';
import { AccionesRapidas } from './AccionesRapidas';
import { CampanitaNovedades } from './CampanitaNovedades';
import classes from './Header.module.css';
import { Logo } from './Logo';

// Nav de desktop alineada con los 3 ejes (en mobile manda el menú inferior).
const navigation = [
  { name: 'Plan Bienestar', href: '/care-plan/plan-100-dias' },
  { name: 'Salud', href: '/health-record' },
  { name: 'Membresía', href: '/membership' },
  { name: 'Mensajes', href: '/Communication' },
  { name: 'Reservar', href: '/get-care' },
];

export function Header({ soloCerrarSesion = false }: { soloCerrarSesion?: boolean }): JSX.Element {
  const navigate = useNavigate();
  const profile = useMedplumProfile();
  const theme = useMantineTheme();
  const [userMenuOpened, setUserMenuOpened] = useState(false);
  // El "+" de web: la misma hoja "¿Qué querés hacer?" que el botón central del menú inferior.
  const [accionesOpened, acciones] = useDisclosure(false);

  return (
    <AppShell.Header className={classes.header} withBorder={false}>
      <Container size="lg" h="100%">
        <div className={classes.inner}>
          {soloCerrarSesion ? (
            <div className={classes.logoButton}>
              <Logo width={205} />
            </div>
          ) : (
            <UnstyledButton
              className={classes.logoButton}
              onClick={() => navigate('/')?.catch(console.error)}
              aria-label="Inicio"
            >
              <Logo width={205} />
            </UnstyledButton>
          )}

          {!soloCerrarSesion && (
            <Group gap={2} className={classes.links}>
              {navigation.map((link) => (
                <Link key={link.name} to={link.href} className={classes.link}>
                  {link.name}
                </Link>
              ))}
            </Group>
          )}

          <Group gap="xs" wrap="nowrap">
            {/* Campanita de Novedades: en smartphone y en web. */}
            {!soloCerrarSesion && <CampanitaNovedades />}
            {!soloCerrarSesion && (
              <ActionIcon
                className={classes.acciones}
                size={36}
                radius="xl"
                variant="filled"
                aria-label="Acciones rápidas"
                onClick={acciones.open}
              >
                <IconPlus size={20} stroke={2} />
              </ActionIcon>
            )}
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
                {!soloCerrarSesion && (
                  <>
                    <Menu.Item
                      leftSection={
                        <IconUserCircle size={16} color="var(--mantine-primary-color-filled)" stroke={1.5} />
                      }
                      onClick={() => navigate('/account/resumen')?.catch(console.error)}
                    >
                      Mi cuenta
                    </Menu.Item>
                  </>
                )}
                <Menu.Item
                  leftSection={<IconLogout size={16} color={theme.colors.gray[6]} stroke={1.5} />}
                  onClick={() => navigate('/signout')?.catch(console.error)}
                >
                  Cerrar sesión
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </div>
      </Container>
      {!soloCerrarSesion && <AccionesRapidas opened={accionesOpened} onClose={acciones.close} />}
    </AppShell.Header>
  );
}
