// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Menú inferior fijo para smartphone (estilo billetera): 4 ejes + botón "+" central.
// Inicio · Salud · [ + ] · Membresía · Cuenta. El "+" abre la hoja "¿Qué querés hacer?"
// (`AccionesRapidas`, la misma que el "+" del Header en web). Solo se muestra en mobile
// (oculto en >= sm; en desktop manda el Header superior).
import { ActionIcon, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconHeartbeat, IconHome, IconPlus, IconUser, IconWallet } from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { AccionesRapidas, RUTA_ENVIAR_ESTUDIOS } from './AccionesRapidas';
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
    match: ['/health-record', '/care-plan', '/Observation', RUTA_ENVIAR_ESTUDIOS],
  },
  { icon: IconWallet, label: 'Membresía', href: '/membership', match: ['/membership'] },
  { icon: IconUser, label: 'Cuenta', href: '/account', match: ['/account'] },
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

      <AccionesRapidas opened={opened} onClose={close} />
    </>
  );
}
