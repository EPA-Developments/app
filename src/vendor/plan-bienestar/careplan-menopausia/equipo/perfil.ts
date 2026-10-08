import type {
  Condition,
  Observation,
  Patient,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
} from '@medplum/fhirtypes';
import { perfilDesdeRespuesta } from '../baseline/perfil.js';
import { BASELINE_QUESTIONNAIRE_URL } from '../baseline/preguntas.js';
import { condicionesDesdeCkm, estadioCatalogo, type PerfilCatalogo } from '../catalogo/seleccion.js';
import { extractCkmInput } from '../ckm/fromFhir.js';
import { evaluateCkmStage } from '../ckm/staging.js';
import type { CkmInput, CkmResult } from '../ckm/types.js';
import { INGRESO_ANCESTRIA, INGRESO_LINKIDS } from '../contrato/pb100d.js';
import { ultimaRespuesta } from '../le8/desdeFhir.js';
import type { Condicion, EstadioCkm } from '../model/catalogo.js';
import { LIFE_STAGES, type WomanLifeStage } from '../model/lifeStage.js';
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
 * instrumentos cargados y las que vienen del portal (menopausia por SNOMED, GLP-1 del
 * cuestionario inicial, diabetes gestacional y ancestría asiática del ingreso).
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
  /**
   * Lo que viene del portal: menopausia (SNOMED), GLP-1 (cuestionario inicial) y, del
   * grupo «Salud de la mujer» del ingreso, diabetes gestacional y ancestría asiática.
   */
  delPortal: Condicion[];
  /**
   * Lo que declaró en el grupo «Salud de la mujer» del ingreso, si lo respondió. La
   * preeclampsia y el parto prematuro quedan acá como dato para el equipo: no activan
   * nada (`apo-reciente` necesita la fecha del evento).
   */
  ingreso?: DatosDelIngreso;
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

/**
 * Lo que la persona declaró en el grupo «Salud de la mujer» del cuestionario de ingreso
 * del portal (`INGRESO_LINKIDS`). Cada campo queda sin definir si no lo respondió; en la
 * ancestría, «No sé» también.
 */
export interface DatosDelIngreso {
  /** La respuesta de la que sale. */
  respuesta: QuestionnaireResponse;
  /** El código de la opción elegida en `etapa-menstrual`, tal como lo guardó el portal. */
  etapaMenstrual?: string;
  edadUltimaMenstruacion?: number;
  preeclampsia?: boolean;
  diabetesGestacional?: boolean;
  partoPrematuro?: boolean;
  ancestriaAsiatica?: boolean;
}

function* itemsDe(items: QuestionnaireResponseItem[] | undefined): Generator<QuestionnaireResponseItem> {
  for (const item of items ?? []) {
    yield item;
    yield* itemsDe(item.item);
    for (const respuesta of item.answer ?? []) yield* itemsDe(respuesta.item);
  }
}

/** El item del grupo «Salud de la mujer» de una respuesta, si lo trae (en cualquier nivel). */
function grupoSaludMujer(r: QuestionnaireResponse): QuestionnaireResponseItem | undefined {
  for (const item of itemsDe(r.item)) {
    if (item.linkId === INGRESO_LINKIDS.grupoSaludMujer) return item;
  }
  return undefined;
}

/**
 * La primera respuesta al linkId, buscada sólo dentro del grupo: un ítem con el mismo
 * linkId en otra parte del ingreso no es un dato del grupo.
 */
function primeraRespuesta(grupo: QuestionnaireResponseItem, linkId: string): QuestionnaireResponseItemAnswer | undefined {
  for (const item of itemsDe(grupo.item)) {
    if (item.linkId === linkId) return item.answer?.[0];
  }
  return undefined;
}

const sinTildes = (texto: string): string => texto.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();

/** El código de una respuesta `choice` (`valueCoding.code`, o `valueString` si el portal guardó el texto). */
function codigoDe(a: QuestionnaireResponseItemAnswer | undefined): string | undefined {
  return a?.valueCoding?.code ?? (typeof a?.valueString === 'string' ? a.valueString : undefined);
}

function siNo(a: QuestionnaireResponseItemAnswer | undefined): boolean | undefined {
  if (typeof a?.valueBoolean === 'boolean') return a.valueBoolean;
  const codigo = codigoDe(a);
  if (codigo === undefined) return undefined;
  const normal = sinTildes(codigo);
  if (normal === INGRESO_ANCESTRIA.si) return true;
  if (normal === INGRESO_ANCESTRIA.no) return false;
  return undefined;
}

/**
 * El instante (ms) de la primera de estas fechas FHIR que se pueda leer, o NaN si
 * ninguna. Se comparan instantes y no textos: «2026-10-08T09:00:00-03:00» es posterior
 * a «2026-10-08T11:00:00Z», y una fecha sola vale como el comienzo de ese día en UTC.
 */
function instante(...fechas: (string | undefined)[]): number {
  for (const fecha of fechas) {
    const ms = fecha ? Date.parse(fecha) : Number.NaN;
    if (!Number.isNaN(ms)) return ms;
  }
  return Number.NaN;
}

/**
 * Si el candidato reemplaza al mejor hasta ahora: una fecha le gana a ninguna y, a igual
 * fecha (o sin fecha los dos), gana el que viene después en la lista.
 */
function esMasReciente(candidato: number, mejor: number): boolean {
  if (Number.isNaN(candidato)) return Number.isNaN(mejor);
  return Number.isNaN(mejor) || candidato >= mejor;
}

