// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Reservar un turno — modelo de "solicitud". El paciente pide (servicio + preferencia)
// y Recepción confirma con los bots de reserva (que aplican las reglas: capacidad,
// ventana, seña). El portal NO escribe la agenda: solo ejecuta el bot
// `som-solicitar-turno` y muestra el estado de sus solicitudes.
import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { formatDateTime } from '@medplum/core';
import type { Patient, Task } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconCalendarPlus, IconCircleCheck, IconInfoCircle } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { showErrorNotification } from '../utils/notifications';
import { cargarMisSolicitudes, crearSolicitud, ESTADO_SOLICITUD, SERVICIOS } from '../fhir/solicitudes';
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

export function GetCare(): JSX.Element {
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;

  const [servicio, setServicio] = useState<string | null>(null);
  const [preferencia, setPreferencia] = useState('');
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);

  const [solicitudes, setSolicitudes] = useState<Task[]>();

  const recargar = useCallback(() => {
    cargarMisSolicitudes(medplum, patient).then(setSolicitudes).catch(showErrorNotification);
  }, [medplum, patient]);

  useEffect(recargar, [recargar]);

  const enviar = async (): Promise<void> => {
    const elegida = SERVICIOS.find((x) => x.codigo === servicio);
    if (!elegida) {
      return;
    }
    setEnviando(true);
    setOk(false);
    try {
      const r = await crearSolicitud(medplum, patient, {
        servicio: elegida.label,
        servicioCodigo: elegida.codigo,
        preferenciaTexto: preferencia.trim() || undefined,
        nota: nota.trim() || undefined,
      });
      if (r.ok) {
        setOk(true);
        setServicio(null);
        setPreferencia('');
        setNota('');
        recargar();
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
    <Document width={800}>
      <Title order={2} mb="md">
        Mis turnos
      </Title>
      <MyAppointments patient={patient} />

      <Divider my="xl" />

      <Title order={2} mb="xs">
        Pedir un turno
      </Title>
      <Text c="dimmed" size="sm" mb="md">
        Elegí el servicio o estudio y tu preferencia de horario. Tu equipo te confirma el turno (día y hora
        exactos) según disponibilidad.
      </Text>

      {ok && (
        <Alert color="segundaOpinion" variant="light" icon={<IconCircleCheck />} mb="md" title="¡Solicitud enviada!">
          La recibimos. Te confirmamos el turno a la brevedad; vas a verlo en "Mis turnos".
        </Alert>
      )}

      <Stack gap="sm" maw={460}>
        <Select
          label="Servicio o estudio"
          placeholder="Elegí un servicio"
          required
          searchable
          data={SERVICIOS.map((s) => ({ value: s.codigo, label: s.label }))}
          value={servicio}
          onChange={setServicio}
        />
        <TextInput
          label="Preferencia de horario"
          placeholder="Ej.: jueves a la tarde, o mañanas temprano"
          value={preferencia}
          onChange={(e) => setPreferencia(e.currentTarget.value)}
        />
        <Textarea
          label="Nota (opcional)"
          placeholder="Algo que quieras contarnos para coordinar mejor"
          autosize
          minRows={2}
          value={nota}
          onChange={(e) => setNota(e.currentTarget.value)}
        />
        <Group>
          <Button leftSection={<IconCalendarPlus size={16} />} loading={enviando} disabled={!servicio} onClick={enviar}>
            Enviar solicitud
          </Button>
        </Group>
      </Stack>

      <Divider my="xl" />

      <Title order={3} mb="md">
        Mis solicitudes
      </Title>
      {solicitudes === undefined ? (
        <Loader />
      ) : solicitudes.length === 0 ? (
        <Group gap="xs" c="dimmed">
          <IconInfoCircle size={18} />
          <Text>Todavía no enviaste ninguna solicitud.</Text>
        </Group>
      ) : (
        <Stack gap="sm">
          {solicitudes.map((t) => (
            <SolicitudCard key={t.id} t={t} />
          ))}
        </Stack>
      )}
    </Document>
  );
}
