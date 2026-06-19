// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Text, useMantineTheme } from '@mantine/core';
import type { JSX } from 'react';

// Logo preliminar de BioWellness.
// TODO: reemplazar esta URL externa por un asset local en src/img/ (servir el logo desde el repo).
const LOGO_URL =
  'https://lh3.googleusercontent.com/a/ACg8ocLarGPa9bcaK9TZcUg-rlgB4GHKXfpsbuDO2Wam4iJhTPx8SLs=s576-c-no';

export interface LogoProps {
  readonly width: number;
}

export function Logo({ width }: LogoProps): JSX.Element {
  const theme = useMantineTheme();
  // Los headers pasan width=240; derivamos el alto de la imagen y el tamaño del texto.
  const imgSize = Math.round(width / 6);
  const fontSize = Math.round(imgSize * 0.62);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(imgSize * 0.3) }}>
      <img
        src={LOGO_URL}
        alt="BioWellness"
        width={imgSize}
        height={imgSize}
        style={{ borderRadius: '50%', display: 'block', objectFit: 'cover' }}
      />
      <Text
        component="span"
        c={`${theme.primaryColor}.8`}
        fw={700}
        style={{ fontSize, lineHeight: 1, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}
      >
        Bio<span style={{ fontWeight: 400 }}>Wellness</span>
      </Text>
    </span>
  );
}
