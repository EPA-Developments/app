import type {
  Bundle,
  BundleEntry,
  CarePlan,
  CareTeam,
  Condition,
  Extension,
  Goal,
  Observation,
  Patient,
  Reference,
  Resource,
  Task,
} from '@medplum/fhirtypes';
import { defaultIdGenerator, urn, type IdGenerator } from '../fhir/ids.js';
import { concept, textConcept, toReference } from '../fhir/codeable.js';
import { SYSTEM } from '../terminology/systems.js';
import { SYS } from '../contrato/pb100d.js';
import { LIFE_STAGES, type WomanLifeStage } from '../model/lifeStage.js';
import {
  ETIQUETA_ESTADIO,
  RESPONSABLE_LABEL,
  TIPO_ITEM_LABEL,
  type Audiencia,
  type Condicion,
  type EvaluacionCatalogo,
  type ItemCatalogo,
  type MetaCatalogo,
  type Momento,
} from '../model/catalogo.js';
import { PB100D_NOMBRE } from '../contrato/pb100d.js';
import { PB100D_PLAN_DEFINITION_URL, PB100D_PLAN_DESCRIPTION } from '../content/ckm/index.js';
import {
  evaluacionesAplicables,
  itemsAplicables,
  metasAplicables,
  type PerfilCatalogo,
} from '../catalogo/seleccion.js';
import type { CareTeamOptions } from './options.js';
import { buildGoal } from './goal.js';
import { buildCareTeam } from './careTeam.js';
import { buildCondition } from './condition.js';
import { buildCarePlan } from './carePlan.js';
import {
  extensionCatalogoItem,
  extensionesDeAplicabilidad,
  extensionesMomentos,
} from './pb100dPlanDefinition.js';

export interface BuildPb100dCarePlanOptions {
  /** The subject of the plan. Accepts `Patient/<id>` or a Reference. */
  patient: Reference<Patient> | string;
  /**
   * Physician-validated CKM stage plus the registered conditions (catalog codes).
   * Build it with `perfilDesdeCkm` or by hand; the bundle only instantiates what
   * applies to it.
   */
  perfil: PerfilCatalogo;
  /**
   * Audiences whose items become Tasks. Default: only `persona`. Professional
   * items (alerts, referrals) are the physician's; include them when the
   * consumer filters Tasks by `performerType` before showing anything to the
   * person.
   */
  audiencias?: readonly Audiencia[];
  /** Include the applicable evaluations (what is measured and when) as Tasks. Default `true`. */
  incluirEvaluaciones?: boolean;
  /** Care-team configuration. */
  careTeam?: CareTeamOptions;
  /** Menopause life stage: adds the addressed Condition and activates the menopause module label. */
  lifeStage?: WomanLifeStage;
  /**
   * With `lifeStage`, whether the bundle creates the stage Condition. Default `true`.
   * Pass `false` when the stage comes from a Condition already on the server
   * (`etapaRegistrada`): the CareTeam still carries the stage label and the CarePlan
   * addresses `existingCondition`, without writing a duplicate.
   */
  crearCondition?: boolean;
  /** The Condition already on the server that the CarePlan addresses when `crearCondition` is `false`. */
  existingCondition?: Reference<Condition> | Condition | string;
  /**
   * The validated CKM stage Observation (`buildCkmStageObservation`), referenced
   * from CarePlan.supportingInfo. Accepts a reference or an Observation with id.
   */
  ckmObservation?: Reference<Observation> | Observation | string;
  /** Canonical URL of the PlanDefinition the CarePlan instantiates. Default: the PB100D CKM definition. */
  planDefinitionUrl?: string;
  /** UUID generator (injectable for deterministic output). */
  idGenerator?: IdGenerator;
  /** ISO date (`YYYY-MM-DD`) stamped on dated fields. */
  now?: string;
}

/** The individual resources that make up a PB100D care plan. */
export interface Pb100dCarePlanResources {
  bundle: Bundle;
  carePlan: CarePlan;
  careTeam: CareTeam;
  goals: Goal[];
  tasks: Task[];
  condition?: Condition;
}

const DIAS: Partial<Record<Momento, number>> = { 'dia-0': 0, 'dia-30': 30, 'dia-60': 60, 'dia-100': 100 };

