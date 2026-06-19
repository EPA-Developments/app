// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Stack, Title } from '@mantine/core';
import type { Patient } from '@medplum/fhirtypes';
import { ResourceAvatar, ResourceName, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { InfoSection } from '../../components/InfoSection';

export function Provider(): JSX.Element {
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;

  if (patient.generalPractitioner && patient.generalPractitioner.length > 0) {
    return (
      <Box p="xl">
        <Title mb="lg">Mi médico de cabecera</Title>
        <InfoSection title="Mi médico de cabecera">
          <Box p="xl">
            <Stack align="center">
              <ResourceAvatar size={200} radius={100} value={patient.generalPractitioner[0]} />
              <Title order={2}>
                <ResourceName value={patient.generalPractitioner[0]} />
              </Title>
              <Button size="lg">Elegir médico de cabecera</Button>
            </Stack>
          </Box>
        </InfoSection>
      </Box>
    );
  }

  return (
    <Box p="xl">
      <Title mb="lg">Elegir médico de cabecera</Title>
      <InfoSection title="Mi médico de cabecera">Próximamente</InfoSection>
    </Box>
  );
}
