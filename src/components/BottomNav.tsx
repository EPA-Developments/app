// SPDX-FileCopyrightText: Copyright BioWellness
// SPDX-License-Identifier: Apache-2.0
//
// Menú inferior fijo para smartphone (estilo billetera): 4 ejes + botón "+" central.
// Inicio · Salud · [ + ] · Membresía · Cuenta. El "+" abre una hoja con las acciones
// principales (Reservar / Cargar resultado / Mensaje). Solo se muestra en mobile
// (oculto en >= sm; en desktop manda el Header superior).
import { ActionIcon, Drawer, Stack, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconCalendarPlus,
  IconHeartbeat,
  IconHome,
  IconMessage,
  IconPlus,
  IconReportMedical,
  IconUser,
  IconWallet,
} from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useLocation, useNavigate } from 'react-router';
import classes from './BottomNav.module.css';

interface Tab {
  readonly icon: Icon;
  readonly label: string;
  readonly href: string;
  // Prefijos de ruta que marcan la pestaña como activa.
  readonly match: readonly string[];
}

const tabs: Tab[] = [
  { icon: IconHome, label: 'Inicio', href: '/', match: ['/'] },
  {
    icon: IconHeartbeat,
    label: 'Salud',
    href: '/health-record',
    match: ['/health-record', '/care-plan', '/Observation'],
  },
  { icon: IconWallet, label: 'Membresía', href: '/membership', match: ['/membership'] },
  { icon: IconUser, label: 'Cuenta', href: '/account', match: ['/account'] },
];

interface QuickAction {
  readonly icon: Icon;
  readonly label: string;
  readonly description: string;
  readonly href: string;
}

const quickActions: QuickAction[] = [
  { icon: IconCalendarPlus, label: 'Reservar turno', description: 'Pedí tu próxima sesión o consulta.', href: '/get-care' },
  {
    icon: IconReportMedical,
    label: 'Cargar resultado',
    description: 'Sumá un valor de laboratorio.',
    href: '/health-record/biomarkers',
  },
  { icon: IconMessage, label: 'Enviar mensaje', description: 'Escribile al equipo de BioWellness.', href: '/Communication' },
];

function isActive(pathname: string, tab: Tab): boolean {
  if (tab.href === '/') {
    return pathname === '/';
  }
  return tab.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
}

function TabButton({ tab, active, onClick }: { tab: Tab; active: boolean; onClick: () => void }): JSX.Element {
  return (
    <UnstyledButton className={classes.tab} data-active={active || undefined} onClick={onClick}>
      <tab.icon size={22} stroke={active ? 2 : 1.6} />
      <Text className={classes.tabLabel}>{tab.label}</Text>
    </UnstyledButton>
  );
}

export function BottomNav(): JSX.Element {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [opened, { open, close }] = useDisclosure(false);

  const go = (href: string): void => {
    close();
    navigate(href)?.catch(console.error);
  };

  // 2 pestañas · botón central · 2 pestañas.
  const left = tabs.slice(0, 2);
  const right = tabs.slice(2);

  return (
    <>
      <nav className={classes.bar} aria-label="Navegación principal">
        {left.map((t) => (
          <TabButton key={t.href} tab={t} active={isActive(pathname, t)} onClick={() => go(t.href)} />
        ))}

        <div className={classes.fabSlot}>
          <ActionIcon
            className={classes.fab}
            size={56}
            radius="xl"
            variant="filled"
            aria-label="Acciones rápidas"
            onClick={open}
          >
            <IconPlus size={26} stroke={2} />
          </ActionIcon>
        </div>

        {right.map((t) => (
          <TabButton key={t.href} tab={t} active={isActive(pathname, t)} onClick={() => go(t.href)} />
        ))}
      </nav>

      <Drawer
        opened={opened}
        onClose={close}
        position="bottom"
        size="auto"
        radius="lg"
        withCloseButton={false}
        padding="lg"
        zIndex={2000}
      >
        <Stack gap="xs">
          <Text fw={700} fz="lg" mb={4}>
            ¿Qué querés hacer?
          </Text>
          {quickActions.map((a) => (
            <UnstyledButton key={a.href} className={classes.action} onClick={() => go(a.href)}>
              <ThemeIcon size={44} radius="md" variant="light">
                <a.icon size={24} stroke={1.5} />
              </ThemeIcon>
              <div>
                <Text fw={600}>{a.label}</Text>
                <Text size="sm" c="dimmed">
                  {a.description}
                </Text>
              </div>
            </UnstyledButton>
          ))}
        </Stack>
      </Drawer>
    </>
  );
}
