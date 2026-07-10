/**
 * @epa/careplan-menopausia
 *
 * FHIR R4 resource factory for the Plan Bienestar 100 Dias cardiovascular care
 * plan for women in menopause. Grounded in the AHA Cardiovascular-Kidney-
 * Metabolic (CKM) framework (Ndumele et al.), the AHA menopause & CVD statement
 * (El Khoudary et al.) and "Life's Essential 8".
 *
 * Drop-in for FooMedical / Medplum React apps: build the resources here, then
 * submit the transaction Bundle (e.g. `medplum.executeBatch(bundle)`).
 */

// Primary API ----------------------------------------------------------------
export {
  buildMenopauseCarePlan,
  buildMenopauseCarePlanBundle,
  buildMenopausePlanDefinition,
  buildPlanDefinition,
  buildGoal,
  buildGoalTarget,
  buildTask,
  buildCareTeam,
  buildCondition,
  buildCarePlan,
  buildMenopauseQuestionnaire,
  goalCategoryConcept,
  goalPriorityConcept,
  usageContextsFromEligibility,
  ACTIVITY_KIND_LABEL,
  type MenopauseCarePlanResources,
  type BuildMenopauseCarePlanOptions,
  type BuildMenopausePlanDefinitionOptions,
  type PlanDefinitionContext,
  type CareTeamOptions,
  type GoalContext,
  type TaskContext,
  type CareTeamContext,
  type ConditionContext,
  type CarePlanContext,
  type QuestionnaireContext,
} from './builders/index.js';

// CKM staging (AHA/Ndumele 0-4) ------------------------------------------------
export {
  evaluateCkmStage,
  extractCkmInput,
  buildCkmStageObservation,
  CKM_LIMITES,
  CKM_STAGE_LABEL,
  type CkmStage,
  type CkmSubStage,
  type CkmCriterion,
  type CkmConditions,
  type CkmInput,
  type CkmResult,
  type CkmFhirContext,
  type CkmObservationContext,
} from './ckm/index.js';

// PREVENT risk (AHA/Khan 2024) -------------------------------------------------
export {
  calculatePrevent,
  preventDataFaltante,
  extractPreventInput,
  bandaAscvd,
  PREVENT_VERIFIED,
  PREVENT_CITATION,
  type PreventInput,
  type PreventResult,
  type PreventRiesgos,
  type PreventBanda,
  type PreventOutcome,
  type PreventSex,
  type PreventFhirContext,
} from './prevent/index.js';

// CKM assessment parameters + reference values (AHA/Ndumele) -------------------
export {
  PARAMETROS_CKM,
  parametrosParaSexo,
  clasificar,
  type ParametroCkm,
  type ParametroCategoria,
  type ParametroDireccion,
  type RangoReferencia,
} from './referencia/parametros.js';

// Eligibility (Patient vs PlanDefinition.useContext) ---------------------------
export {
  evaluateEligibility,
  calculateAge,
  type EligibilityResult,
  type EvaluateEligibilityOptions,
} from './eligibility.js';

// Clinical content (the plan template) ---------------------------------------
export {
  MENOPAUSE_PLAN,
  MENOPAUSE_PLAN_DEFINITION_URL,
  MENOPAUSE_GOALS,
  MENOPAUSE_EDUCATION,
  MENOPAUSE_MONITORING,
  MENOPAUSE_ACTIVITIES,
  MENOPAUSE_QUESTIONNAIRE_ITEMS,
  MENOPAUSE_QUESTIONNAIRE_URL,
} from './content/menopausia/index.js';

// Domain model ----------------------------------------------------------------
export {
  LIFE_STAGES,
  type WomanLifeStage,
  type LifeStageInfo,
  type AdministrativeGender,
  type EligibilitySpec,
  type Le8Domain,
  type GoalCategoryKey,
  type GoalPriorityKey,
  type TargetSpec,
  type GoalTemplate,
  type EducationTemplate,
  type MonitoringTemplate,
  type ActivityKind,
  type ActivityTemplate,
  type PlanTemplate,
} from './model/index.js';

// Terminology -----------------------------------------------------------------
export { SYSTEM, LOINC, SNOMED, type LoincKey, type SnomedKey } from './terminology/index.js';

// FHIR helpers ----------------------------------------------------------------
export {
  defaultIdGenerator,
  sequentialIdGenerator,
  urn,
  concept,
  textConcept,
  quantity,
  range,
  toReference,
  type IdGenerator,
  type QuantityComparator,
} from './fhir/index.js';
