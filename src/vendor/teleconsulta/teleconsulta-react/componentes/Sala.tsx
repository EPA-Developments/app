import { BOTS, evaluarAcceso, textoDesde, type PoliticaTeleconsulta, type RolTeleconsulta } from '@epa/teleconsulta-core';
import type { Appointment } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { Alert, Box, Button, Group, Stack, Text } from '@mantine/core';
import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { llamarBot, type RespuestaBot } from '../bots';
import { useTeleconsultaConfig } from '../TeleconsultaContext';
import { useSalaJitsi, type DatosSala } from '../hooks/useSalaJitsi';

interface RespuestaToken extends RespuestaBot {
  dominio?: string;
  sala?: string;
  jwt?: string;
  rol?: RolTeleconsulta;
}

export interface SalaProps {
  turno: Appointment & { id: string };
  politica: PoliticaTeleconsulta;
  /** Text of the enter button (e.g. "El paciente ya está esperando — Iniciar consulta"). */
  textoEntrar?: string;
  /** Shown over the call while the other participant is missing. */
  textoEsperando: string;
  /** Extra actions next to the enter button (e.g. back link). */
  acciones?: ReactNode;
  /** Called after the user hangs up. */
  onSalir?: () => void;
  alturaSala?: number | string;
}

/**
 * The videocall block shared by the patient and the professional: shows when
 * the room opens, asks the token bot for a JWT on click (never stored), embeds
 * Jitsi, reports presence (best-effort) and shows a waiting notice while alone.
 */
export function Sala(props: SalaProps): ReactElement {
  const medplum = useMedplum();
  const { zonaHoraria } = useTeleconsultaConfig();
  const contenedor = useRef<HTMLDivElement>(null);
  const [ahora, setAhora] = useState(() => new Date());
  const [datos, setDatos] = useState<DatosSala | undefined>(undefined);
  const [pidiendo, setPidiendo] = useState(false);
  const [mensaje, setMensaje] = useState<string | undefined>(undefined);

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const acceso = evaluarAcceso(props.turno, props.politica, ahora, zonaHoraria);
  const { turno } = props;

  const alUnirse = useCallback(() => {
    void llamarBot(medplum, BOTS.presencia, { appointmentId: turno.id });
  }, [medplum, turno.id]);

  const { participantes, error } = useSalaJitsi({
    datos,
    contenedor,
    onUnido: alUnirse,
    onCerrar: () => {
      setDatos(undefined);
      props.onSalir?.();
    },
  });

  const entrar = async (): Promise<void> => {
    setPidiendo(true);
    setMensaje(undefined);
    const r = await llamarBot<RespuestaToken>(medplum, BOTS.token, { appointmentId: turno.id });
    setPidiendo(false);
    if (r.ok && r.dominio && r.sala && r.jwt) {
      setDatos({ dominio: r.dominio, sala: r.sala, jwt: r.jwt });
    } else {
      setMensaje(r.mensaje ?? 'No pudimos abrir la videollamada.');
    }
  };

  if (datos) {
    return (
      <Stack gap="sm">
        {error && <Alert color="red">{error}</Alert>}
        <Box pos="relative" h={props.alturaSala ?? 620} style={{ borderRadius: 12, overflow: 'hidden', background: '#111' }}>
          <div ref={contenedor} style={{ width: '100%', height: '100%' }} data-testid="sala-jitsi" />
          {participantes === 1 && (
            <Box
              pos="absolute"
              top={12}
              left={12}
              px="md"
              py={6}
              style={{ background: 'rgba(0,0,0,0.6)', color: 'white', borderRadius: 999, pointerEvents: 'none' }}
            >
              <Text size="sm" c="white">
                {props.textoEsperando}
              </Text>
            </Box>
          )}
        </Box>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {!acceso.permitido && acceso.ventana?.estado === 'antes' && (
        <Alert variant="light" color="gray" radius="md">
          Vas a poder entrar {textoDesde(acceso.ventana.abre, ahora, zonaHoraria)}. Dejá lista la cámara y el micrófono;
          al entrar vas a poder probarlos.
        </Alert>
      )}
      {!acceso.permitido && acceso.ventana?.estado !== 'antes' && acceso.motivo && (
        <Alert variant="light" color="yellow" radius="md">
          {acceso.motivo}
        </Alert>
      )}
      {acceso.permitido && (
        <Text size="sm" c="dimmed">
          La videollamada ya está abierta. Al entrar vas a poder probar la cámara y el micrófono antes de unirte.
        </Text>
      )}
      {mensaje && (
        <Alert variant="light" color="red" radius="md">
          {mensaje}
        </Alert>
      )}
      <Group>
        <Button radius="xl" size="md" onClick={entrar} loading={pidiendo} disabled={!acceso.permitido}>
          {props.textoEntrar ?? 'Entrar a la videollamada'}
        </Button>
        {props.acciones}
      </Group>
    </Stack>
  );
}
