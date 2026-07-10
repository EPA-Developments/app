import { clasificar, type ParametroCategoria, type ParametroCkm } from '@epa/careplan-menopausia';
import type { Patient } from '@medplum/fhirtypes';
import {
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { useState, type ReactElement } from 'react';
import { useDatosCkm, type ValorParametro } from '../hooks/useDatosCkm';

export interface CargarDatosCkmProps {
  patient?: Patient;
}

const CATEGORIAS: { key: ParametroCategoria; emoji: string; titulo: string }[] = [
  { key: 'antropometria', emoji: '📏', titulo: 'Cuerpo' },
  { key: 'presion', emoji: '🩸', titulo: 'Presión arterial' },
  { key: 'lipidos', emoji: '🧪', titulo: 'Colesterol y grasas' },
  { key: 'glucemia', emoji: '🍬', titulo: 'Azúcar en sangre' },
  { key: 'renal', emoji: '💧', titulo: 'Riñones' },
];

const COLOR_NIVEL = { ok: 'teal', limite: 'yellow', alto: 'red' } as const;

function referenciaTexto(parametro: ParametroCkm): string {
  return parametro.rangos
    .map((r) => {
      if (r.min !== undefined && r.max !== undefined) return `${r.etiqueta}: ${r.min}–${r.max}`;
      if (r.min !== undefined) return `${r.etiqueta}: ≥ ${r.min}`;
      if (r.max !== undefined) return `${r.etiqueta}: < ${r.max}`;
      return r.etiqueta;
    })
    .join(' · ');
}

function FilaParametro({ item, onGuardar }: { item: ValorParametro; onGuardar: (v: number) => Promise<void> }): ReactElement {
  const { parametro, valor } = item;
  const [entrada, setEntrada] = useState<number | string>(valor ?? '');
  const [guardando, setGuardando] = useState(false);
  const banda = valor !== undefined ? clasificar(parametro, valor) : undefined;

  const guardar = async (): Promise<void> => {
    if (entrada === '' || Number.isNaN(Number(entrada))) return;
    setGuardando(true);
    try {
      await onGuardar(Number(entrada));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Card withBorder radius="md" p="md">
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <div>
            <Group gap="xs">
              <Text fw={600}>{parametro.etiqueta}</Text>
              {banda && (
                <Badge size="sm" variant="light" color={COLOR_NIVEL[banda.nivel]} radius="xl">
                  {banda.etiqueta}
                </Badge>
              )}
              {valor === undefined && (
                <Badge size="sm" variant="light" color="gray" radius="xl">
                  Sin cargar
                </Badge>
              )}
            </Group>
            {parametro.nota && (
              <Text size="xs" c="dimmed">
                {parametro.nota}
              </Text>
            )}
          </div>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <NumberInput
            value={entrada}
            onChange={setEntrada}
            placeholder={valor !== undefined ? String(valor) : `Valor en ${parametro.unidad}`}
            suffix={` ${parametro.unidad}`}
            hideControls
            style={{ flex: 1 }}
            aria-label={parametro.etiqueta}
          />
          <Button onClick={guardar} loading={guardando} radius="xl" variant="light" color="teal">
            Guardar
          </Button>
        </Group>
        {parametro.rangos.length > 0 && (
          <Text size="xs" c="dimmed">
            Referencia (AHA/Ndumele): {referenciaTexto(parametro)} {parametro.unidad}
          </Text>
        )}
      </Stack>
    </Card>
  );
}

/**
 * "Mis datos de salud": lets the patient load the CKM assessment parameters
 * (AHA/Ndumele) that power the CKM map and the PREVENT risk — including the
 * cholesterol values that are often missing. Each field shows its reference
 * range and classifies the current value.
 */
export function CargarDatosCkm(props: CargarDatosCkmProps): ReactElement {
  const datos = useDatosCkm({ patient: props.patient });

  if (datos.cargando) {
    return (
      <Stack gap="md">
        <Skeleton height={60} radius="lg" />
        <Skeleton height={100} radius="lg" />
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <div>
        <Group gap="sm">
          <ThemeIcon variant="light" color="teal" size={44} radius="xl">
            📝
          </ThemeIcon>
          <div>
            <Title order={2}>Mis datos de salud</Title>
            <Text c="dimmed">
              Cargá tus mediciones y resultados de laboratorio. Con ellos armamos tu mapa
              cardiometabólico y estimamos tu riesgo. Cada valor muestra su referencia.
            </Text>
          </div>
        </Group>
      </div>

      {datos.faltantes.length > 0 && (
        <Card withBorder radius="lg" p="md" bg="yellow.0">
          <Text size="sm">
            Te faltan <b>{datos.faltantes.length}</b> datos para completar tu evaluación
            {datos.faltantes.some((f) => f.parametro.categoria === 'lipidos') && ', incluido el colesterol'}
            . Cargalos abajo cuando los tengas.
          </Text>
        </Card>
      )}

      {CATEGORIAS.map(({ key, emoji, titulo }) => {
        const items = datos.valores.filter((v) => v.parametro.categoria === key);
        if (items.length === 0) return null;
        return (
          <Stack key={key} gap="sm">
            <Group gap="xs">
              <Text component="span" fz="lg" aria-hidden>
                {emoji}
              </Text>
              <Title order={4}>{titulo}</Title>
            </Group>
            {items.map((item) => (
              <FilaParametro
                key={item.parametro.key}
                item={item}
                onGuardar={async (v) => {
                  await datos.guardar(item.parametro, v);
                }}
              />
            ))}
          </Stack>
        );
      })}
    </Stack>
  );
}
