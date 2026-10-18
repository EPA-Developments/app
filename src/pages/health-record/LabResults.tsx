// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Stack, Text, Title, useMantineTheme } from '@mantine/core';
import { formatDate, getReferenceString } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconChevronRight } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { InfoButton } from '../../components/InfoButton';
import { InfoSection } from '../../components/InfoSection';
import { ESTADOS_INFORME_EMITIDO } from '../../fhir/som';

export function LabResults(): JSX.Element {
  const theme = useMantineTheme();
  const navigate = useNavigate();
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  // Sólo los emitidos, como la policy: un borrador (el de la Segunda Opinión, que espera la firma
  // del cardiólogo) no se lista aunque la policy vieja siga puesta.
  const reports = medplum
    .searchResources('DiagnosticReport', `subject=${getReferenceString(patient)}&status=${ESTADOS_INFORME_EMITIDO}`)
    .read();

  return (
    <Box p="xl">
      <Title mb="lg">Resultados de Laboratorio</Title>
      <InfoSection title="Resultados de Laboratorio">
        <Stack gap={0}>
          {reports.map((report) => (
            <InfoButton key={report.id} onClick={() => navigate(`./${report.id}`)?.catch(console.error)}>
              <div>
                <Text fw={500} mb={4}>
                  {formatDate(report.meta?.lastUpdated as string)}
                </Text>
                <Text>{report.code?.text}</Text>
              </div>
              <IconChevronRight color={theme.colors.gray[5]} />
            </InfoButton>
          ))}
        </Stack>
      </InfoSection>
    </Box>
  );
}
