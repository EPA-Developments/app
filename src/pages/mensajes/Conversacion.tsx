// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Una conversación: arriba el motivo, en el medio los mensajes (los del paciente a la
// derecha) y abajo, siempre a la vista y destacado, el lugar donde escribe.
// Se actualiza cada 15 s y al volver a la app; con MEDPLUM_TIEMPO_REAL, al instante.
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Container,
  Group,
  Loader,
  Text,
  Textarea,
  ThemeIcon,
  Title,
} from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Communication, DocumentReference, Patient, Reference } from '@medplum/fhirtypes';
import { useMedplum, useSubscription } from '@medplum/react';
import { IconChevronLeft, IconPaperclip, IconPencilPlus, IconSend } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { cargarMensajes, enviarMensaje, esMio, marcarRecibidos, motivoDe, textoMensaje } from '../../fhir/mensajes';
import { descargarAdjunto } from '../../utils/adjuntos';
import { showErrorNotification } from '../../utils/notifications';
import { tiempoRealHabilitado } from '../../utils/tiempoReal';
import { RUTA_MENSAJES, RUTA_NUEVO_MENSAJE } from './Conversaciones';
import { iconoMotivo } from './iconos';
import classes from './Mensajes.module.css';

export const REFRESCO_CHAT_MS = 15 * 1000;

const fechaHora = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function Burbuja({ m, mio }: { m: WithId<Communication>; mio: boolean }): JSX.Element {
  const medplum = useMedplum();
  const adjuntos = (m.payload ?? []).filter((p) => p.contentAttachment || p.contentReference);

  const abrir = async (a: NonNullable<Communication['payload']>[number]): Promise<void> => {
    if (a.contentAttachment) {
      await descargarAdjunto(medplum, a.contentAttachment);
    } else if (a.contentReference) {
      // Lo que el equipo adjunta desde su bandeja llega como DocumentReference.
      const doc = await medplum.readReference(a.contentReference as Reference<DocumentReference>);
      const attachment = doc.content?.[0]?.attachment;
      if (attachment) {
        await descargarAdjunto(medplum, attachment);
      }
    }
  };

  return (
    <div className={classes.burbuja} data-mio={mio || undefined}>
      {!mio && (
        <Text size="xs" fw={700} c="dimmed">
          {m.sender?.display ?? 'Tu equipo de salud'}
        </Text>
      )}
      {textoMensaje(m) && (
        <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {textoMensaje(m)}
        </Text>
      )}
      {adjuntos.map((a, i) => (
        <Button
          key={i}
          mt={4}
          size="compact-xs"
          variant={mio ? 'white' : 'light'}
          leftSection={<IconPaperclip size={14} />}
          onClick={() => abrir(a).catch(showErrorNotification)}
        >
          {a.contentAttachment?.title ?? 'Archivo adjunto'}
        </Button>
      ))}
      <div className={classes.hora}>{m.sent ? fechaHora.format(new Date(m.sent)) : ''}</div>
    </div>
  );
}

