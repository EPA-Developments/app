// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// "Mi seguimiento GLP-1" — vista de SOLO LECTURA del programa del paciente: semanas de
// tratamiento, controles (ventana, estado, estudios), meta y peso. Todo lo calcula el
// sistema (bots de recepcionistas); acá solo se muestra. No se muestra la nota clínica
// del CarePlan ni se interpreta la respuesta: las dudas van a Mensajes.
import { Alert, Badge, Box, Button, Card, Group, Loader, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import type { Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import {
  IconCalendarEvent,
  IconCircleCheck,
  IconCircleDashed,
  IconFlask,
  IconMessage,
  IconPill,
  IconScale,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { LineChart } from '../../components/LineChart';
import type { ControlGlp1, SeguimientoGlp1, SeguimientoGlp1Activo } from '../../fhir/glp1';
import {
  cargarSeguimientoGlp1,
  formatearInstante,
  hoyArgentina,
  proximoControl,
  textoEstado,
  textoMeta,
  textoSemanas,
  textoVentana,
} from '../../fhir/glp1';
import { showErrorNotification } from '../../utils/notifications';
import { datosGraficoPeso } from './SeguimientoGlp1.grafico';

const RUTA_PESO = '/health-record/vitals/weight';
const RUTA_MENSAJES = '/Communication';

function colorEstado(control: ControlGlp1): string {
  if (control.estado === 'realizado') {
    return 'gray';
  }
  return control.estado === 'agendado' ? 'segundaOpinion' : 'yellow';
}

function IconoEstado({ control }: { control: ControlGlp1 }): JSX.Element {
  return control.estado === 'por-agendar' ? (
    <IconCircleDashed size={22} color="var(--mantine-color-gray-5)" />
  ) : (
    <IconCircleCheck size={22} color={`var(--mantine-color-${colorEstado(control)}-6)`} />
  );
}

function ControlCard({ control, hoy }: { control: ControlGlp1; hoy: string }): JSX.Element {
  return (
    <Card withBorder radius="md" p="md" data-testid={`control-semana-${control.semana}`}>
      <Group wrap="nowrap" align="flex-start" gap="sm">
        <IconoEstado control={control} />
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Group gap="xs">
            <Text fw={600}>{control.nombre}</Text>
            {control.esRevision && (
              <Badge variant="light" color="segundaOpinion">
                Semana {control.semana}
              </Badge>
            )}
          </Group>
          <Text size="sm" c="dimmed">
            {textoVentana(control, hoy)}
          </Text>
          <Text size="sm" fw={500} c={`${colorEstado(control)}.8`}>
            {textoEstado(control)}
          </Text>
          {control.esRevision && (
            <Text size="sm">
              Es cuando tu equipo evalúa cómo venís con el tratamiento, 12 semanas después de llegar a tu dosis.
            </Text>
          )}
          {control.requiereLaboratorio && control.estudios.length > 0 && (
            <Group gap={6} wrap="nowrap" align="flex-start">
              <IconFlask size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <Text size="sm">Traé los resultados de: {control.estudios.map((e) => e.nombre).join(', ')}.</Text>
            </Group>
          )}
        </Stack>
      </Group>
    </Card>
  );
}

function MetaYPeso({ s }: { s: SeguimientoGlp1Activo }): JSX.Element {
  const navigate = useNavigate();
  const ultimo = s.pesos.at(-1);

  const chartData = useMemo(() => datosGraficoPeso(s.pesos, s.meta), [s.pesos, s.meta]);

  return (
    <Card withBorder radius="md" p="lg">
      <Group gap="sm" mb="xs">
        <ThemeIcon variant="light" radius="xl">
          <IconScale size={18} />
        </ThemeIcon>
        <Title order={3}>Tu meta y tu peso</Title>
      </Group>
      {s.meta && s.meta.tipo !== 'texto' ? (
        <Text data-testid="meta-glp1">Tu meta: {textoMeta(s.meta).replace(/^./, (c) => c.toLowerCase())}.</Text>
      ) : (
        <Text c="dimmed">{s.meta ? textoMeta(s.meta) : 'Tu equipo va a definir tu meta de peso'}.</Text>
      )}
      {chartData ? (
        <LineChart chartData={chartData} desdeCero={false} />
      ) : (
        <Text size="sm" c="dimmed" mt="sm">
          Todavía no cargaste tu peso. Registrarlo seguido te ayuda a ver tu evolución.
        </Text>
      )}
      {ultimo && (
        <Text size="sm" mt="xs">
          Tu último peso: <b>{ultimo.kg.toLocaleString('es-AR', { maximumFractionDigits: 1 })} kg</b>, el{' '}
          {formatearInstante(ultimo.fecha)}.
        </Text>
      )}
      <Group mt="md">
        <Button radius="xl" onClick={() => navigate(RUTA_PESO)?.catch(console.error)}>
          Cargar mi peso
        </Button>
      </Group>
    </Card>
  );
}

function BotonMensajes({ texto }: { texto: string }): JSX.Element {
  const navigate = useNavigate();
  return (
    <Button
      variant="light"
      radius="xl"
      leftSection={<IconMessage size={16} />}
      onClick={() => navigate(RUTA_MENSAJES)?.catch(console.error)}
    >
      {texto}
    </Button>
  );
}

function Activo({ s }: { s: SeguimientoGlp1Activo }): JSX.Element {
  const hoy = hoyArgentina();
  const proximo = proximoControl(s.controles);

  return (
    <Stack gap="lg">
      <Card withBorder radius="md" p="lg">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <ThemeIcon size={44} radius="xl" variant="light">
            <IconPill size={24} stroke={1.5} />
          </ThemeIcon>
          <div style={{ minWidth: 0 }}>
            {s.molecula && <Title order={2}>{s.molecula}</Title>}
            <Text fw={600} size="lg">
              {textoSemanas(s.inicio, hoy)}
            </Text>
          </div>
        </Group>
        {s.esquema && (
          <Box mt="md">
            <Text size="sm" fw={600}>
              Tu esquema
            </Text>
            <Text size="sm">{s.esquema}</Text>
            <Text size="xs" c="dimmed" mt={4}>
              Seguí siempre las indicaciones de tu médico.
            </Text>
          </Box>
        )}
      </Card>

      {proximo && (
        <Alert
          variant="light"
          color="segundaOpinion"
          radius="md"
          icon={<IconCalendarEvent />}
          title={`Próximo paso: ${proximo.nombre}`}
          data-testid="proximo-control"
        >
          <Text size="sm">{textoVentana(proximo, hoy)}</Text>
          <Text size="sm" fw={500}>
            {textoEstado(proximo)}
          </Text>
        </Alert>
      )}

      <Box>
        <Title order={3} mb="sm">
          Tus controles
        </Title>
        <Stack gap="sm">
          {s.controles.map((c) => (
            <ControlCard key={c.taskId} control={c} hoy={hoy} />
          ))}
        </Stack>
      </Box>

      <MetaYPeso s={s} />

      <Card withBorder radius="md" p="lg">
        <Text fw={600} mb="xs">
          ¿Dudas o síntomas?
        </Text>
        <BotonMensajes texto="Escribile a tu equipo" />
      </Card>
    </Stack>
  );
}

export function SeguimientoGlp1(): JSX.Element {
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  // undefined = cargando · null = sin programa.
  const [seguimiento, setSeguimiento] = useState<SeguimientoGlp1 | null>();

  useEffect(() => {
    cargarSeguimientoGlp1(medplum, patient)
      .then((s) => setSeguimiento(s ?? null))
      .catch((err) => {
        showErrorNotification(err);
        setSeguimiento(null);
      });
  }, [medplum, patient]);

  return (
    <Box p="xl">
      <Title mb="lg">Mi seguimiento GLP-1</Title>
      {seguimiento === undefined && (
        <Group justify="center" py="xl">
          <Loader size="sm" />
        </Group>
      )}
      {seguimiento === null && (
        <Card withBorder radius="md" p="lg">
          <Text fw={600}>Todavía no tenés un seguimiento de tratamiento GLP-1</Text>
          <Text size="sm" c="dimmed" mt={4} mb="md">
            Si tu médico te indicó un tratamiento con GLP-1, acá vas a ver tus controles, los estudios que tenés que
            llevar y tu meta. Escribinos por Mensajes y te sumamos al programa.
          </Text>
          <BotonMensajes texto="Ir a Mensajes" />
        </Card>
      )}
      {seguimiento?.estado === 'indicacion-pendiente' && (
        <Card withBorder radius="md" p="lg">
          <Text fw={600}>Tu médico está preparando tu plan de seguimiento</Text>
          <Text size="sm" c="dimmed" mt={4} mb="md">
            Cuando esté listo vas a ver acá tus controles, los estudios que tenés que llevar y tu meta. Si tenés dudas
            mientras tanto, escribile a tu equipo.
          </Text>
          <BotonMensajes texto="Ir a Mensajes" />
        </Card>
      )}
      {seguimiento?.estado === 'activo' && <Activo s={seguimiento} />}
    </Box>
  );
}
