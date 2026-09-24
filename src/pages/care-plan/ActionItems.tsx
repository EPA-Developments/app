// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { esCarePlanDelPlan } from '@epa/plan-bienestar-react';
import { Box, Stack, Text, Title, useMantineTheme } from '@mantine/core';
import { formatDate, getReferenceString } from '@medplum/core';
import type { CarePlan, Patient } from '@medplum/fhirtypes';
import { StatusBadge, useMedplum } from '@medplum/react';
import { IconCalendar } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { InfoButton } from '../../components/InfoButton';
import { InfoSection } from '../../components/InfoSection';
import { PlanBienestar100 } from '../../components/PlanBienestar100';
import { RUTA_SEGUIMIENTO_GLP1, esCarePlanGlp1 } from '../../fhir/glp1';

function rutaDelPlan(carePlan: CarePlan): string {
  if (esCarePlanDelPlan(carePlan)) {
    return '/care-plan/plan-100-dias';
  }
  return esCarePlanGlp1(carePlan) ? RUTA_SEGUIMIENTO_GLP1 : `./${carePlan.id}`;
}

export function ActionItems(): JSX.Element {
  const theme = useMantineTheme();
  const navigate = useNavigate();
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  const carePlans = medplum.searchResources('CarePlan', 'subject=' + getReferenceString(patient)).read();

  return (
    <Box p="xl">
      <Title mb="lg">Pasos del plan</Title>
      {/* Plan Bienestar · 100 días: progreso si está inscripto, invitación si no. */}
      <Box mb="lg">
        <PlanBienestar100 invitar />
      </Box>
      <InfoSection title="Pasos del plan">
        <Stack gap={0}>
          {carePlans.map((resource) => (
            <InfoButton
              key={resource.id}
              // El Plan Bienestar y el seguimiento GLP-1 tienen sus propias pantallas amigables;
              // el resto va al detalle genérico.
              onClick={() => navigate(rutaDelPlan(resource))?.catch(console.error)}
            >
              <div>
                <Text c={theme.primaryColor} fw={500}>
                  {resource.title}
                </Text>
                <Text mt="sm" c="gray.5" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <IconCalendar size={16} />
                  <time>{formatDate(resource.period?.start)} </time>
                  {resource.period?.end && <time>&nbsp;-&nbsp;{formatDate(resource.period.end)}</time>}
                </Text>
              </div>
              <StatusBadge status={resource.status as string} />
            </InfoButton>
          ))}
        </Stack>
      </InfoSection>
    </Box>
  );
}
