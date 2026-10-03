import type { Condition, Observation, Patient, QuestionnaireResponse } from '@medplum/fhirtypes';
import { perfilDesdeRespuesta } from '../baseline/perfil.js';
import { BASELINE_QUESTIONNAIRE_URL } from '../baseline/preguntas.js';
import { condicionesDesdeCkm, estadioCatalogo, type PerfilCatalogo } from '../catalogo/seleccion.js';
import { extractCkmInput } from '../ckm/fromFhir.js';
import { evaluateCkmStage } from '../ckm/staging.js';
import type { CkmInput, CkmResult } from '../ckm/types.js';
import { ultimaRespuesta } from '../le8/desdeFhir.js';
import type { Condicion, EstadioCkm } from '../model/catalogo.js';
import { LIFE_STAGES } from '../model/lifeStage.js';
import { SNOMED } from '../terminology/snomed.js';
import { SYSTEM } from '../terminology/systems.js';
import { condicionesRegistradasDesdeFhir, type CondicionRegistrada } from './condiciones.js';
import { condicionesDesdeInstrumentos } from './instrumentos.js';
import { estadioValidado, type EstadioRegistrado } from './validacion.js';

/**
 * El perfil de la persona para el catálogo, armado desde su historia FHIR. Es la única
 * fuente para el día 0, el recálculo del plan y el portal al empezar el plan: todos
 * ven el mismo estadío y las mismas condiciones.
 *
 * Estadío: el validado por el equipo; si no hay, el estimado; si tampoco, ninguno.
 * Condiciones: las derivadas de los datos (`condicionesDesdeCkm`) más las registradas
 * por el equipo (`Condition` del catálogo, eventos vigentes), las derivadas de los
 * instrumentos cargados y las que el portal ya reconocía (menopausia por SNOMED,
 * GLP-1 del cuestionario inicial).
 */
export interface ContextoPerfil {
  patient?: Patient;
  observations?: Observation[];
  conditions?: Condition[];
  questionnaireResponses?: QuestionnaireResponse[];
  /** ISO date (`YYYY-MM-DD`) de "hoy": edad, vigencia de los eventos. Default: la fecha actual. */
  hoy?: string;
}

export interface PerfilPersona {
  input: CkmInput;
  estimado: CkmResult;
  validado?: EstadioRegistrado;
  estadio?: EstadioCkm;
  origenEstadio: 'validado' | 'estimado' | 'ninguno';
  /** Lo que registró el equipo (con la vigencia de los eventos). */
  registradas: CondicionRegistrada[];
  /** Lo que derivan los instrumentos cargados. */
  deInstrumentos: Condicion[];
  /** Lo que el portal ya reconocía: menopausia (SNOMED) y GLP-1 (cuestionario inicial). */
  delPortal: Condicion[];
  /** Todas las condiciones del perfil, sin duplicados, en el orden del catálogo. */
  condiciones: Condicion[];
  /** El perfil listo para el catálogo, o undefined sin estadío. */
  perfil?: PerfilCatalogo;
  /** Qué falta para tener estadío, si no hay. */
  faltantes: string[];
  hoy: string;
}

const BASELINE_SUFIJO = BASELINE_QUESTIONNAIRE_URL.replace(/^.*\/fhir\//, '');

const CODIGOS_MENOPAUSIA = new Set<string | undefined>([
  SNOMED.menopausePresent.code,
  ...Object.values(LIFE_STAGES).map((etapa) => etapa.coding.code),
]);

function condicionActiva(condition: Condition): boolean {
  const estado = condition.clinicalStatus?.coding?.[0]?.code;
  return estado === undefined || estado === 'active' || estado === 'recurrence' || estado === 'relapse';
}

/** Lo que el portal reconocía antes del menú del equipo: menopausia por SNOMED y GLP-1 del cuestionario inicial. */
export function condicionesDelPortal(conditions: Condition[], respuestas: QuestionnaireResponse[]): Condicion[] {
  const out: Condicion[] = [];
  if (
    conditions.some(
      (c) => condicionActiva(c) && (c.code?.coding ?? []).some((k) => k.system === SYSTEM.snomed && CODIGOS_MENOPAUSIA.has(k.code)),
    )
  ) {
    out.push('menopausia');
  }
  if (perfilDesdeRespuesta(ultimaRespuesta(respuestas, BASELINE_SUFIJO)).conGlp1) out.push('toma-glp1');
  return out;
}

export function perfilDeLaPersona(ctx: ContextoPerfil): PerfilPersona {
  const hoy = ctx.hoy ?? new Date().toISOString().slice(0, 10);
  const observations = ctx.observations ?? [];
  const conditions = ctx.conditions ?? [];
  const respuestas = ctx.questionnaireResponses ?? [];

  const input = extractCkmInput({ patient: ctx.patient, observations, conditions, on: hoy });
  const estimado = evaluateCkmStage(input);
  const validado = estadioValidado(observations);
  const estadio: EstadioCkm | undefined = validado
    ? estadioCatalogo(validado.stage)
    : estimado.stage !== undefined
      ? estadioCatalogo(estimado.stage)
      : undefined;

  const registradas = condicionesRegistradasDesdeFhir(conditions, hoy);
  const deInstrumentos = condicionesDesdeInstrumentos(respuestas);
  const delPortal = condicionesDelPortal(conditions, respuestas);
  const condiciones = condicionesDesdeCkm(estimado, input, [
    ...registradas.filter((r) => r.vigente).map((r) => r.codigo),
    ...deInstrumentos,
    ...delPortal,
  ]);

  return {
    input,
    estimado,
    ...(validado ? { validado } : {}),
    ...(estadio ? { estadio } : {}),
    origenEstadio: validado ? 'validado' : estimado.stage !== undefined ? 'estimado' : 'ninguno',
    registradas,
    deInstrumentos,
    delPortal,
    condiciones,
    ...(estadio ? { perfil: { estadio, condiciones } } : {}),
    faltantes: estadio ? [] : estimado.faltantes.length ? estimado.faltantes : ['datos básicos (peso, presión, glucemia, lípidos)'],
    hoy,
  };
}
