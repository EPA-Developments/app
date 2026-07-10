import { createReference } from '@medplum/core';
import type { Patient, Questionnaire, QuestionnaireResponse, Task } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';
import { Card, Stack, Text, Title } from '@mantine/core';
import { useEffect, useState, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useBasePath, usePaciente } from '../PlanBienestarContext';

export interface CuestionarioDelPlanProps {
  patient?: Patient;
  basePath?: string;
}

/**
 * Renders the questionnaire linked from a plan step (Task.focus) and, on
 * submit, stores the QuestionnaireResponse and completes the step.
 */
export function CuestionarioDelPlan(props: CuestionarioDelPlanProps): ReactElement {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const basePath = useBasePath(props.basePath);
  const paciente = usePaciente(props.patient);
  const { taskId } = useParams<{ taskId: string }>();
  const [paso, setPaso] = useState<Task | undefined>(undefined);
  const [cuestionario, setCuestionario] = useState<Questionnaire | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelado = false;
    if (!taskId) {
      setError('Paso no encontrado.');
      return undefined;
    }
    (async () => {
      const tarea = await medplum.readResource('Task', taskId);
      if (cancelado) return;
      setPaso(tarea);
      if (!tarea.focus?.reference?.startsWith('Questionnaire/')) {
        setError('Este paso no tiene un cuestionario asociado.');
        return;
      }
      const cuestionarioLeido = await medplum.readReference(tarea.focus as { reference: string });
      if (cancelado) return;
      setCuestionario(cuestionarioLeido as Questionnaire);
    })().catch(() => {
      if (!cancelado) setError('No se pudo cargar el cuestionario.');
    });
    return () => {
      cancelado = true;
    };
  }, [medplum, taskId]);

  const responder = async (respuesta: QuestionnaireResponse): Promise<void> => {
    const guardada = await medplum.createResource<QuestionnaireResponse>({
      ...respuesta,
      status: 'completed',
      subject: paciente ? createReference(paciente) : respuesta.subject,
    });
    if (paso) {
      await medplum.updateResource<Task>({
        ...paso,
        status: 'completed',
        output: [
          {
            type: { text: 'QuestionnaireResponse' },
            valueReference: createReference(guardada),
          },
        ],
      });
    }
    navigate(basePath);
  };

  if (error) {
    return <Text c="dimmed">{error}</Text>;
  }

  if (!cuestionario) {
    return <Text c="dimmed">Cargando cuestionario…</Text>;
  }

  return (
    <Stack gap="md">
      <div>
        <Title order={2}>{cuestionario.title ?? 'Cuestionario'}</Title>
        <Text c="dimmed">
          Tus respuestas ayudan a tu equipo a personalizar el plan. No hay respuestas correctas ni
          incorrectas, y podés completarlo con tranquilidad.
        </Text>
      </div>
      <Card withBorder radius="lg" p="lg">
        <QuestionnaireForm questionnaire={cuestionario} onSubmit={responder} />
      </Card>
    </Stack>
  );
}
