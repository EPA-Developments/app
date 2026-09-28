import type {
  Extension,
  PlanDefinition,
  PlanDefinitionAction,
  PlanDefinitionGoal,
  PlanDefinitionGoalTarget,
} from '@medplum/fhirtypes';
import { concept, textConcept } from '../fhir/codeable.js';
import { SYSTEM } from '../terminology/systems.js';
import { EXT, SYS } from '../contrato/pb100d.js';
import {
  CATALOGO_PB100D,
  GUIA,
  PB100D_ELIGIBILITY,
  PB100D_FECHA_FIRMA,
  PB100D_FIRMANTES,
  PB100D_PLAN_DEFINITION_URL,
  PB100D_PLAN_DESCRIPTION,
  PB100D_PLAN_KEY,
  PB100D_PLAN_NAME,
  PB100D_PLAN_TITLE,
  PB100D_PLAN_VERSION,
} from '../content/ckm/index.js';
import {
  ETIQUETA_ESTADIO,
  MOMENTO_LABEL,
  RESPONSABLE_LABEL,
  TIPO_ITEM_LABEL,
  type Aplicabilidad,
  type Condicion,
  type EstadioCkm,
  type EvaluacionCatalogo,
  type ItemCatalogo,
  type MetaCatalogo,
  type Momento,
  type Responsable,
} from '../model/catalogo.js';
import type { EligibilitySpec } from '../model/planTemplate.js';
import { buildGoalTarget, goalCategoryConcept, goalPriorityConcept } from './goal.js';
import { usageContextsFromEligibility } from './planDefinition.js';

export interface BuildPb100dPlanDefinitionOptions {
  /** Overrides the canonical URL (tests, staging servers). */
  url?: string;
  name?: string;
  /** Publication status. Default `active`. */
  status?: 'draft' | 'active' | 'retired' | 'unknown';
  /** Overrides the signed eligibility (adults 30 to 79, both sexes). */
  eligibility?: EligibilitySpec;
  /** Business version. Default: the signature date. */
  version?: string;
  /** ISO date stamped on PlanDefinition.date. */
  now?: string;
  id?: string;
}

/** Extension: the catalog code of the item a Goal or Task was instantiated from. */
export function extensionCatalogoItem(codigo: string): Extension {
  return { url: EXT.catalogoItem, valueCode: codigo };
}

/** Extensions: one `catalogo-estadios` per stage the element is active in. */
export function extensionesEstadios(estadios: readonly EstadioCkm[]): Extension[] {
  return estadios.map((estadio) => ({ url: EXT.catalogoEstadios, valueCode: estadio }));
}

function extensionCondicion(condicion: Condicion, modo: 'todas' | 'alguna' | 'ninguna'): Extension {
  return {
    url: EXT.catalogoCondicion,
    extension: [
      { url: 'modo', valueCode: modo },
      { url: 'condicion', valueCoding: { system: SYS.catalogoCondicion, code: condicion } },
    ],
  };
}

/**
 * Extensions that carry an element's applicability (stages and conditions) so
 * the rule lives on the server, readable by any consumer without this package.
 * `modo` says how the condition combines: `todas` (all required), `alguna`
 * (at least one) or `ninguna` (must be absent).
 */
export function extensionesDeAplicabilidad(aplicabilidad: Aplicabilidad): Extension[] {
  return [
    ...extensionesEstadios(aplicabilidad.estadios),
    ...(aplicabilidad.condiciones ?? []).map((c) => extensionCondicion(c, 'todas')),
    ...(aplicabilidad.algunaDe ?? []).map((c) => extensionCondicion(c, 'alguna')),
    ...(aplicabilidad.excluye ?? []).map((c) => extensionCondicion(c, 'ninguna')),
  ];
}

/** Extensions: one `catalogo-momento` per plan moment the item runs at. */
export function extensionesMomentos(momentos: readonly Momento[]): Extension[] {
  return momentos.map((momento) => ({ url: EXT.catalogoMomento, valueCode: momento }));
}

/**
 * FHIRPath applicability over the physician-validated CKM stage Observation
 * (`%ckm`, code `estadio-ckm` in the EPA code system; values `estadio-ckm-N` or
 * `estadio-ckm-4-b`). Consumers bind `%ckm` to the latest such Observation.
 */
