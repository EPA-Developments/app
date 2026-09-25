// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Pantalla de inicio de una sección con menú lateral ("Salud", "Plan de cuidado") en
// smartphone: sus opciones en tarjetas, agrupadas. En web la sección conserva su inicio
// de siempre (`inicioWeb`) y la navegación la hace el menú lateral.
import { Box, Stack, Text, Title, useMantineTheme } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import type { JSX } from 'react';
import { Navigate } from 'react-router';
import { TarjetaDeOpciones } from './TarjetaDeOpciones';
import type { OpcionDeMenu } from './TarjetaDeOpciones';

export interface GrupoDeOpciones {
  /** Sin título, las opciones van sueltas. */
  readonly titulo?: string;
  readonly opciones: readonly OpcionDeMenu[];
}

export function InicioDeSeccion({
  titulo,
  grupos,
  inicioWeb,
}: {
  titulo: string;
  grupos: readonly GrupoDeOpciones[];
  inicioWeb: string;
}): JSX.Element {
  const theme = useMantineTheme();
  const esWeb = useMediaQuery(`(min-width: ${theme.breakpoints.sm})`, undefined, { getInitialValueInEffect: false });

  if (esWeb) {
    return <Navigate replace to={inicioWeb} />;
  }

  return (
    <Box py="lg">
      <Title order={2} mb="lg">
        {titulo}
      </Title>
      <Stack gap="lg">
        {grupos.map((g, i) => (
          <div key={g.titulo ?? i}>
            {g.titulo && (
              <Text size="sm" fw={700} tt="uppercase" c="segundaOpinion" mb={6}>
                {g.titulo}
              </Text>
            )}
            <TarjetaDeOpciones opciones={g.opciones} lineClamp={2} />
          </div>
        ))}
      </Stack>
    </Box>
  );
}
