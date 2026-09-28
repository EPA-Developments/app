/**
 * Del cuestionario baseline al perfil que filtra la biblioteca.
 *
 * Dos derivaciones de la misma declaración (`BASELINE_PREGUNTAS`):
 *
 *   `baselineQuestionnaireItems()`  →  el Questionnaire FHIR que ve la paciente
 *   `perfilDesdeRespuesta()`        →  el PerfilBaseline que lee el generador
 *
 * Como salen de la misma fuente, una opción nueva aparece en los dos lados o en
 * ninguno.
 */

import type { Questionnaire, QuestionnaireItem, QuestionnaireResponse, QuestionnaireResponseItem } from '@medplum/fhirtypes';
import type { Flag, PerfilBaseline, Senal } from '../biblioteca/acciones-nivel1.js';
import {
  BASELINE_GRUPOS,
  BASELINE_PREGUNTAS,
  BASELINE_QUESTIONNAIRE_URL,
  GLP1_CODE_SI,
  GLP1_LINK_ID,
} from './preguntas.js';

const SYSTEM_BASELINE = 'https://epa-bienestar.ar/fhir/CodeSystem/pb100d-baseline';

/** Items del Questionnaire, agrupados como se muestran en pantalla. */
export function baselineQuestionnaireItems(): QuestionnaireItem[] {
  return BASELINE_GRUPOS.map((grupo) => ({
    linkId: grupo.linkId,
    text: grupo.text,
    type: 'group' as const,
    item: BASELINE_PREGUNTAS.filter((p) => p.grupo === grupo.linkId).map((pregunta) => ({
      linkId: pregunta.linkId,
      text: pregunta.text,
      type: 'choice' as const,
      repeats: pregunta.multiple ?? false,
      answerOption: pregunta.opciones.map((opcion) => ({
        valueCoding: { system: SYSTEM_BASELINE, code: opcion.code, display: opcion.display },
      })),
    })),
  }));
}

/** Questionnaire completo, listo para subir al servidor. */
export function buildBaselineQuestionnaire(): Questionnaire {
  return {
    resourceType: 'Questionnaire',
    url: BASELINE_QUESTIONNAIRE_URL,
    name: 'PB100DBaseline',
    title: 'Plan Bienestar 100 Días — cuestionario inicial',
    status: 'active',
    subjectType: ['Patient'],
    item: baselineQuestionnaireItems(),
  };
}

/** Índice code → señal, por pregunta. Se arma una vez. */
const SENAL_POR_RESPUESTA = new Map<string, Map<string, Senal>>(
  BASELINE_PREGUNTAS.map((pregunta) => [
    pregunta.linkId,
    new Map(
      pregunta.opciones
        .filter((o): o is typeof o & { senal: Senal } => o.senal !== undefined)
        .map((o) => [o.code, o.senal])
    ),
  ])
);

/** Recorre los items de una QuestionnaireResponse, incluidos los anidados. */
function* recorrer(items: QuestionnaireResponseItem[] | undefined): Generator<QuestionnaireResponseItem> {
  for (const item of items ?? []) {
    yield item;
    yield* recorrer(item.item);
  }
}

export interface PerfilDesdeRespuestaOptions {
  /**
   * Flags clínicos que carga el equipo. No salen del cuestionario: la paciente
   * no se auto-reporta una contraindicación.
   */
  flags?: Flag[];
  /**
   * Pisa lo que la paciente respondió sobre el GLP-1.
   *
   * La fuente de verdad del tratamiento activo es la medicación registrada, no
   * el recuerdo de la paciente: si el dashboard la tiene, gana.
   */
  conGlp1?: boolean;
}

/**
 * Arma el perfil que filtra la biblioteca a partir de lo que respondió la paciente.
 *
 * Ignora en silencio los códigos que no reconoce: una respuesta vieja de una
 * versión anterior del cuestionario no debería impedir generar el plan, sólo
 * aportar menos señales.
 */
export function perfilDesdeRespuesta(
  respuesta: QuestionnaireResponse | undefined,
  options: PerfilDesdeRespuestaOptions = {}
): PerfilBaseline {
  const senales = new Set<Senal>();
  let conGlp1 = false;

  for (const item of recorrer(respuesta?.item)) {
    const porCodigo = SENAL_POR_RESPUESTA.get(item.linkId ?? '');
    for (const answer of item.answer ?? []) {
      const code = answer.valueCoding?.code;
      if (!code) {
        continue;
      }
      if (item.linkId === GLP1_LINK_ID && code === GLP1_CODE_SI) {
        conGlp1 = true;
      }
      const senal = porCodigo?.get(code);
      if (senal) {
        senales.add(senal);
      }
    }
  }

  return {
    senales: [...senales],
    flags: options.flags ?? [],
    conGlp1: options.conGlp1 ?? conGlp1,
  };
}
