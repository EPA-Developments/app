// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// "¿Qué querés hacer?" — la hoja de acciones del botón "+". Es la misma en smartphone
// (botón central del menú inferior) y en web (botón "+" del Header), así las opciones
// se definen una sola vez. El camino completo de opciones está en docs/acciones-rapidas.md.
import { Container, Drawer, Stack, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import {
  IconCalendarPlus,
  IconClipboardHeart,
  IconFileUpload,
  IconMessage,
  IconReportMedical,
} from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import classes from './AccionesRapidas.module.css';

export interface AccionRapida {
  readonly icon: Icon;
  readonly label: string;
  readonly description: string;
  readonly href: string;
}

export const RUTA_ENVIAR_ESTUDIOS = '/enviar-estudios';

export const ACCIONES_RAPIDAS: readonly AccionRapida[] = [
  {
    icon: IconClipboardHeart,
    label: 'Mi Plan Bienestar',
    description: 'Tus pasos y metas de los 100 días.',
    href: '/care-plan/plan-100-dias',
  },
  {
    icon: IconCalendarPlus,
    label: 'Reservar turno',
    description: 'Pedí tu próxima sesión o consulta.',
    href: '/get-care',
  },
  {
    icon: IconFileUpload,
    label: 'Enviar estudios en PDF',
    description: 'Tu laboratorio en PDF; lo procesamos automáticamente.',
    href: RUTA_ENVIAR_ESTUDIOS,
  },
  {
    icon: IconReportMedical,
    label: 'Cargar resultado',
    description: 'Sumá un valor de laboratorio a mano.',
    href: '/health-record/biomarkers',
  },
  { icon: IconMessage, label: 'Enviar mensaje', description: 'Escribile a tu equipo.', href: '/Communication' },
];

export function AccionesRapidas({ opened, onClose }: { opened: boolean; onClose: () => void }): JSX.Element {
  const navigate = useNavigate();

  const go = (href: string): void => {
    onClose();
    navigate(href)?.catch(console.error);
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="bottom"
      // Hoja a la altura de su contenido (con `size`, Mantine la estira a toda la pantalla):
      // arriba queda el overlay para cerrarla tocando afuera.
      styles={{ content: { height: 'auto' } }}
      radius="lg"
      withCloseButton={false}
      padding="lg"
      zIndex={2000}
    >
      <Container size="sm" p={0}>
        <Stack gap="xs">
          <Text fw={700} fz="lg" mb={4}>
            ¿Qué querés hacer?
          </Text>
          {ACCIONES_RAPIDAS.map((a) => (
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
      </Container>
    </Drawer>
  );
}
