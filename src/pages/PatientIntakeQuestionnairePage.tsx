// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { createReference } from '@medplum/core';
import type { Patient, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { Document, QuestionnaireForm, useMedplum } from '@medplum/react';
import { IconCircleCheck } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { showErrorNotification } from '../utils/notifications';
import { fixQuestionnaireResponseTimes } from '../utils/questionnaire';
import { INTAKE_QUESTIONNAIRE_URL, intakeQuestionnaire } from './intake.questionnaire';

export function PatientIntakeQuestionnairePage(): JSX.Element {
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  const [isSubmitted, setIsSubmitted] = useState(false);
  // Fuente de verdad: el Questionnaire del server (compartido con la app clínica).
  // Si no está cargado o no hay acceso, se usa la definición local como fallback.
  const [questionnaire, setQuestionnaire] = useState<Questionnaire>(intakeQuestionnaire);

  useEffect(() => {
    medplum
      .searchOne('Questionnaire', { url: INTAKE_QUESTIONNAIRE_URL })
      .then((q) => {
        if (q) {
          setQuestionnaire(q);
        }
      })
      .catch(() => {
        /* sin acceso o no cargado: se mantiene el fallback local */
      });
  }, [medplum]);

  async function handleQuestionnaireSubmit(formData: QuestionnaireResponse): Promise<void> {
    try {
      await medplum.createResource<QuestionnaireResponse>({
        ...formData,
        item: fixQuestionnaireResponseTimes(formData.item),
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
          <ThemeIcon size={56} radius="xl" variant="light">
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
        <QuestionnaireForm questionnaire={questionnaire} onSubmit={handleQuestionnaireSubmit} />
      )}
    </Document>
  );
}
