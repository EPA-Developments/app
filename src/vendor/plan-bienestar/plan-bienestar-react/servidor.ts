import {
  buildMenopausePlanDefinition,
  buildMenopauseQuestionnaire,
  MENOPAUSE_PLAN_DEFINITION_URL,
  MENOPAUSE_QUESTIONNAIRE_URL,
} from '@epa/careplan-menopausia';
import type { MedplumClient } from '@medplum/core';
import type { PlanDefinition, Questionnaire } from '@medplum/fhirtypes';

/**
 * "Click 1" of the setup: makes sure the plan's server-side resources exist
 * (idempotent): the PlanDefinition (the eligibility "sign") and the shared
 * screening Questionnaire that patient plans reference.
 *
 * Afterwards, administrators manage the plan entirely from the Medplum App:
 * toggling `status` (active/retired) or editing `useContext` changes who sees
 * the plan in every host app instantly — no redeploy ("click 2").
 */
export async function asegurarRecursosDelPlan(
  medplum: MedplumClient,
): Promise<{ planDefinition: PlanDefinition; questionnaire: Questionnaire }> {
  const hoy = new Date().toISOString().slice(0, 10);

  const definiciones = await medplum.searchResources('PlanDefinition', {
    url: MENOPAUSE_PLAN_DEFINITION_URL,
  });
  const planDefinition =
    definiciones[0] ??
    (await medplum.createResource<PlanDefinition>(buildMenopausePlanDefinition({ now: hoy })));

  const cuestionarios = await medplum.searchResources('Questionnaire', {
    url: MENOPAUSE_QUESTIONNAIRE_URL,
  });
  const questionnaire =
    cuestionarios[0] ??
    (await medplum.createResource<Questionnaire>(buildMenopauseQuestionnaire({ now: hoy })));

  return { planDefinition, questionnaire };
}

/**
 * @deprecated Use `asegurarRecursosDelPlan` — it also seeds the shared
 * Questionnaire, required under restrictive access policies.
 */
export async function asegurarPlanDefinition(medplum: MedplumClient): Promise<PlanDefinition> {
  const { planDefinition } = await asegurarRecursosDelPlan(medplum);
  return planDefinition;
}
