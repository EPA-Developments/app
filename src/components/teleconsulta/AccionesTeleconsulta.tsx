// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Acciones de una teleconsulta en "Mis turnos": entrar a la videollamada, pagar la seña de
// una reserva tentativa y cancelar (antes de confirmar, la paciente ve qué pasa con la seña
// según R-14). Todo por los bots `som-teleconsulta-*`.
import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import type { Appointment } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconCreditCard, IconVideo, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Link } from 'react-router';
import { estadoReservaPortal } from '../../fhir/agenda';
import {
  cancelarTeleconsulta,
  esUrlDePago,
  pagarSenaTeleconsulta,
  puedeCancelar,
  puedeEntrar,
} from '../../fhir/teleconsulta';
import type { RespuestaCancelar } from '../../fhir/teleconsulta';

export interface AccionesTeleconsultaProps {
  readonly appt: Appointment & { id: string };
  /** Después de cancelar: el mensaje para la paciente (y recargar los turnos). */
  readonly onCambio: (mensaje: string) => void;
  /** Redirección al pago (tests; por defecto `window.location.assign`). */
  readonly redirigir?: (url: string) => void;
}

export function AccionesTeleconsulta({ appt, onCambio, redirigir }: AccionesTeleconsultaProps): JSX.Element | null {
  const medplum = useMedplum();
  const [pagando, setPagando] = useState(false);
  const [error, setError] = useState<string>();
  const [cancelar, setCancelar] = useState(false);

  const reserva = estadoReservaPortal(appt);
  // El link guardado ya lo muestra la tarjeta; sin link, se pide al bot.
  const pagarConBot = appt.status === 'pending' && reserva?.estado !== 'vencido' && !reserva?.linkPago;
  const entrar = puedeEntrar(appt);
  const cancelable = puedeCancelar(appt);
  if (!entrar && !pagarConBot && !cancelable) {
    return null;
  }

  const pagar = async (): Promise<void> => {
    setPagando(true);
    setError(undefined);
    const r = await pagarSenaTeleconsulta(medplum, appt.id);
    if (r.ok && esUrlDePago(r.url)) {
      (redirigir ?? ((url: string) => window.location.assign(url)))(r.url);
      return;
    }
    setPagando(false);
    setError(r.mensaje ?? 'No pudimos abrir el pago. Probá de nuevo en unos segundos.');
  };

  return (
    <Stack gap="xs" mt="sm">
      <Group gap="xs" wrap="wrap">
        {entrar && (
          <Button component={Link} to={`/teleconsulta/${appt.id}`} size="xs" leftSection={<IconVideo size={14} />}>
            Entrar a la videollamada
          </Button>
        )}
        {pagarConBot && (
          <Button size="xs" loading={pagando} onClick={pagar} leftSection={<IconCreditCard size={14} />}>
            Pagar la seña
          </Button>
        )}
        {cancelable && (
          <Button size="xs" variant="subtle" color="red" onClick={() => setCancelar(true)} leftSection={<IconX size={14} />}>
            Cancelar
          </Button>
        )}
      </Group>
      {error && (
        <Text size="sm" c="red">
          {error}
        </Text>
      )}
      {cancelar && (
        <CancelarTeleconsulta
          appt={appt}
          onCerrar={() => setCancelar(false)}
          onCancelada={(mensaje) => {
            setCancelar(false);
            onCambio(mensaje);
          }}
        />
      )}
    </Stack>
  );
}

function CancelarTeleconsulta({
  appt,
  onCerrar,
  onCancelada,
}: {
  appt: Appointment & { id: string };
  onCerrar: () => void;
  onCancelada: (mensaje: string) => void;
}): JSX.Element {
  const medplum = useMedplum();
  const [previa, setPrevia] = useState<RespuestaCancelar>();
  const [cancelando, setCancelando] = useState(false);
  const [error, setError] = useState<string>();

  // Qué pasaría si cancela (R-14), sin tocar el turno.
  useEffect(() => {
    let vigente = true;
    cancelarTeleconsulta(medplum, appt.id, false)
      .then((r) => {
        if (vigente) {
          if (r.ok) {
            setPrevia(r);
          } else {
            setError(r.mensaje ?? 'No pudimos revisar el turno.');
          }
        }
      })
      .catch(() => vigente && setError('No pudimos revisar el turno.'));
    return () => {
      vigente = false;
    };
  }, [medplum, appt.id]);

  const confirmar = async (): Promise<void> => {
    setCancelando(true);
    const r = await cancelarTeleconsulta(medplum, appt.id, true);
    setCancelando(false);
    if (r.ok && r.cancelado) {
      onCancelada(r.mensaje ?? 'Cancelamos tu teleconsulta.');
    } else {
      setError(r.mensaje ?? 'No pudimos cancelar el turno.');
    }
  };

  return (
    <Modal opened onClose={onCerrar} title="Cancelar la teleconsulta" centered>
      <Stack>
        {previa?.mensaje && (
          <Alert color={previa.consumeSesion && previa.conSena ? 'orange' : 'segundaOpinion'} variant="light">
            {previa.mensaje}
          </Alert>
        )}
        {!previa && !error && <Text c="dimmed">Revisando tu turno…</Text>}
        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onCerrar}>
            Volver
          </Button>
          <Button color="red" onClick={confirmar} loading={cancelando} disabled={!previa}>
            Cancelar el turno
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
