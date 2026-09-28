import {
  LE8_CATEGORIA_LABEL,
  LE8_CORTES,
  LE8_DOMINIO_LABEL,
  RESPUESTA_LABEL,
  type CambioMedida,
  type CategoriaRespuesta,
  type PuntajeDominio,
} from '@epa/careplan-menopausia';
import type { CarePlan, Patient } from '@medplum/fhirtypes';
import { Anchor, Badge, Card, Group, RingProgress, SimpleGrid, Skeleton, Stack, Text, ThemeIcon, Title, Tooltip } from '@mantine/core';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { useBasePath } from '../PlanBienestarContext';
import { useTableroLe8 } from '../hooks/useTableroLe8';

export interface TableroLe8Props {
  /** Patient override; defaults to provider config or the logged-in profile. */
  patient?: Patient;
  /** Where `PlanBienestarRoutes` is mounted. Default `/care-plan/plan-100-dias`. */
  basePath?: string;
  /** The active CarePlan, if the host already has it. */
  carePlan?: CarePlan;
  /** Full view (domain list, day 0 vs today, 100-day response). Default: compact card. */
  detalle?: boolean;
  /** Host route with the LE8 questionnaires (diet, activity, sleep, tobacco). */
  rutaCuestionarios?: string;
}

/** Semaphore colour of a 0-100 score (AHA bands). */
export function colorLe8(puntaje: number | undefined): string {
  if (puntaje === undefined) return 'gray';
  if (puntaje >= LE8_CORTES.alta) return 'teal';
  if (puntaje >= LE8_CORTES.moderada) return 'yellow';
  return 'red';
}

const COLOR_RESPUESTA: Record<CategoriaRespuesta, string> = { respuesta: 'teal', parcial: 'yellow', 'sin-respuesta': 'gray' };

const fmt = (v: number, d = 1): string => v.toFixed(d).replace('.', ',');

function Semaforo({ dominio, compacto }: { dominio: PuntajeDominio; compacto?: boolean }): ReactElement {
  const color = colorLe8(dominio.puntaje);
  const label = LE8_DOMINIO_LABEL[dominio.dominio];
  if (compacto) {
    return (
      <Tooltip label={`${label}: ${dominio.puntaje ?? 'sin dato'}`}>
        <Stack gap={2} align="center" style={{ minWidth: 34 }}>
          <div
            aria-label={`${label}: ${dominio.puntaje ?? 'sin dato'}`}
            style={{ width: 14, height: 14, borderRadius: 999, background: `var(--mantine-color-${color}-${color === 'gray' ? 3 : 5})` }}
          />
          <Text fz={10} c="dimmed" ta="center" lh={1.1}>
            {dominio.puntaje ?? '—'}
          </Text>
        </Stack>
      </Tooltip>
    );
  }
  return (
    <Group justify="space-between" wrap="nowrap" data-testid={`le8-${dominio.dominio}`}>
      <Group gap="sm" wrap="nowrap">
        <div style={{ width: 12, height: 12, borderRadius: 999, background: `var(--mantine-color-${color}-${color === 'gray' ? 3 : 5})` }} />
        <div>
          <Text fw={600} size="sm">
            {label}
          </Text>
          <Text size="xs" c="dimmed">
            {dominio.detalle ?? (dominio.falta ? `Falta: ${dominio.falta}` : '')}
            {dominio.pendienteValidacion ? ' · conversión a confirmar' : ''}
          </Text>
        </div>
      </Group>
      <Badge color={color} variant="light" radius="xl" size="lg">
        {dominio.puntaje ?? 'sin dato'}
      </Badge>
    </Group>
  );
}

