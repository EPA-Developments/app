import { etiquetaEstado, formatearFecha, formatearHora, referenciaPaciente } from '@epa/teleconsulta-core';
import { ActionIcon, Alert, Badge, Button, Card, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { ResourceName, useMedplumProfile } from '@medplum/react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';
import { sumarDias } from '../fechas';
import { useAgendaProfesional } from '../hooks/useAgendaProfesional';
import type { TurnoVirtual } from '../hooks/useTurnosPaciente';
import { useTeleconsultaConfig } from '../TeleconsultaContext';

export interface AgendaTeleconsultaProps {
  /** Practitioner id override; defaults to the logged-in Practitioner. */
  practitionerId?: string;
  /** Refresh interval (ms), default 30 s. */
  intervaloMs?: number;
}

function Accion(props: { turno: TurnoVirtual }): ReactElement | null {
  const { rutaConsulta } = useTeleconsultaConfig();
  const { turno } = props;
  const a = rutaConsulta(turno.id);
  switch (turno.status) {
    case 'arrived':
      return (
        <Button component={Link} to={a} color="teal" radius="xl">
          El paciente ya está esperando — Iniciar consulta
        </Button>
      );
    case 'checked-in':
      return (
        <Button component={Link} to={a} radius="xl">
          Volver a la consulta
        </Button>
      );
    case 'booked':
      return (
        <Button component={Link} to={a} variant="light" radius="xl">
          Abrir consulta
        </Button>
      );
    case 'fulfilled':
      return (
        <Button component={Link} to={a} variant="subtle" radius="xl">
          Ver cierre
        </Button>
      );
    case 'pending':
      return (
        <Text size="sm" c="dimmed">
          Falta el pago
        </Text>
      );
    default:
      return null;
  }
}

/**
 * The professional's videocalls of the day. Refreshes by itself: when a
 * patient enters the room their row turns into "El paciente ya está
 * esperando — Iniciar consulta".
 */
export function AgendaTeleconsulta(props: AgendaTeleconsultaProps): ReactElement {
  const perfil = useMedplumProfile();
  const { zonaHoraria } = useTeleconsultaConfig();
  const practitionerId = props.practitionerId ?? (perfil?.resourceType === 'Practitioner' ? perfil.id : undefined);
  const [dia, setDia] = useState(() => new Date());
  const { turnos, cargando, error } = useAgendaProfesional(practitionerId, dia, zonaHoraria, props.intervaloMs);
  const esperando = turnos.filter((t) => t.status === 'arrived').length;
  const hoy = formatearFecha(new Date(), zonaHoraria) === formatearFecha(dia, zonaHoraria);

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Stack gap={0}>
          <Title order={3}>Videollamadas</Title>
          <Text c="dimmed" size="sm">
            {hoy ? 'Hoy, ' : ''}
            {formatearFecha(dia, zonaHoraria)}
            {turnos.length > 0 && ` · ${turnos.length} ${turnos.length === 1 ? 'turno' : 'turnos'}`}
            {esperando > 0 && ` · ${esperando} ${esperando === 1 ? 'paciente esperando' : 'pacientes esperando'}`}
          </Text>
        </Stack>
        <Group gap="xs">
          <ActionIcon variant="default" radius="xl" size="lg" aria-label="Día anterior" onClick={() => setDia(sumarDias(dia, -1, zonaHoraria))}>
            ‹
          </ActionIcon>
          <Button variant="default" radius="xl" onClick={() => setDia(new Date())} disabled={hoy}>
            Hoy
          </Button>
          <ActionIcon variant="default" radius="xl" size="lg" aria-label="Día siguiente" onClick={() => setDia(sumarDias(dia, 1, zonaHoraria))}>
            ›
          </ActionIcon>
        </Group>
      </Group>

      {error && (
        <Alert variant="light" color="red" radius="md">
          {error}
        </Alert>
      )}
      {cargando && turnos.length === 0 && <Loader size="sm" />}
      {!cargando && turnos.length === 0 && <Text c="dimmed">No hay videollamadas para este día.</Text>}

      {turnos.map((turno) => {
        const estado = etiquetaEstado(turno.status);
        const paciente = referenciaPaciente(turno);
        return (
          <Card key={turno.id} withBorder radius="lg" padding="md" data-testid={`agenda-${turno.id}`}>
            <Group justify="space-between" wrap="wrap">
              <Group gap="md">
                <Text fw={700} w={56}>
                  {turno.start ? formatearHora(new Date(turno.start), zonaHoraria) : '--:--'}
                </Text>
                <Stack gap={0}>
                  {paciente ? <ResourceName value={paciente} fw={600} /> : <Text fw={600}>Paciente</Text>}
                  <Badge variant="light" color={estado.color} radius="sm" size="sm">
                    {estado.texto}
                  </Badge>
                </Stack>
              </Group>
              <Accion turno={turno} />
            </Group>
          </Card>
        );
      })}
    </Stack>
  );
}
