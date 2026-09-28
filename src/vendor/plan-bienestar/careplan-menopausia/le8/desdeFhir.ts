/**
 * Entrada del puntaje LE8 a partir de los recursos FHIR de la persona — lógica pura
 * (recibe los recursos ya leídos; no hace red).
 *
 * Los factores (IMC, presión, lípidos, glucemia) salen de las `Observation` por LOINC
 * (la presión también de los componentes del panel), la diabetes de las `Condition`
 * activas (SNOMED) y el tratamiento de las `MedicationRequest` activas (por el nombre
 * del fármaco). Las conductas (dieta, actividad, nicotina, sueño) salen de las
 * respuestas a los cuestionarios LE8 del portal, reconocidas por la URL canónica del
 * `Questionnaire` en cualquiera de los namespaces aceptados y por los `linkId` del
 * contrato (`LE8_CUESTIONARIOS`). Con `hasta` sólo se usan los recursos hasta esa
 * fecha: así se obtiene el puntaje del día 0 para medir la respuesta a 100 días.
 */
import type {
  Coding,
  Condition,
  MedicationRequest,
  Observation,
  Patient,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
} from '@medplum/fhirtypes';
import { coincide } from '../contrato/pb100d.js';
import { LOINC } from '../terminology/loinc.js';
import { SNOMED } from '../terminology/snomed.js';
import { SYSTEM } from '../terminology/systems.js';
import type { EntradaLe8, EstadoNicotina, NicotinaLe8, TiempoSinFumar } from './puntaje.js';

export interface Le8FhirContext {
  patient?: Patient;
  observations?: Observation[];
  conditions?: Condition[];
  medicationRequests?: MedicationRequest[];
  questionnaireResponses?: QuestionnaireResponse[];
  /** Sólo se consideran los recursos fechados hasta este ISO (inclusive). */
  hasta?: string;
}

/**
 * Contrato con los cuestionarios LE8 del portal (`EPA-Developments/app`,
 * `src/le8.questionnaires.ts`): sufijo de la URL canónica y `linkId` que se leen.
 * Cambiarlos rompe el tablero: no renombrar sin coordinar.
 */
export const LE8_CUESTIONARIOS = {
  sueno: { sufijo: 'Questionnaire/le8-sleep-psqi-v1', horas: 'psqi-q4' },
  dieta: { sufijo: 'Questionnaire/le8-diet-mepa-v1', prefijo: 'medas-', criterios: 13, cumple: '1' },
  actividad: { sufijo: 'Questionnaire/le8-activity-evs-v1', dias: 'evs-days', minutos: 'evs-minutes' },
  nicotina: {
    sufijo: 'Questionnaire/le8-tobacco-v1',
    estado: 'tabaco-estado',
    tiempo: 'tabaco-tiempo-dejo',
    humoAjeno: 'tabaco-humo-ajeno',
  },
} as const;

const ESTADO_NICOTINA: Record<string, EstadoNicotina> = { never: 'nunca', former: 'ex', current: 'actual' };
const TIEMPO_SIN_FUMAR: Record<string, TiempoSinFumar> = { lt1: 'menos-1-anio', '1to5': '1-a-5-anios', gte5: '5-anios-o-mas' };

/** Estado de tabaquismo (LOINC 72166-2) por SNOMED del valor: respaldo cuando no hay cuestionario. */
const NICOTINA_POR_SNOMED: Record<string, EstadoNicotina> = {
  '266919005': 'nunca', // Never smoked tobacco
  '8517006': 'ex', // Ex-smoker
  '77176002': 'actual', // Smoker
  '449868002': 'actual', // Current every day smoker
  '428041000124106': 'actual', // Current some day smoker
  '428071000124103': 'actual', // Heavy tobacco smoker
  '428061000124105': 'actual', // Light tobacco smoker
};

