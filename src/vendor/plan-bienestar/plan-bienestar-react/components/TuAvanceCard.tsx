import type { CorteAvance, TextoCorte } from '@epa/careplan-menopausia';
import type { Patient } from '@medplum/fhirtypes';
import { Badge, Card, Group, List, Progress, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import type { ReactElement } from 'react';
import { useAvanceDelPlan } from '../hooks/useAvanceDelPlan';

export interface TuAvanceCardProps {
  patient?: Patient;
  /** Hoy (AAAA-MM-DD, Argentina). Default: hoy en Argentina. */
  hoy?: string;
}

const ETIQUETA_ESTADO: Record<CorteAvance['estado'], string> = {
  cerrado: 'Cerrado',
  'en-curso': 'En curso',
  futuro: 'Más adelante',
};

/** Sin rojo (firmado en B8): el estado del corte, en colores neutros. */
const COLOR_ESTADO: Record<CorteAvance['estado'], string> = {
  cerrado: 'teal',
  'en-curso': 'blue',
  futuro: 'gray',
};

function Corte({ texto, corte }: { texto: TextoCorte; corte: CorteAvance }): ReactElement {
  return (
    <Stack gap={6} data-testid={`tu-avance-corte-${corte.clave}`}>
      <Group justify="space-between" wrap="wrap" gap="xs">
        <Text fw={600}>{texto.titulo}</Text>
        <Badge variant="light" radius="xl" color={COLOR_ESTADO[corte.estado]}>
          {ETIQUETA_ESTADO[corte.estado]}
        </Badge>
      </Group>
      <Text size="sm">{texto.resumen}</Text>
      {corte.estado !== 'futuro' && (
        <Progress value={corte.puntaje} color="teal" radius="xl" aria-label={`Avance del corte ${texto.titulo}`} />
      )}
      {texto.detalle.length > 0 && (
        <List size="sm" spacing={2} c="dimmed">
          {texto.detalle.map((linea) => (
            <List.Item key={linea}>{linea}</List.Item>
          ))}
        </List>
      )}
    </Stack>
  );
}

/**
 * La tarjeta «Tu avance» (B7 y B8, firmadas el 30/10/2026): los tres cortes del plan,
 * en las consultas de los días 1, 50 y 100, con el puntaje de lo que la persona hizo y
 * su detalle. No se muestra sin inscripción de Recepción (los cortes son sus consultas).
 */
export function TuAvanceCard(props: TuAvanceCardProps): ReactElement | null {
  const { cargando, avance, textos } = useAvanceDelPlan({
    ...(props.patient ? { patient: props.patient } : {}),
    ...(props.hoy ? { hoy: props.hoy } : {}),
  });
  if (cargando || !avance?.inscripto || !textos) return null;

  return (
    <Card withBorder radius="lg" p="lg" data-testid="tu-avance-card">
      <Stack gap="md">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <ThemeIcon variant="light" color="teal" size={44} radius="xl">
            🌿
          </ThemeIcon>
          <div>
            <Title order={4}>{textos.titulo}</Title>
            <Text size="sm" c="dimmed">
              {textos.bajada}
            </Text>
          </div>
        </Group>
        {textos.antesDelCorte && (
          <Stack gap={4}>
            <Text fw={500}>{textos.antesDelCorte}</Text>
            {textos.mensaje && <Text size="sm">{textos.mensaje}</Text>}
          </Stack>
        )}
        {avance.cortes.map((corte) => {
          const texto = textos.cortes.find((t) => t.clave === corte.clave);
          return texto ? <Corte key={corte.clave} texto={texto} corte={corte} /> : null;
        })}
      </Stack>
    </Card>
  );
}
