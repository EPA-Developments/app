// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Campanita "Novedades" del Header (smartphone y web): badge con las no leídas y panel
// con las notificaciones que dejan los bots (turno confirmado, pago recibido, resultados
// listos…). Tocar una la marca como leída y lleva a donde corresponde.
//
// Refresco: al montar, al volver a la app (foco / pestaña visible) y cada 2 minutos. Con
// MEDPLUM_TIEMPO_REAL=true además se suscribe por WebSocket (Subscription de Medplum) y
// el badge se enciende al instante; si el WebSocket no conecta, sigue el refresco.
// Contrato y checklist del server: docs/medplum/notificaciones.md.
import {
  ActionIcon,
  Button,
  Drawer,
  Group,
  Indicator,
  Loader,
  Stack,
  Text,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { WithId } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { Attachment, Communication } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile, useSubscription } from '@medplum/react';
import {
  IconAlarm,
  IconBell,
  IconBellOff,
  IconCalendarCheck,
  IconFileText,
  IconInfoCircle,
  IconPaperclip,
  IconReceipt,
  IconReportMedical,
} from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import {
  adjuntoNotificacion,
  cargarNotificaciones,
  contarNoLeidas,
  criteriaNotificaciones,
  destinoNotificacion,
  esNoLeida,
  haceCuanto,
  marcarLeida,
  marcarTodasLeidas,
  textoNotificacion,
  tipoNotificacion,
} from '../fhir/notificaciones';
import type { TipoNotificacion } from '../fhir/notificaciones';
import { descargarAdjunto } from '../utils/adjuntos';
import { showErrorNotification } from '../utils/notifications';
import { tiempoRealHabilitado } from '../utils/tiempoReal';
import classes from './CampanitaNovedades.module.css';

export const REFRESCO_MS = 2 * 60 * 1000;

const ICONOS: Record<TipoNotificacion, { icon: Icon; color: string }> = {
  'reserva-confirmada': { icon: IconCalendarCheck, color: 'green' },
  recordatorio: { icon: IconAlarm, color: 'blue' },
  'pago-recibido': { icon: IconReceipt, color: 'teal' },
  'resultados-listos': { icon: IconReportMedical, color: 'grape' },
  'documento-nuevo': { icon: IconFileText, color: 'indigo' },
  general: { icon: IconInfoCircle, color: 'gray' },
};

function Novedad({
  c,
  onTocar,
  onAdjunto,
}: {
  c: WithId<Communication>;
  onTocar: () => void;
  onAdjunto: (a: Attachment) => void;
}): JSX.Element {
  const { tipo, titulo } = tipoNotificacion(c);
  const { icon: TipoIcon, color } = ICONOS[tipo];
  const noLeida = esNoLeida(c);
  const adjunto = adjuntoNotificacion(c);
  return (
    <div className={classes.item} data-unread={noLeida || undefined}>
      <UnstyledButton className={classes.main} onClick={onTocar}>
        <ThemeIcon size={38} radius="md" variant="light" color={color}>
          <TipoIcon size={20} stroke={1.6} />
        </ThemeIcon>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Group justify="space-between" gap="xs" wrap="nowrap">
            <Text fw={noLeida ? 700 : 500} size="sm">
              {titulo}
            </Text>
            <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
              <Text size="xs" c="dimmed">
                {c.sent ? haceCuanto(c.sent) : ''}
              </Text>
              {noLeida && <span className={classes.dot} title="Sin leer" />}
            </Group>
          </Group>
          <Text size="sm" c={noLeida ? undefined : 'dimmed'} style={{ whiteSpace: 'pre-line' }}>
            {textoNotificacion(c)}
          </Text>
        </div>
      </UnstyledButton>
      {adjunto && (
        <Button
          className={classes.adjunto}
          size="compact-xs"
          variant="light"
          leftSection={<IconPaperclip size={14} />}
          onClick={() => onAdjunto(adjunto)}
        >
          {adjunto.title ?? 'Ver adjunto'}
        </Button>
      )}
    </div>
  );
}

