import type { Patient } from '@medplum/fhirtypes';
import { Badge, Button, Card, Group, Progress, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { useBasePath } from '../PlanBienestarContext';
import { useCobertura } from '../hooks/useCobertura';
import { useElegibilidad } from '../hooks/useElegibilidad';
import { usePlanBienestar } from '../hooks/usePlanBienestar';

export interface PlanBienestarCardProps {
  /** Patient override; defaults to provider config or the logged-in profile. */
  patient?: Patient;
  /** Where `PlanBienestarRoutes` is mounted. Default `/care-plan/plan-100-dias`. */
  basePath?: string;
  /** Canonical URL of the PlanDefinition. Defaults to the menopause plan. */
  planDefinitionUrl?: string;
}

/**
 * Home-page card of the Plan Bienestar 100 Dias. Self-gating: renders nothing
 * unless the server has an ACTIVE PlanDefinition whose useContext (gender/age)
 * matches the patient. Offers to start the plan, or shows progress and a
 * shortcut once the plan is underway.
 */
export function PlanBienestarCard(props: PlanBienestarCardProps): ReactElement | null {
  const navigate = useNavigate();
  const basePath = useBasePath(props.basePath);
  const elegibilidad = useElegibilidad({
    patient: props.patient,
    planDefinitionUrl: props.planDefinitionUrl,
  });
  const plan = usePlanBienestar({
    patient: props.patient,
    planDefinitionUrl: props.planDefinitionUrl,
  });
  const cobertura = useCobertura({ patient: props.patient });
  const [creando, setCreando] = useState(false);
  const [solicitando, setSolicitando] = useState(false);

  if (elegibilidad.cargando || plan.cargando || cobertura.cargando || !elegibilidad.elegible) {
    return null;
  }

  const titulo = elegibilidad.planDefinition?.title ?? 'Plan Bienestar 100 Dias';
  const descripcion = elegibilidad.planDefinition?.description;

  const empezar = async (): Promise<void> => {
    setCreando(true);
    try {
      await plan.empezarPlan();
      navigate(basePath);
    } finally {
      setCreando(false);
    }
  };

  const solicitar = async (): Promise<void> => {
    setSolicitando(true);
    try {
      await cobertura.solicitarAlta();
    } finally {
      setSolicitando(false);
    }
  };

  // Elegible clinicamente pero sin cobertura: un solo click para pedir el alta.
  // Recepcion cobra y activa; el plan se arma cuando la paciente vuelve a entrar.
  if (!plan.carePlan && !cobertura.habilitado) {
    const pendiente = cobertura.estado === 'pendiente';
    const vencida = cobertura.estado === 'vencida';
    return (
      <Card withBorder radius="lg" p="lg" data-testid="plan-bienestar-card">
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon variant="light" color="pink" size={44} radius="xl">
                ❤️
              </ThemeIcon>
              <div>
                <Badge color={pendiente ? 'yellow' : 'teal'} variant="light" radius="xl">
                  {pendiente ? 'Solicitud enviada' : vencida ? 'Programa pausado' : 'Recomendado para vos'}
                </Badge>
                <Title order={4} mt={4}>
                  {titulo}
                </Title>
              </div>
            </Group>
            {!pendiente && (
              <Button radius="xl" color="teal" onClick={solicitar} loading={solicitando}>
                {vencida ? 'Quiero retomarlo' : 'Quiero sumarme'}
              </Button>
            )}
          </Group>
          <Text size="sm" c="dimmed">
            {pendiente
              ? 'Recibimos tu solicitud. Nuestro equipo te va a contactar para coordinar el alta y activarte el plan.'
              : vencida
                ? 'Tu programa está en pausa. Tus datos siguen disponibles; escribinos y lo retomamos donde lo dejaste.'
                : (descripcion ?? '100 días, un paso por vez, con el respaldo de tu equipo de salud.')}
          </Text>
        </Stack>
      </Card>
    );
  }

  if (plan.carePlan) {
    const progreso = plan.total > 0 ? Math.round((plan.completados / plan.total) * 100) : 0;
    return (
      <Card withBorder radius="lg" p="lg" data-testid="plan-bienestar-card">
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon variant="light" color="pink" size={44} radius="xl">
                ❤️
              </ThemeIcon>
              <div>
                <Badge color="teal" variant="light" radius="xl">
                  Plan en curso
                </Badge>
                <Title order={4} mt={4}>
                  {titulo}
                </Title>
              </div>
            </Group>
            <Button radius="xl" color="teal" onClick={() => navigate(basePath)}>
              Continuar mi plan
            </Button>
          </Group>
          <Text size="sm" c="dimmed">
            {plan.completados} de {plan.total} pasos completados · ¡seguí así!
          </Text>
          <Progress value={progreso} size="lg" radius="xl" color="teal" aria-label="Progreso del plan" />
        </Stack>
      </Card>
    );
  }

  return (
    <Card withBorder radius="lg" p="lg" data-testid="plan-bienestar-card">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon variant="light" color="pink" size={44} radius="xl">
              ❤️
            </ThemeIcon>
            <div>
              <Badge color="teal" variant="light" radius="xl">
                Recomendado para vos
              </Badge>
              <Title order={4} mt={4}>
                {titulo}
              </Title>
            </div>
          </Group>
          <Button radius="xl" color="teal" onClick={empezar} loading={creando}>
            Empezar mi plan
          </Button>
        </Group>
        {descripcion && (
          <Text size="sm" c="dimmed">
            {descripcion}
          </Text>
        )}
        <Text size="xs" c="dimmed">
          100 días, un paso por vez, con el respaldo de tu equipo de salud.
        </Text>
      </Stack>
    </Card>
  );
}