function Medida({ nombre, cambio, unidad }: { nombre: string; cambio: CambioMedida | undefined; unidad: string }): ReactElement {
  if (!cambio) {
    return (
      <Text size="sm" c="dimmed">
        {nombre}: falta una medición del día 0 y otra actual.
      </Text>
    );
  }
  const signo = cambio.cambioPct > 0 ? '+' : '';
  return (
    <Text size="sm">
      {nombre}: {fmt(cambio.inicial.valor)} → {fmt(cambio.actual.valor)} {unidad}{' '}
      <Text component="span" fw={600} c={COLOR_RESPUESTA[cambio.categoria]}>
        ({signo}
        {fmt(cambio.cambioPct)} %)
      </Text>
    </Text>
  );
}

/**
 * "Tu tablero de 8 hábitos": the LE8 score as eight semaphores (0-100 each) and
 * a total, plus, when the plan is underway, weight and waist as % of day 0 and
 * the 100-day response. The person sees her number go up, never her stage.
 */
export function TableroLe8(props: TableroLe8Props): ReactElement | null {
  const navigate = useNavigate();
  const basePath = useBasePath(props.basePath);
  const tablero = useTableroLe8({ patient: props.patient, carePlan: props.carePlan });
  const rutaCuestionarios = props.rutaCuestionarios ?? '/health-record/cuestionarios';

  if (tablero.cargando) {
    return <Skeleton height={props.detalle ? 320 : 140} radius="lg" />;
  }
  const le8 = tablero.le8;
  if (!le8) return null;

  const total = le8.total;
  const color = colorLe8(total);
  const faltanConductas = le8.dominios.slice(0, 4).some((d) => d.puntaje === undefined);
  const faltanFactores = le8.dominios.slice(4).some((d) => d.puntaje === undefined);

  const anillo = (
    <RingProgress
      size={props.detalle ? 132 : 104}
      thickness={props.detalle ? 12 : 10}
      roundCaps
      sections={[{ value: total ?? 0, color }]}
      label={
        <div style={{ textAlign: 'center' }}>
          <Text fw={700} fz={props.detalle ? 30 : 24} lh={1} c={total === undefined ? 'dimmed' : `${color}.8`}>
            {total ?? '—'}
          </Text>
          <Text fz="xs" c="dimmed">
            LE8 total
          </Text>
        </div>
      }
      aria-label={total === undefined ? 'Puntaje LE8 sin datos' : `Puntaje LE8 total ${total} de 100`}
    />
  );

  const cta = (
    <Group gap="md">
      {faltanConductas && (
        <Anchor size="sm" fw={500} onClick={() => navigate(rutaCuestionarios)}>
          Completar mis cuestionarios →
        </Anchor>
      )}
      {faltanFactores && (
        <Anchor size="sm" fw={500} onClick={() => navigate(`${basePath}/mis-datos`)}>
          Cargar mis datos →
        </Anchor>
      )}
    </Group>
  );

  if (!props.detalle) {
    return (
      <Card withBorder radius="lg" p="lg" data-testid="tablero-le8">
        <Group gap="lg" align="center" wrap="wrap">
          {anillo}
          <Stack gap="xs" style={{ flex: 1, minWidth: 220 }}>
            <div>
              <Text size="sm" c="dimmed">
                Tu tablero de 8 hábitos · Life's Essential 8
              </Text>
              <Title order={4}>{le8.categoria ? LE8_CATEGORIA_LABEL[le8.categoria] : 'Faltan datos para tu puntaje'}</Title>
            </div>
            <Group gap="xs" wrap="wrap">
              {le8.dominios.map((d) => (
                <Semaforo key={d.dominio} dominio={d} compacto />
              ))}
            </Group>
            <Text size="xs" c="dimmed">
              {le8.conDato} de 8 dominios con dato.
              {tablero.respuesta?.categoria ? ` Respuesta a 100 días: ${RESPUESTA_LABEL[tablero.respuesta.categoria].toLowerCase()}.` : ''}
            </Text>
            <Group justify="space-between" wrap="wrap">
              {cta}
              <Anchor size="sm" fw={500} onClick={() => navigate(`${basePath}/tablero`)}>
                Ver mi tablero →
              </Anchor>
            </Group>
          </Stack>
        </Group>
      </Card>
    );
  }

  const respuesta = tablero.respuesta;
  return (
    <Stack gap="lg" data-testid="tablero-le8">
      <div>
        <Group gap="sm">
          <ThemeIcon variant="light" color={color} size={44} radius="xl">
            ❤️
          </ThemeIcon>
          <div>
            <Title order={2}>Tu tablero de 8 hábitos</Title>
            <Text c="dimmed">
              Cada dominio puntúa de 0 a 100; el promedio es tu salud cardiovascular (Life's Essential 8, AHA). Verás cuáles
              están en verde y cuáles tienen margen.
            </Text>
          </div>
        </Group>
      </div>

      <Card withBorder radius="lg" p="lg">
        <Group gap="lg" align="center" wrap="wrap">
          {anillo}
          <Stack gap="xs" style={{ flex: 1, minWidth: 220 }}>
            <Title order={4}>{le8.categoria ? LE8_CATEGORIA_LABEL[le8.categoria] : 'Faltan datos para tu puntaje'}</Title>
            <Text size="sm" c="dimmed">
              Alta ≥ 80 · moderada 50 a 79 · baja menos de 50. {le8.conDato} de 8 dominios con dato.
            </Text>
            {tablero.le8Inicial?.total !== undefined && total !== undefined && (
              <Text size="sm">
                Día 0: <b>{tablero.le8Inicial.total}</b> → hoy: <b>{total}</b>{' '}
                {total - tablero.le8Inicial.total !== 0 && (
                  <Text component="span" c={total >= tablero.le8Inicial.total ? 'teal' : 'red'} fw={600}>
                    ({total > tablero.le8Inicial.total ? '+' : ''}
                    {total - tablero.le8Inicial.total})
                  </Text>
                )}
              </Text>
            )}
            {cta}
          </Stack>
        </Group>
      </Card>

      <Card withBorder radius="lg" p="lg">
        <Stack gap="sm">
          {le8.dominios.map((d) => (
            <Semaforo key={d.dominio} dominio={d} />
          ))}
        </Stack>
      </Card>

      {respuesta && (
        <Card withBorder radius="lg" p="lg" data-testid="respuesta-100-dias">
          <Stack gap="xs">
            <Group justify="space-between" wrap="wrap">
              <Title order={4}>Respuesta a 100 días{tablero.dia !== undefined ? ` · día ${Math.min(tablero.dia, 100)}` : ''}</Title>
              {respuesta.categoria && (
                <Badge color={COLOR_RESPUESTA[respuesta.categoria]} variant="light" radius="xl" size="lg">
                  {RESPUESTA_LABEL[respuesta.categoria]}
                </Badge>
              )}
            </Group>
            <Text size="sm" c="dimmed">
              {respuesta.criterio === 'le8'
                ? 'En tu etapa la respuesta se mide por el puntaje LE8: llegar a 80 o subir 10 puntos, sin ningún dominio por debajo de 50.'
                : 'Se mide en peso o en cintura como porcentaje del día 0, y vale la mejor de las dos: 5 % es respuesta, 3 % parcial.'}
            </Text>
            {respuesta.criterio === 'le8' && respuesta.le8 && (
              <Text size="sm">{respuesta.le8.motivo}</Text>
            )}
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
              <Medida nombre="Peso" cambio={respuesta.pesoCintura?.peso} unidad="kg" />
              <Medida nombre="Cintura" cambio={respuesta.pesoCintura?.cintura} unidad="cm" />
            </SimpleGrid>
            <Text size="xs" c="dimmed">
              Pesate un día fijo por semana y medí la cintura una vez al mes, siempre igual: el número que importa es la
              tendencia. Tu equipo revisa la respuesta contigo al día 100.
            </Text>
          </Stack>
        </Card>
      )}

      <Anchor size="sm" fw={500} onClick={() => navigate(basePath)}>
        ← Volver a los pasos del plan
      </Anchor>
    </Stack>
  );
}
