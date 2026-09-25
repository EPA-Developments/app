import { BOTS } from '@epa/teleconsulta-core';
import { Alert, Button, Stack, type ButtonProps } from '@mantine/core';
import { useMedplum } from '@medplum/react';
import { useState, type ReactElement } from 'react';
import { esUrlDePago, llamarBot, type RespuestaBot } from '../bots';

interface RespuestaPago extends RespuestaBot {
  url?: string;
}

export interface PagarBotonProps extends Omit<ButtonProps, 'onClick' | 'loading'> {
  appointmentId: string;
  texto?: string;
  /** Test hook / host override of the redirect (default: `window.location.assign`). */
  redirigir?: (url: string) => void;
}

/**
 * "Pagar" — asks the pago bot for a Mercado Pago checkout (price from the
 * service, never from the browser) and sends the patient there. The
 * appointment is confirmed only by the payment webhook, not by coming back.
 */
export function PagarBoton(props: PagarBotonProps): ReactElement {
  const { appointmentId, texto, redirigir, ...boton } = props;
  const medplum = useMedplum();
  const [pidiendo, setPidiendo] = useState(false);
  const [mensaje, setMensaje] = useState<string | undefined>(undefined);

  const pagar = async (): Promise<void> => {
    setPidiendo(true);
    setMensaje(undefined);
    const r = await llamarBot<RespuestaPago>(medplum, BOTS.pago, { appointmentId });
    if (r.ok && esUrlDePago(r.url)) {
      (redirigir ?? ((url: string) => window.location.assign(url)))(r.url);
      return;
    }
    setPidiendo(false);
    setMensaje(r.ok ? 'No pudimos abrir el pago. Probá de nuevo en unos segundos.' : r.mensaje);
  };

  return (
    <Stack gap={6}>
      <Button radius="xl" color="teal" {...boton} onClick={pagar} loading={pidiendo}>
        {texto ?? 'Pagar con Mercado Pago'}
      </Button>
      {mensaje && (
        <Alert variant="light" color="red" radius="md" p="xs">
          {mensaje}
        </Alert>
      )}
    </Stack>
  );
}
