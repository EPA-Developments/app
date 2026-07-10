import type {
  PlanDefinition,
  PlanDefinitionAction,
  PlanDefinitionGoal,
  PlanDefinitionGoalTarget,
  UsageContext,
} from '@medplum/fhirtypes';
import { concept, quantity, range, textConcept } from '../fhir/codeable.js';
import { SYSTEM } from '../terminology/systems.js';
import { SNOMED } from '../terminology/snomed.js';
import type { AdministrativeGender, EligibilitySpec, PlanTemplate } from '../model/planTemplate.js';
import { MENOPAUSE_PLAN, MENOPAUSE_PLAN_DEFINITION_URL } from '../content/menopausia/plan.js';
import { MENOPAUSE_QUESTIONNAIRE_URL } from '../content/menopausia/questionnaire.js';
import { buildGoalTarget, goalCategoryConcept, goalPriorityConcept } from './goal.js';
import { ACTIVITY_KIND_LABEL } from './task.js';

const GENDER_LABEL: Record<AdministrativeGender, string> = {
  female: 'Femenino',
  male: 'Masculino',
  other: 'Otro',
  unknown: 'Desconocido',
};

/**
 * Maps an EligibilitySpec onto FHIR UsageContext entries (`gender` + `age`).
 * This is the data an administrator edits on the server to widen/narrow who
 * sees the plan — the "2 clicks" management, no app redeploy involved.
 */
export function usageContextsFromEligibility(spec: EligibilitySpec): UsageContext[] {
  const contexts: UsageContext[] = [];

  for (const gender of spec.genders ?? []) {
    contexts.push({
      code: { system: SYSTEM.usageContextType, code: 'gender', display: 'Gender' },
      valueCodeableConcept: concept({
        system: SYSTEM.administrativeGender,
        code: gender,
        display: GENDER_LABEL[gender],
      }),
    });
  }

  if (spec.ageRange && (spec.ageRange.low !== undefined || spec.ageRange.high !== undefined)) {
    contexts.push({
      code: { system: SYSTEM.usageContextType, code: 'age', display: 'Age Range' },
      valueRange: range(
        spec.ageRange.low !== undefined ? quantity(spec.ageRange.low, 'anios', 'a') : undefined,
        spec.ageRange.high !== undefined ? quantity(spec.ageRange.high, 'anios', 'a') : undefined,
      ),
    });
  }

  return contexts;
}

export interface PlanDefinitionContext {
  /** Stable canonical URL for the definition. */
  url: string;
  /** Computer-friendly name (PascalCase). */
  name?: string;
  /** Publication status. Default `active` (visible to eligible patients). */
  status?: 'draft' | 'active' | 'retired' | 'unknown';
  /** Overrides the template's eligibility (e.g. widen the age range). */
  eligibility?: EligibilitySpec;
  /** Canonical URL of the screening Questionnaire linked from actions. */
  questionnaireUrl?: string;
  /** Business version, e.g. `0.2.0`. */
  version?: string;
  /** ISO date stamped on PlanDefinition.date. */
  now?: string;
  id?: string;
}

/**
 * Builds a FHIR PlanDefinition from a plan template. The definition is the
 * server-side "source of truth" of the plan: apps query active definitions,
 * evaluate `useContext` eligibility against the logged-in Patient and offer
 * the plan only when it matches.
 */
export function buildPlanDefinition(template: PlanTemplate, ctx: PlanDefinitionContext): PlanDefinition {
  const eligibility = ctx.eligibility ?? template.eligibility ?? {};

  const goals: PlanDefinitionGoal[] = template.goals.map((goalTemplate) => {
    const goal: PlanDefinitionGoal = {
      category: goalCategoryConcept(goalTemplate.category),
      description: textConcept(goalTemplate.description),
    };
    if (goalTemplate.priority) goal.priority = goalPriorityConcept(goalTemplate.priority);
    const target = buildGoalTarget(goalTemplate);
    if (target) goal.target = [target as PlanDefinitionGoalTarget];
    return goal;
  });

  const actions: PlanDefinitionAction[] = template.activities.map((activity) => {
    const action: PlanDefinitionAction = {
      id: activity.key,
      title: activity.title,
      description: activity.description,
      code: [
        {
          coding: [
            { system: SYSTEM.epa, code: activity.kind, display: ACTIVITY_KIND_LABEL[activity.kind] },
          ],
          text: ACTIVITY_KIND_LABEL[activity.kind],
        },
      ],
    };
    if (activity.usesQuestionnaire && ctx.questionnaireUrl) {
      action.definitionCanonical = ctx.questionnaireUrl;
    }
    return action;
  });

  const planDefinition: PlanDefinition = {
    resourceType: 'PlanDefinition',
    url: ctx.url,
    status: ctx.status ?? 'active',
    title: template.title,
    description: template.description,
    publisher: 'EPA Bienestar IA',
    type: concept({
      system: SYSTEM.planDefinitionType,
      code: 'clinical-protocol',
      display: 'Clinical Protocol',
    }),
    identifier: [{ system: SYSTEM.epa, value: template.key }],
    goal: goals,
    action: actions,
  };

  const useContext = usageContextsFromEligibility(eligibility);
  if (useContext.length > 0) planDefinition.useContext = useContext;

  if (ctx.name) planDefinition.name = ctx.name;
  if (ctx.version) planDefinition.version = ctx.version;
  if (ctx.now) planDefinition.date = ctx.now;
  if (ctx.id) planDefinition.id = ctx.id;

  return planDefinition;
}

export type BuildMenopausePlanDefinitionOptions = Omit<PlanDefinitionContext, 'url' | 'questionnaireUrl'> &
  Partial<Pick<PlanDefinitionContext, 'url' | 'questionnaireUrl'>>;

/**
 * The menopause cardiovascular PlanDefinition: eligible for women aged 45-65
 * by default (editable on the server via `useContext`).
 */
export function buildMenopausePlanDefinition(
  options: BuildMenopausePlanDefinitionOptions = {},
): PlanDefinition {
  const planDefinition = buildPlanDefinition(MENOPAUSE_PLAN, {
    url: MENOPAUSE_PLAN_DEFINITION_URL,
    name: 'PlanCardiovascularMenopausia',
    questionnaireUrl: MENOPAUSE_QUESTIONNAIRE_URL,
    ...options,
  });
  planDefinition.topic = [concept(SNOMED.menopausePresent)];
  return planDefinition;
}
