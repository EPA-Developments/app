import type { PlanTemplate } from '../../model/planTemplate.js';
import { MENOPAUSE_GOALS } from './goals.js';
import { MENOPAUSE_EDUCATION } from './education.js';
import { MENOPAUSE_MONITORING } from './monitoring.js';
import { MENOPAUSE_ACTIVITIES } from './activities.js';

/**
 * The menopause cardiovascular health plan template.
 *
 * First plan of the EPA "Salud de la Mujer" line within Plan Bienestar 100 Dias.
 * Grounded in:
 *  - AHA Presidential Advisory on Cardiovascular-Kidney-Metabolic (CKM) Health
 *    (Ndumele et al., Circulation 2023).
 *  - AHA Scientific Statement "Menopause Transition and Cardiovascular Disease
 *    Risk" (El Khoudary et al., Circulation 2020).
 *  - AHA "Life's Essential 8" cardiovascular health metrics.
 */
export const MENOPAUSE_PLAN: PlanTemplate = {
  key: 'menopausia-cardiovascular',
  title: 'Plan cardiovascular en menopausia',
  description:
    'Plan de promocion de la salud cardiovascular para mujeres en la transicion menopausica y posmenopausia, con metas de estilo de vida (Life’s Essential 8), educacion y monitoreo cardiometabolico y renal.',
  lifeStages: ['perimenopausia', 'posmenopausia', 'menopausia-prematura', 'menopausia-quirurgica'],
  eligibility: {
    genders: ['female'],
    ageRange: { low: 45, high: 65 },
  },
  goals: MENOPAUSE_GOALS,
  education: MENOPAUSE_EDUCATION,
  monitoring: MENOPAUSE_MONITORING,
  activities: MENOPAUSE_ACTIVITIES,
};

/**
 * Stable canonical URL of the menopause PlanDefinition. Apps discover the plan
 * (and CarePlans instantiated from it) through this URL.
 */
export const MENOPAUSE_PLAN_DEFINITION_URL =
  'https://epa-bienestar.ar/fhir/PlanDefinition/menopausia-cardiovascular';
