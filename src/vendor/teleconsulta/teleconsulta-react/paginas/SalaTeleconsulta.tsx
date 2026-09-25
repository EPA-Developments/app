import { Alert, Button, Card, Group, Loader, Stack } from '@mantine/core';
import { useEffect, useState, type ReactElement } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { DocumentosDeConsulta } from '../componentes/DocumentosDeConsulta';
import { EncabezadoTurno } from '../componentes/EncabezadoTurno';
import { PagarBoton } from '../componentes/PagarBoton';
import { Sala } from '../componentes/Sala';
import { useTurno } from '../hooks/useTurno';
import { useTeleconsultaConfig } from '../TeleconsultaContext';

export interface SalaTeleconsultaProps {
  /** Defaults to the `:appointmentId` route param. */
  appointmentId?: string;
  /** Poll interval while a just-approved payment is confirmed (ms). */
  intervaloPagoMs?: number;
  /** How many times to poll before giving up (default 20). */
  intentosPago?: number;
}

/**
 * Patient page of one videocall (`/teleconsulta/:appointmentId`): pay if
 * pending, wait for the webhook after Mercado Pago, enter the room when it
 * opens, and see the report afterwards.
 */
export function SalaTeleconsulta(props: SalaTeleconsultaProps): ReactElement {
  const params = useParams();
  const [busqueda] = useSearchParams();
  const { rutaTurnos } = useTeleconsultaConfig();
  const appointmentId = props.appointmentId ?? params.appointmentId;
  const { turno, politica, cargando, error, recargar } = useTurno(appointmentId);
  const pago = busqueda.get('pago');
  const [intentos, setIntentos] = useState(0);
  const maxIntentos = props.intentosPago ?? 20;
  const confirmandoPago = pago === 'aprobado' && turno?.status === 'pending' && intentos < maxIntentos;

  useEffect(() => {
    if (!confirmandoPago) return undefined;
    const t = setTimeout(() => {
      setIntentos((n) => n + 1);
      void recargar();
    }, props.intervaloPagoMs ?? 3000);
    return () => clearTimeout(t);
  }, [confirmandoPago, intentos, recargar, props.intervaloPagoMs]);

  const volver = (
    <Group>
      <Button component={Link} to={rutaTurnos} variant="default" radius="xl">
        Volver a Mis turnos
      </Button>
    </Group>
  );

  if (cargando && !turno) return <Loader />;
  if (!turno || !politica) {
    return (
      <Stack gap="md">
        <Alert variant="light" color="red" radius="md">
          {error ?? 'No encontramos esa videollamada en tu cuenta.'}
        </Alert>
        {volver}
      </Stack>
    );
  }

  let cuerpo: ReactElement;
  if (turno.status === 'fulfilled') {
    cuerpo = (
      <Stack gap="md">
        <DocumentosDeConsulta appointmentId={turno.id} />
        {volver}
      </Stack>
    );
  } else if (turno.status === 'cancelled' || turno.status === 'noshow' || turno.status === 'entered-in-error') {
    cuerpo = (
      <Stack gap="md">
        <Alert variant="light" color="gray" radius="md">
          Este turno fue cancelado.
        </Alert>
        {volver}
      </Stack>
    );
  } else if (turno.status === 'pending') {
    cuerpo = confirmandoPago ? (
      <Alert variant="light" color="blue" radius="md" icon={<Loader size="xs" />}>
        Estamos confirmando tu pago…
      </Alert>
    ) : (
      <Stack gap="md" align="flex-start">
        {pago === 'aprobado' && (
          <Alert variant="light" color="blue" radius="md">
            Tu pago está en proceso. Apenas se confirme, vas a poder entrar desde acá.
          </Alert>
        )}
        {pago === 'pendiente' && (
          <Alert variant="light" color="yellow" radius="md">
            Tu pago quedó pendiente. Apenas se acredite, confirmamos tu turno.
          </Alert>
        )}
        {pago === 'error' && (
          <Alert variant="light" color="red" radius="md">
            El pago no se completó. Podés intentar de nuevo.
          </Alert>
        )}
        {pago !== 'aprobado' && pago !== 'pendiente' && (
          <Alert variant="light" color="yellow" radius="md">
            Para confirmar la videollamada falta el pago.
          </Alert>
        )}
        <PagarBoton appointmentId={turno.id} />
        {volver}
      </Stack>
    );
  } else {
    cuerpo = (
      <Stack gap="md">
        {pago === 'aprobado' && (
          <Alert variant="light" color="teal" radius="md">
            ¡Listo! Tu pago está confirmado.
          </Alert>
        )}
        <Sala
          turno={turno}
          politica={politica}
          textoEsperando="Ya estás en la sala. El profesional va a entrar en un momento."
          acciones={volver}
          onSalir={() => void recargar()}
        />
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <Card withBorder radius="lg" padding="lg">
        <EncabezadoTurno turno={turno} mostrar="profesional" />
      </Card>
      {cuerpo}
    </Stack>
  );
}
