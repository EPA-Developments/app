import { Alert, Button, Card, Grid, Group, Loader, Stack } from '@mantine/core';
import { useEffect, type ReactElement } from 'react';
import { Link, useParams } from 'react-router';
import { CerrarConsulta } from '../componentes/CerrarConsulta';
import { DocumentosDeConsulta } from '../componentes/DocumentosDeConsulta';
import { EncabezadoTurno } from '../componentes/EncabezadoTurno';
import { FichaPrevia } from '../componentes/FichaPrevia';
import { Sala } from '../componentes/Sala';
import { useTurno } from '../hooks/useTurno';
import { useTeleconsultaConfig } from '../TeleconsultaContext';

export interface ConsultaProfesionalProps {
  /** Defaults to the `:appointmentId` route param. */
  appointmentId?: string;
  /** Refresh interval while the consultation is open (ms), default 15 s. */
  intervaloMs?: number;
}

/**
 * Professional page of one videocall (`/consulta/:appointmentId`): the
 * pre-visit file next to the room (entering as moderator: the token bot
 * decides the role), and the closing form below it.
 */
export function ConsultaProfesional(props: ConsultaProfesionalProps): ReactElement {
  const params = useParams();
  const { rutaAgenda } = useTeleconsultaConfig();
  const appointmentId = props.appointmentId ?? params.appointmentId;
  const { turno, politica, cargando, error, recargar } = useTurno(appointmentId);
  const abierta = turno !== undefined && turno.status !== 'fulfilled' && turno.status !== 'cancelled';

  useEffect(() => {
    if (!abierta) return undefined;
    const t = setInterval(() => void recargar(), props.intervaloMs ?? 15_000);
    return () => clearInterval(t);
  }, [abierta, recargar, props.intervaloMs]);

  const volver = (
    <Group>
      <Button component={Link} to={rutaAgenda} variant="default" radius="xl">
        Volver a la agenda
      </Button>
    </Group>
  );

  if (cargando && !turno) return <Loader />;
  if (!turno || !politica) {
    return (
      <Stack gap="md">
        <Alert variant="light" color="red" radius="md">
          {error ?? 'No encontramos esa videollamada.'}
        </Alert>
        {volver}
      </Stack>
    );
  }

  let principal: ReactElement;
  if (turno.status === 'fulfilled') {
    principal = (
      <Stack gap="md">
        <Alert variant="light" color="teal" radius="md">
          Consulta finalizada. El paciente ya puede ver el informe, los estudios y las recetas.
        </Alert>
        <DocumentosDeConsulta appointmentId={turno.id} />
        {volver}
      </Stack>
    );
  } else if (turno.status === 'cancelled' || turno.status === 'noshow' || turno.status === 'entered-in-error') {
    principal = (
      <Stack gap="md">
        <Alert variant="light" color="gray" radius="md">
          Este turno fue cancelado.
        </Alert>
        {volver}
      </Stack>
    );
  } else {
    principal = (
      <Stack gap="md">
        <Sala
          turno={turno}
          politica={politica}
          textoEntrar={
            turno.status === 'arrived' ? 'El paciente ya está esperando — Iniciar consulta' : 'Iniciar consulta'
          }
          textoEsperando="El paciente todavía no se conectó"
          acciones={volver}
          onSalir={() => void recargar()}
        />
        <CerrarConsulta turno={turno} onCerrada={() => void recargar()} />
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <Card withBorder radius="lg" padding="lg">
        <EncabezadoTurno turno={turno} mostrar="paciente" />
      </Card>
      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, md: 8 }}>{principal}</Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <FichaPrevia turno={turno} />
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
