// SPDX-FileCopyrightText: Copyright BioWellness
// SPDX-License-Identifier: Apache-2.0
//
// "Mis turnos" — vista de SOLO LECTURA de los turnos del paciente.
// Los turnos los crea y gestiona Recepción (app aparte) vía los bots de reserva; el
// portal solo los visualiza. Búsqueda estándar y acotada al paciente: Appointment?patient=<ref>.
// Se separan próximos y anteriores. La reserva online (escribir) se cablea aparte
// llamando a los bots de recepción, no FHIR directo.
import { Badge, Card, Group, Stack, Text } from '@mantine/core';
import { formatDateTime, getReferenceString } from '@medplum/core';
import type { Appointment, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconCalendarEvent } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { showErrorNotification } from '../utils/notifications';

// status de Appointment (FHIR R4) → etiqueta en español y color para el paciente.
const STATUS: Record<string, { label: string; color: string }> = {
  proposed: { label: 'Propuesto', color: 'gray' },
  pending: { label: 'Pendiente', color: 'yellow' },
  booked: { label: 'Confirmado', color: 'biowellness' },
  arrived: { label: 'Presente', color: 'biowellness' },
  'checked-in': { label: 'Check-in', color: 'biowellness' },
  waitlist: { label: 'En espera', color: 'yellow' },
  fulfilled: { label: 'Realizado', color: 'gray' },
  cancelled: { label: 'Cancelado', color: 'red' },
  noshow: { label: 'No asististe', color: 'red' },
  'entered-in-error': { label: 'Error de carga', color: 'red' },
};

function statusBadge(status?: string): JSX.Element {
  const s = status ? STATUS[status] : undefined;
  return (
    <Badge color={s?.color ?? 'gray'} variant="light">
      {s?.label ?? status ?? '—'}
    </Badge>
  );
}

// Nombre del servicio/terapia del turno, con degradación elegante según lo que traiga.
function serviceLabel(appt: Appointment): string {
  return (
    appt.serviceType?.[0]?.coding?.[0]?.display ??
    appt.serviceType?.[0]?.text ??
    appt.description ??
    appt.appointmentType?.coding?.[0]?.display ??
    appt.appointmentType?.text ??
    'Turno'
  );
}

function AppointmentCard({ appt }: { appt: Appointment }): JSX.Element {
  return (
    <Card withBorder radius="md" p="md">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <div>
          <Text fw={600}>{serviceLabel(appt)}</Text>
          <Text size="sm" c="dimmed">
            {appt.start ? formatDateTime(appt.start) : 'Fecha a confirmar'}
          </Text>
        </div>
        {statusBadge(appt.status)}
      </Group>
    </Card>
  );
}

export function MyAppointments({ patient }: { patient: Patient }): JSX.Element {
  const medplum = useMedplum();
  const [appointments, setAppointments] = useState<Appointment[]>();

  useEffect(() => {
    medplum
      .searchResources('Appointment', `patient=${getReferenceString(patient)}&_sort=-date&_count=100`)
      .then(setAppointments)
      .catch(showErrorNotification);
  }, [medplum, patient]);

  if (appointments === undefined) {
    return <Text c="dimmed">Cargando tus turnos…</Text>;
  }

  if (appointments.length === 0) {
    return (
      <Group gap="xs" c="dimmed">
        <IconCalendarEvent size={18} />
        <Text>Todavía no tenés turnos agendados.</Text>
      </Group>
    );
  }

  const now = Date.now();
  const isUpcoming = (a: Appointment): boolean =>
    !!a.start && new Date(a.start).getTime() >= now && a.status !== 'cancelled' && a.status !== 'noshow';
  const upcoming = appointments
    .filter(isUpcoming)
    .sort((a, b) => ((a.start ?? '') < (b.start ?? '') ? -1 : 1));
  const past = appointments.filter((a) => !isUpcoming(a));

  return (
    <Stack gap="lg">
      {upcoming.length > 0 && (
        <Stack gap="xs">
          <Text fw={600} size="sm" c="dimmed" tt="uppercase">
            Próximos
          </Text>
          {upcoming.map((a) => (
            <AppointmentCard key={a.id} appt={a} />
          ))}
        </Stack>
      )}
      {past.length > 0 && (
        <Stack gap="xs">
          <Text fw={600} size="sm" c="dimmed" tt="uppercase">
            Anteriores
          </Text>
          {past.map((a) => (
            <AppointmentCard key={a.id} appt={a} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
