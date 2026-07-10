import type { ReactElement } from 'react';
import type { Patient, Task } from '@medplum/fhirtypes';
import {
  Anchor,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Progress,
  RingProgress,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { useNavigate } from 'react-router';
import { useBasePath } from '../PlanBienestarContext';
import { usePlanBienestar } from '../hooks/usePlanBienestar';
import { fraseDeAliento, GRUPOS_DE_PASOS, pasoConCuestionario, tipoDePaso } from '../fhirTexto';

export interface PasosDelPlanProps {
  patient?: Patient;
  basePath?: string;
}

const DIA_MS = 24 * 60 * 60 * 1000;
const TOTAL_DIAS = 100;

/** Current day of the plan (1..100) from the CarePlan's period start. */
function diaDelPlan(inicio: string | undefined, hoy: Date = new Date()): number | undefined {
  if (!inicio) return undefined;
  const start = new Date(inicio).getTime();
  if (Number.isNaN(start)) return undefined;
  const dia = Math.floor((hoy.getTime() - start) / DIA_MS) + 1;
  return Math.min(Math.max(dia, 1), TOTAL_DIAS);
}

function PasoCard({
  paso,
  onCompletar,
  onCuestionario,
}: {
  paso: Task;
  onCompletar: (completado: boolean) => void;
  onCuestionario: () => void;
}): ReactElement {
  const completado = paso.status === 'completed';
  return (
    <Card withBorder radius="lg" p="md" bg={completado ? 'teal.0' : undefined}>
      <Group align="flex-start" wrap="nowrap">
        <Checkbox
          mt={4}
          size="md"
          radius="xl"
          color="teal"
          checked={completado}
          onChange={(event) => onCompletar(event.currentTarget.checked)}
          aria-label={paso.code?.text ?? 'Paso del plan'}
        />
        <Stack gap={6} style={{ flex: 1 }}>
          <Group gap="xs" justify="space-between" wrap="nowrap" align="flex-start">
            <Text fw={600} c={completado ? 'dimmed' : undefined}>
              {paso.code?.text}
            </Text>
            {completado && (
              <Badge color="teal" variant="light" radius="xl">
                ¡Listo!
              </Badge>
            )}
          </Group>
          {paso.description && (
            <Text size="sm" c="dimmed">
              {paso.description}
            </Text>
          )}
          {pasoConCuestionario(paso) && !completado && (
            <div>
              <Button variant="light" color="teal" size="xs" radius="xl" onClick={onCuestionario}>
                Responder cuestionario →
              </Button>
            </div>
          )}
        </Stack>
      </Group>
    </Card>
  );
}

/** "Pasos del plan": the CarePlan's Tasks as a warm, completable checklist. */
export function PasosDelPlan(props: PasosDelPlanProps): ReactElement {
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
    return (
      <Card withBorder radius="lg" p="xl">
        <Stack gap="xs" align="center">
          <ThemeIcon variant="light" color="teal" size={48} radius="xl">
            🌱
          </ThemeIcon>
          <Title order={4}>Todavia no empezaste el plan</Title>
          <Text c="dimmed" ta="center">
            Volvé a la página de inicio y tocá «Empezar mi plan» para dar el primer paso.
          </Text>
        </Stack>
      </Card>
    );
  }

  const progreso = plan.total > 0 ? Math.round((plan.completados / plan.total) * 100) : 0;
  const dia = diaDelPlan(plan.carePlan.period?.start);

  return (
    <Stack gap="lg">
      <div>
        <Group gap="sm">
          <ThemeIcon variant="light" color="pink" size={44} radius="xl">
            ❤️
          </ThemeIcon>
          <div>
            <Title order={2}>Tu plan de 100 días</Title>
            <Text c="dimmed">Cuidar tu corazón, a tu ritmo y con tu equipo. Un paso por vez.</Text>
          </div>
        </Group>
      </div>

      <Card withBorder radius="lg" p="lg">
        <Group gap="lg" align="center" wrap="wrap">
          {dia !== undefined && (
            <RingProgress
              size={112}
              thickness={10}
              roundCaps
              sections={[{ value: (dia / TOTAL_DIAS) * 100, color: 'teal' }]}
              label={
                <div style={{ textAlign: 'center' }}>
                  <Text fw={700} fz={26} lh={1} c="teal.8">
                    {dia}
                  </Text>
                  <Text size="xs" c="dimmed">
                    de {TOTAL_DIAS} días
                  </Text>
                </div>
              }
              aria-label={`Día ${dia} de ${TOTAL_DIAS} del plan`}
            />
          )}
          <Stack gap="xs" style={{ flex: 1, minWidth: 220 }}>
            <Group justify="space-between">
              <Text fw={600}>
                {plan.completados} de {plan.total} pasos completados
              </Text>
              <Badge size="lg" variant="light" color="teal" radius="xl">
                {progreso}%
              </Badge>
            </Group>
            <Progress value={progreso} size="lg" radius="xl" color="teal" aria-label="Progreso del plan" />
            <Group justify="space-between" wrap="wrap">
              <Text size="sm" c="dimmed">
                {fraseDeAliento(progreso)}
              </Text>
              <Anchor size="sm" fw={500} onClick={() => navigate(`${basePath}/metas`)}>
                Ver mis metas →
              </Anchor>
            </Group>
          </Stack>
        </Group>
      </Card>

      {GRUPOS_DE_PASOS.map((grupo) => {
        const pasos = plan.pasos.filter((paso) => tipoDePaso(paso) === grupo.tipo);
        if (pasos.length === 0) return null;
        return (
          <Stack key={grupo.tipo} gap="sm">
            <div>
              <Group gap="xs">
                <Text component="span" fz="lg" aria-hidden>
                  {grupo.emoji}
                </Text>
                <Title order={4}>{grupo.titulo}</Title>
              </Group>
              <Text size="sm" c="dimmed">
                {grupo.descripcion}
              </Text>
            </div>
            {pasos.map((paso) => (
              <PasoCard
                key={paso.id}
                paso={paso}
                onCompletar={(completado) => plan.completarPaso(paso, completado)}
                onCuestionario={() => navigate(`${basePath}/cuestionario/${paso.id}`)}
              />
            ))}
          </Stack>
        );
      })}
    </Stack>
  );
}