export function Conversacion(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const patient = medplum.getProfile() as Patient;
  const { messageId = '' } = useParams();

  const [topic, setTopic] = useState<WithId<Communication>>();
  const [mensajes, setMensajes] = useState<WithId<Communication>[]>();
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refrescar = useCallback(
    (conversacion: WithId<Communication> | undefined): void => {
      if (!conversacion) {
        return;
      }
      cargarMensajes(medplum, conversacion)
        .then((lista) => {
          setMensajes(lista);
          // Lo que el equipo escribió queda leído al abrir la conversación.
          marcarRecibidos(medplum, patient, lista).catch(console.error);
        })
        .catch(() => undefined);
    },
    [medplum, patient]
  );

  useEffect(() => {
    setTopic(undefined);
    setMensajes(undefined);
    medplum
      .readResource('Communication', messageId)
      .then((t) => {
        setTopic(t);
        refrescar(t);
      })
      .catch((err) => {
        showErrorNotification(err);
        navigate(RUTA_MENSAJES)?.catch(console.error);
      });
  }, [medplum, messageId, navigate, refrescar]);

  useEffect(() => {
    const intervalo = window.setInterval(() => refrescar(topic), REFRESCO_CHAT_MS);
    const alVolver = (): void => refrescar(topic);
    window.addEventListener('focus', alVolver);
    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener('focus', alVolver);
    };
  }, [refrescar, topic]);

  useSubscription(
    tiempoRealHabilitado() && topic ? `Communication?part-of=Communication/${topic.id}` : undefined,
    () => refrescar(topic),
    { onError: (err) => console.warn('Mensajes sin tiempo real; sigue el refresco periódico.', err) }
  );

  // Siempre mostrar lo último.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [mensajes?.length]);

  async function enviar(): Promise<void> {
    if (!topic || !texto.trim()) {
      return;
    }
    setEnviando(true);
    try {
      const nuevo = await enviarMensaje(medplum, patient, topic, texto);
      setMensajes((l) => [...(l ?? []), nuevo]);
      setTexto('');
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setEnviando(false);
    }
  }

  const motivo = topic ? motivoDe(topic) : undefined;
  const Icono = iconoMotivo(motivo?.code);
  const finalizada = topic?.status === 'completed';

  return (
    <Container size="sm" className={classes.chat}>
      <div className={classes.cabecera}>
        <Anchor component={Link} to={RUTA_MENSAJES} size="sm" fw={500}>
          <Group gap={2} wrap="nowrap">
            <IconChevronLeft size={16} />
            Mensajes
          </Group>
        </Anchor>
        {motivo && (
          <Group gap="sm" mt={6} wrap="nowrap">
            <ThemeIcon size={36} radius="md" variant="light">
              <Icono size={20} stroke={1.5} />
            </ThemeIcon>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text size="xs" c="dimmed">
                Motivo
              </Text>
              <Title order={4} lh={1.2}>
                {motivo.titulo}
              </Title>
            </div>
            {finalizada && (
              <Badge color="gray" variant="light">
                Finalizada
              </Badge>
            )}
          </Group>
        )}
      </div>

      <div className={classes.mensajes} ref={scrollRef}>
        {mensajes === undefined ? (
          <Group justify="center" py="xl">
            <Loader size="sm" />
          </Group>
        ) : (
          mensajes.map((m) => <Burbuja key={m.id} m={m} mio={esMio(m, patient)} />)
        )}
      </div>

      {finalizada ? (
        <Alert color="gray" variant="light" mb="xs" title="Esta conversación está finalizada">
          <Button
            mt="xs"
            size="sm"
            leftSection={<IconPencilPlus size={16} />}
            onClick={() =>
              navigate(`${RUTA_NUEVO_MENSAJE}${motivo?.code ? `?motivo=${motivo.code}` : ''}`)?.catch(console.error)
            }
          >
            Escribir un mensaje nuevo
          </Button>
        </Alert>
      ) : (
        <div className={classes.redactor}>
          <Textarea
            label={
              <Text size="sm" fw={700} component="span">
                Tu mensaje
              </Text>
            }
            placeholder="Escribí acá tu mensaje…"
            variant="unstyled"
            autosize
            minRows={2}
            maxRows={5}
            value={texto}
            onChange={(e) => setTexto(e.currentTarget.value)}
            onKeyDown={(e) => {
              // En la compu, Ctrl/⌘ + Enter envía; en el celular Enter es un salto de línea.
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                enviar().catch(console.error);
              }
            }}
            disabled={!topic}
          />
          <Group justify="flex-end" mt={4}>
            <Button
              leftSection={<IconSend size={16} />}
              onClick={enviar}
              loading={enviando}
              disabled={!topic || !texto.trim()}
            >
              Enviar
            </Button>
          </Group>
        </div>
      )}
    </Container>
  );
}