/**
 * Lo declarado en el grupo «Salud de la mujer» del ingreso: de la última respuesta
 * completa (o enmendada) que trae el grupo, sea cual sea la URL del cuestionario, y
 * leído sólo dentro del grupo. Hoy el ingreso no tiene el grupo (el portal lo agrega detrás de una constante
 * apagada), así que devuelve undefined para todas las personas.
 */
export function datosDelIngreso(respuestas: QuestionnaireResponse[]): DatosDelIngreso | undefined {
  let ultima: { respuesta: QuestionnaireResponse; grupo: QuestionnaireResponseItem; fecha: number } | undefined;
  for (const r of respuestas) {
    if (r.status !== 'completed' && r.status !== 'amended') continue;
    const grupo = grupoSaludMujer(r);
    if (!grupo) continue;
    const fecha = instante(r.authored, r.meta?.lastUpdated);
    if (!ultima || esMasReciente(fecha, ultima.fecha)) ultima = { respuesta: r, grupo, fecha };
  }
  if (!ultima) return undefined;

  const { grupo } = ultima;
  const datos: DatosDelIngreso = { respuesta: ultima.respuesta };
  const etapa = codigoDe(primeraRespuesta(grupo, INGRESO_LINKIDS.etapaMenstrual));
  if (etapa !== undefined) datos.etapaMenstrual = etapa;
  const edad = primeraRespuesta(grupo, INGRESO_LINKIDS.edadUltimaMenstruacion);
  const valorEdad = edad?.valueInteger ?? edad?.valueDecimal;
  if (typeof valorEdad === 'number') datos.edadUltimaMenstruacion = valorEdad;
  const campos = [
    ['preeclampsia', INGRESO_LINKIDS.obstPreeclampsia],
    ['diabetesGestacional', INGRESO_LINKIDS.obstDmg],
    ['partoPrematuro', INGRESO_LINKIDS.obstPrematuro],
    ['ancestriaAsiatica', INGRESO_LINKIDS.ancestriaAsiatica],
  ] as const;
  for (const [campo, linkId] of campos) {
    const valor = siNo(primeraRespuesta(grupo, linkId));
    if (valor !== undefined) datos[campo] = valor;
  }
  return datos;
}

/**
 * Lo que viene del portal y no registró el equipo: menopausia por SNOMED, GLP-1 del
 * cuestionario inicial y, del grupo «Salud de la mujer» del ingreso, `dmg-previa`
 * (diabetes gestacional) y `ancestria-asiatica`. La preeclampsia y el parto prematuro
 * del ingreso no activan nada: quedan en `datosDelIngreso` para el equipo.
 */
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
  const ingreso = datosDelIngreso(respuestas);
  if (ingreso?.diabetesGestacional) out.push('dmg-previa');
  if (ingreso?.ancestriaAsiatica) out.push('ancestria-asiatica');
  return out;
}

const VERIFICACION_DESCARTADA = new Set(['refuted', 'entered-in-error']);

const ETAPA_POR_CODIGO = new Map<string | undefined, WomanLifeStage>(
  Object.values(LIFE_STAGES).map((etapa) => [etapa.coding.code, etapa.stage]),
);

/** La etapa de la menopausia registrada (`LIFE_STAGES`) y la Condition de la que sale. */
export interface EtapaRegistrada {
  stage: WomanLifeStage;
  condition: Condition;
}

/**
 * La etapa de la menopausia de la persona según sus Condition SNOMED activas (las de
 * `LIFE_STAGES`: peri, posmenopausia, prematura y quirúrgica), sin las refutadas ni
 * las cargadas por error. Si hay más de una, la más reciente. La menopausia «a secas»
 * (289903006) no es una etapa: activa la condición `menopausia` pero no da etapa.
 */
export function etapaRegistrada(conditions: Condition[]): EtapaRegistrada | undefined {
  let mejor: { etapa: EtapaRegistrada; fecha: number } | undefined;
  for (const condition of conditions) {
    if (!condicionActiva(condition)) continue;
    if (VERIFICACION_DESCARTADA.has(condition.verificationStatus?.coding?.[0]?.code ?? '')) continue;
    const coding = (condition.code?.coding ?? []).find((k) => k.system === SYSTEM.snomed && ETAPA_POR_CODIGO.has(k.code));
    const stage = coding ? ETAPA_POR_CODIGO.get(coding.code) : undefined;
    if (!stage) continue;
    const fecha = instante(condition.recordedDate, condition.onsetDateTime, condition.meta?.lastUpdated);
    if (!mejor || esMasReciente(fecha, mejor.fecha)) mejor = { etapa: { stage, condition }, fecha };
  }
  return mejor?.etapa;
}

export function perfilDeLaPersona(ctx: ContextoPerfil): PerfilPersona {
  const hoy = ctx.hoy ?? new Date().toISOString().slice(0, 10);
  const observations = ctx.observations ?? [];
  const conditions = ctx.conditions ?? [];
  const respuestas = ctx.questionnaireResponses ?? [];

  // La ancestría asiática declarada en el ingreso baja los umbrales de IMC y cintura
  // (Tabla 4): tiene que estar en el input antes de estimar el estadío.
  const ingreso = datosDelIngreso(respuestas);
  const extraido = extractCkmInput({ patient: ctx.patient, observations, conditions, on: hoy });
  const input: CkmInput = ingreso?.ancestriaAsiatica ? { ...extraido, ancestriaAsiatica: true } : extraido;
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
    ...(ingreso ? { ingreso } : {}),
    condiciones,
    ...(estadio ? { perfil: { estadio, condiciones } } : {}),
    faltantes: estadio ? [] : estimado.faltantes.length ? estimado.faltantes : ['datos básicos (peso, presión, glucemia, lípidos)'],
    hoy,
  };
}
