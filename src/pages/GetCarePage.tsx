// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Loader, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import type { Appointment, Bundle, HealthcareService, Patient, Reference, Slot } from '@medplum/fhirtypes';
import { createReference, getExtensionValue, getReferenceString, isDefined, normalizeErrorString } from '@medplum/core';
import { Document, BaseScheduler, useMedplum } from '@medplum/react';
import type { FetchOptionsFunction } from '@medplum/react';
import { useSearchOne } from '@medplum/react-hooks';
import { IconCalendarEvent, IconInfoCircle } from '@tabler/icons-react';
import { useCallback, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';

const SERVICE_TYPE_REFERENCE_URI = 'https://medplum.com/fhir/service-type-reference';

export function GetCare(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const patient = medplum.getProfile() as Patient;
  const [schedule, loading] = useSearchOne('Schedule');

  const healthcareServiceRef = useMemo(
    () =>
      schedule?.serviceType
        ?.map(
          (concept) =>
            getExtensionValue(concept, SERVICE_TYPE_REFERENCE_URI) as Reference<HealthcareService> | undefined
        )
        .find(isDefined),
    [schedule]
  );

  const fetchAppointments: FetchOptionsFunction<Appointment> = useCallback(
    async (period) => {
      if (!schedule || !healthcareServiceRef?.reference) {
        return [];
      }

      // $find op requires `start` and `end` times are defined
      if (!period.start || !period.end) {
        return [];
      }

      const findUrl = medplum.fhirUrl('Appointment', '$find');
      findUrl.searchParams.append('start', period.start);
      findUrl.searchParams.append('end', period.end);
      findUrl.searchParams.append('service-type-reference', healthcareServiceRef.reference);
      findUrl.searchParams.append('schedule', getReferenceString(schedule));
      const bundle = await medplum.get<Bundle<Appointment>>(findUrl);
      return (bundle.entry ?? [])
        .map((entry) => entry.resource)
        .map((appointment) =>
          appointment?.start ? ([appointment, new Date(appointment.start)] as [Appointment, Date]) : undefined
        )
        .filter(isDefined);
    },
    [medplum, schedule, healthcareServiceRef]
  );

  const [holdSuccess, setHoldSuccess] = useState(false);
  const [holdLoading, setHoldLoading] = useState(false);
  const [holdError, setHoldError] = useState<unknown>();

  const holdAppointment = async (appointment: Appointment): Promise<void> => {
    // Add the viewer to the appointment as a participant
    const booking = {
      ...appointment,
      participant: [
        ...appointment.participant,
        {
          actor: createReference(patient),
          status: 'accepted',
        },
      ],
    };

    setHoldLoading(true);
    await medplum
      .post<Bundle<Appointment | Slot>>(medplum.fhirUrl('Appointment', '$hold'), {
        resourceType: 'Parameters',
        parameter: [{ name: 'appointment', resource: booking }],
      })
      .then(
        () => setHoldSuccess(true),
        (err) => setHoldError(err)
      )
      .finally(() => setHoldLoading(false));
  };

  if (loading) {
    return (
      <Document width={800}>
        <Loader />
      </Document>
    );
  }

  // Todavía no hay agenda configurada en el servidor (sin Schedule o sin servicio
  // asociado). En vez de un error, mostramos un estado amable e invitamos a escribir.
  if (!schedule || !healthcareServiceRef) {
    return (
      <Document width={800}>
        <Stack align="center" gap="md" py="xl">
          <ThemeIcon size={56} radius="xl" variant="light">
            <IconCalendarEvent size={30} stroke={1.5} />
          </ThemeIcon>
          <Title order={3} ta="center">
            Reserva de turnos en preparación
          </Title>
          <Text c="dimmed" ta="center" maw={460}>
            Estamos terminando de configurar la reserva online. Mientras tanto, escribinos y coordinamos tu turno con el
            equipo de BioWellness.
          </Text>
          <Button onClick={() => navigate('/Communication')?.catch(console.error)}>Enviar un mensaje</Button>
        </Stack>
      </Document>
    );
  }

  const actor = schedule.actor.length === 1 ? schedule.actor[0] : undefined;

  return (
    <Document width={800}>
      <BaseScheduler actor={actor} fetchOptions={fetchAppointments} onSelectOption={holdAppointment}>
        {holdLoading && <Loader />}
        {!!holdError && (
          <Alert variant="outline" color="red" title="No se pudo reservar" icon={<IconInfoCircle />}>
            {normalizeErrorString(holdError)}
          </Alert>
        )}
        {holdSuccess && (
          <div>
            <h3>¡Listo!</h3>
            <p>Tu turno fue creado.</p>
          </div>
        )}
      </BaseScheduler>
    </Document>
  );
}
