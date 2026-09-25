import {
  BOTS,
  evaluarMover,
  formatearFecha,
  formatearFechaHora,
  formatearHora,
  type PoliticaTeleconsulta,
} from '@epa/teleconsulta-core';
import type { Slot } from '@medplum/fhirtypes';
import { Alert, Button, Group, Loader, Modal, Stack, Text, TextInput, Title } from '@mantine/core';
import { useMedplum } from '@medplum/react';
import { useEffect, useState, type ReactElement } from 'react';
import { llamarBot, type RespuestaBot } from '../bots';
import type { TurnoVirtual } from '../hooks/useTurnosPaciente';
import { useTeleconsultaConfig } from '../TeleconsultaContext';

export interface MoverTurnoModalProps {
  turno: TurnoVirtual;
  politica: PoliticaTeleconsulta;
  abierto: boolean;
  onCerrar: () => void;
  /** Called with the bot message ("Movimos tu turno. Te quedan 2 movimientos."). */
  onListo: (mensaje: string) => void;
}

type SlotLibre = Slot & { id: string };

/** Free slots of the same schedule as the current one, from now on. */
function useSlotsLibres(turno: TurnoVirtual, activo: boolean): { slots: SlotLibre[]; cargando: boolean } {
  const medplum = useMedplum();
  const [slots, setSlots] = useState<SlotLibre[]>([]);
  const [cargando, setCargando] = useState(false);
  const slotActual = turno.slot?.[0]?.reference;

  useEffect(() => {
    if (!activo || !slotActual) return;
    let vigente = true;
    setCargando(true);
    medplum
      .readReference<Slot>({ reference: slotActual })
      .then(async (actual) => {
        const agenda = actual.schedule?.reference;
        if (!agenda) return [];
        return (await medplum.searchResources(
          'Slot',
          { schedule: agenda, status: 'free', start: `ge${new Date().toISOString()}`, _sort: 'start', _count: '60' },
          { cache: 'no-cache' },
        )) as SlotLibre[];
      })
      .catch(() => [] as SlotLibre[])
      .then((libres) => {
        if (vigente) {
          setSlots(libres);
          setCargando(false);
        }
      });
    return () => {
      vigente = false;
    };
  }, [medplum, slotActual, activo]);

  return { slots, cargando };
}

/**
 * Move an appointment within the policy (default: 3 moves, up to 24 h
 * before). With a Schedule/Slot agenda the patient picks a free slot of the
 * same professional; otherwise a date and time. The bot re-checks everything.
 */
export function MoverTurnoModal(props: MoverTurnoModalProps): ReactElement {
  const medplum = useMedplum();
  const { zonaHoraria } = useTeleconsultaConfig();
  const { turno, politica } = props;
  const conAgenda = (turno.slot?.length ?? 0) > 0;
  const { slots, cargando } = useSlotsLibres(turno, props.abierto && conAgenda);
  const [slotId, setSlotId] = useState<string | undefined>(undefined);
  const [fechaHora, setFechaHora] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<string | undefined>(undefined);
  const evaluacion = evaluarMover(turno, politica, new Date());

  const porDia = new Map<string, SlotLibre[]>();
  for (const s of slots) {
    const dia = formatearFecha(new Date(s.start), zonaHoraria);
    porDia.set(dia, [...(porDia.get(dia) ?? []), s]);
  }

  const listo = conAgenda ? slotId !== undefined : fechaHora !== '';

  const mover = async (): Promise<void> => {
    setEnviando(true);
    setMensaje(undefined);
    const entrada: Record<string, unknown> = { appointmentId: turno.id };
    if (conAgenda) {
      entrada.slotId = slotId;
    } else {
      const inicio = new Date(fechaHora);
      if (Number.isNaN(inicio.getTime())) {
        setEnviando(false);
        setMensaje('El nuevo horario no es válido.');
        return;
      }
      entrada.nuevoInicio = inicio.toISOString();
    }
    const r = await llamarBot<RespuestaBot>(medplum, BOTS.mover, entrada);
    setEnviando(false);
    if (r.ok) {
      props.onListo(r.mensaje ?? 'Movimos tu turno.');
    } else {
      setMensaje(r.mensaje ?? 'No pudimos mover el turno.');
    }
  };

  const restantes =
    evaluacion.restantes === 1 ? 'Te queda 1 movimiento' : `Te quedan ${evaluacion.restantes} movimientos`;

  return (
    <Modal opened={props.abierto} onClose={props.onCerrar} title="Mover turno" radius="lg" centered size="lg">
      <Stack gap="md">
        {turno.start && (
          <Text size="sm">
            Turno actual: <b>{formatearFechaHora(new Date(turno.start), zonaHoraria)}</b>
          </Text>
        )}
        {evaluacion.permitido ? (
          <Alert variant="light" color="blue" radius="md">
            {restantes} para este turno.
            {evaluacion.limite && ` Podés moverlo hasta el ${formatearFechaHora(evaluacion.limite, zonaHoraria)}.`}
          </Alert>
        ) : (
          <Alert variant="light" color="yellow" radius="md">
            {evaluacion.motivo}
          </Alert>
        )}

        {evaluacion.permitido && conAgenda && (
          <Stack gap="sm">
            {cargando && <Loader size="sm" />}
            {!cargando && slots.length === 0 && (
              <Text size="sm" c="dimmed">
                No hay horarios libres para este profesional por ahora. Escribinos y lo resolvemos.
              </Text>
            )}
            {[...porDia.entries()].map(([dia, delDia]) => (
              <Stack key={dia} gap={6}>
                <Title order={6}>{dia}</Title>
                <Group gap="xs">
                  {delDia.map((s) => (
                    <Button
                      key={s.id}
                      size="xs"
                      radius="xl"
                      variant={slotId === s.id ? 'filled' : 'light'}
                      onClick={() => setSlotId(s.id)}
                      aria-pressed={slotId === s.id}
                    >
                      {formatearHora(new Date(s.start), zonaHoraria)}
                    </Button>
                  ))}
                </Group>
              </Stack>
            ))}
          </Stack>
        )}

        {evaluacion.permitido && !conAgenda && (
          <TextInput
            type="datetime-local"
            label="Nuevo día y horario"
            value={fechaHora}
            onChange={(e) => setFechaHora(e.currentTarget.value)}
          />
        )}

        {mensaje && (
          <Alert variant="light" color="red" radius="md">
            {mensaje}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" radius="xl" onClick={props.onCerrar}>
            Volver
          </Button>
          <Button radius="xl" onClick={mover} loading={enviando} disabled={!evaluacion.permitido || !listo}>
            Mover turno
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
