// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { createReference } from '@medplum/core';
import type { Patient, QuestionnaireResponse } from '@medplum/fhirtypes';
import { Document, QuestionnaireForm, useMedplum } from '@medplum/react';
import { IconCircleCheck } from '@tabler/icons-react';
import { useState } from 'react';
import type { JSX } from 'react';
import { showErrorNotification } from '../utils/notifications';
import { intakeQuestionnaire } from './intake.questionnaire';

export function PatientIntakeQuestionnairePage(): JSX.Element {
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  const [isSubmitted, setIsSubmitted] = useState(false);

  async function handleQuestionnaireSubmit(formData: QuestionnaireResponse): Promise<void> {
    try {
      await medplum.createResource<QuestionnaireResponse>({
        ...formData,
        status: 'completed',
        subject: createReference(patient),
        source: createReference(patient),
        authored: new Date().toISOString(),
      });
      notifications.show({
        color: 'green',
        title: '¡Gracias!',
        message: 'Tu cuestionario de ingreso se guardó correctamente.',
      });
      setIsSubmitted(true);
      window.scrollTo(0, 0);
    } catch (err) {
      showErrorNotification(err);
    }
  }

  return (
    <Document width={800}>
      {isSubmitted ? (
        <Stack align="center" gap="md" py="xl">
          <ThemeIcon size={56} radius="xl" color="teal" variant="light">
            <IconCircleCheck size={30} stroke={1.5} />
          </ThemeIcon>
          <Title order={3} ta="center">
            ¡Gracias por completar tu cuestionario!
          </Title>
          <Text c="dimmed" ta="center" maw={460}>
            Tu información quedó registrada en tu historia clínica. El equipo de BioWellness la revisará antes de tu
            visita.
          </Text>
        </Stack>
      ) : (
        <QuestionnaireForm questionnaire={intakeQuestionnaire} onSubmit={handleQuestionnaireSubmit} />
      )}
    </Document>
  );
}