/** Fármacos por clase (nombre genérico o de clase, en el texto de la prescripción). */
export const RE_TRATAMIENTO_LE8 = {
  presion:
    /(enala|lisino|rami|perindo|capto|quina|benaze|fosino|trando)pril|sart[aá]n\b|amlodip|nifedip|felodip|lercanidip|hidroclorotiaz|clortalid|indapamid|furosemid|atenolol|bisoprolol|metoprolol|nebivolol|carvedilol|propranolol|espironolact|eplerenon|antihipertensiv/i,
  lipidos: /statina|atorvast|rosuvast|simvast|pravast|pitavast|lovast|fluvast|estatina|ezetimib|bempedoic|bempedoico|evolocumab|alirocumab|inclisir[aá]n|fenofibrat|icosapent/i,
} as const;

const def = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

function fechaObs(o: Observation): string {
  return o.effectiveDateTime ?? o.effectivePeriod?.start ?? o.issued ?? '';
}

const dentroDe = (fecha: string, hasta: string | undefined): boolean => !hasta || !fecha || fecha.slice(0, 10) <= hasta.slice(0, 10);

const esLoinc = (coding: Coding[] | undefined, loinc: Coding): boolean =>
  (coding ?? []).some((c) => c.system === SYSTEM.loinc && c.code === loinc.code);

const anulada = (o: Observation): boolean => o.status === 'entered-in-error' || o.status === 'cancelled';

/** Último valor (por fecha) de un LOINC, directo o como componente del panel. */
function ultimoValor(observations: Observation[], loinc: Coding, hasta?: string): number | undefined {
  let mejor: { fecha: string; valor: number } | undefined;
  for (const o of observations) {
    if (anulada(o)) continue;
    const fecha = fechaObs(o);
    if (!dentroDe(fecha, hasta)) continue;
    let valor: number | undefined;
    if (esLoinc(o.code?.coding, loinc) && def(o.valueQuantity?.value)) {
      valor = o.valueQuantity.value;
    } else {
      const comp = (o.component ?? []).find((c) => esLoinc(c.code?.coding, loinc) && def(c.valueQuantity?.value));
      valor = comp?.valueQuantity?.value;
    }
    if (valor === undefined) continue;
    if (!mejor || fecha >= mejor.fecha) mejor = { fecha, valor };
  }
  return mejor?.valor;
}

function ultimaObservacion(observations: Observation[], loinc: Coding, hasta?: string): Observation | undefined {
  let mejor: Observation | undefined;
  for (const o of observations) {
    if (anulada(o) || !esLoinc(o.code?.coding, loinc) || !dentroDe(fechaObs(o), hasta)) continue;
    if (!mejor || fechaObs(o) >= fechaObs(mejor)) mejor = o;
  }
  return mejor;
}

function condicionActiva(c: Condition): boolean {
  const estado = c.clinicalStatus?.coding?.[0]?.code;
  const verificacion = c.verificationStatus?.coding?.[0]?.code;
  return (
    (estado === undefined || ['active', 'recurrence', 'relapse'].includes(estado)) &&
    verificacion !== 'refuted' &&
    verificacion !== 'entered-in-error'
  );
}

function tieneCondicion(conditions: Condition[], codigos: readonly Coding[]): boolean {
  const codes = new Set(codigos.map((c) => c.code));
  return conditions.some(
    (c) => condicionActiva(c) && (c.code?.coding ?? []).some((k) => k.system === SYSTEM.snomed && codes.has(k.code)),
  );
}

function medicacionActiva(meds: MedicationRequest[], hasta: string | undefined, re: RegExp): boolean {
  return meds.some((m) => {
    if (m.status && m.status !== 'active') return false;
    if (m.authoredOn && !dentroDe(m.authoredOn, hasta)) return false;
    const cc = m.medicationCodeableConcept;
    const texto = `${cc?.text ?? ''} ${(cc?.coding ?? []).map((c) => c.display ?? '').join(' ')}`;
    return re.test(texto);
  });
}

// ───────────────────────── cuestionarios ─────────────────────────

function* recorrer(items: QuestionnaireResponseItem[] | undefined): Generator<QuestionnaireResponseItem> {
  for (const item of items ?? []) {
    yield item;
    yield* recorrer(item.item);
    for (const answer of item.answer ?? []) yield* recorrer(answer.item);
  }
}

