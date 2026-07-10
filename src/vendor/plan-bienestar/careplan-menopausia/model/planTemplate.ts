import type { Coding } from '@medplum/fhirtypes';
import type { QuantityComparator } from '../fhir/codeable.js';
import type { WomanLifeStage } from './lifeStage.js';

/**
 * The 8 components of the AHA "Life's Essential 8" cardiovascular health score,
 * which form the lifestyle backbone of the plan, plus menopause-specific and
 * CKM (kidney) additions.
 */
export type Le8Domain =
  | 'dieta'
  | 'actividad-fisica'
  | 'nicotina'
  | 'sueno'
  | 'imc'
  | 'lipidos'
  | 'glucemia'
  | 'presion-arterial';

export type GoalCategoryKey = 'estilo-de-vida' | 'metabolico' | 'cardiovascular' | 'renal' | 'bienestar';

export type GoalPriorityKey = 'high' | 'medium' | 'low';

/** A numeric target for a Goal, mapped later to Goal.target detailQuantity/detailRange. */
export interface TargetSpec {
  low?: number;
  high?: number;
  unit: string;
  /** UCUM code for the unit, when available. */
  ucumCode?: string;
  /** Comparator when the target is a single bound (e.g. `<130 mg/dL`). */
  comparator?: QuantityComparator;
}

export interface GoalTemplate {
  key: string;
  category: GoalCategoryKey;
  le8Domain?: Le8Domain;
  /** Patient-facing description (Spanish). Maps to Goal.description.text. */
  description: string;
  /** Measured concept for Goal.target.measure (LOINC/SNOMED). */
  measure?: Coding;
  target?: TargetSpec;
  priority?: GoalPriorityKey;
  /** Clinical/AHA rationale. Maps to Goal.note. */
  rationale?: string;
}

export interface EducationTemplate {
  key: string;
  title: string;
  description: string;
  code?: Coding;
}

export interface MonitoringTemplate {
  key: string;
  label: string;
  code: Coding;
  unit?: string;
  /** Human-readable cadence, e.g. `semanal`, `trimestral`. */
  frequency?: string;
}

export type ActivityKind = 'educacion' | 'monitoreo' | 'conducta' | 'derivacion';

export type AdministrativeGender = 'female' | 'male' | 'other' | 'unknown';

/**
 * Declarative eligibility for a plan. Maps to `PlanDefinition.useContext`
 * (UsageContext `gender` / `age`), so the rule lives on the FHIR server as
 * editable data — not hardcoded in apps.
 */
export interface EligibilitySpec {
  /** Administrative genders the plan applies to. */
  genders?: AdministrativeGender[];
  /** Age range in whole years (inclusive bounds). */
  ageRange?: { low?: number; high?: number };
}

export interface ActivityTemplate {
  key: string;
  kind: ActivityKind;
  title: string;
  description: string;
  code?: Coding;
  /** When true, this activity asks the patient to complete the plan questionnaire. */
  usesQuestionnaire?: boolean;
}

export interface PlanTemplate {
  key: string;
  title: string;
  description: string;
  lifeStages: WomanLifeStage[];
  /** Default eligibility published on the PlanDefinition (editable server-side). */
  eligibility?: EligibilitySpec;
  goals: GoalTemplate[];
  education: EducationTemplate[];
  monitoring: MonitoringTemplate[];
  activities: ActivityTemplate[];
}
