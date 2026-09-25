// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Resumen de "Mi cuenta": entrada a todo lo del usuario, agrupado por los tres ejes
// (Usuario · Cliente · Paciente). Acá están el nombre y el avatar; las demás pantallas
// de la cuenta no los repiten.
import { Box, Group, Stack, Text, Title } from '@mantine/core';
import { formatHumanName } from '@medplum/core';
import type { Patient, Practitioner } from '@medplum/fhirtypes';
import { ResourceAvatar, useMedplumProfile } from '@medplum/react';
import {
  IconClipboardHeart,
  IconFileCheck,
  IconHeartbeat,
  IconLogout,
  IconUserCircle,
  IconUsers,
  IconWallet,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import { TarjetaDeOpciones } from '../../components/TarjetaDeOpciones';
import type { OpcionDeMenu } from '../../components/TarjetaDeOpciones';

interface Grupo {
  readonly eje: string;
  readonly opciones: OpcionDeMenu[];
}

const GRUPOS: Grupo[] = [
  {
    eje: 'Usuario',
    opciones: [
      {
        icon: IconUserCircle,
        titulo: 'Mis datos',
        descripcion: 'Datos personales, contacto, domicilio, contacto de emergencia y cobertura.',
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
    opciones: [
      {
        icon: IconWallet,
        titulo: 'Membresía',
        descripcion: 'Turnos, sesiones, cobertura y pagos.',
        href: '/membership',
      },
    ],
  },
  {
    eje: 'Paciente',
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

export function Resumen(): JSX.Element {
  const profile = useMedplumProfile() as Patient | Practitioner | undefined;
  const nombre = profile?.name?.[0] ? formatHumanName(profile.name[0]) : '';
  const email = profile?.telecom?.find((t) => t.system === 'email')?.value;

  return (
    <Box p="xl">
      <Group mb="lg">
        <ResourceAvatar size={64} radius="xl" value={profile} />
        <div>
          <Title order={2}>{nombre}</Title>
          {email && <Text c="dimmed">{email}</Text>}
        </div>
      </Group>

      <Stack gap="lg">
        {GRUPOS.map((g) => (
          <div key={g.eje}>
            <Text size="sm" fw={700} tt="uppercase" c="segundaOpinion" mb={6}>
              {g.eje}
            </Text>
            <TarjetaDeOpciones opciones={g.opciones} />
          </div>
        ))}
        <TarjetaDeOpciones
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
