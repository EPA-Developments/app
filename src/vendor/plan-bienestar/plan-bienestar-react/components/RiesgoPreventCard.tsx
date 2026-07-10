import type { PreventBanda } from '@epa/careplan-menopausia';
import type { Patient } from '@medplum/fhirtypes';
import { Anchor, Badge, Card, Group, RingProgress, Skeleton, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { useBasePath } from '../PlanBienestarContext';
import { useRiesgoPrevent } from '../hooks/useRiesgoPrevent';

export interface RiesgoPreventCardProps {
  patient?: Patient;
  basePath?: string;
  usaEstatina?: boolean;
}

const BANDA: Record<PreventBanda, { etiqueta: string; color: string }> = {
  bajo: { etiqueta: 'Riesgo bajo', color: 'teal' },
  limite: { etiqueta: 'Riesgo límite', color: 'lime' },
  intermedio: { etiqueta: 'Riesgo intermedio', color: 'yellow' },
  alto: { etiqueta: 'Riesgo alto', color: 'red' },
};

/**
 * "Tu riesgo cardiovascular a 10 años" using the AHA PREVENT base model. When
 * cholesterol is missing the card invites the patient to load it (the model
 * cannot run without it). Educational — never a diagnosis.
 */
export function RiesgoPreventCard(props: RiesgoPreventCardProps): ReactElement | null {
  const navigate = useNavigate();
  const basePath = useBasePath(props.basePath);
  const riesgo = useRiesgoPrevent({ patient: props.patient, usaEstatina: props.usaEstatina });

  if (riesgo.cargando) {
    return <Skeleton height={140} radius="lg" />;
  }

  // Sin colesterol el modelo no corre: invitamos a cargarlo.
  if (!riesgo.resultado) {
    return (
      <Card withBorder radius="lg" p="lg" data-testid="riesgo-prevent-card">
        <Group gap="sm" align="flex-start" wrap="nowrap">
          <ThemeIcon variant="light" color="gray" size={44} radius="xl">
            📈
          </ThemeIcon>
          <Stack gap={4} style={{ flex: 1 }}>
            <Title order={4}>Tu riesgo cardiovascular</Title>
            <Text size="sm" c="dimmed">
              Para estimar tu riesgo a 10 años necesitamos tu {riesgo.faltantes.join(', ')}.
            </Text>
            <Anchor size="sm" fw={500} onClick={() => navigate(`${basePath}/mis-datos`)}>
              Cargar mis datos →
            </Anchor>
          </Stack>
        </Group>
      </Card>
    );
  }

  const banda = riesgo.banda ? BANDA[riesgo.banda] : BANDA.bajo;
  const ascvd = riesgo.resultado.diezAnios.ascvd;

  return (
    <Card withBorder radius="lg" p="lg" data-testid="riesgo-prevent-card">
      <Stack gap="sm">
        <Group gap="sm" align="center" wrap="wrap">
          <RingProgress
            size={120}
            thickness={11}
            roundCaps
            sections={[{ value: Math.min(ascvd, 100), color: banda.color }]}
            label={
              <div style={{ textAlign: 'center' }}>
                <Text fw={700} fz={24} lh={1}>
                  {ascvd}%
                </Text>
                <Text size="xs" c="dimmed">
                  a 10 años
                </Text>
              </div>
            }
            aria-label={`Riesgo ASCVD a 10 años ${ascvd}%`}
          />
          <Stack gap={4} style={{ flex: 1, minWidth: 200 }}>
            <Text size="sm" c="dimmed">
              Tu riesgo cardiovascular (PREVENT)
            </Text>
            <Group gap="xs">
              <Badge size="lg" variant="light" color={banda.color} radius="xl">
                {banda.etiqueta}
              </Badge>
            </Group>
            <Text size="sm">
              Probabilidad de un evento cardiovascular en los próximos 10 años. También a 30 años:{' '}
              <b>{riesgo.resultado.treintaAnios.ascvd}%</b>.
            </Text>
          </Stack>
        </Group>

        <Group gap="lg">
          <div>
            <Text size="xs" c="dimmed">
              Enfermedad cardiovascular total
            </Text>
            <Text fw={600}>{riesgo.resultado.diezAnios.totalCvd}% a 10 años</Text>
          </div>
          <div>
            <Text size="xs" c="dimmed">
              Insuficiencia cardíaca
            </Text>
            <Text fw={600}>{riesgo.resultado.diezAnios.heartFailure}% a 10 años</Text>
          </div>
        </Group>

        {riesgo.faltantes.length > 0 && (
          <Text size="xs" c="dimmed">
            El cálculo mejora si sumás: {riesgo.faltantes.join(', ')}.{' '}
            <Anchor size="xs" onClick={() => navigate(`${basePath}/mis-datos`)}>
              Cargar datos
            </Anchor>
          </Text>
        )}
        <Text size="xs" c="dimmed">
          Estimación educativa según {riesgo.citacion} No reemplaza la evaluación de tu equipo de salud.
        </Text>
      </Stack>
    </Card>
  );
}
