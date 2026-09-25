// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// "Mis turnos" — los turnos del paciente. Búsqueda estándar y acotada al paciente:
// Appointment?patient=<ref>. Se separan próximos y anteriores.
// - Presenciales: SOLO LECTURA. Los crea y gestiona Recepción (app aparte) vía los bots
//   de reserva.
// - Videollamadas: tarjeta del módulo de teleconsulta con Entrar, Pagar, Mover y Cancelar.
//   Esas acciones también pasan por bots del servidor (política de movimientos y
//   reintegro); el portal nunca escribe el turno directo.
import { esTurnoVirtual } from '@epa/teleconsulta-core';
import { TarjetaTurno, useTurnosPaciente } from '@epa/teleconsulta-react';
import { Alert, Badge, Card, Group, Stack, Text } from '@mantine/core';
import { formatDateTime, getReferenceString } from '@medplum/core';
import type { Appointment, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconCalendarEvent, IconCircleCheck } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { ESTADOS_TURNO } from '../fhir/turnos';
import { showErrorNotification } from '../utils/notifications';

function statusBadge(status?: string): JSX.Element {
  const s = status ? ESTADOS_TURNO[status] : undefined;
  return (
    <Badge color={s?.color ?? 'gray'} variant="light">
      {s?.label ?? status ?? '—'}
    </Badge>
  );
}

// Nombre del servicio del turno, con degradación elegante según lo que traiga.
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

interface Item {
  clave: string;
  start?: string;
  tarjeta: JSX.Element;
}

const porInicio = (a: Item, b: Item): number => ((a.start ?? '') < (b.start ?? '') ? -1 : 1);

export function MyAppointments({ patient }: { patient: Patient }): JSX.Element {
  const medplum = useMedplum();
  const [appointments, setAppointments] = useState<Appointment[]>();
  const virtuales = useTurnosPaciente(patient.id);
  const [aviso, setAviso] = useState<string>();

  useEffect(() => {
    medplum
      .searchResources('Appointment', `patient=${getReferenceString(patient)}&_sort=-date&_count=100`)
      .then(setAppointments)
      .catch(showErrorNotification);
  }, [medplum, patient]);

  if (
    appointments === undefined ||
    (virtuales.cargando && virtuales.proximos.length + virtuales.anteriores.length === 0)
  ) {
    return <Text c="dimmed">Cargando tus turnos…</Text>;
  }

  const presenciales = appointments.filter((a) => !esTurnoVirtual(a));

  if (presenciales.length === 0 && virtuales.proximos.length === 0 && virtuales.anteriores.length === 0) {
    return (
      <Group gap="xs" c="dimmed">
        <IconCalendarEvent size={18} />
        <Text>Todavía no tenés turnos agendados.</Text>
      </Group>
    );
  }

  const alCambiar = (mensaje: string): void => {
    setAviso(mensaje);
    virtuales.recargar().catch(showErrorNotification);
  };

  const now = Date.now();
  const isUpcoming = (a: Appointment): boolean =>
    !!a.start && new Date(a.start).getTime() >= now && a.status !== 'cancelled' && a.status !== 'noshow';
  const presencial = (a: Appointment): Item => ({
    clave: a.id ?? '',
    start: a.start,
    tarjeta: <AppointmentCard key={a.id} appt={a} />,
  });
  const virtual = (t: (typeof virtuales.proximos)[number], onCambio?: (m: string) => void): Item => ({
    clave: t.turno.id,
    start: t.turno.start,
    tarjeta: <TarjetaTurno key={t.turno.id} {...t} onCambio={onCambio} />,
  });

  const upcoming = [
    ...presenciales.filter(isUpcoming).map(presencial),
    ...virtuales.proximos.map((t) => virtual(t, alCambiar)),
  ].sort(porInicio);
  const past = [
    ...presenciales.filter((a) => !isUpcoming(a)).map(presencial),
    ...virtuales.anteriores.map((t) => virtual(t)),
  ]
    .sort(porInicio)
    .reverse();

  return (
    <Stack gap="lg">
      {aviso && (
        <Alert
          color="segundaOpinion"
          variant="light"
          icon={<IconCircleCheck />}
          withCloseButton
          onClose={() => setAviso(undefined)}
        >
          {aviso}
        </Alert>
      )}
      {upcoming.length > 0 && (
        <Stack gap="xs">
          <Text fw={600} size="sm" c="dimmed" tt="uppercase">
            Próximos
          </Text>
          {upcoming.map((i) => i.tarjeta)}
        </Stack>
      )}
      {past.length > 0 && (
        <Stack gap="xs">
          <Text fw={600} size="sm" c="dimmed" tt="uppercase">
            Anteriores
          </Text>
          {past.map((i) => i.tarjeta)}
        </Stack>
      )}
    </Stack>
  );
}
