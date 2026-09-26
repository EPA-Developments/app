// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Reservar un turno. La paciente elige modalidad, consulta, profesional y horario, y el bot
// `som-reservar-portal` de Recepción reserva aplicando las reglas (R-23): la consulta del
// Plan Bienestar queda confirmada; las demás, tentativas hasta la seña del 50 % por
// Mercado Pago (horario retenido 30 minutos). El portal NO escribe la agenda. Queda, como
// alternativa, pedir que Recepción coordine (bot `som-solicitar-turno`).
import { Alert, Badge, Button, Card, Collapse, Divider, Group, Loader, Stack, Text, Textarea, Title } from '@mantine/core';
import { formatDateTime } from '@medplum/core';
import type { Patient, Task } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconInfoCircle, IconMessage2 } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { ReservaTurno } from '../components/reserva/ReservaTurno';
import { cargarMisSolicitudes, crearSolicitud, ESTADO_SOLICITUD } from '../fhir/solicitudes';
import { showErrorNotification } from '../utils/notifications';
import { MyAppointments } from './MyAppointments';

function SolicitudCard({ t }: { t: Task }): JSX.Element {
  const e = ESTADO_SOLICITUD[t.status ?? ''] ?? { label: t.status ?? '—', color: 'gray' };
  return (
    <Card withBorder radius="md" p="md">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <div>
          <Text size="sm">{t.description ?? 'Solicitud de turno'}</Text>
          <Text size="xs" c="dimmed">
            {t.authoredOn ? formatDateTime(t.authoredOn) : ''}
          </Text>
        </div>
        <Badge color={e.color} variant="light">
          {e.label}
        </Badge>
      </Group>
    </Card>
  );
}

/** Alternativa: pedir que Recepción coordine el turno (cuando no hay horario que sirva). */
function PedirCoordinacion({ patient, onEnviada }: { patient: Patient; onEnviada: () => void }): JSX.Element {
  const medplum = useMedplum();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);

  const enviar = async (): Promise<void> => {
    setEnviando(true);
    setOk(false);
    try {
      const r = await crearSolicitud(medplum, patient, {
        servicio: 'Consulta a coordinar con Recepción',
        preferenciaTexto: texto.trim() || undefined,
      });
      if (r.ok) {
        setOk(true);
        setTexto('');
        onEnviada();
      } else {
        showErrorNotification(new Error(r.mensaje ?? 'No se pudo enviar la solicitud.'));
      }
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Stack gap="sm">
      <Button variant="subtle" size="sm" leftSection={<IconMessage2 size={16} />} onClick={() => setAbierto((a) => !a)} w="fit-content">
        ¿No encontrás horario? Pedí que te contactemos
      </Button>
      <Collapse in={abierto}>
        <Stack gap="sm" maw={460}>
          {ok && (
            <Alert color="segundaOpinion" variant="light" icon={<IconCircleCheck />} title="¡Solicitud enviada!">
              La recibimos. Recepción te contacta para coordinar el turno.
            </Alert>
          )}
          <Textarea
            label="Contanos qué necesitás y cuándo podés"
            placeholder="Ej.: una consulta de Nutrición, los jueves a la tarde"
            autosize
            minRows={2}
            value={texto}
            onChange={(e) => setTexto(e.currentTarget.value)}
          />
          <Group>
            <Button variant="light" loading={enviando} disabled={!texto.trim()} onClick={enviar}>
              Enviar solicitud
            </Button>
          </Group>
        </Stack>
      </Collapse>
    </Stack>
  );
}

export function GetCare(): JSX.Element {
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  const [version, setVersion] = useState(0);
  const [solicitudes, setSolicitudes] = useState<Task[]>();

  const recargar = useCallback(() => {
    cargarMisSolicitudes(medplum, patient).then(setSolicitudes).catch(showErrorNotification);
  }, [medplum, patient]);

  useEffect(recargar, [recargar]);

  return (
    <Document width={800}>
      <Title order={2} mb="md">
        Mis turnos
      </Title>
      <MyAppointments patient={patient} version={version} />

      <Divider my="xl" />

      <Title order={2} mb="xs">
        Reservar un turno
      </Title>
      <Text c="dimmed" size="sm" mb="md">
        Elegí cómo querés atenderte, la consulta, el profesional y el horario. Las consultas del Plan Bienestar 100
        Días® están incluidas; las demás se confirman con la seña del 50 %.
      </Text>
      <ReservaTurno patient={patient} onReservado={() => setVersion((v) => v + 1)} />

      <Divider my="xl" />

      <PedirCoordinacion patient={patient} onEnviada={recargar} />

      {solicitudes === undefined ? (
        <Loader size="sm" mt="md" />
      ) : solicitudes.length > 0 ? (
        <Stack gap="sm" mt="md">
          <Title order={3}>Mis solicitudes</Title>
          {solicitudes.map((t) => (
            <SolicitudCard key={t.id} t={t} />
          ))}
        </Stack>
      ) : (
        <Group gap="xs" c="dimmed" mt="md">
          <IconInfoCircle size={18} />
          <Text size="sm">Sin solicitudes pendientes con Recepción.</Text>
        </Group>
      )}
    </Document>
  );
}