export function fhirPathEstadios(estadios: readonly EstadioCkm[]): string {
  const clausulas = estadios.map((e) => `code = 'estadio-ckm-${e}' or code.startsWith('estadio-ckm-${e}-')`);
  return (
    `%ckm.valueCodeableConcept.coding.where(system = '${SYSTEM.epa}')` +
    `.exists(${clausulas.join(' or ')})`
  );
}

function descripcionAplicabilidad(aplicabilidad: Aplicabilidad): string {
  const partes = [`Estadíos ${aplicabilidad.estadios.join(', ')}`];
  if (aplicabilidad.condiciones?.length) partes.push(`con ${aplicabilidad.condiciones.join(' y ')}`);
  if (aplicabilidad.algunaDe?.length) partes.push(`y alguna de ${aplicabilidad.algunaDe.join(', ')}`);
  if (aplicabilidad.excluye?.length) partes.push(`sin ${aplicabilidad.excluye.join(', ')}`);
  return partes.join('; ');
}

function citaFuente(fuente: string, cor?: string, loe?: string): string {
  const partes = [fuente];
  if (cor) partes.push(`COR ${cor}`);
  if (loe) partes.push(`LOE ${loe}`);
  return partes.join(' · ');
}

function participante(tipo: 'patient' | 'practitioner', responsable: Responsable): PlanDefinitionAction['participant'] {
  return [
    {
      type: tipo,
      role: concept({ system: SYSTEM.epa, code: responsable, display: RESPONSABLE_LABEL[responsable] }),
    },
  ];
}

function condicionAplicabilidad(aplicabilidad: Aplicabilidad): PlanDefinitionAction['condition'] {
  return [
    {
      kind: 'applicability',
      expression: {
        language: 'text/fhirpath',
        expression: fhirPathEstadios(aplicabilidad.estadios),
        description: descripcionAplicabilidad(aplicabilidad),
      },
    },
  ];
}

/** PlanDefinition.goal from a signed catalog goal. */
export function goalDesdeMeta(meta: MetaCatalogo): PlanDefinitionGoal {
  const goal: PlanDefinitionGoal = {
    id: meta.codigo,
    category: goalCategoryConcept(meta.category),
    description: textConcept(`${meta.nombre}: ${meta.valor}`),
    documentation: [{ type: 'citation', citation: meta.fuente }],
    extension: [extensionCatalogoItem(meta.codigo), ...extensionesDeAplicabilidad(meta)],
  };
  if (meta.priority) goal.priority = goalPriorityConcept(meta.priority);
  const target = buildGoalTarget({
    key: meta.codigo,
    category: meta.category,
    description: meta.valor,
    measure: meta.measure,
    target: meta.target,
  });
  if (target) goal.target = [target as PlanDefinitionGoalTarget];
  return goal;
}

/** PlanDefinition.action from a signed catalog item (persona or profesional). */
export function actionDesdeItem(item: ItemCatalogo): PlanDefinitionAction {
  const action: PlanDefinitionAction = {
    id: item.codigo,
    title: item.titulo,
    description: item.texto,
    code: [
      {
        coding: [
          { system: SYS.catalogo, code: item.codigo, display: item.titulo },
          { system: SYSTEM.epa, code: item.tipo, display: TIPO_ITEM_LABEL[item.tipo] },
        ],
        text: TIPO_ITEM_LABEL[item.tipo],
      },
    ],
    participant: participante(item.audiencia === 'persona' ? 'patient' : 'practitioner', item.responsable),
    condition: condicionAplicabilidad(item),
    documentation: [{ type: 'citation', citation: citaFuente(item.fuente, item.cor, item.loe) }],
    extension: [...extensionesDeAplicabilidad(item), ...extensionesMomentos(item.momentos)],
  };
  if (item.racional) action.textEquivalent = item.racional;
  if (item.tipo === 'alerta' && item.cor === '3') action.priority = 'asap';
  return action;
}

