// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Videollamada de una teleconsulta (/teleconsulta/:appointmentId). "Entrar" ejecuta el bot
// de SOM `som-teleconsulta-entrar`: si el turno es de la paciente, está confirmado y la sala
// ya abrió, devuelve el link del Jitsi de SOM (y marca que llegó); si falta la seña, se paga
// con `som-teleconsulta-pago`. El portal no ejecuta bots de otros proyectos.
//
// LA PACIENTE ESPERA ACÁ, NO EN EL JITSI. Entra como invitada y el médico es el que
// modera: si ella abre la sala antes, el Jitsi le muestra «Esperando al anfitrión» con
// un botón para iniciar sesión, y parece que le falta un usuario. Así que, después de
// «Entrar», el portal la hace esperar en su propia pantalla y abre la sala sola cuando
// el turno pasa a `checked-in` (el médico entró desde el dashboard). Si el médico
// entrara por otro lado y el turno no cambiara, a los pocos minutos del inicio se le
// ofrece entrar igual: nunca queda esperando para siempre.
import { Alert, Anchor, Box, Button, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { formatDateTime } from '@medplum/core';
import type { Appointment } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconCreditCard, IconExternalLink, IconVideo } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Link, useParams } from 'react-router';
import {
  entrarTeleconsulta,
  estadoDeLaEspera,
  esTeleconsulta,
  esUrlDePago,
  esUrlDeSala,
  pagarSenaTeleconsulta,
  puedeEntrarIgual,
  REFRESCO_ESPERA_MS,
} from '../fhir/teleconsulta';
import type { RespuestaEntrar } from '../fhir/teleconsulta';

export interface TeleconsultaPageProps {
  /** Redirección al pago (tests; por defecto `window.location.assign`). */
  readonly redirigir?: (url: string) => void;
  /** Cada cuánto se mira si el médico entró (tests; por defecto `REFRESCO_ESPERA_MS`). */
  readonly refrescoEsperaMs?: number;
}

export function TeleconsultaPage({
  redirigir,
  refrescoEsperaMs = REFRESCO_ESPERA_MS,
}: TeleconsultaPageProps = {}): JSX.Element {
  const { appointmentId = '' } = useParams();
  const medplum = useMedplum();
  const [turno, setTurno] = useState<Appointment | null>();
  const [entrando, setEntrando] = useState(false);
  const [respuesta, setRespuesta] = useState<RespuestaEntrar>();
  const [sala, setSala] = useState<string>();
  /** La sala se muestra: el médico ya entró, o ella eligió entrar igual. */
  const [abierta, setAbierta] = useState(false);
  const [ahora, setAhora] = useState(() => new Date());
  const [pagando, setPagando] = useState(false);
  const [errorPago, setErrorPago] = useState<string>();

  useEffect(() => {
    medplum
      .readResource('Appointment', appointmentId)
      .then(setTurno)
      .catch(() => setTurno(null));
  }, [medplum, appointmentId]);

  /** El turno recién leído del servidor (sin caché): de ahí sale si el médico entró. */
  const releer = useCallback(async (): Promise<Appointment | undefined> => {
    try {
      const fresco = await medplum.readResource('Appointment', appointmentId, { cache: 'no-cache' });
      setTurno(fresco);
      setAhora(new Date());
      if (estadoDeLaEspera(fresco) === 'medico-en-sala') {
        setAbierta(true);
      }
      return fresco;
    } catch {
      // Un refresco que falla no la saca de la espera: se vuelve a probar en el próximo.
      return undefined;
    }
  }, [medplum, appointmentId]);

  const entrar = async (): Promise<void> => {
    setEntrando(true);
    const r = await entrarTeleconsulta(medplum, appointmentId);
    if (r.ok && esUrlDeSala(r.url)) {
      // Primero el turno y después la sala: si el médico ya está, se abre directo, sin
      // pasar un instante por la pantalla de espera.
      await releer();
      setSala(r.url);
    }
    setEntrando(false);
    setRespuesta(r);
  };

  // Mientras espera, mirar el turno cada tanto: cuando el médico entra, se abre la sala.
  useEffect(() => {
    if (!sala || abierta) {
      return undefined;
    }
    const intervalo = setInterval(() => void releer(), refrescoEsperaMs);
    return () => clearInterval(intervalo);
  }, [sala, abierta, releer, refrescoEsperaMs]);

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

        {sala && !abierta ? (
          <SalaDeEspera turno={turno} ahora={ahora} onEntrarIgual={() => setAbierta(true)} />
        ) : sala ? (
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

/** La espera en el portal, hasta que el médico entra a la sala. */
function SalaDeEspera(props: { turno: Appointment; ahora: Date; onEntrarIgual: () => void }): JSX.Element {
  const estado = estadoDeLaEspera(props.turno);
  if (estado === 'terminada') {
    return (
      <Alert color="gray" variant="light">
        Esta consulta ya terminó.
      </Alert>
    );
  }
  if (estado === 'cancelada') {
    return (
      <Alert color="gray" variant="light">
        Este turno se canceló. Si es un error, escribinos por Mensajes.
      </Alert>
    );
  }
  return (
    <Stack gap="sm">
      <Group gap="sm" wrap="nowrap">
        <Loader size="sm" />
        <Text fw={600}>Ya estás en la sala de espera</Text>
      </Group>
      <Text>
        Tu médico todavía no entró. Cuando entre, la videollamada se abre sola en esta pantalla. No hace falta que hagas
        nada más: dejala abierta.
      </Text>
      <Text size="sm" c="dimmed">
        Mientras tanto, buscá un lugar tranquilo y, si podés, usá auriculares.
      </Text>
      {puedeEntrarIgual(props.turno, props.ahora) && (
        <Group>
          <Button variant="light" onClick={props.onEntrarIgual} leftSection={<IconVideo size={16} />}>
            Entrar igual a la sala
          </Button>
        </Group>
      )}
    </Stack>
  );
}
