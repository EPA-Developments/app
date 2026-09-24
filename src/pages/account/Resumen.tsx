// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Resumen de "Mi cuenta": entrada a todo lo del usuario, agrupado por los tres ejes
// (Usuario · Cliente · Paciente).
import { Avatar, Box, Card, Group, Stack, Text, ThemeIcon, Title, UnstyledButton } from '@mantine/core';
import { formatHumanName } from '@medplum/core';
import type { Patient, Practitioner } from '@medplum/fhirtypes';
import { useMedplumProfile } from '@medplum/react';
import {
  IconChevronRight,
  IconClipboardHeart,
  IconFileCheck,
  IconHeartbeat,
  IconLogout,
  IconUserCircle,
  IconUsers,
  IconWallet,
} from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';
import { Fragment } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';

interface Opcion {
  readonly icon: Icon;
  readonly titulo: string;
  readonly descripcion: string;
  readonly href: string;
}

interface Grupo {
  readonly eje: string;
  readonly subtitulo: string;
  readonly opciones: Opcion[];
}

const GRUPOS: Grupo[] = [
  {
    eje: 'Usuario',
    subtitulo: 'Mis datos',
    opciones: [
      {
        icon: IconUserCircle,
        titulo: 'Mis datos',
        descripcion: 'Datos personales, contacto, domicilio y contacto de emergencia.',
        href: '/account/profile',
      },
      {
        icon: IconUsers,
        titulo: 'Mi equipo de salud',
        descripcion: 'Tu médico de cabecera y quiénes te acompañan.',
        href: '/account/equipo',
      },
    ],
  },
  {
    eje: 'Cliente',
    subtitulo: 'Mi membresía',
    opciones: [
      { icon: IconWallet, titulo: 'Membresía', descripcion: 'Turnos, sesiones, cobertura y pagos.', href: '/membership' },
    ],
  },
  {
    eje: 'Paciente',
    subtitulo: 'Mi salud',
    opciones: [
      {
        icon: IconHeartbeat,
        titulo: 'Historia de salud',
        descripcion: 'Biomarcadores, signos vitales y cuestionarios.',
        href: '/health-record',
      },
      {
        icon: IconClipboardHeart,
        titulo: 'Mi Plan Bienestar',
        descripcion: 'Tu Plan Bienestar · 100 días, paso a paso.',
        href: '/care-plan/plan-100-dias',
      },
      {
        icon: IconFileCheck,
        titulo: 'Consentimiento y privacidad',
        descripcion: 'Tu autorización y el uso de tus datos.',
        href: '/health-record/consent',
      },
    ],
  },
];

function Fila({ opcion, color, onClick }: { opcion: Opcion; color?: string; onClick: () => void }): JSX.Element {
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
          <Text size="sm" c="dimmed">
            {opcion.descripcion}
          </Text>
        </div>
        <IconChevronRight size={18} color="var(--mantine-color-gray-5)" />
      </Group>
    </UnstyledButton>
  );
}

function Opciones({ opciones, color }: { opciones: Opcion[]; color?: string }): JSX.Element {
  const navigate = useNavigate();
  return (
    <Card withBorder radius="md" p={0}>
      {opciones.map((o, i) => (
        <Fragment key={o.href}>
          {i > 0 && <Box style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }} />}
          <Fila opcion={o} color={color} onClick={() => navigate(o.href)?.catch(console.error)} />
        </Fragment>
      ))}
    </Card>
  );
}

export function Resumen(): JSX.Element {
  const profile = useMedplumProfile() as Patient | Practitioner | undefined;
  const nombre = profile?.name?.[0] ? formatHumanName(profile.name[0]) : '';
  const email = profile?.telecom?.find((t) => t.system === 'email')?.value;

  return (
    <Box p="xl">
      <Group mb="lg">
        <Avatar size={64} radius="xl" color="segundaOpinion">
          {nombre
            .split(' ')
            .slice(0, 2)
            .map((p) => p[0])
            .join('')
            .toUpperCase()}
        </Avatar>
        <div>
          <Title order={2}>{nombre}</Title>
          {email && <Text c="dimmed">{email}</Text>}
        </div>
      </Group>

      <Stack gap="lg">
        {GRUPOS.map((g) => (
          <div key={g.eje}>
            <Text size="sm" fw={700} tt="uppercase" mb={6}>
              <Text span c="segundaOpinion" inherit>
                {g.eje}
              </Text>{' '}
              <Text span c="dimmed" inherit>
                · {g.subtitulo}
              </Text>
            </Text>
            <Opciones opciones={g.opciones} />
          </div>
        ))}
        <Opciones
          color="red"
          opciones={[
            {
              icon: IconLogout,
              titulo: 'Cerrar sesión',
              descripcion: 'Salir de tu cuenta en este dispositivo.',
              href: '/signout',
            },
          ]}
        />
      </Stack>
    </Box>
  );
}
