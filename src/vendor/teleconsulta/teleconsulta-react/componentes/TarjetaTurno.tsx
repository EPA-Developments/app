import {
  ESTADOS_CON_ACCESO,
  etiquetaEstado,
  formatearFecha,
  formatearHora,
  referenciaProfesional,
  tituloDelTurno,
} from '@epa/teleconsulta-core';
import { Badge, Button, Card, Group, Stack, Text } from '@mantine/core';
import { ResourceName } from '@medplum/react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';
import type { TurnoConPolitica } from '../hooks/useTurnosPaciente';
import { useTeleconsultaConfig } from '../TeleconsultaContext';
import { CancelarTurnoModal } from './CancelarTurnoModal';
import { MoverTurnoModal } from './MoverTurnoModal';
import { PagarBoton } from './PagarBoton';

export interface TarjetaTurnoProps extends TurnoConPolitica {
  /** Called after a move or cancellation, with the message for the patient. */
  onCambio?: (mensaje: string) => void;
}

/**
 * One videocall appointment, with everything the patient can do from here:
 * enter, pay, move, cancel, or see the report once it is over.
 */
export function TarjetaTurno(props: TarjetaTurnoProps): ReactElement {
  const { turno, politica } = props;
  const { zonaHoraria, rutaSala } = useTeleconsultaConfig();
  const [modal, setModal] = useState<'mover' | 'cancelar' | undefined>(undefined);
  const estado = etiquetaEstado(turno.status);
  const profesional = referenciaProfesional(turno);
  const inicio = turno.start ? new Date(turno.start) : undefined;
  const modificable = turno.status === 'booked' || turno.status === 'pending';
  const conAcceso = turno.status !== undefined && ESTADOS_CON_ACCESO.includes(turno.status);

  const listo = (mensaje: string): void => {
    setModal(undefined);
    props.onCambio?.(mensaje);
  };

  return (
    <Card withBorder radius="lg" padding="lg" data-testid={`turno-${turno.id}`}>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={2}>
            <Text fw={600}>{tituloDelTurno(turno)}</Text>
            {profesional && <ResourceName value={profesional} size="sm" c="dimmed" />}
          </Stack>
          <Group gap={6} wrap="nowrap">
            <Badge variant="light" color="violet" radius="sm">
              Videollamada
            </Badge>
            <Badge variant="light" color={estado.color} radius="sm">
              {estado.texto}
            </Badge>
          </Group>
        </Group>

        {inicio && (
          <Text size="sm">
            {formatearFecha(inicio, zonaHoraria)} · {formatearHora(inicio, zonaHoraria)} hs
          </Text>
        )}

        <Group gap="xs">
          {conAcceso && (
            <Button component={Link} to={rutaSala(turno.id)} radius="xl">
              Entrar a la videollamada
            </Button>
          )}
          {turno.status === 'pending' && <PagarBoton appointmentId={turno.id} />}
          {turno.status === 'fulfilled' && (
            <Button component={Link} to={rutaSala(turno.id)} variant="light" radius="xl">
              Ver informe y recetas
            </Button>
          )}
          {modificable && (
            <>
              <Button variant="default" radius="xl" onClick={() => setModal('mover')}>
                Mover
              </Button>
              <Button variant="subtle" color="red" radius="xl" onClick={() => setModal('cancelar')}>
                Cancelar
              </Button>
            </>
          )}
        </Group>
      </Stack>

      {modal === 'mover' && (
        <MoverTurnoModal turno={turno} politica={politica} abierto onCerrar={() => setModal(undefined)} onListo={listo} />
      )}
      {modal === 'cancelar' && (
        <CancelarTurnoModal
          turno={turno}
          politica={politica}
          abierto
          onCerrar={() => setModal(undefined)}
          onListo={listo}
        />
      )}
    </Card>
  );
}