export function CampanitaNovedades(): JSX.Element | null {
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const navigate = useNavigate();
  const recipient = profile ? getReferenceString(profile) : undefined;

  const [abierto, { open, close }] = useDisclosure(false);
  const [noLeidas, setNoLeidas] = useState(0);
  const [lista, setLista] = useState<WithId<Communication>[]>();
  const abiertoRef = useRef(abierto);
  abiertoRef.current = abierto;

  const refrescarContador = useCallback((): void => {
    if (recipient) {
      // La campanita no es crítica: si falla (p. ej. sin señal) queda el último valor.
      contarNoLeidas(medplum, recipient)
        .then(setNoLeidas)
        .catch(() => undefined);
    }
  }, [medplum, recipient]);

  const cargarLista = useCallback((): void => {
    if (recipient) {
      cargarNotificaciones(medplum, recipient)
        .then(setLista)
        .catch((err) => {
          setLista([]);
          showErrorNotification(err);
        });
    }
  }, [medplum, recipient]);

  useEffect(() => {
    refrescarContador();
    const intervalo = window.setInterval(refrescarContador, REFRESCO_MS);
    const alVolver = (): void => {
      if (document.visibilityState === 'visible') {
        refrescarContador();
      }
    };
    window.addEventListener('focus', refrescarContador);
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener('focus', refrescarContador);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [refrescarContador]);

  // Tiempo real: una novedad nueva (o leída en otro dispositivo) actualiza al instante.
  useSubscription(
    tiempoRealHabilitado() && recipient ? criteriaNotificaciones(recipient) : undefined,
    () => {
      refrescarContador();
      if (abiertoRef.current) {
        cargarLista();
      }
    },
    { onError: (err) => console.warn('Novedades sin tiempo real; sigue el refresco periódico.', err) }
  );

  const abrir = (): void => {
    open();
    cargarLista();
  };

  const leer = (c: WithId<Communication>): void => {
    if (!esNoLeida(c)) {
      return;
    }
    setLista((l) => l?.map((x) => (x.id === c.id ? { ...x, status: 'completed' } : x)));
    setNoLeidas((n) => Math.max(0, n - 1));
    marcarLeida(medplum, c).catch((err) => {
      showErrorNotification(err);
      refrescarContador();
      cargarLista();
    });
  };

  const tocar = (c: WithId<Communication>): void => {
    leer(c);
    const destino = destinoNotificacion(c);
    if (destino) {
      close();
      navigate(destino)?.catch(console.error);
    }
  };

  const leerTodas = (): void => {
    const pendientes = lista?.filter(esNoLeida) ?? [];
    setLista((l) => l?.map((x) => ({ ...x, status: esNoLeida(x) ? 'completed' : x.status })));
    setNoLeidas(0);
    marcarTodasLeidas(medplum, pendientes)
      .catch(showErrorNotification)
      // Puede haber no leídas más viejas que las que muestra el panel.
      .finally(refrescarContador);
  };

  const abrirAdjunto = (c: WithId<Communication>, a: Attachment): void => {
    leer(c);
    descargarAdjunto(medplum, a).catch(showErrorNotification);
  };

  if (!recipient) {
    return null;
  }

  const hayNoLeidas = !!lista?.some(esNoLeida);

  return (
    <>
      <Indicator
        inline
        color="red"
        size={18}
        offset={6}
        label={noLeidas > 9 ? '9+' : noLeidas}
        disabled={noLeidas === 0}
        zIndex={1}
      >
        <ActionIcon
          variant="subtle"
          color="gray"
          size={40}
          radius="xl"
          aria-label={noLeidas ? `Novedades: ${noLeidas} sin leer` : 'Novedades'}
          onClick={abrir}
        >
          <IconBell size={24} stroke={1.6} />
        </ActionIcon>
      </Indicator>

      <Drawer
        opened={abierto}
        onClose={close}
        position="right"
        size="md"
        zIndex={2000}
        title={
          <Text fw={700} fz="lg">
            Novedades
          </Text>
        }
      >
        {lista === undefined ? (
          <Group justify="center" py="xl">
            <Loader size="sm" />
          </Group>
        ) : lista.length === 0 ? (
          <Stack align="center" gap="xs" py="xl">
            <ThemeIcon size={48} radius="xl" variant="light" color="gray">
              <IconBellOff size={26} stroke={1.5} />
            </ThemeIcon>
            <Text c="dimmed" ta="center">
              No tenés novedades por ahora.
            </Text>
          </Stack>
        ) : (
          <Stack gap={6}>
            {hayNoLeidas && (
              <Group justify="flex-end">
                <Button size="compact-sm" variant="subtle" onClick={leerTodas}>
                  Marcar todas como leídas
                </Button>
              </Group>
            )}
            {lista.map((c) => (
              <Novedad key={c.id} c={c} onTocar={() => tocar(c)} onAdjunto={(a) => abrirAdjunto(c, a)} />
            ))}
          </Stack>
        )}
      </Drawer>
    </>
  );
}
