// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Inicio de "Salud" en smartphone: cada sección de la Historia Clínica con sus opciones
// (cuestionarios, paneles de biomarcadores, mediciones…), igual que el Resumen de
// "Mi cuenta". En web manda el menú lateral y el inicio sigue siendo Biomarcadores.
import { Box, Stack, Text, Title, useMantineTheme } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import type { JSX } from 'react';
import { Navigate } from 'react-router';
import { TarjetaDeOpciones } from '../../components/TarjetaDeOpciones';
import type { OpcionDeMenu } from '../../components/TarjetaDeOpciones';
import { SECCIONES_SALUD, TITULO_SALUD } from './Salud.data';

export const INICIO_SALUD_WEB = '/health-record/biomarkers';

interface Grupo {
  readonly titulo: string;
  readonly opciones: OpcionDeMenu[];
}

// Las secciones con sub-opciones van cada una con su título; las que son una sola opción
// (Cuestionarios, Consentimiento) se juntan al final.
const GRUPOS: Grupo[] = [
  ...SECCIONES_SALUD.filter((s) => s.opciones?.length).map((s) => ({
    titulo: s.titulo,
    opciones: (s.opciones ?? []).map((o) => ({ ...o, icon: s.icon })),
  })),
  {
    titulo: 'Registros',
    opciones: SECCIONES_SALUD.filter((s) => !s.opciones?.length).map((s) => ({
      icon: s.icon,
      titulo: s.titulo,
      descripcion: s.descripcion,
      href: s.href,
    })),
  },
];

export function SaludInicio(): JSX.Element {
  const theme = useMantineTheme();
  const esWeb = useMediaQuery(`(min-width: ${theme.breakpoints.sm})`, undefined, { getInitialValueInEffect: false });

  if (esWeb) {
    return <Navigate replace to={INICIO_SALUD_WEB} />;
  }

  return (
    <Box py="lg">
      <Title order={2} mb="lg">
        {TITULO_SALUD}
      </Title>
      <Stack gap="lg">
        {GRUPOS.map((g) => (
          <div key={g.titulo}>
            <Text size="sm" fw={700} tt="uppercase" c="segundaOpinion" mb={6}>
              {g.titulo}
            </Text>
            <TarjetaDeOpciones opciones={g.opciones} lineClamp={2} />
          </div>
        ))}
      </Stack>
    </Box>
  );
}
