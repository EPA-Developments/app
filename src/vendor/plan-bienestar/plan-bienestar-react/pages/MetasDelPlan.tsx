import type { ReactElement } from 'react';
import type { Goal, Patient } from '@medplum/fhirtypes';
import {
  Anchor,
  Badge,
  Card,
  Group,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { useNavigate } from 'react-router';
import { useBasePath } from '../PlanBienestarContext';
import { usePlanBienestar } from '../hooks/usePlanBienestar';
import { EMOJI_POR_CATEGORIA, textoMeta } from '../fhirTexto';

export interface MetasDelPlanProps {
  patient?: Patient;
  basePath?: string;
}

function emojiDeMeta(meta: Goal): string {
  const codigo = meta.category?.[0]?.coding?.[0]?.code;
  return (codigo && EMOJI_POR_CATEGORIA[codigo]) || '⭐';
}

/** "Mis metas": the CarePlan's Goals as warm, plain-language cards. */
export function MetasDelPlan(props: MetasDelPlanProps): ReactElement {
  const navigate = useNavigate();
  const basePath = useBasePath(props.basePath);
  const plan = usePlanBienestar({ patient: props.patient });

  if (plan.cargando) {
    return (
      <Stack gap="md">
        <Skeleton height={60} radius="lg" />
        <Skeleton height={90} radius="lg" />
        <Skeleton height={90} radius="lg" />
      </Stack>
    );
  }

  if (!plan.carePlan) {
    return <Text c="dimmed">Todavia no empezaste el plan.</Text>;
  }

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Mis metas de salud</Title>
        <Text c="dimmed">
          Son tus objetivos para estos 100 días. Tu equipo los va a personalizar con vos.{' '}
          <Anchor fw={500} onClick={() => navigate(basePath)}>
            Volver a los pasos del plan
          </Anchor>
        </Text>
      </div>
      <Stack gap="sm">
        {plan.metas.map((meta: Goal) => {
          const objetivo = textoMeta(meta);
          const categoria = meta.category?.[0]?.text;
          const nota = meta.note?.[0]?.text;
          return (
            <Card key={meta.id} withBorder radius="lg" p="md">
              <Group align="flex-start" wrap="nowrap">
                <ThemeIcon variant="light" color="teal" size={40} radius="xl">
                  {emojiDeMeta(meta)}
                </ThemeIcon>
                <Stack gap={6} style={{ flex: 1 }}>
                  <Text fw={600}>{meta.description?.text}</Text>
                  <Group gap="xs">
                    {categoria && (
                      <Badge size="sm" variant="light" color="gray" radius="xl">
                        {categoria}
                      </Badge>
                    )}
                    {objetivo && (
                      <Badge size="sm" variant="light" color="teal" radius="xl">
                        Meta: {objetivo}
                      </Badge>
                    )}
                  </Group>
                  {nota && (
                    <Text size="xs" c="dimmed">
                      ¿Por qué importa? {nota}
                    </Text>
                  )}
                </Stack>
              </Group>
            </Card>
          );
        })}
      </Stack>
    </Stack>
  );
}
