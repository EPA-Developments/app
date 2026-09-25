// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Tarjeta con filas navegables (ícono · título · descripción · ›). La usan las pantallas
// de inicio de las secciones en smartphone: el Resumen de "Mi cuenta" y el inicio de "Salud".
import { Box, Card, Group, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';
import { Fragment } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';

export interface OpcionDeMenu {
  readonly icon: Icon;
  readonly titulo: string;
  readonly descripcion?: string;
  readonly href: string;
}

function Fila({
  opcion,
  color,
  lineClamp,
  onClick,
}: {
  opcion: OpcionDeMenu;
  color?: string;
  lineClamp?: number;
  onClick: () => void;
}): JSX.Element {
  return (
    <UnstyledButton onClick={onClick} p="md" w="100%">
      <Group wrap="nowrap">
        <ThemeIcon size={40} radius="md" variant="light" color={color}>
          <opcion.icon size={20} stroke={1.5} />
        </ThemeIcon>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text fw={600} c={color}>
            {opcion.titulo}
          </Text>
          {opcion.descripcion && (
            <Text size="sm" c="dimmed" lineClamp={lineClamp}>
              {opcion.descripcion}
            </Text>
          )}
        </div>
        <IconChevronRight size={18} color="var(--mantine-color-gray-5)" />
      </Group>
    </UnstyledButton>
  );
}

export function TarjetaDeOpciones({
  opciones,
  color,
  lineClamp,
}: {
  opciones: readonly OpcionDeMenu[];
  color?: string;
  /** Máximo de líneas de la descripción (sin tope si se omite). */
  lineClamp?: number;
}): JSX.Element {
  const navigate = useNavigate();
  return (
    <Card withBorder radius="md" p={0}>
      {opciones.map((o, i) => (
        <Fragment key={o.href}>
          {i > 0 && <Box style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }} />}
          <Fila opcion={o} color={color} lineClamp={lineClamp} onClick={() => navigate(o.href)?.catch(console.error)} />
        </Fragment>
      ))}
    </Card>
  );
}
