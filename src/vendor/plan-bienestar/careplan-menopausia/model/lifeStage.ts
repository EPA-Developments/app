import type { Coding } from '@medplum/fhirtypes';
import { SNOMED } from '../terminology/snomed.js';

/**
 * Stage of the menopause transition. The first EPA "Salud de la Mujer" plan
 * targets these; other female life stages (embarazo, pre-menopausia joven,
 * etc.) will be added as separate plan templates.
 */
export type WomanLifeStage =
  | 'perimenopausia'
  | 'posmenopausia'
  | 'menopausia-prematura'
  | 'menopausia-quirurgica';

export interface LifeStageInfo {
  stage: WomanLifeStage;
  /** Spanish patient-facing label */
  label: string;
  /**
   * SNOMED CT coding for the associated condition/finding. Some of these are
   * still flagged `TODO confirm` in `terminology/snomed.ts`.
   */
  coding: Coding;
}

export const LIFE_STAGES: Record<WomanLifeStage, LifeStageInfo> = {
  perimenopausia: {
    stage: 'perimenopausia',
    label: 'Perimenopausia',
    coding: SNOMED.perimenopausalState,
  },
  posmenopausia: {
    stage: 'posmenopausia',
    label: 'Posmenopausia',
    coding: SNOMED.postmenopausalState,
  },
  'menopausia-prematura': {
    stage: 'menopausia-prematura',
    label: 'Menopausia prematura',
    coding: SNOMED.prematureMenopause,
  },
  'menopausia-quirurgica': {
    stage: 'menopausia-quirurgica',
    label: 'Menopausia quirurgica',
    coding: SNOMED.surgicalMenopause,
  },
};
