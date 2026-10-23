// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Visual simple del score PREVENT (AHA 2023): tres anillos con las probabilidades de
// riesgo. La interpretación clínica detallada va en el informe; acá es solo un resumen.
//
// El número de PREVENT nunca se muestra sin la leyenda de calibración (como en el dashboard):
// las ecuaciones salen de cohortes de Estados Unidos y no están verificadas en la Argentina.
import { Group, RingProgress, Stack, Text } from '@mantine/core';
import type { JSX } from 'react';
import type { PreventValores } from '../fhir/som';

interface Riesgo {
  readonly key: keyof PreventValores;
  readonly label: string;
}

/**
 * La leyenda de calibración, en palabras de la paciente: va con todo número de PREVENT (acá y en
 * las Homes, prevent.ts). En el dashboard: «PREVENT se derivó en cohortes estadounidenses. Su
 * calibración en población argentina no está verificada».
 */
export const LEYENDA_CALIBRACION_PREVENT =
  'Este cálculo se hizo con datos de personas de Estados Unidos. Todavía no se sabe qué tan exacto es en la Argentina.';

const RIESGOS: readonly Riesgo[] = [
  { key: 'ascvd10', label: 'ASCVD 10 años' },
  { key: 'hf10', label: 'IC 10 años' },
  { key: 'total30', label: 'ECV total 30 años' },
];

/** Color del anillo según la magnitud (señal visual, no umbral clínico). */
function colorFor(v: number): string {
  const pct = v * 100;
  if (pct < 5) {
    return 'green';
  }
  if (pct < 10) {
    return 'segundaOpinion';
  }
  if (pct < 20) {
    return 'yellow';
  }
  return 'red';
}

function Anillo({ label, value }: { label: string; value?: number }): JSX.Element {
  const has = typeof value === 'number' && !Number.isNaN(value);
  const pct = has ? value * 100 : 0;
  return (
    <Stack align="center" gap={4}>
      <RingProgress
        size={120}
        thickness={11}
        roundCaps
        sections={has ? [{ value: Math.min(pct, 100), color: colorFor(value) }] : [{ value: 0, color: 'gray' }]}
        label={
          <Text ta="center" fw={700} size="lg">
            {has ? `${pct.toFixed(1)}%` : '—'}
          </Text>
        }
      />
      <Text size="sm" c="dimmed" ta="center" maw={120}>
        {label}
      </Text>
    </Stack>
  );
}

export function PreventScore({ valores }: { valores: PreventValores }): JSX.Element {
  return (
    <Stack gap="xs">
      <Text fw={600}>Score PREVENT (AHA 2023)</Text>
      <Group justify="center" gap="xl" wrap="wrap">
        {RIESGOS.map((r) => (
          <Anillo key={r.key} label={r.label} value={valores[r.key]} />
        ))}
      </Group>
      <Text size="xs" c="dimmed" ta="center">
        Estimación automática. La interpretación clínica está en el informe.
      </Text>
      <Text size="xs" c="dimmed" ta="center">
        {LEYENDA_CALIBRACION_PREVENT}
      </Text>
    </Stack>
  );
}
