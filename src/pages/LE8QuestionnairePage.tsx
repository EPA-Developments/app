// SPDX-FileCopyrightText: Copyright BioWellness
// SPDX-License-Identifier: Apache-2.0
//
// Página del portal del paciente: renderiza uno de los cuestionarios de Life's
// Essential 8 (por slug) y, al enviarlo, crea un QuestionnaireResponse a nombre del
// propio paciente logueado. El dashboard lo interpreta automáticamente: el portal solo
// muestra el formulario y guarda la respuesta; no toca el Questionnaire ni el dashboard.
import { Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { createReference } from '@medplum/core';
import type { Patient, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { Document, QuestionnaireForm, useMedplum } from '@medplum/react';
import { IconCircleCheck } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useParams } from 'react-router';
import { Loading } from '../components/Loading';
import { showErrorNotification } from '../utils/notifications';
import { fixQuestionnaireResponseTimes } from '../utils/questionnaire';
import { le8QuestionnaireBySlug } from '../le8';

export function LE8QuestionnairePage(): JSX.Element {
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  const { slug } = useParams();
  const meta = slug ? le8QuestionnaireBySlug(slug) : undefined;

  // undefined = cargando, null = no encontrado en el server.
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>();
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    if (!meta) {
      return;
    }
    setQuestionnaire(undefined);
    medplum
      .searchOne('Questionnaire', { url: meta.url })
      .then((q) => setQuestionnaire(q ?? null))
      .catch((err) => {
        setQuestionnaire(null);
        showErrorNotification(err);
      });
  }, [medplum, meta]);

  if (!meta) {
    return (
      <Document width={800}>
        <Text c="dimmed">Cuestionario desconocido.</Text>
      </Document>
    );
  }

  if (questionnaire === undefined) {
    return <Loading />;
  }

  if (questionnaire === null) {
    return (
      <Document width={800}>
        <Text c="dimmed">
          Todavía no está disponible el cuestionario “{meta.label}”. Pedile al equipo de BioWellness que lo cargue.
        </Text>
      </Document>
    );
  }

  async function handleSubmit(formData: QuestionnaireResponse): Promise<void> {
    try {
      await medplum.createResource<QuestionnaireResponse>({
        ...formData,
        item: fixQuestionnaireResponseTimes(formData.item),
        status: 'completed',
        questionnaire: meta!.url,
        subject: createReference(patient),
        source: createReference(patient),
        authored: new Date().toISOString(),
      });
      notifications.show({
        color: 'green',
        title: '¡Gracias!',
        message: 'Tus respuestas se guardaron correctamente.',
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
            Tus respuestas quedaron registradas. El equipo de BioWellness las usa para tu evaluación cardiovascular
            (Life's Essential 8).
          </Text>
        </Stack>
      ) : (
        <>
          <Title order={2} mb="md">
            {questionnaire.title ?? meta.label}
          </Title>
          {meta.description && (
            <Text c="dimmed" mb="lg">
              {meta.description}
            </Text>
          )}
          <QuestionnaireForm questionnaire={questionnaire} onSubmit={handleSubmit} />
        </>
      )}
    </Document>
  );
}
