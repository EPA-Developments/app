import type {
  Bundle,
  BundleEntry,
  CarePlan,
  CareTeam,
  Condition,
  Goal,
  Questionnaire,
  Resource,
  Task,
} from '@medplum/fhirtypes';
import { defaultIdGenerator, urn } from '../fhir/ids.js';
import { toReference } from '../fhir/codeable.js';
import { LIFE_STAGES } from '../model/lifeStage.js';
import { SNOMED } from '../terminology/snomed.js';
import { MENOPAUSE_PLAN, MENOPAUSE_PLAN_DEFINITION_URL } from '../content/menopausia/plan.js';
import type { BuildMenopauseCarePlanOptions } from './options.js';
import { buildGoal } from './goal.js';
import { buildTask } from './task.js';
import { buildCareTeam } from './careTeam.js';
import { buildCondition } from './condition.js';
import { buildMenopauseQuestionnaire } from './questionnaire.js';
import { buildCarePlan } from './carePlan.js';

/** The individual resources that make up a menopause care plan. */
export interface MenopauseCarePlanResources {
  bundle: Bundle;
  carePlan: CarePlan;
  careTeam: CareTeam;
  goals: Goal[];
  tasks: Task[];
  questionnaire?: Questionnaire;
  condition?: Condition;
}

/**
 * Builds a FHIR R4 transaction Bundle for the menopause cardiovascular care
 * plan. Internal references use `urn:uuid` placeholders resolved by the FHIR
 * server on submission; the Patient (and any care-team members) are referenced
 * as existing resources.
 *
 * POST to `[base]` (a Medplum/FHIR server) or `medplum.executeBatch(bundle)`.
 */
export function buildMenopauseCarePlanBundle(options: BuildMenopauseCarePlanOptions): Bundle {
  const generateId = options.idGenerator ?? defaultIdGenerator;
  const patient = toReference(options.patient);
  const { now } = options;
  const includeCondition = options.includeCondition ?? true;
  const existingQuestionnaireRef = options.existingQuestionnaire?.reference;
  // A server-side Questionnaire takes precedence: nothing to create in-bundle.
  const includeQuestionnaire = (options.includeQuestionnaire ?? true) && !existingQuestionnaireRef;
  const lifeStage = options.lifeStage ? LIFE_STAGES[options.lifeStage] : undefined;

  // Pre-generate urn:uuid placeholders so resources can cross-reference.
  const carePlanUrn = urn(generateId());
  const careTeamUrn = urn(generateId());
  const questionnaireUrn = includeQuestionnaire ? urn(generateId()) : undefined;
  const questionnaireRef = existingQuestionnaireRef ?? questionnaireUrn;
  const conditionUrn = includeCondition ? urn(generateId()) : undefined;

  const goalEntries = MENOPAUSE_PLAN.goals.map((template) => ({
    fullUrl: urn(generateId()),
    resource: buildGoal(template, { patient, now }),
  }));

  const taskEntries = MENOPAUSE_PLAN.activities.map((template) => ({
    fullUrl: urn(generateId()),
    resource: buildTask(template, {
      patient,
      carePlan: carePlanUrn,
      questionnaire: questionnaireRef,
      now,
    }),
  }));

  const careTeam = buildCareTeam(options.careTeam, {
    patient,
    lifeStageLabel: lifeStage?.label,
  });

  const condition = includeCondition
    ? buildCondition(lifeStage?.coding ?? SNOMED.menopausePresent, { patient, now })
    : undefined;

  const questionnaire = includeQuestionnaire ? buildMenopauseQuestionnaire({ now }) : undefined;

  const carePlan = buildCarePlan({
    patient,
    title: MENOPAUSE_PLAN.title,
    description: MENOPAUSE_PLAN.description,
    goals: goalEntries.map((entry) => entry.fullUrl),
    tasks: taskEntries.map((entry) => entry.fullUrl),
    careTeam: careTeamUrn,
    condition: conditionUrn,
    instantiatesCanonical: [options.planDefinitionUrl ?? MENOPAUSE_PLAN_DEFINITION_URL],
    now,
  });

  const entries: BundleEntry[] = [];
  const add = (fullUrl: string, resource: Resource): void => {
    entries.push({ fullUrl, resource, request: { method: 'POST', url: resource.resourceType } });
  };

  if (condition && conditionUrn) add(conditionUrn, condition);
  add(careTeamUrn, careTeam);
  for (const entry of goalEntries) add(entry.fullUrl, entry.resource);
  if (questionnaire && questionnaireUrn) add(questionnaireUrn, questionnaire);
  add(carePlanUrn, carePlan);
  for (const entry of taskEntries) add(entry.fullUrl, entry.resource);

  return { resourceType: 'Bundle', type: 'transaction', entry: entries };
}

/**
 * Builds the menopause care plan and returns the individual resources plus the
 * assembled transaction Bundle. Convenience for callers that prefer to create
 * resources individually (e.g. via `medplum.createResource`) rather than as a
 * batch.
 */
export function buildMenopauseCarePlan(
  options: BuildMenopauseCarePlanOptions,
): MenopauseCarePlanResources {
  const bundle = buildMenopauseCarePlanBundle(options);
  const resources = (bundle.entry ?? [])
    .map((entry) => entry.resource)
    .filter((resource): resource is Resource => resource !== undefined);

  const ofType = <T extends Resource>(resourceType: T['resourceType']): T[] =>
    resources.filter((resource): resource is T => resource.resourceType === resourceType);

  const carePlan = ofType<CarePlan>('CarePlan')[0];
  const careTeam = ofType<CareTeam>('CareTeam')[0];
  if (!carePlan || !careTeam) {
    throw new Error('Failed to assemble menopause care plan resources.');
  }

  return {
    bundle,
    carePlan,
    careTeam,
    goals: ofType<Goal>('Goal'),
    tasks: ofType<Task>('Task'),
    questionnaire: ofType<Questionnaire>('Questionnaire')[0],
    condition: ofType<Condition>('Condition')[0],
  };
}
