import {
  BASELINE_QUESTIONNAIRE_URL,
  buildBaselineQuestionnaire,
  buildMenopausePlanDefinition,
  buildMenopauseQuestionnaire,
  buildPb100dPlanDefinition,
  MENOPAUSE_PLAN_DEFINITION_URL,
  MENOPAUSE_QUESTIONNAIRE_URL,
  PB100D_PLAN_DEFINITION_URL,
} from '@epa/careplan-menopausia';
import type { MedplumClient } from '@medplum/core';
import type { PlanDefinition, Questionnaire } from '@medplum/fhirtypes';

/**
 * "Click 1" of the setup: makes sure the plan's server-side resources exist
 * (idempotent): the PlanDefinitions (the eligibility "sign") and the shared
 * screening Questionnaire that patient plans reference.
 *
 * Two PlanDefinitions are seeded: the menopause plan the apps instantiate today
 * (`planDefinition`) and the single CKM-stage definition of the signed catalog
 * (`planDefinitionCkm`, `pb100d-ckm`), which the apps move to in a later phase.
 *
 * Afterwards, administrators manage the plan entirely from the Medplum App:
 * toggling `status` (active/retired) or editing `useContext` changes who sees
 * the plan in every host app instantly — no redeploy ("click 2").
 */
export async function asegurarRecursosDelPlan(
  medplum: MedplumClient,
): Promise<{
  planDefinition: PlanDefinition;
  planDefinitionCkm: PlanDefinition;
  questionnaire: Questionnaire;
  baseline: Questionnaire;
}> {
  const hoy = new Date().toISOString().slice(0, 10);

  const definiciones = await medplum.searchResources('PlanDefinition', {
    url: MENOPAUSE_PLAN_DEFINITION_URL,
  });
  const planDefinition =
    definiciones[0] ??
    (await medplum.createResource<PlanDefinition>(buildMenopausePlanDefinition({ now: hoy })));

  const definicionesCkm = await medplum.searchResources('PlanDefinition', {
    url: PB100D_PLAN_DEFINITION_URL,
  });
  const planDefinitionCkm =
    definicionesCkm[0] ??
    (await medplum.createResource<PlanDefinition>(buildPb100dPlanDefinition({ now: hoy })));

  const cuestionarios = await medplum.searchResources('Questionnaire', {
    url: MENOPAUSE_QUESTIONNAIRE_URL,
  });
  const questionnaire =
    cuestionarios[0] ??
    (await medplum.createResource<Questionnaire>(buildMenopauseQuestionnaire({ now: hoy })));

  // Cuestionario inicial: de sus respuestas sale el perfil con el que el
  // Dashboard personaliza el plan.
  const baselines = await medplum.searchResources('Questionnaire', { url: BASELINE_QUESTIONNAIRE_URL });
  const baseline =
    baselines[0] ?? (await medplum.createResource<Questionnaire>(buildBaselineQuestionnaire()));

  return { planDefinition, planDefinitionCkm, questionnaire, baseline };
}

/**
 * @deprecated Use `asegurarRecursosDelPlan` — it also seeds the shared
 * Questionnaire, required under restrictive access policies.
 */
export async function asegurarPlanDefinition(medplum: MedplumClient): Promise<PlanDefinition> {
  const { planDefinition } = await asegurarRecursosDelPlan(medplum);
  return planDefinition;
}
