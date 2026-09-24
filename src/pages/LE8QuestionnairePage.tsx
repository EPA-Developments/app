// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Página del portal del paciente: renderiza uno de los cuestionarios de Life's
// Essential 8 (por slug) y, al enviarlo, crea un QuestionnaireResponse a nombre del
// propio paciente logueado. El dashboard lo interpreta automáticamente: el portal solo
// muestra el formulario y guarda la respuesta; no toca el Questionnaire ni el dashboard.
import { Button, Group, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { createReference } from '@medplum/core';
import type { Patient, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { Document, QuestionnaireForm, useMedplum } from '@medplum/react';
import { IconArrowRight, IconCircleCheck } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Loading } from '../components/Loading';
import { showErrorNotification } from '../utils/notifications';
import { fixQuestionnaireResponseTimes, relaxRequiredBooleans } from '../utils/questionnaire';
import { LE8_QUESTIONNAIRES, le8QuestionnaireBySlug } from '../le8';
import { le8QuestionnaireDef } from '../le8.questionnaires';

export function LE8QuestionnairePage(): JSX.Element {
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  const navigate = useNavigate();
  const { slug } = useParams();
  const meta = slug ? le8QuestionnaireBySlug(slug) : undefined;
  // "Mi salud cardiovascular": los 4 cuestionarios LE8 se recorren en orden.
  const indice = LE8_QUESTIONNAIRES.findIndex((q) => q.slug === meta?.slug);
  const siguiente = indice >= 0 ? LE8_QUESTIONNAIRES[indice + 1] : undefined;
  const pasoTexto = `Mi salud cardiovascular · ${indice + 1} de ${LE8_QUESTIONNAIRES.length}`;

  // undefined = cargando, null = no encontrado en el server.
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>();
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    if (!meta) {
      return;
    }
    // Al cambiar de cuestionario (slug) reseteamos el estado: sin esto, la
    // pantalla de "¡Gracias!" del anterior queda pegada y no deja cargar otro.
    setIsSubmitted(false);
    setQuestionnaire(undefined);
    // La fuente de verdad es el Questionnaire del server (mismo url canónico); si no está
    // cargado o da 403, usamos la definición local (`le8.questionnaires.ts`) como fallback
    // para que el paciente pueda completarlo igual. La respuesta referencia el url canónico,
    // así que el dashboard la interpreta lo mismo.
    const local = le8QuestionnaireDef(meta.slug);
    medplum
      .searchOne('Questionnaire', { url: meta.url })
      .then((q) => setQuestionnaire(q ? relaxRequiredBooleans(q) : (local ?? null)))
      .catch((err) => {
        console.warn('Cuestionario LE8 desde el server no disponible; usando definición local.', err);
        setQuestionnaire(local ?? null);
      });
  }, [medplum, meta?.url]);

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
          Todavía no está disponible el cuestionario “{meta.label}”. Escribile a tu equipo por Mensajes.
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
            {siguiente ? '¡Gracias por completar tu cuestionario!' : '¡Completaste Mi salud cardiovascular!'}
          </Title>
          <Text c="dimmed" ta="center" maw={460}>
            Tus respuestas quedaron registradas. Tu equipo las usa para tu evaluación cardiovascular (Life's
            Essential 8).
          </Text>
          <Group justify="center">
            {siguiente ? (
              <Button
                radius="xl"
                rightSection={<IconArrowRight size={16} />}
                onClick={() => navigate(`/health-record/cuestionarios/${siguiente.slug}`)?.catch(console.error)}
              >
                Siguiente: {siguiente.label}
              </Button>
            ) : (
              <Button
                radius="xl"
                rightSection={<IconArrowRight size={16} />}
                onClick={() => navigate('/care-plan/plan-100-dias')?.catch(console.error)}
              >
                Ver mi Plan Bienestar
              </Button>
            )}
            <Button variant="light" radius="xl" onClick={() => setIsSubmitted(false)}>
              Responder de nuevo
            </Button>
          </Group>
        </Stack>
      ) : (
        <>
          <Text size="sm" fw={600} c="dimmed" tt="uppercase" mb={4}>
            {pasoTexto}
          </Text>
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
