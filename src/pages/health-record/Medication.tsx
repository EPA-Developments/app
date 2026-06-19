// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Box, Button, Modal, Stack, Text, Title } from '@mantine/core';
import { formatDateTime, formatHumanName, formatTiming } from '@medplum/core';
import type { MedicationRequest } from '@medplum/fhirtypes';
import { ResourceTable, useMedplum } from '@medplum/react';
import { useState } from 'react';
import type { JSX } from 'react';
import { useParams } from 'react-router';
import { InfoSection } from '../../components/InfoSection';

export function Medication(): JSX.Element {
  const medplum = useMedplum();
  const [modalOpen, setModalOpen] = useState(false);
  const { medicationId = '' } = useParams();
  const med: MedicationRequest = medplum.readResource('MedicationRequest', medicationId).read();

  return (
    <Box p="xl">
      <Title order={2}>{med.medicationCodeableConcept?.text}</Title>
      <p className="mb-6 text-lg text-gray-600">Para reponer esta medicación, contactá a tu farmacia.</p>
      <p className="mb-6 text-lg text-gray-600">
        ¿No te quedan reposiciones en tu farmacia?{' '}
        <Anchor onClick={() => setModalOpen(true)}>Renová tu receta</Anchor>
      </p>
      <InfoSection title="Medicación">
        <ResourceTable value={med} ignoreMissingValues />
      </InfoSection>
      <RenewalModal prev={med} opened={modalOpen} setOpened={setModalOpen} />
    </Box>
  );
}

function RenewalModal({
  prev,
  opened,
  setOpened,
}: {
  readonly prev: MedicationRequest;
  readonly opened: boolean;
  readonly setOpened: (o: boolean) => void;
}): JSX.Element {
  const medplum = useMedplum();
  const patient = medplum.getProfile();
  return (
    <Modal
      size="lg"
      opened={opened}
      onClose={() => setOpened(false)}
      title={<Title order={3}>Solicitar renovación</Title>}
    >
      <Stack gap="md">
        <KeyValue name="Paciente" value={formatHumanName(patient?.name?.[0])} />
        <KeyValue name="Última prescripción" value={formatDateTime(prev.authoredOn)} />
        <KeyValue name="Estado" value={prev.status} />
        <KeyValue name="Medicación" value={prev.medicationCodeableConcept?.text} />
        <KeyValue
          name="Indicaciones de dosis"
          value={prev.dosageInstruction?.[0]?.timing && formatTiming(prev.dosageInstruction[0].timing)}
        />
        <Button onClick={() => setOpened(false)}>Enviar solicitud de renovación</Button>
      </Stack>
    </Modal>
  );
}

function KeyValue({ name, value }: { name: string; value: string | undefined }): JSX.Element {
  return (
    <div>
      <Text size="xs" color="gray" tt="uppercase">
        {name}
      </Text>
      <Text size="lg" fw={500}>
        {value}
      </Text>
    </div>
  );
}