/** PlanDefinition.action from a signed catalog evaluation (what is measured and when). */
export function actionDesdeEvaluacion(evaluacion: EvaluacionCatalogo): PlanDefinitionAction {
  const codes: PlanDefinitionAction['code'] = [
    {
      coding: [
        { system: SYS.catalogo, code: evaluacion.codigo, display: evaluacion.label },
        { system: SYSTEM.epa, code: 'evaluacion', display: TIPO_ITEM_LABEL.evaluacion },
      ],
      text: TIPO_ITEM_LABEL.evaluacion,
    },
  ];
  if (evaluacion.code) codes.push(concept(evaluacion.code));
  const momentos = evaluacion.momentos.map((m) => MOMENTO_LABEL[m]).join(', ');
  const action: PlanDefinitionAction = {
    id: evaluacion.codigo,
    title: evaluacion.label,
    description: evaluacion.despues ? `${momentos}. Después del plan: ${evaluacion.despues}.` : `${momentos}.`,
    code: codes,
    participant: participante('practitioner', 'equipo'),
    condition: condicionAplicabilidad(evaluacion),
    documentation: [{ type: 'citation', citation: evaluacion.fuente }],
    extension: [...extensionesDeAplicabilidad(evaluacion), ...extensionesMomentos(evaluacion.momentos)],
  };
  return action;
}

/**
 * The single PlanDefinition of the Plan Bienestar 100 Días by CKM stage.
 *
 * One definition for the five stages: every goal and action carries the stages
 * and conditions that activate it (contract extensions) plus a FHIRPath
 * applicability over the physician-validated `estadio-ckm` Observation.
 * Eligibility as signed: adults 30 to 79, both sexes. Pharmacology only reaches
 * the professional (participant `practitioner`); the person never sees it.
 */
export function buildPb100dPlanDefinition(options: BuildPb100dPlanDefinitionOptions = {}): PlanDefinition {
  const eligibility = options.eligibility ?? PB100D_ELIGIBILITY;

  const planDefinition: PlanDefinition = {
    resourceType: 'PlanDefinition',
    url: options.url ?? PB100D_PLAN_DEFINITION_URL,
    name: options.name ?? PB100D_PLAN_NAME,
    title: PB100D_PLAN_TITLE,
    status: options.status ?? 'active',
    version: options.version ?? PB100D_PLAN_VERSION,
    description: PB100D_PLAN_DESCRIPTION,
    publisher: 'EPA Bienestar IA',
    approvalDate: PB100D_FECHA_FIRMA,
    author: PB100D_FIRMANTES.map((name) => ({ name })),
    type: concept({
      system: SYSTEM.planDefinitionType,
      code: 'clinical-protocol',
      display: 'Clinical Protocol',
    }),
    identifier: [{ system: SYSTEM.epa, value: PB100D_PLAN_KEY }],
    topic: [
      concept({ system: SYSTEM.epa, code: 'ckm', display: 'Síndrome cardio-renal-metabólico (CKM)' }),
      concept({ system: SYSTEM.epa, code: 'le8', display: "Life's Essential 8" }),
    ],
    relatedArtifact: [
      {
        type: 'citation',
        label: GUIA,
        citation:
          '2026 AHA/ACC/ADA/ASN Guideline for Cardiovascular-Kidney-Metabolic Syndrome (Ndumele et al., Circulation 2026)',
      },
      {
        type: 'documentation',
        label: 'Catálogo firmado',
        display: `Catálogo PB100D por estadío CKM, firmado el ${PB100D_FECHA_FIRMA} (docs/catalogo-pb100d/)`,
      },
    ],
    goal: CATALOGO_PB100D.metas.map(goalDesdeMeta),
    action: [
      ...CATALOGO_PB100D.items.map(actionDesdeItem),
      ...CATALOGO_PB100D.evaluaciones.map(actionDesdeEvaluacion),
    ],
    extension: Object.entries(ETIQUETA_ESTADIO).map(([estadio, etiqueta]) => ({
      url: EXT.catalogoEstadios,
      valueCoding: { system: SYSTEM.epa, code: `estadio-ckm-${estadio}`, display: etiqueta },
    })),
  };

  const useContext = usageContextsFromEligibility(eligibility);
  if (useContext.length > 0) planDefinition.useContext = useContext;
  if (options.now) planDefinition.date = options.now;
  if (options.id) planDefinition.id = options.id;

  return planDefinition;
}
