import { BASELINE_GRUPOS, BASELINE_PREGUNTAS, type PreguntaBaseline } from '@epa/careplan-menopausia';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Progress,
  Radio,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { useState, type ReactElement } from 'react';
import type { Patient } from '@medplum/fhirtypes';
import { useNavigate } from 'react-router';
import { useBasePath } from '../PlanBienestarContext';
import { useBaseline, type SeleccionBaseline } from '../hooks/useBaseline';

export interface CuestionarioBaselineProps {
  patient?: Patient;
  basePath?: string;
}

/** Emoji por grupo. Decorativo: los lectores de pantalla lo ignoran. */
const EMOJI: Record<string, string> = {
  momento: '🌱',
  digestion: '🍽️',
  cuerpo: '🦴',
  descanso: '🌙',
  organizacion: '🧭',
  preferencias: '💚',
};

/** El código que significa "nada de esto me pasa". Al marcarlo, limpia el resto. */
const NINGUNA = 'ninguna';

function preguntasDe(grupo: string): PreguntaBaseline[] {
  return BASELINE_PREGUNTAS.filter((p) => p.grupo === grupo);
}

function Pregunta({
  pregunta,
  elegidos,
  onChange,
}: {
  pregunta: PreguntaBaseline;
  elegidos: string[];
  onChange: (codigos: string[]) => void;
}): ReactElement {
  if (!pregunta.multiple) {
    return (
      <Radio.Group value={elegidos[0] ?? ''} onChange={(valor) => onChange([valor])} label={pregunta.text}>
        <Stack gap="xs" mt="sm">
          {pregunta.opciones.map((opcion) => (
            <Radio key={opcion.code} value={opcion.code} label={opcion.display} color="teal" size="md" />
          ))}
        </Stack>
      </Radio.Group>
    );
  }

  const alternar = (code: string, marcado: boolean): void => {
    if (code === NINGUNA) {
      // "Ninguna de estas" es excluyente: no convive con una barrera marcada.
      onChange(marcado ? [NINGUNA] : []);
      return;
    }
    const sinNinguna = elegidos.filter((c) => c !== NINGUNA);
    onChange(marcado ? [...sinNinguna, code] : sinNinguna.filter((c) => c !== code));
  };

  return (
    <div>
      <Text fw={500} mb="sm">
        {pregunta.text}
      </Text>
      <Stack gap="xs">
        {pregunta.opciones.map((opcion) => (
          <Checkbox
            key={opcion.code}
            checked={elegidos.includes(opcion.code)}
            onChange={(e) => alternar(opcion.code, e.currentTarget.checked)}
            label={opcion.display}
            color="teal"
            size="md"
          />
        ))}
      </Stack>
    </div>
  );
}

/**
 * Cuestionario inicial: de acá sale todo lo que hace que el plan sea suyo.
 *
 * De a un grupo por pantalla, no las 21 preguntas de un saque: es lo que se
 * completa desde el teléfono y con la lista entera a la vista la gente abandona.
 *
 * Las preguntas y sus opciones salen de `BASELINE_PREGUNTAS`, no están escritas
 * acá: lo que la paciente lee y lo que activa cada respuesta son la misma
 * declaración, así no pueden separarse.
 */
export function CuestionarioBaseline(props: CuestionarioBaselineProps): ReactElement {
  const navigate = useNavigate();
  const basePath = useBasePath(props.basePath);
  const baseline = useBaseline({ patient: props.patient });

  const [paso, setPaso] = useState(0);
  const [seleccion, setSeleccion] = useState<SeleccionBaseline | undefined>(undefined);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | undefined>(undefined);

  if (baseline.cargando) {
    return (
      <Stack gap="md">
        <Skeleton height={60} radius="lg" />
        <Skeleton height={220} radius="lg" />
      </Stack>
    );
  }

  // Precarga lo ya respondido la primera vez que se rinde con datos.
  const actual = seleccion ?? baseline.seleccion;
  const total = BASELINE_GRUPOS.length;
  // Acota por las dudas: un `paso` fuera de rango dejaría la pantalla en blanco.
  const grupo = BASELINE_GRUPOS[Math.min(paso, total - 1)] as (typeof BASELINE_GRUPOS)[number];
  const esUltimo = paso >= total - 1;

  const cambiar = (linkId: string, codigos: string[]): void => {
    setSeleccion({ ...actual, [linkId]: codigos });
  };

  const finalizar = async (): Promise<void> => {
    setGuardando(true);
    setErrorGuardado(undefined);
    try {
      await baseline.guardar(actual);
      navigate(basePath);
    } catch {
      setErrorGuardado('No pudimos guardar tus respuestas. Probá de nuevo en un momento.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Stack gap="lg">
      <div>
        <Group gap="sm">
          <ThemeIcon variant="light" color="teal" size={44} radius="xl">
            📝
          </ThemeIcon>
          <div>
            <Title order={2}>Contanos de vos</Title>
            <Text c="dimmed">
              {baseline.respondido
                ? 'Podés actualizar tus respuestas cuando algo cambie.'
                : 'Con esto armamos un plan que se parezca a tu día a día. No hay respuestas correctas.'}
            </Text>
          </div>
        </Group>
      </div>

      <Card withBorder radius="lg" p="lg">
        <Stack gap="lg">
          <div>
            <Group justify="space-between" mb="xs">
              <Group gap="xs">
                <Text component="span" fz="lg" aria-hidden>
                  {EMOJI[grupo.linkId]}
                </Text>
                <Title order={4}>{grupo.text}</Title>
              </Group>
              <Badge variant="light" color="teal" radius="xl">
                {paso + 1} de {total}
              </Badge>
            </Group>
            <Progress
              value={((paso + 1) / total) * 100}
              size="md"
              radius="xl"
              color="teal"
              aria-label={`Paso ${paso + 1} de ${total}`}
            />
          </div>

          <Stack gap="xl">
            {preguntasDe(grupo.linkId).map((pregunta) => (
              <Pregunta
                key={pregunta.linkId}
                pregunta={pregunta}
                elegidos={actual[pregunta.linkId] ?? []}
                onChange={(codigos) => cambiar(pregunta.linkId, codigos)}
              />
            ))}
          </Stack>

          {errorGuardado && (
            <Alert color="red" radius="lg">
              {errorGuardado}
            </Alert>
          )}

          <Group justify="space-between">
            <Button
              variant="subtle"
              color="gray"
              radius="xl"
              disabled={paso === 0 || guardando}
              onClick={() => setPaso(paso - 1)}
            >
              ← Volver
            </Button>
            {esUltimo ? (
              <Button color="teal" radius="xl" loading={guardando} onClick={() => void finalizar()}>
                Guardar y ver mi plan
              </Button>
            ) : (
              <Button color="teal" radius="xl" onClick={() => setPaso(paso + 1)}>
                Seguir →
              </Button>
            )}
          </Group>
        </Stack>
      </Card>

      <Text size="sm" c="dimmed" ta="center">
        Lo que respondas lo ve tu equipo de salud para ajustar tu plan. Podés cambiarlo cuando quieras.
      </Text>
    </Stack>
  );
}
