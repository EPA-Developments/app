// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Videollamada de una teleconsulta (/teleconsulta/:appointmentId). "Entrar" ejecuta el bot
// de SOM `som-teleconsulta-entrar`: si el turno es de la paciente, está confirmado y la sala
// ya abrió, devuelve el link del Jitsi de SOM (y marca que llegó); si falta la seña, se paga
// con `som-teleconsulta-pago`. El portal no ejecuta bots de otros proyectos.
import { Alert, Anchor, Box, Button, Group, Stack, Text, Title } from '@mantine/core';
import { formatDateTime } from '@medplum/core';
import type { Appointment } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconCreditCard, IconExternalLink, IconVideo } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Link, useParams } from 'react-router';
import {
  entrarTeleconsulta,
  esTeleconsulta,
  esUrlDePago,
  esUrlDeSala,
  pagarSenaTeleconsulta,
} from '../fhir/teleconsulta';
import type { RespuestaEntrar } from '../fhir/teleconsulta';

export interface TeleconsultaPageProps {
  /** Redirección al pago (tests; por defecto `window.location.assign`). */
  readonly redirigir?: (url: string) => void;
}

export function TeleconsultaPage({ redirigir }: TeleconsultaPageProps = {}): JSX.Element {
  const { appointmentId = '' } = useParams();
  const medplum = useMedplum();
  const [turno, setTurno] = useState<Appointment | null>();
  const [entrando, setEntrando] = useState(false);
  const [respuesta, setRespuesta] = useState<RespuestaEntrar>();
  const [sala, setSala] = useState<string>();
  const [pagando, setPagando] = useState(false);
  const [errorPago, setErrorPago] = useState<string>();

  useEffect(() => {
    medplum
      .readResource('Appointment', appointmentId)
      .then(setTurno)
      .catch(() => setTurno(null));
  }, [medplum, appointmentId]);

  const entrar = async (): Promise<void> => {
    setEntrando(true);
    const r = await entrarTeleconsulta(medplum, appointmentId);
    setEntrando(false);
    setRespuesta(r);
    if (r.ok && esUrlDeSala(r.url)) {
      setSala(r.url);
    }
  };

  const pagar = async (): Promise<void> => {
    setPagando(true);
    setErrorPago(undefined);
    const r = await pagarSenaTeleconsulta(medplum, appointmentId);
    if (r.ok && esUrlDePago(r.url)) {
      (redirigir ?? ((url: string) => window.location.assign(url)))(r.url);
      return;
    }
    setPagando(false);
    setErrorPago(r.mensaje ?? 'No pudimos abrir el pago. Probá de nuevo en unos segundos.');
  };

  const volver = (
    <Anchor component={Link} to="/get-care" size="sm">
      Volver a Mis turnos
    </Anchor>
  );

  if (turno === undefined) {
    return (
      <Document width={960}>
        <Text c="dimmed">Cargando tu turno…</Text>
      </Document>
    );
  }
  if (turno === null || !esTeleconsulta(turno)) {
    return (
      <Document width={960}>
        <Stack>
          <Alert color="yellow" variant="light">
            {turno === null ? 'No encontramos ese turno.' : 'Este turno no es una teleconsulta.'}
          </Alert>
          {volver}
        </Stack>
      </Document>
    );
  }

  const profesional = turno.participant?.find((p) => p.actor?.reference?.startsWith('Practitioner/'))?.actor?.display;

  return (
    <Document width={960}>
      <Stack>
        <div>
          <Title order={2}>{turno.description ?? 'Teleconsulta'}</Title>
          <Text c="dimmed">
            {turno.start ? formatDateTime(turno.start) : 'Fecha a confirmar'}
            {profesional ? ` · ${profesional}` : ''}
          </Text>
        </div>

        {sala ? (
          <Stack gap="xs">
            <Box
              component="iframe"
              src={sala}
              title="Videollamada"
              allow="camera; microphone; fullscreen; display-capture; autoplay"
              style={{ width: '100%', height: '70vh', border: 0, borderRadius: 8 }}
            />
            <Anchor href={sala} target="_blank" rel="noopener noreferrer" size="sm">
              <Group gap={4} component="span">
                <IconExternalLink size={14} />
                Abrir la videollamada en otra pestaña
              </Group>
            </Anchor>
          </Stack>
        ) : (
          <Stack gap="sm">
            <Text>Cuando sea la hora, entrá a la sala. Te recomendamos usar auriculares y un lugar tranquilo.</Text>
            <Group>
              <Button onClick={entrar} loading={entrando} leftSection={<IconVideo size={16} />}>
                Entrar a la videollamada
              </Button>
            </Group>
            {respuesta && !respuesta.ok && (
              <Alert color={respuesta.pagar ? 'yellow' : 'gray'} variant="light">
                <Stack gap="xs">
                  <Text size="sm">{respuesta.mensaje ?? 'No pudimos abrir la videollamada.'}</Text>
                  {respuesta.pagar && (
                    <Group>
                      <Button size="xs" onClick={pagar} loading={pagando} leftSection={<IconCreditCard size={14} />}>
                        Pagar la seña
                      </Button>
                    </Group>
                  )}
                  {errorPago && (
                    <Text size="sm" c="red">
                      {errorPago}
                    </Text>
                  )}
                </Stack>
              </Alert>
            )}
          </Stack>
        )}
        {volver}
      </Stack>
    </Document>
  );
}
