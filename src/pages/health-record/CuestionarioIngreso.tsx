// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Cuestionario de ingreso (Salud → primera opción del menú, /health-record/ingreso).
// - Sin completar: el formulario.
// - Completado: cuándo lo respondió, "Ver mis respuestas" y "Actualizar mis respuestas"
//   (el formulario precargado con la última respuesta; actualizar crea una respuesta
//   nueva y la anterior queda en el historial).
// El Questionnaire sale del server (compartido con la app clínica) y, si no está, de la
// definición local, y se adapta al paciente (`ingresoParaPaciente`: sin preguntas
// retiradas y sin la de embarazo para hombres). El contacto de emergencia no va acá: se
// carga en Mi perfil (si falta, se sugiere). Cada respuesta es un QuestionnaireResponse.
// Con INGRESO_SALUD_MUJER prendida (hoy apagada, hasta la firma médica), después de guardar
// la respuesta se registra la etapa de la menopausia declarada (`registrarEtapaDelIngreso`).
import { Alert, Anchor, Button, Group, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { createReference, formatDateTime } from '@medplum/core';
import type { Patient, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { Document, QuestionnaireForm, useMedplum } from '@medplum/react';
import { IconArrowRight, IconCircleCheck } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { Link } from 'react-router';
import { tieneContactoEmergencia } from '../../fhir/demografia';
import { buscarUltimoIngreso, ingresoParaPaciente } from '../../fhir/ingreso';
import { registrarEtapaDelIngreso } from '../../fhir/ingresoCondiciones';
import { showErrorNotification } from '../../utils/notifications';
import { fixQuestionnaireResponseTimes } from '../../utils/questionnaire';
import { INGRESO_SALUD_MUJER, INTAKE_QUESTIONNAIRE_URL, intakeQuestionnaire } from '../intake.questionnaire';

const RUTA_RESPUESTAS = '/health-record/questionnaire-responses';
const RUTA_MI_SALUD_CV = '/health-record/cuestionarios';
const RUTA_MI_PERFIL = '/account/profile';

/** Respuesta previa como punto de partida del formulario (sin id ni fechas). */
function comoBorrador(r: QuestionnaireResponse): QuestionnaireResponse {
  return { resourceType: 'QuestionnaireResponse', status: 'in-progress', questionnaire: r.questionnaire, item: r.item };
}

type Estado = { tipo: 'cargando' } | { tipo: 'formulario'; previa?: QuestionnaireResponse } | { tipo: 'completo'; respuesta: QuestionnaireResponse; recienEnviado: boolean };

export function CuestionarioIngreso(): JSX.Element {
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  const [questionnaire, setQuestionnaire] = useState<Questionnaire>(intakeQuestionnaire);
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const preguntas = useMemo(() => ingresoParaPaciente(questionnaire, patient), [questionnaire, patient]);

  useEffect(() => {
    // Fuente de verdad: el Questionnaire del server; si no está o no hay acceso, el local.
    medplum
      .searchOne('Questionnaire', { url: INTAKE_QUESTIONNAIRE_URL })
      .then((q) => q && setQuestionnaire(q))
      .catch(() => undefined);
    buscarUltimoIngreso(medplum, patient)
      .then((r) => setEstado(r ? { tipo: 'completo', respuesta: r, recienEnviado: false } : { tipo: 'formulario' }))
      .catch(() => setEstado({ tipo: 'formulario' }));
  }, [medplum, patient]);

  async function enviar(formData: QuestionnaireResponse): Promise<void> {
    try {
      const respuesta = await medplum.createResource<QuestionnaireResponse>({
        ...formData,
        id: undefined,
        item: fixQuestionnaireResponseTimes(formData.item),
        status: 'completed',
        subject: createReference(patient),
        source: createReference(patient),
        authored: new Date().toISOString(),
      });
      if (INGRESO_SALUD_MUJER) {
        // La respuesta ya quedó guardada (es lo que revisa el equipo): si la Condition de la
        // etapa no se puede escribir, no se le muestra un error a la persona.
        await registrarEtapaDelIngreso(medplum, patient, respuesta).catch((err: unknown) =>
          console.warn('No se pudo registrar la etapa declarada en el ingreso', err)
        );
      }
      notifications.show({ color: 'green', title: '¡Gracias!', message: 'Tu cuestionario de ingreso se guardó correctamente.' });
      setEstado({ tipo: 'completo', respuesta, recienEnviado: true });
      window.scrollTo(0, 0);
    } catch (err) {
      showErrorNotification(err);
    }
  }

  return (
    <Document width={800}>
      {estado.tipo === 'cargando' && <Text c="dimmed">Cargando tu cuestionario…</Text>}

      {estado.tipo === 'formulario' && (
        <Stack gap="md">
          {estado.previa && (
            <Alert variant="light" color="segundaOpinion">
              Cargamos tus respuestas anteriores: cambiá lo que sea distinto y guardalo.
            </Alert>
          )}
          {!tieneContactoEmergencia(patient) && (
            <Alert variant="light" color="gray">
              Tu contacto de emergencia lo cargás en{' '}
              <Anchor component={Link} to={RUTA_MI_PERFIL}>
                Mi perfil
              </Anchor>
              : lo ve tu equipo de salud en caso de necesitarlo.
            </Alert>
          )}
          <QuestionnaireForm
            // Se rearma si llega la copia del server (el formulario toma el cuestionario una sola vez).
            key={`${estado.previa?.id ?? 'nuevo'}|${preguntas.id ?? 'local'}|${preguntas.version ?? ''}`}
            questionnaire={preguntas}
            questionnaireResponse={estado.previa ? comoBorrador(estado.previa) : undefined}
            submitButtonText="Guardar"
            onSubmit={enviar}
          />
        </Stack>
      )}

      {estado.tipo === 'completo' && (
        <Stack gap="md">
          <Group gap="sm" wrap="nowrap" align="flex-start">
            <ThemeIcon size={44} radius="xl" variant="light">
              <IconCircleCheck size={26} stroke={1.5} />
            </ThemeIcon>
            <div>
              <Title order={2}>{estado.recienEnviado ? '¡Gracias por completar tu cuestionario!' : 'Cuestionario de ingreso'}</Title>
              <Text c="dimmed">
                {estado.recienEnviado
                  ? 'Tu información quedó registrada en tu historia clínica. Tu equipo la va a revisar antes de tu consulta.'
                  : `Lo completaste el ${formatDateTime(estado.respuesta.authored)}. Si algo cambió (un diagnóstico, una medicación, una cirugía), actualizalo.`}
              </Text>
            </div>
          </Group>
          <Group gap="sm">
            {estado.recienEnviado ? (
              <Button component={Link} to={RUTA_MI_SALUD_CV} rightSection={<IconArrowRight size={16} />}>
                Seguí con Mi salud cardiovascular
              </Button>
            ) : (
              <Button onClick={() => setEstado({ tipo: 'formulario', previa: estado.respuesta })}>Actualizar mis respuestas</Button>
            )}
            <Button component={Link} to={`${RUTA_RESPUESTAS}/${estado.respuesta.id}`} variant="default">
              Ver mis respuestas
            </Button>
          </Group>
          <Anchor component={Link} to={RUTA_RESPUESTAS} size="sm">
            Historial de cuestionarios
          </Anchor>
        </Stack>
      )}
    </Document>
  );
}
