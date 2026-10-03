import type {
  Condition,
  MedicationRequest,
  Observation,
  Patient,
  QuestionnaireResponse,
} from '@medplum/fhirtypes';
import { BASELINE_QUESTIONNAIRE_URL } from '../baseline/preguntas.js';
import { evaluacionesAplicables } from '../catalogo/seleccion.js';
import type { CkmResult } from '../ckm/types.js';
import { CATALOGOS_POR_ESTADIO } from '../content/ckm/index.js';
import { entradaLe8DesdeFhir, LE8_CUESTIONARIOS, ultimaRespuesta } from '../le8/desdeFhir.js';
import { puntajeLe8 } from '../le8/puntaje.js';
import type { Condicion, EstadioCkm, EvaluacionCatalogo, Momento } from '../model/catalogo.js';
import { LOINC } from '../terminology/loinc.js';
import { SYSTEM } from '../terminology/systems.js';
import { INSTRUMENTOS_EQUIPO } from './instrumentos.js';
import { perfilDeLaPersona } from './perfil.js';
import type { EstadioRegistrado } from './validacion.js';

/**
 * Día 0: qué falta.
 *
 * La lista sale del catálogo firmado, no de una lista a mano: son las evaluaciones
 * (`CatalogoEstadio.evaluaciones`) del estadío de la persona con momento `dia-0` que
 * aplican a su perfil. Para cada una, un detector mira la historia FHIR y dice si el
 * dato está, está vencido, está a medias o falta, y quién lo carga: la persona (los
 * cuestionarios del portal), el consultorio (antropometría, presión), el laboratorio,
 * el equipo (instrumentos y registros clínicos) o el sistema (lo que se calcula).
 *
 * El estadío de referencia es el validado por el equipo; si no hay, el estimado; si
 * tampoco, el catálogo del estadío 0 (el conjunto base que se pide a todas las
 * personas). Un dato vale para el día 0 si es de los últimos `vigenciaDias` (90 por
 * defecto, provisorio hasta que el equipo fije las vigencias).
 */
export interface ContextoDia0 {
  patient?: Patient;
  observations?: Observation[];
  conditions?: Condition[];
  questionnaireResponses?: QuestionnaireResponse[];
  medicationRequests?: MedicationRequest[];
  /** ISO date (`YYYY-MM-DD`) de "hoy". Default: la fecha actual. */
  hoy?: string;
  /** Días de vigencia de un dato para el día 0. Default 90. */
  vigenciaDias?: number;
  /** Condiciones extra (además de las registradas en la historia, los instrumentos y los datos). */
  condicionesRegistradas?: Iterable<Condicion>;
  /** Momento del plan que se evalúa. Default: `dia-0`. */
  momento?: Momento;
  /**
   * ISO date desde la que un dato cuenta para este momento (los controles de los días
   * 30, 60 y 100): un dato anterior figura vencido, "anterior a este control".
   */
  desde?: string;
}

export const VIGENCIA_DIA_0_DIAS = 90;

export type EstadoDato = 'cargado' | 'parcial' | 'vencido' | 'falta';

export const ESTADO_DATO_LABEL: Record<EstadoDato, string> = {
  cargado: 'Cargado',
  parcial: 'A medias',
  vencido: 'Vencido',
  falta: 'Falta',
};

export type QuienCarga = 'persona' | 'consultorio' | 'laboratorio' | 'equipo' | 'sistema';

export const QUIEN_CARGA_LABEL: Record<QuienCarga, string> = {
  persona: 'La persona, desde el portal',
  consultorio: 'En el consultorio',
  laboratorio: 'Laboratorio',
  equipo: 'El equipo',
  sistema: 'Lo calcula el sistema',
};

export interface DatoDia0 {
  codigo: string;
  label: string;
  estado: EstadoDato;
  quien: QuienCarga;
  /** ISO de la última carga, si hay. */
  fecha?: string;
  /** Qué hay o qué falta, en palabras cortas ("IMC 28 kg/m2", "faltan AST y plaquetas"). */
  detalle?: string;
  fuente: string;
  evaluacion: EvaluacionCatalogo;
}

export interface ResultadoDia0 {
  /** Estadío de referencia del catálogo usado. */
  estadio: EstadioCkm;
  /** Momento del plan evaluado (`dia-0` por defecto). */
  momento: Momento;
  origenEstadio: 'validado' | 'estimado' | 'ninguno';
  estimado: CkmResult;
  validado?: EstadioRegistrado;
  datos: DatoDia0[];
  cargados: number;
  faltan: number;
  completo: boolean;
  /** Dominios que faltan para poder estimar el estadío, si hoy no se puede. */
  faltaParaEstadificar: string[];
  hoy: string;
}

