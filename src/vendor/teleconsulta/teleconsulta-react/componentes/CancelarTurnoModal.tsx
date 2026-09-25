import { BOTS, evaluarCancelar, formatearFechaHora, type PoliticaTeleconsulta } from '@epa/teleconsulta-core';
import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { useMedplum } from '@medplum/react';
import { useState, type ReactElement } from 'react';
import { llamarBot, type RespuestaBot } from '../bots';
import type { TurnoVirtual } from '../hooks/useTurnosPaciente';
import { useTeleconsultaConfig } from '../TeleconsultaContext';

export interface CancelarTurnoModalProps {
  turno: TurnoVirtual;
  politica: PoliticaTeleconsulta;
  abierto: boolean;
  onCerrar: () => void;
  /** Called with the bot message after a successful cancellation. */
  onListo: (mensaje: string) => void;
}

/**
 * Tells the patient BEFORE confirming whether this cancellation is refunded
 * (the same rule the bot applies), then cancels through the bot.
 */
export function CancelarTurnoModal(props: CancelarTurnoModalProps): ReactElement {
  const medplum = useMedplum();
  const { zonaHoraria } = useTeleconsultaConfig();
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | undefined>(undefined);
  const evaluacion = evaluarCancelar(props.turno, props.politica, new Date());

  let aviso: string;
  if (props.turno.status === 'pending') {
    aviso = 'Este turno todavía no está pago, así que no hay nada para devolver.';
  } else if (evaluacion.conReintegro) {
    aviso = 'Si cancelás ahora te devolvemos el total de lo que pagaste, por el mismo medio de pago.';
  } else {
    const limite = evaluacion.limiteReintegro ? ` (el límite era ${formatearFechaHora(evaluacion.limiteReintegro, zonaHoraria)})` : '';
    aviso = `Faltan menos de ${props.politica.horasReintegro} horas para el turno: si cancelás ahora no hay reintegro${limite}.`;
  }

  const cancelar = async (): Promise<void> => {
    setEnviando(true);
    setMensaje(undefined);
    const r = await llamarBot<RespuestaBot>(medplum, BOTS.cancelar, { appointmentId: props.turno.id });
    setEnviando(false);
    if (r.ok) {
      props.onListo(r.mensaje ?? 'Cancelamos tu turno.');
    } else {
      setMensaje(r.mensaje ?? 'No pudimos cancelar el turno.');
    }
  };

  return (
    <Modal opened={props.abierto} onClose={props.onCerrar} title="Cancelar turno" radius="lg" centered>
      <Stack gap="md">
        {evaluacion.permitido ? (
          <Alert variant="light" color={evaluacion.conReintegro ? 'teal' : 'yellow'} radius="md">
            {aviso}
          </Alert>
        ) : (
          <Alert variant="light" color="yellow" radius="md">
            {evaluacion.motivo}
          </Alert>
        )}
        {mensaje && (
          <Alert variant="light" color="red" radius="md">
            {mensaje}
          </Alert>
        )}
        <Text size="sm" c="dimmed">
          Si preferís otro día u horario, podés mover el turno en lugar de cancelarlo.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" radius="xl" onClick={props.onCerrar}>
            Volver
          </Button>
          <Button color="red" radius="xl" onClick={cancelar} loading={enviando} disabled={!evaluacion.permitido}>
            Cancelar turno
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
