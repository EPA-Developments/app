import {
  etiquetaEstado,
  formatearFecha,
  formatearHora,
  referenciaPaciente,
  referenciaProfesional,
  tituloDelTurno,
} from '@epa/teleconsulta-core';
import { Badge, Group, Stack, Text, Title } from '@mantine/core';
import { ResourceName } from '@medplum/react';
import type { ReactElement } from 'react';
import type { TurnoVirtual } from '../hooks/useTurnosPaciente';
import { useTeleconsultaConfig } from '../TeleconsultaContext';

/**
 * Title, the other participant (`mostrar`: the professional for the patient,
 * the patient for the professional), date and status of a videocall.
 */
export function EncabezadoTurno(props: { turno: TurnoVirtual; mostrar: 'profesional' | 'paciente' }): ReactElement {
  const { turno } = props;
  const { zonaHoraria } = useTeleconsultaConfig();
  const estado = etiquetaEstado(turno.status);
  const otro = props.mostrar === 'profesional' ? referenciaProfesional(turno) : referenciaPaciente(turno);
  const inicio = turno.start ? new Date(turno.start) : undefined;

  return (
    <Group justify="space-between" align="flex-start">
      <Stack gap={2}>
        <Title order={3}>{tituloDelTurno(turno)}</Title>
        {otro && <ResourceName value={otro} c="dimmed" />}
        {inicio && (
          <Text size="sm">
            {formatearFecha(inicio, zonaHoraria)} · {formatearHora(inicio, zonaHoraria)} hs
          </Text>
        )}
      </Stack>
      <Badge variant="light" color={estado.color} size="lg" radius="sm">
        {estado.texto}
      </Badge>
    </Group>
  );
}
