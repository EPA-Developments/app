// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { esCarePlanDelPlan } from '@epa/plan-bienestar-react';
import { Box, Title } from '@mantine/core';
import type { CarePlan } from '@medplum/fhirtypes';
import { ResourceTable, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { Navigate, useParams } from 'react-router';
import { InfoSection } from '../../components/InfoSection';

export function ActionItem(): JSX.Element {
  const medplum = useMedplum();
  const { itemId } = useParams();
  const resource: CarePlan = medplum.readResource('CarePlan', itemId as string).read();

  // La paciente nunca ve el recurso FHIR crudo del Plan Bienestar: sus pantallas
  // amigables (pasos, metas, cuestionario) viven en /care-plan/plan-100-dias.
  if (esCarePlanDelPlan(resource)) {
    return <Navigate replace to="/care-plan/plan-100-dias" />;
  }

  return (
    <Box p="xl">
      <Title order={2} mb="md">
        {resource.title}
      </Title>
      <InfoSection title="Paso del plan">
        <ResourceTable value={resource} ignoreMissingValues />
      </InfoSection>
    </Box>
  );
}
