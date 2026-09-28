import { BASELINE_QUESTIONNAIRE_URL, perfilDesdeRespuesta } from '@epa/careplan-menopausia';
import { createReference } from '@medplum/core';
import type { Patient, QuestionnaireResponse, QuestionnaireResponseItem } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useCallback, useEffect, useState } from 'react';
import { usePaciente } from '../PlanBienestarContext';

/** Lo que la paciente eligió: por `linkId`, los códigos marcados. */
export type SeleccionBaseline = Record<string, string[]>;

export interface Baseline {
  cargando: boolean;
  /** Ya completó el cuestionario alguna vez. */
  respondido: boolean;
  /** La última respuesta, si hay. */
  respuesta?: QuestionnaireResponse;
  /** Lo que respondió, listo para precargar el formulario. */
  seleccion: SeleccionBaseline;
  /** Cuántas señales produce su respuesta. 0 = el plan no se puede personalizar. */
  senales: number;
  guardar: (seleccion: SeleccionBaseline) => Promise<QuestionnaireResponse>;
  error?: string;
}

export interface UseBaselineOptions {
  patient?: Patient;
}

const SYSTEM_BASELINE = 'https://epa-bienestar.ar/fhir/CodeSystem/pb100d-baseline';

/** Reconstruye la selección a partir de una respuesta guardada. */
function seleccionDeRespuesta(respuesta: QuestionnaireResponse | undefined): SeleccionBaseline {
  const seleccion: SeleccionBaseline = {};
  const recorrer = (items: QuestionnaireResponseItem[] | undefined): void => {
    for (const item of items ?? []) {
      const codigos = (item.answer ?? [])
        .map((a) => a.valueCoding?.code)
        .filter((c): c is string => Boolean(c));
      if (item.linkId && codigos.length > 0) {
        seleccion[item.linkId] = codigos;
      }
      recorrer(item.item);
    }
  };
  recorrer(respuesta?.item);
  return seleccion;
}

function respuestaDesdeSeleccion(seleccion: SeleccionBaseline, paciente: Patient | undefined): QuestionnaireResponse {
  return {
    resourceType: 'QuestionnaireResponse',
    status: 'completed',
    questionnaire: BASELINE_QUESTIONNAIRE_URL,
    authored: new Date().toISOString(),
    subject: paciente ? createReference(paciente) : undefined,
    source: paciente ? createReference(paciente) : undefined,
    item: Object.entries(seleccion)
      .filter(([, codigos]) => codigos.length > 0)
      .map(([linkId, codigos]) => ({
        linkId,
        answer: codigos.map((code) => ({ valueCoding: { system: SYSTEM_BASELINE, code } })),
      })),
  };
}

/**
 * El cuestionario inicial de la paciente: leerlo, y volver a guardarlo.
 *
 * Guardar crea una **respuesta nueva** en vez de pisar la anterior. Las
 * respuestas viejas son historia clínica: si la paciente dice en marzo que tiene
 * náuseas y en junio que ya no, las dos cosas fueron ciertas y el equipo puede
 * querer ver el cambio. El generador siempre toma la última.
 */
export function useBaseline(options: UseBaselineOptions = {}): Baseline {
  const medplum = useMedplum();
  const paciente = usePaciente(options.patient);
  const [respuesta, setRespuesta] = useState<QuestionnaireResponse | undefined>(undefined);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const pacienteRef = paciente ? `Patient/${paciente.id}` : undefined;

  useEffect(() => {
    let cancelado = false;
    if (!pacienteRef) {
      setCargando(false);
      return undefined;
    }
    setCargando(true);
    medplum
      .searchResources('QuestionnaireResponse', {
        subject: pacienteRef,
        questionnaire: BASELINE_QUESTIONNAIRE_URL,
        _sort: '-_lastUpdated',
        _count: '1',
      })
      .then((encontradas) => {
        if (!cancelado) {
          setRespuesta(encontradas[0]);
          setError(undefined);
        }
      })
      .catch(() => {
        if (!cancelado) {
          setError('No pudimos cargar tus respuestas. Podés completarlo igual.');
        }
      })
      .finally(() => {
        if (!cancelado) {
          setCargando(false);
        }
      });
    return () => {
      cancelado = true;
    };
  }, [medplum, pacienteRef]);

  const guardar = useCallback(
    async (seleccion: SeleccionBaseline): Promise<QuestionnaireResponse> => {
      const guardada = await medplum.createResource<QuestionnaireResponse>(
        respuestaDesdeSeleccion(seleccion, paciente),
      );
      setRespuesta(guardada);
      return guardada;
    },
    [medplum, paciente],
  );

  return {
    cargando,
    respondido: respuesta !== undefined,
    respuesta,
    seleccion: seleccionDeRespuesta(respuesta),
    senales: perfilDesdeRespuesta(respuesta).senales?.length ?? 0,
    guardar,
    error,
  };
}
