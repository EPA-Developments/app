// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Group, Stack, Text, Title, useMantineTheme } from '@mantine/core';
import { formatDateTime, getReferenceString } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { IconChevronRight } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { InfoButton } from '../../components/InfoButton';
import { InfoSection } from '../../components/InfoSection';

export function Responses(): JSX.Element {
  const medplum = useMedplum();
  const theme = useMantineTheme();
  const navigate = useNavigate();
  const profile = useMedplumProfile() as Patient;
  const responses = medplum
    .searchResources('QuestionnaireResponse', `source=${getReferenceString(profile)}&_sort=-authored`)
    .read();

  return (
    <Box p="xl">
      <Group justify="space-between" mb="lg">
        <Title>Cuestionarios</Title>
        <Button onClick={() => navigate('/patient-intake-questionnaire')?.catch(console.error)}>
          Completar cuestionario de ingreso
        </Button>
      </Group>
      <InfoSection title="Cuestionarios">
        <Stack gap={0}>
          {responses.map((resp) => (
            <InfoButton key={resp.id} onClick={() => navigate(`./${resp.id}`)?.catch(console.error)}>
              <div>
                <Text c={theme.primaryColor} fw={500} mb={4}>
                  {formatDateTime(resp.authored)}
                </Text>
              </div>
              <IconChevronRight color={theme.colors.gray[5]} />
            </InfoButton>
          ))}
        </Stack>
      </InfoSection>
    </Box>
  );
}