function sumarDias(iso: string, dias: number): string {
  const fecha = new Date(`${iso}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

interface TaskCtx {
  patient: Reference<Patient>;
  carePlan: string;
  now?: string;
}

function codigoCatalogo(codigo: string, titulo: string, tipo: keyof typeof TIPO_ITEM_LABEL): Task['code'] {
  return {
    coding: [
      { system: SYS.catalogo, code: codigo, display: titulo },
      { system: SYSTEM.epa, code: tipo, display: TIPO_ITEM_LABEL[tipo] },
    ],
    text: titulo,
  };
}

function ventana(momentos: readonly Momento[], now: string | undefined): Task['restriction'] | undefined {
  if (!now) return undefined;
  const dias = momentos.map((m) => DIAS[m]).filter((d): d is number => d !== undefined);
  if (dias.length === 0) return undefined;
  const ultimo = Math.max(...dias);
  return { period: { start: now, end: sumarDias(now, ultimo) } };
}

/** Task for a catalog item; persona items are `plan`, professional ones `proposal`. */
export function taskDesdeItem(item: ItemCatalogo, ctx: TaskCtx): Task {
  const task: Task = {
    resourceType: 'Task',
    status: 'requested',
    intent: item.audiencia === 'persona' ? 'plan' : 'proposal',
    code: codigoCatalogo(item.codigo, item.titulo, item.tipo),
    description: item.texto,
    for: ctx.patient,
    basedOn: [{ reference: ctx.carePlan }],
    businessStatus: textConcept(TIPO_ITEM_LABEL[item.tipo]),
    performerType: [
      concept({ system: SYSTEM.epa, code: item.responsable, display: RESPONSABLE_LABEL[item.responsable] }),
    ],
    extension: [extensionCatalogoItem(item.codigo), ...extensionesEstadiosDe(item), ...extensionesMomentos(item.momentos)],
  };
  if (item.audiencia === 'profesional') {
    task.priority = item.tipo === 'alerta' && item.cor === '3' ? 'asap' : 'routine';
    if (item.racional) task.note = [{ text: item.racional }];
  }
  if (ctx.now) task.authoredOn = ctx.now;
  const restriction = ventana(item.momentos, ctx.now);
  if (restriction) task.restriction = restriction;
  return task;
}

/** Task for a catalog evaluation (what is measured and when), owned by the team. */
export function taskDesdeEvaluacion(evaluacion: EvaluacionCatalogo, ctx: TaskCtx): Task {
  const task: Task = {
    resourceType: 'Task',
    status: 'requested',
    intent: 'plan',
    code: codigoCatalogo(evaluacion.codigo, evaluacion.label, 'evaluacion'),
    for: ctx.patient,
    basedOn: [{ reference: ctx.carePlan }],
    businessStatus: textConcept(TIPO_ITEM_LABEL.evaluacion),
    performerType: [concept({ system: SYSTEM.epa, code: 'equipo', display: RESPONSABLE_LABEL.equipo })],
    extension: [
      extensionCatalogoItem(evaluacion.codigo),
      ...extensionesEstadiosDe(evaluacion),
      ...extensionesMomentos(evaluacion.momentos),
    ],
  };
  // The measured concept (LOINC) goes in reasonCode: the Task asks for that measurement.
  if (evaluacion.code) task.reasonCode = concept(evaluacion.code);
  if (evaluacion.despues) task.description = `Después del plan: ${evaluacion.despues}.`;
  if (ctx.now) task.authoredOn = ctx.now;
  const restriction = ventana(evaluacion.momentos, ctx.now);
  if (restriction) task.restriction = restriction;
  return task;
}

function extensionesEstadiosDe(elemento: { estadios: readonly ('0' | '1' | '2' | '3' | '4')[] }): Extension[] {
  return extensionesDeAplicabilidad({ estadios: elemento.estadios });
}

/** Goal for a catalog goal, with the catalog code as identifier and extension. */
export function goalDesdeMetaCatalogo(meta: MetaCatalogo, ctx: { patient: Reference<Patient>; now?: string }): Goal {
  const goal = buildGoal(
    {
      key: meta.codigo,
      category: meta.category,
      le8Domain: meta.le8,
      description: `${meta.nombre}: ${meta.valor}`,
      measure: meta.measure,
      target: meta.target,
      priority: meta.priority,
      rationale: meta.fuente,
    },
    ctx,
  );
  goal.identifier = [{ system: SYS.catalogo, value: meta.codigo }];
  goal.extension = [extensionCatalogoItem(meta.codigo), ...extensionesEstadiosDe(meta)];
  return goal;
}

function referenciaObservacion(
  observation: Reference<Observation> | Observation | string | undefined,
): Reference<Observation> | undefined {
  if (!observation) return undefined;
  if (typeof observation === 'string') return { reference: observation };
  if ('resourceType' in observation) {
    return observation.id ? { reference: `Observation/${observation.id}` } : undefined;
  }
  return observation;
}

function referenciaCondition(condition: Reference<Condition> | Condition | string | undefined): string | undefined {
  if (!condition) return undefined;
  if (typeof condition === 'string') return condition;
  if ('resourceType' in condition) return condition.id ? `Condition/${condition.id}` : undefined;
  return condition.reference;
}

function extensionesPerfil(perfil: PerfilCatalogo): Extension[] {
  const condiciones: Condicion[] = [...perfil.condiciones];
  return extensionesDeAplicabilidad({ estadios: [perfil.estadio], condiciones });
}

/**
 * Builds a FHIR R4 transaction Bundle for the Plan Bienestar 100 Días of one
 * person: Goals and Tasks for the catalog items that apply to her stage and
 * conditions, a CareTeam and the CarePlan that wires them, instantiating the
 * PB100D CKM PlanDefinition. Internal references use `urn:uuid` placeholders.
 */
export function buildPb100dCarePlanBundle(options: BuildPb100dCarePlanOptions): Bundle {
  const generateId = options.idGenerator ?? defaultIdGenerator;
  const patient = toReference(options.patient);
  const { now, perfil } = options;
  const audiencias = options.audiencias ?? ['persona'];
  const incluirEvaluaciones = options.incluirEvaluaciones ?? true;
  const lifeStage = options.lifeStage ? LIFE_STAGES[options.lifeStage] : undefined;
  const crearCondition = lifeStage !== undefined && (options.crearCondition ?? true);

  const carePlanUrn = urn(generateId());
  const careTeamUrn = urn(generateId());
  const conditionUrn = crearCondition ? urn(generateId()) : undefined;

  const goalEntries = metasAplicables(perfil).map((meta) => ({
    fullUrl: urn(generateId()),
    resource: goalDesdeMetaCatalogo(meta, { patient, now }),
  }));

  const taskCtx: TaskCtx = { patient, carePlan: carePlanUrn, now };
  const items = itemsAplicables(perfil).filter((item) => audiencias.includes(item.audiencia));
  const taskEntries = items.map((item) => ({ fullUrl: urn(generateId()), resource: taskDesdeItem(item, taskCtx) }));
  if (incluirEvaluaciones) {
    for (const evaluacion of evaluacionesAplicables(perfil)) {
      taskEntries.push({ fullUrl: urn(generateId()), resource: taskDesdeEvaluacion(evaluacion, taskCtx) });
    }
  }

  const careTeam = buildCareTeam(options.careTeam, {
    patient,
    lifeStageLabel: lifeStage?.label,
  });

  const condition = crearCondition && lifeStage ? buildCondition(lifeStage.coding, { patient, now }) : undefined;
  const addressed = conditionUrn ?? (lifeStage ? referenciaCondition(options.existingCondition) : undefined);

  const etiqueta = ETIQUETA_ESTADIO[perfil.estadio];
  const carePlan = buildCarePlan({
    patient,
    title: `${PB100D_NOMBRE} · Estadío ${perfil.estadio}`,
    description: `${etiqueta}. ${PB100D_PLAN_DESCRIPTION}`,
    goals: goalEntries.map((entry) => entry.fullUrl),
    tasks: taskEntries.map((entry) => entry.fullUrl),
    careTeam: careTeamUrn,
    condition: addressed,
    instantiatesCanonical: [options.planDefinitionUrl ?? PB100D_PLAN_DEFINITION_URL],
    now,
  });
  carePlan.extension = extensionesPerfil(perfil);
  const observacion = referenciaObservacion(options.ckmObservation);
  if (observacion) carePlan.supportingInfo = [observacion];
  if (now) {
    carePlan.period = { start: now, end: sumarDias(now, 100) };
  }

  const entries: BundleEntry[] = [];
  const add = (fullUrl: string, resource: Resource): void => {
    entries.push({ fullUrl, resource, request: { method: 'POST', url: resource.resourceType } });
  };

  if (condition && conditionUrn) add(conditionUrn, condition);
  add(careTeamUrn, careTeam);
  for (const entry of goalEntries) add(entry.fullUrl, entry.resource);
  add(carePlanUrn, carePlan);
  for (const entry of taskEntries) add(entry.fullUrl, entry.resource);

  return { resourceType: 'Bundle', type: 'transaction', entry: entries };
}

/** Builds the PB100D care plan and returns the individual resources plus the Bundle. */
export function buildPb100dCarePlan(options: BuildPb100dCarePlanOptions): Pb100dCarePlanResources {
  const bundle = buildPb100dCarePlanBundle(options);
  const resources = (bundle.entry ?? [])
    .map((entry) => entry.resource)
    .filter((resource): resource is Resource => resource !== undefined);

  const ofType = <T extends Resource>(resourceType: T['resourceType']): T[] =>
    resources.filter((resource): resource is T => resource.resourceType === resourceType);

  const carePlan = ofType<CarePlan>('CarePlan')[0];
  const careTeam = ofType<CareTeam>('CareTeam')[0];
  if (!carePlan || !careTeam) {
    throw new Error('Failed to assemble PB100D care plan resources.');
  }

  return {
    bundle,
    carePlan,
    careTeam,
    goals: ofType<Goal>('Goal'),
    tasks: ofType<Task>('Task'),
    condition: ofType<Condition>('Condition')[0],
  };
}