const BASELINE_SUFIJO = BASELINE_QUESTIONNAIRE_URL.replace(/^.*\/fhir\//, '');

/** Códigos LOINC que se toman en consultorio (la persona también los puede cargar). */
const CONSULTORIO = new Set(
  [LOINC.bodyWeight, LOINC.bodyHeight, LOINC.bmi, LOINC.waistCircumference, LOINC.bloodPressurePanel, LOINC.systolicBloodPressure, LOINC.diastolicBloodPressure, LOINC.heartRate].map(
    (c) => c.code!,
  ),
);

/** Códigos LOINC que salen de los cuestionarios LE8 del portal. */
const DEL_PORTAL: Record<string, string> = {
  [LOINC.smokingStatus.code!]: LE8_CUESTIONARIOS.nicotina.sufijo,
  [LOINC.steps24h.code!]: LE8_CUESTIONARIOS.actividad.sufijo,
  [LOINC.sleepDuration.code!]: LE8_CUESTIONARIOS.sueno.sufijo,
};

/** Otros códigos que satisfacen la evaluación cuando el principal no está. */
const ALTERNATIVAS: Record<string, string[]> = {
  [LOINC.nonHdlCholesterol.code!]: [LOINC.totalCholesterol.code!, LOINC.ldlCholesterol.code!, LOINC.triglycerides.code!],
  [LOINC.hba1c.code!]: [LOINC.fastingGlucose.code!],
  [LOINC.bmi.code!]: [LOINC.bodyWeight.code!],
  [LOINC.systolicBloodPressure.code!]: [LOINC.diastolicBloodPressure.code!],
  [LOINC.egfr.code!]: [LOINC.creatinine.code!],
};

function fechaObs(o: Observation): string {
  return o.effectiveDateTime ?? o.issued ?? o.meta?.lastUpdated ?? '';
}

function tieneLoinc(o: Observation, code: string): boolean {
  const directo = (o.code?.coding ?? []).some((c) => c.system === SYSTEM.loinc && c.code === code);
  const componente = (o.component ?? []).some((comp) => (comp.code?.coding ?? []).some((c) => c.system === SYSTEM.loinc && c.code === code));
  return directo || componente;
}

function valorLoinc(o: Observation, code: string): number | undefined {
  if ((o.code?.coding ?? []).some((c) => c.system === SYSTEM.loinc && c.code === code) && o.valueQuantity?.value !== undefined) {
    return o.valueQuantity.value;
  }
  const componente = (o.component ?? []).find((comp) => (comp.code?.coding ?? []).some((c) => c.system === SYSTEM.loinc && c.code === code));
  return componente?.valueQuantity?.value;
}

/**
 * La última Observation (con valor, no anulada) del primer código que tenga alguna:
 * los códigos van en orden de preferencia (el principal y después las alternativas).
 */
function ultimaObs(observations: Observation[], codes: string[]): { observation: Observation; code: string; valor: number } | undefined {
  for (const code of codes) {
    let mejor: { observation: Observation; code: string; valor: number } | undefined;
    for (const o of observations) {
      if (o.status === 'entered-in-error' || o.status === 'cancelled') continue;
      if (!tieneLoinc(o, code)) continue;
      const valor = valorLoinc(o, code);
      if (valor === undefined) continue;
      if (!mejor || fechaObs(o) >= fechaObs(mejor.observation)) mejor = { observation: o, code, valor };
    }
    if (mejor) return mejor;
  }
  return undefined;
}

function diasEntre(desdeIso: string, hastaIso: string): number {
  const desde = Date.parse(desdeIso);
  const hasta = Date.parse(hastaIso);
  if (Number.isNaN(desde) || Number.isNaN(hasta)) return Number.POSITIVE_INFINITY;
  return (hasta - desde) / 86_400_000;
}

function fechaCorta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

interface Interno {
  hoy: string;
  vigenciaDias: number;
  /** Un dato anterior a esta fecha no cuenta para el momento evaluado. */
  desde?: string;
  observations: Observation[];
  respuestas: QuestionnaireResponse[];
  estimado: CkmResult;
  validado?: EstadioRegistrado;
  le8: { conDato: number; completo: boolean };
  prevent: { faltan: string[] };
  edad?: number;
}

type Deteccion = Pick<DatoDia0, 'estado' | 'quien' | 'fecha' | 'detalle'>;

function conVigencia(ctx: Interno, fecha: string, quien: QuienCarga, detalle?: string): Deteccion {
  if (!fecha) return { estado: 'cargado', quien, ...(detalle ? { detalle } : {}) };
  if (ctx.desde && fecha < ctx.desde) {
    return { estado: 'vencido', quien, fecha, detalle: `Última carga ${fechaCorta(fecha)}, anterior a este control` };
  }
  const dias = diasEntre(fecha, `${ctx.hoy}T23:59:59Z`);
  if (dias > ctx.vigenciaDias) {
    return { estado: 'vencido', quien, fecha, detalle: `Última carga ${fechaCorta(fecha)}, hace más de ${ctx.vigenciaDias} días` };
  }
  return { estado: 'cargado', quien, fecha, ...(detalle ? { detalle } : {}) };
}

function porCuestionario(ctx: Interno, sufijo: string, quien: QuienCarga, nombre: string): Deteccion {
  const r = ultimaRespuesta(ctx.respuestas, sufijo);
  if (!r) return { estado: 'falta', quien, detalle: `Sin ${nombre}` };
  return conVigencia(ctx, r.authored ?? r.meta?.lastUpdated ?? '', quien, nombre);
}

function porCodigo(ctx: Interno, evaluacion: EvaluacionCatalogo, code: string): Deteccion {
  const quien: QuienCarga = CONSULTORIO.has(code) ? 'consultorio' : code in DEL_PORTAL ? 'persona' : 'laboratorio';
  const obs = ultimaObs(ctx.observations, [code, ...(ALTERNATIVAS[code] ?? [])]);
  const sufijoPortal = DEL_PORTAL[code];
  if (!obs && sufijoPortal) {
    return porCuestionario(ctx, sufijoPortal, 'persona', 'cuestionario del portal');
  }
  if (!obs) return { estado: 'falta', quien };
  const unidad = evaluacion.unit && obs.code === code ? ` ${evaluacion.unit}` : '';
  const detalle = obs.code === code ? `${obs.valor}${unidad}` : `Sólo ${LOINC_LABEL[obs.code] ?? obs.code}: ${obs.valor}`;
  const d = conVigencia(ctx, fechaObs(obs.observation), quien, detalle);
  return obs.code === code || d.estado !== 'cargado' ? d : { ...d, estado: 'parcial' };
}

const LOINC_LABEL: Record<string, string> = Object.fromEntries(
  Object.values(LOINC).map((c) => [c.code!, c.display ?? c.code!]),
);

function porFib4(ctx: Interno): Deteccion {
  const partes: Array<[string, string]> = [
    [LOINC.ast.code!, 'AST'],
    [LOINC.alt.code!, 'ALT'],
    [LOINC.platelets.code!, 'plaquetas'],
  ];
  const faltan = partes.filter(([code]) => !ultimaObs(ctx.observations, [code])).map(([, nombre]) => nombre);
  if (faltan.length === partes.length) return { estado: 'falta', quien: 'laboratorio', detalle: 'AST, ALT y plaquetas' };
  if (faltan.length > 0) return { estado: 'parcial', quien: 'laboratorio', detalle: `Faltan ${faltan.join(' y ')}` };
  return { estado: 'cargado', quien: 'laboratorio', detalle: 'AST, ALT y plaquetas cargados' };
}

function porPrevent(ctx: Interno): Deteccion {
  if (ctx.prevent.faltan.length === 0) return { estado: 'cargado', quien: 'sistema', detalle: 'Se calcula con los datos cargados' };
  return { estado: 'parcial', quien: 'sistema', detalle: `Faltan ${ctx.prevent.faltan.join(', ')}` };
}

function porLe8(ctx: Interno): Deteccion {
  if (ctx.le8.completo) return { estado: 'cargado', quien: 'sistema', detalle: '8 de 8 dominios' };
  if (ctx.le8.conDato > 0) return { estado: 'parcial', quien: 'sistema', detalle: `${ctx.le8.conDato} de 8 dominios con dato` };
  return { estado: 'falta', quien: 'sistema', detalle: 'Ningún dominio con dato' };
}

function porValidacion(ctx: Interno): Deteccion {
  if (ctx.validado) {
    return { estado: 'cargado', quien: 'equipo', fecha: ctx.validado.fecha ?? '', detalle: `Estadío ${ctx.validado.stage}${ctx.validado.subStage ? ` (${ctx.validado.subStage})` : ''} validado` };
  }
  return {
    estado: 'falta',
    quien: 'equipo',
    detalle: ctx.estimado.stage !== undefined ? `El sistema estima ${ctx.estimado.stage}: falta validar` : 'Sin datos para estimar',
  };
}

/** Cómo se detecta una evaluación del catálogo en la historia FHIR. */
export type DetectorEvaluacion = 'loinc' | 'cuestionario' | 'fib4' | 'prevent' | 'le8' | 'validacion' | 'manual';

export interface ClasificacionEvaluacion {
  quien: QuienCarga;
  detector: DetectorEvaluacion;
  /** LOINC del dato principal y sus alternativas, en orden de preferencia (`loinc`). */
  codigosLoinc?: string[];
  /** Sufijo del `Questionnaire` (bajo cualquier base aceptada) cuya última respuesta satisface la evaluación (`cuestionario`, o `loinc` de los cuestionarios LE8). */
  cuestionario?: string;
  /** Nombre corto de lo que falta ("STOP-BANG", "MEDAS-14 del portal"). */
  nombre?: string;
}

/** Detectores por texto del catálogo, para las evaluaciones sin código LOINC. */
const POR_LABEL: ReadonlyArray<{ re: RegExp } & Omit<ClasificacionEvaluacion, 'codigosLoinc'>> = [
  { re: /MEDAS/i, detector: 'cuestionario', quien: 'persona', cuestionario: LE8_CUESTIONARIOS.dieta.sufijo, nombre: 'MEDAS-14 del portal' },
  { re: /cuestionario inicial/i, detector: 'cuestionario', quien: 'persona', cuestionario: BASELINE_SUFIJO, nombre: 'cuestionario inicial del portal' },
  { re: /STOP-BANG/i, detector: 'cuestionario', quien: 'equipo', cuestionario: INSTRUMENTOS_EQUIPO.stopBang, nombre: 'STOP-BANG' },
  { re: /PHQ|GAD|PSS/i, detector: 'cuestionario', quien: 'equipo', cuestionario: INSTRUMENTOS_EQUIPO.psicologico, nombre: 'PHQ-2, GAD-2 y PSS-4' },
  { re: /AHC-HRSN|determinantes sociales/i, detector: 'cuestionario', quien: 'equipo', cuestionario: INSTRUMENTOS_EQUIPO.ahcHrsn, nombre: 'AHC-HRSN' },
  { re: /FIB-4/i, detector: 'fib4', quien: 'laboratorio', nombre: 'AST, ALT y plaquetas' },
  { re: /PREVENT/i, detector: 'prevent', quien: 'sistema' },
  { re: /potenciadores/i, detector: 'cuestionario', quien: 'equipo', cuestionario: INSTRUMENTOS_EQUIPO.potenciadores, nombre: 'registro de potenciadores' },
  { re: /estadificaci[oó]n .*validad/i, detector: 'validacion', quien: 'equipo' },
  { re: /reconciliaci[oó]n de medicaci[oó]n/i, detector: 'cuestionario', quien: 'equipo', cuestionario: INSTRUMENTOS_EQUIPO.reconciliacion, nombre: 'reconciliación de medicación' },
  { re: /puntaje LE8/i, detector: 'le8', quien: 'sistema' },
];

/**
 * Quién carga una evaluación del catálogo y con qué se detecta. Es la regla que usa el
 * día 0 y la que se exporta a Recepción para que evalúe "qué falta" con su propio motor.
 */
export function clasificarEvaluacion(evaluacion: EvaluacionCatalogo): ClasificacionEvaluacion {
  const code = evaluacion.code?.code;
  if (code && evaluacion.code?.system === SYSTEM.loinc) {
    const quien: QuienCarga = CONSULTORIO.has(code) ? 'consultorio' : code in DEL_PORTAL ? 'persona' : 'laboratorio';
    const sufijoPortal = DEL_PORTAL[code];
    return { quien, detector: 'loinc', codigosLoinc: [code, ...(ALTERNATIVAS[code] ?? [])], ...(sufijoPortal ? { cuestionario: sufijoPortal } : {}) };
  }
  const porLabel = POR_LABEL.find((d) => d.re.test(evaluacion.label));
  if (porLabel) {
    const { re: _re, ...clasificacion } = porLabel;
    return clasificacion;
  }
  return { quien: 'equipo', detector: 'manual' };
}

function detectar(ctx: Interno, evaluacion: EvaluacionCatalogo): Deteccion {
  const c = clasificarEvaluacion(evaluacion);
  switch (c.detector) {
    case 'loinc':
      return porCodigo(ctx, evaluacion, evaluacion.code!.code!);
    case 'cuestionario':
      return porCuestionario(ctx, c.cuestionario!, c.quien, c.nombre ?? 'cuestionario');
    case 'fib4':
      return porFib4(ctx);
    case 'prevent':
      return porPrevent(ctx);
    case 'le8':
      return porLe8(ctx);
    case 'validacion':
      return porValidacion(ctx);
    case 'manual':
      return { estado: 'falta', quien: 'equipo', detalle: 'Se registra a mano (sin detector)' };
  }
}

/** Qué le falta a PREVENT: colesterol total, HDL, presión sistólica, eGFR y la edad. */
function faltantesPrevent(observations: Observation[], edad: number | undefined): string[] {
  const faltan: string[] = [];
  if (!ultimaObs(observations, [LOINC.totalCholesterol.code!])) faltan.push('colesterol total');
  if (!ultimaObs(observations, [LOINC.hdlCholesterol.code!])) faltan.push('HDL');
  if (!ultimaObs(observations, [LOINC.systolicBloodPressure.code!])) faltan.push('presión sistólica');
  if (!ultimaObs(observations, [LOINC.egfr.code!, LOINC.creatinine.code!])) faltan.push('eGFR');
  if (edad === undefined) faltan.push('fecha de nacimiento');
  return faltan;
}

/** Evalúa el día 0 de una persona con su historia FHIR. */
export function evaluarDia0(ctx: ContextoDia0): ResultadoDia0 {
  const hoy = ctx.hoy ?? new Date().toISOString().slice(0, 10);
  const observations = ctx.observations ?? [];
  const conditions = ctx.conditions ?? [];
  const respuestas = ctx.questionnaireResponses ?? [];
  const persona = perfilDeLaPersona({ patient: ctx.patient, observations, conditions, questionnaireResponses: respuestas, hoy });
  const { estimado, validado, estadio, origenEstadio } = persona;
  const estadioReferencia: EstadioCkm = estadio ?? '0';
  const condiciones = new Set<Condicion>([...persona.condiciones, ...(ctx.condicionesRegistradas ?? [])]);
  const momento: Momento = ctx.momento ?? 'dia-0';
  const evaluaciones = evaluacionesAplicables(
    { estadio: estadioReferencia, condiciones },
    CATALOGOS_POR_ESTADIO[estadioReferencia].evaluaciones,
  ).filter((e) => e.momentos.includes(momento));

  const le8 = puntajeLe8(
    entradaLe8DesdeFhir({
      patient: ctx.patient,
      observations,
      conditions,
      medicationRequests: ctx.medicationRequests ?? [],
      questionnaireResponses: respuestas,
    }),
  );
  const interno: Interno = {
    hoy,
    vigenciaDias: ctx.vigenciaDias ?? VIGENCIA_DIA_0_DIAS,
    ...(ctx.desde ? { desde: ctx.desde } : {}),
    observations,
    respuestas,
    estimado,
    ...(validado ? { validado } : {}),
    le8: { conDato: le8.conDato, completo: le8.completo },
    prevent: { faltan: faltantesPrevent(observations, persona.input.edad) },
    ...(persona.input.edad !== undefined ? { edad: persona.input.edad } : {}),
  };

  const datos: DatoDia0[] = evaluaciones.map((evaluacion) => ({
    codigo: evaluacion.codigo,
    label: evaluacion.label,
    fuente: evaluacion.fuente,
    evaluacion,
    ...detectar(interno, evaluacion),
  }));
  const cargados = datos.filter((d) => d.estado === 'cargado').length;

  return {
    estadio: estadioReferencia,
    momento,
    origenEstadio,
    estimado,
    ...(validado ? { validado } : {}),
    datos,
    cargados,
    faltan: datos.length - cargados,
    completo: datos.length > 0 && cargados === datos.length,
    faltaParaEstadificar: estimado.stage === undefined ? estimado.faltantes : [],
    hoy,
  };
}

/**
 * Las evaluaciones de otro momento del plan (los controles de los días 30, 60 y 100),
 * con la misma lógica del día 0. Con `ctx.desde`, un dato anterior a esa fecha figura
 * vencido: es de un control anterior.
 */
export function evaluarMomento(ctx: ContextoDia0, momento: Momento): ResultadoDia0 {
  return evaluarDia0({ ...ctx, momento });
}

/** Los datos del día 0 agrupados por quién los carga, en el orden en que se piden. */
export function agruparPorQuien(datos: DatoDia0[]): Array<{ quien: QuienCarga; datos: DatoDia0[] }> {
  const orden: QuienCarga[] = ['consultorio', 'laboratorio', 'persona', 'equipo', 'sistema'];
  return orden
    .map((quien) => ({ quien, datos: datos.filter((d) => d.quien === quien) }))
    .filter((g) => g.datos.length > 0);
}
