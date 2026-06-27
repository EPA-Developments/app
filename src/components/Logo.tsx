// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Text, useMantineTheme } from '@mantine/core';
import type { JSX } from 'react';

export interface LogoProps {
  readonly width: number;
}

export function Logo({ width }: LogoProps): JSX.Element {
  const theme = useMantineTheme();
  // Los headers pasan width=240; derivamos el tamaño del texto a partir del ancho disponible.
  const fontSize = Math.round(width / 9.5);
  return (
    <Text
      component="span"
      c={`${theme.primaryColor}.6`}
      fw={700}
      style={{ fontSize, lineHeight: 1, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}
    >
      Segunda Opinión <span style={{ fontWeight: 400 }}>Médica</span>
    </Text>
  );
}
