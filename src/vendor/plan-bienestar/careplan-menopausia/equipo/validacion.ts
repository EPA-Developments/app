import type { Observation, Patient, Practitioner, PractitionerRole, Reference } from '@medplum/fhirtypes';
import { toReference } from '../fhir/codeable.js';
import { SYSTEM } from '../terminology/systems.js';
import { CKM_STAGE_LABEL } from '../ckm/staging.js';
import type { CkmResult, CkmStage, CkmSubStage } from '../ckm/types.js';

/**
 * Estadío CKM registrado en FHIR: la `Observation` `estadio-ckm` del CodeSystem EPA.
 *
 * Dos orígenes, distinguidos por `Observation.method`:
 *  - **validado**: lo confirmó (o corrigió) un profesional del equipo. Es el único
 *    que el catálogo toma como estadío de la persona (`docs/catalogo-pb100d`: "el
 *    estadío lo confirma el médico").
 *  - **estimado**: lo calculó el sistema desde la historia (`buildCkmStageObservation`,
 *    lo que escribe el portal). Sirve de propuesta; nunca reemplaza la validación.
 * Una `Observation` sin método es una estimación vieja: tampoco vale como validada.
 */
export const ESTADIO_CKM = {
  /** `Observation.code`. */
  code: 'estadio-ckm',
  /** `Observation.method`: quién puso el estadío. */
  metodo: {
    validado: 'estadio-ckm-validado',
    estimado: 'estadio-ckm-estimado',
  },
  /** Componente: lo que estimaba el sistema en el momento de validar. */
  componenteEstimado: 'ckm-estadio-estimado',
} as const;

/** `estadio-ckm-2`, `estadio-ckm-4-b`. */
export function codigoEstadio(stage: CkmStage, subStage?: CkmSubStage): string {
  return `estadio-ckm-${stage}${subStage ? `-${subStage.slice(1)}` : ''}`;
}

/** El estadío que codifica un `estadio-ckm-N[-b]`, o undefined si no es uno. */
export function estadioDesdeCodigo(code: string | undefined): { stage: CkmStage; subStage?: CkmSubStage } | undefined {
  const m = /^estadio-ckm-([0-4])(?:-([ab]))?$/.exec(code ?? '');
  if (!m) return undefined;
  const stage = Number(m[1]) as CkmStage;
  const sub = m[2];
  return sub && stage === 4 ? { stage, subStage: `4${sub}` as CkmSubStage } : { stage };
}

export type OrigenEstadio = 'validado' | 'estimado';

export interface ValidacionEstadio {
  patient: Reference<Patient> | string;
  stage: CkmStage;
  /** Sólo con estadío 4: `4b` cuando hay falla renal. */
  subStage?: CkmSubStage;
  /** Quién valida (el profesional logueado). */
  validador?: Reference<Practitioner | PractitionerRole> | string;
  /** Lo que estimaba el sistema, para que quede la diferencia registrada. */
  estimado?: CkmResult;
  /** Motivo de la corrección u observación clínica, en palabras del profesional. */
  comentario?: string;
  /** ISO dateTime de la validación (default: ahora). */
  now?: string;
  id?: string;
}

/**
 * La `Observation` del estadío validado por el equipo. Lleva `method` validado, el
 * profesional en `performer`, y como componente el estadío que estimaba el sistema
 * (si se pasa), así se ve cuándo el médico corrigió y cuándo confirmó.
 */
export function buildEstadioValidadoObservation(v: ValidacionEstadio): Observation {
  const subStage = v.stage === 4 ? v.subStage : undefined;
  const etiqueta = CKM_STAGE_LABEL[v.stage];
  const observation: Observation = {
    resourceType: 'Observation',
    status: 'final',
    category: [{ coding: [{ system: SYSTEM.observationCategory, code: 'survey', display: 'Survey' }] }],
    code: {
      coding: [{ system: SYSTEM.epa, code: ESTADIO_CKM.code, display: 'Estadio CKM (0-4) AHA/Ndumele' }],
      text: 'Estadio CKM',
    },
    subject: toReference(v.patient),
    effectiveDateTime: v.now ?? new Date().toISOString(),
    method: {
      coding: [{ system: SYSTEM.epa, code: ESTADIO_CKM.metodo.validado, display: 'Validado por el equipo' }],
      text: 'Validado por el equipo',
    },
    valueCodeableConcept: {
      coding: [{ system: SYSTEM.epa, code: codigoEstadio(v.stage, subStage), display: etiqueta }],
      text: `Estadio ${v.stage}${subStage ? ` (${subStage})` : ''} - ${etiqueta}`,
    },
  };
  if (v.validador) {
    observation.performer = [toReference(v.validador) as Reference<Practitioner>];
  }
  if (v.estimado?.stage !== undefined) {
    observation.component = [
      {
        code: {
          coding: [{ system: SYSTEM.epa, code: ESTADIO_CKM.componenteEstimado }],
          text: 'Estadio estimado por el sistema al validar',
        },
        valueCodeableConcept: {
          coding: [{ system: SYSTEM.epa, code: codigoEstadio(v.estimado.stage, v.estimado.subStage) }],
          text: `Estimado ${v.estimado.stage}${v.estimado.subStage ? ` (${v.estimado.subStage})` : ''}`,
        },
      },
    ];
  }
  const notas: string[] = [];
  if (v.comentario?.trim()) notas.push(v.comentario.trim());
  if (v.estimado && v.estimado.stage !== undefined && v.estimado.stage !== v.stage) {
    notas.push(`Corrige el estadío estimado por el sistema (${v.estimado.stage}).`);
  }
  if (notas.length) observation.note = notas.map((text) => ({ text }));
  if (v.id) observation.id = v.id;
  return observation;
}

