/** CKM syndrome stage per the AHA Presidential Advisory (Ndumele et al., 2023). */
export type CkmStage = 0 | 1 | 2 | 3 | 4;

/** Stage 4 substage: 4b when kidney failure is present. */
export type CkmSubStage = '4a' | '4b';

/** A matched staging criterion, with a patient-safe Spanish label. */
export interface CkmCriterion {
  key: string;
  stage: CkmStage;
  label: string;
}

/** Diagnosed conditions relevant to CKM staging (from FHIR Conditions or direct flags). */
export interface CkmConditions {
  diabetes?: boolean;
  hypertension?: boolean;
  metabolicSyndrome?: boolean;
  chronicKidneyDisease?: boolean;
  /** Subclinical CVD evidence (e.g. CAC > 0, imaging). Manual/imaging input for now. */
  subclinicalCvd?: boolean;
  /** Established clinical CVD (CHD/MI, stroke, HF, PAD, AF). */
  clinicalCvd?: boolean;
  /** Kidney failure (ESRD / dialysis): switches stage 4a -> 4b. */
  kidneyFailure?: boolean;
  /**
   * High predicted CVD risk (PREVENT), a stage-3 risk equivalent per Ndumele.
   * Computed from the PREVENT module and passed in.
   */
  highPredictedRisk?: boolean;
}

/** Structured inputs for CKM staging. All measurements optional. */
export interface CkmInput {
  sexo?: 'female' | 'male' | 'other' | 'unknown';
  bmi?: number;
  waistCm?: number;
  systolicMmHg?: number;
  diastolicMmHg?: number;
  fastingGlucoseMgDl?: number;
  hba1cPercent?: number;
  triglyceridesMgDl?: number;
  hdlMgDl?: number;
  /** Urine albumin/creatinine ratio in mg/g. */
  acrMgG?: number;
  /** Estimated GFR in mL/min/1.73m2. */
  egfr?: number;
  conditions?: CkmConditions;
}

export interface CkmResult {
  /**
   * The computed stage. Undefined when no criterion matched AND the data is
   * insufficient to assert stage 0 (never claim ideal health without data).
   */
  stage?: CkmStage;
  subStage?: CkmSubStage;
  /** Spanish label of the stage. */
  label?: string;
  /** Matched criteria, highest stage first. */
  criterios: CkmCriterion[];
  /** Missing data domains (Spanish), to prompt the patient/team. */
  faltantes: string[];
  /** True when the four base domains (adiposidad, presion, glucemia, lipidos) have data. */
  datosSuficientes: boolean;
}