/** Última respuesta (por `authored`) al cuestionario del sufijo dado, en cualquier namespace. */
export function ultimaRespuesta(
  respuestas: QuestionnaireResponse[],
  sufijo: string,
  hasta?: string,
): QuestionnaireResponse | undefined {
  let mejor: QuestionnaireResponse | undefined;
  for (const r of respuestas) {
    if (r.status === 'entered-in-error' || !coincide(r.questionnaire?.split('|')[0], sufijo)) continue;
    const fecha = r.authored ?? r.meta?.lastUpdated ?? '';
    if (!dentroDe(fecha, hasta)) continue;
    const fechaMejor = mejor?.authored ?? mejor?.meta?.lastUpdated ?? '';
    if (!mejor || fecha >= fechaMejor) mejor = r;
  }
  return mejor;
}

function respuestaDe(r: QuestionnaireResponse | undefined, linkId: string): QuestionnaireResponseItemAnswer | undefined {
  if (!r) return undefined;
  for (const item of recorrer(r.item)) {
    if (item.linkId === linkId) return item.answer?.[0];
  }
  return undefined;
}

const numero = (a: QuestionnaireResponseItemAnswer | undefined): number | undefined => {
  const v = a?.valueDecimal ?? a?.valueInteger ?? a?.valueQuantity?.value;
  if (def(v)) return v;
  const texto = a?.valueString?.replace(',', '.');
  const parseado = texto ? Number(texto) : NaN;
  return Number.isFinite(parseado) ? parseado : undefined;
};
const codigo = (a: QuestionnaireResponseItemAnswer | undefined): string | undefined => a?.valueCoding?.code ?? a?.valueString;

/** Criterios MEDAS cumplidos (`code` "1") entre los ítems que puntúan; undefined si no respondió ninguno. */
export function medasDesdeRespuesta(r: QuestionnaireResponse | undefined): number | undefined {
  if (!r) return undefined;
  const { prefijo, criterios, cumple } = LE8_CUESTIONARIOS.dieta;
  let respondidos = 0;
  let puntos = 0;
  for (const item of recorrer(r.item)) {
    const m = item.linkId && new RegExp(`^${prefijo}(\\d{2})$`).exec(item.linkId);
    if (!m || Number(m[1]) < 1 || Number(m[1]) > criterios) continue;
    const c = codigo(item.answer?.[0]);
    if (c === undefined) continue;
    respondidos += 1;
    if (c === cumple) puntos += 1;
  }
  return respondidos > 0 ? puntos : undefined;
}

/** Minutos semanales del Exercise Vital Sign: días × minutos (0 días = 0 minutos). */
export function actividadDesdeRespuesta(r: QuestionnaireResponse | undefined): number | undefined {
  const dias = numero(respuestaDe(r, LE8_CUESTIONARIOS.actividad.dias));
  if (!def(dias)) return undefined;
  if (dias <= 0) return 0;
  const minutos = numero(respuestaDe(r, LE8_CUESTIONARIOS.actividad.minutos));
  return def(minutos) ? dias * minutos : undefined;
}

export function nicotinaDesdeRespuesta(r: QuestionnaireResponse | undefined): NicotinaLe8 | undefined {
  const estado = ESTADO_NICOTINA[codigo(respuestaDe(r, LE8_CUESTIONARIOS.nicotina.estado)) ?? ''];
  if (!estado) return undefined;
  const tiempo = TIEMPO_SIN_FUMAR[codigo(respuestaDe(r, LE8_CUESTIONARIOS.nicotina.tiempo)) ?? ''];
  const humo = respuestaDe(r, LE8_CUESTIONARIOS.nicotina.humoAjeno)?.valueBoolean;
  return {
    estado,
    ...(tiempo ? { tiempoSinFumar: tiempo } : {}),
    ...(humo !== undefined ? { humoAjenoEnCasa: humo } : {}),
  };
}