export interface EstadioRegistrado {
  stage: CkmStage;
  subStage?: CkmSubStage;
  origen: OrigenEstadio;
  observation: Observation;
  /** ISO de la validación o estimación. */
  fecha?: string;
  /** Referencia del profesional que validó (`Practitioner/…`), si quedó registrada. */
  validador?: string;
  /** Lo que estimaba el sistema al validar, si quedó registrado. */
  estimadoAlValidar?: CkmStage;
}

/** ¿Es una `Observation` del estadío CKM (cualquier origen), vigente? */
export function esObservationEstadio(o: Observation): boolean {
  return (
    o.status !== 'entered-in-error' &&
    o.status !== 'cancelled' &&
    (o.code?.coding ?? []).some((c) => c.system === SYSTEM.epa && c.code === ESTADIO_CKM.code)
  );
}

/** Origen de una `Observation` del estadío: validado sólo con el método explícito. */
export function origenDeEstadio(o: Observation): OrigenEstadio {
  const validado = (o.method?.coding ?? []).some((c) => c.system === SYSTEM.epa && c.code === ESTADIO_CKM.metodo.validado);
  return validado ? 'validado' : 'estimado';
}

function fechaDe(o: Observation): string {
  return o.effectiveDateTime ?? o.issued ?? o.meta?.lastUpdated ?? '';
}

function registrar(o: Observation): EstadioRegistrado | undefined {
  const codigo = (o.valueCodeableConcept?.coding ?? []).find((c) => c.system === SYSTEM.epa)?.code;
  const estadio = estadioDesdeCodigo(codigo);
  if (!estadio) return undefined;
  const estimado = (o.component ?? []).find((comp) =>
    (comp.code?.coding ?? []).some((c) => c.system === SYSTEM.epa && c.code === ESTADIO_CKM.componenteEstimado),
  );
  const estimadoAlValidar = estadioDesdeCodigo(
    (estimado?.valueCodeableConcept?.coding ?? []).find((c) => c.system === SYSTEM.epa)?.code,
  )?.stage;
  const fecha = fechaDe(o);
  const validador = o.performer?.[0]?.reference;
  return {
    stage: estadio.stage,
    ...(estadio.subStage ? { subStage: estadio.subStage } : {}),
    origen: origenDeEstadio(o),
    observation: o,
    ...(fecha ? { fecha } : {}),
    ...(validador ? { validador } : {}),
    ...(estimadoAlValidar !== undefined ? { estimadoAlValidar } : {}),
  };
}

function masReciente(registros: EstadioRegistrado[]): EstadioRegistrado | undefined {
  return [...registros].sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))[0];
}

/**
 * El estadío validado por el equipo: la `Observation` `estadio-ckm` más reciente con
 * método validado. Las estimaciones del sistema (o sin método) no cuentan.
 */
export function estadioValidado(observations: Observation[]): EstadioRegistrado | undefined {
  const registros = observations
    .filter(esObservationEstadio)
    .map(registrar)
    .filter((r): r is EstadioRegistrado => r !== undefined && r.origen === 'validado');
  return masReciente(registros);
}

/** El último estadío registrado, de cualquier origen (para mostrar qué estimó el sistema y cuándo). */
export function ultimoEstadioRegistrado(observations: Observation[]): EstadioRegistrado | undefined {
  const registros = observations
    .filter(esObservationEstadio)
    .map(registrar)
    .filter((r): r is EstadioRegistrado => r !== undefined);
  return masReciente(registros);
}