/** Estado de tabaquismo desde la Observation LOINC 72166-2 (SNOMED) o una Condition de tabaquismo. */
function nicotinaDesdeHistoria(observations: Observation[], conditions: Condition[], hasta?: string): NicotinaLe8 | undefined {
  const obs = ultimaObservacion(observations, LOINC.smokingStatus, hasta);
  const code = obs?.valueCodeableConcept?.coding?.find((c) => c.system === SYSTEM.snomed && c.code && NICOTINA_POR_SNOMED[c.code])?.code;
  if (code) return { estado: NICOTINA_POR_SNOMED[code]! };
  if (tieneCondicion(conditions, [SNOMED.currentSmoker])) return { estado: 'actual' };
  if (tieneCondicion(conditions, [SNOMED.exSmoker])) return { estado: 'ex' };
  return undefined;
}

// ───────────────────────── entrada ─────────────────────────

/** Entrada del puntaje LE8 con lo que haya en la historia y en los cuestionarios. */
export function entradaLe8DesdeFhir(ctx: Le8FhirContext): EntradaLe8 {
  const obs = ctx.observations ?? [];
  const conds = ctx.conditions ?? [];
  const meds = ctx.medicationRequests ?? [];
  const qrs = ctx.questionnaireResponses ?? [];
  const hasta = ctx.hasta;

  const sueno = ultimaRespuesta(qrs, LE8_CUESTIONARIOS.sueno.sufijo, hasta);
  const dieta = ultimaRespuesta(qrs, LE8_CUESTIONARIOS.dieta.sufijo, hasta);
  const actividad = ultimaRespuesta(qrs, LE8_CUESTIONARIOS.actividad.sufijo, hasta);
  const tabaco = ultimaRespuesta(qrs, LE8_CUESTIONARIOS.nicotina.sufijo, hasta);

  const suenoHoras = numero(respuestaDe(sueno, LE8_CUESTIONARIOS.sueno.horas)) ?? ultimoValor(obs, LOINC.sleepDuration, hasta);
  const medasPuntos = medasDesdeRespuesta(dieta);
  const actividadMinSemana = actividadDesdeRespuesta(actividad);
  const nicotina = nicotinaDesdeRespuesta(tabaco) ?? nicotinaDesdeHistoria(obs, conds, hasta);

  let imc = ultimoValor(obs, LOINC.bmi, hasta);
  if (!def(imc)) {
    const peso = ultimoValor(obs, LOINC.bodyWeight, hasta);
    const altura = ultimoValor(obs, LOINC.bodyHeight, hasta);
    if (def(peso) && def(altura) && altura > 0) {
      const metros = altura > 3 ? altura / 100 : altura; // cm o m
      imc = Math.round((peso / (metros * metros)) * 10) / 10;
    }
  }

  const entrada: EntradaLe8 = {
    medasTotal: LE8_CUESTIONARIOS.dieta.criterios,
    ...(def(medasPuntos) ? { medasPuntos } : {}),
    ...(def(actividadMinSemana) ? { actividadMinSemana } : {}),
    ...(nicotina ? { nicotina } : {}),
    ...(def(suenoHoras) ? { suenoHoras } : {}),
    ...(def(imc) ? { imc } : {}),
    noHdlMgDl: ultimoValor(obs, LOINC.nonHdlCholesterol, hasta),
    colesterolTotalMgDl: ultimoValor(obs, LOINC.totalCholesterol, hasta),
    hdlMgDl: ultimoValor(obs, LOINC.hdlCholesterol, hasta),
    tratamientoLipidos: medicacionActiva(meds, hasta, RE_TRATAMIENTO_LE8.lipidos) || undefined,
    glucemiaAyunasMgDl: ultimoValor(obs, LOINC.fastingGlucose, hasta),
    hba1cPorcentaje: ultimoValor(obs, LOINC.hba1c, hasta),
    diabetes: tieneCondicion(conds, [SNOMED.diabetesMellitus, SNOMED.type2Diabetes]) || undefined,
    sistolicaMmHg: ultimoValor(obs, LOINC.systolicBloodPressure, hasta),
    diastolicaMmHg: ultimoValor(obs, LOINC.diastolicBloodPressure, hasta),
    tratamientoPresion: medicacionActiva(meds, hasta, RE_TRATAMIENTO_LE8.presion) || undefined,
  };
  // Sin claves en undefined: más fácil de comparar en tests y de serializar.
  return Object.fromEntries(Object.entries(entrada).filter(([, v]) => v !== undefined)) as EntradaLe8;
}
