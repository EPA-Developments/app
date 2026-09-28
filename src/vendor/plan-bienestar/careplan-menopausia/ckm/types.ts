/** CKM syndrome stage per the 2026 AHA/ACC/ADA/ASN guideline (Tabla 4). */
export type CkmStage = 0 | 1 | 2 | 3 | 4;

/** Stage 4 substage: 4b when kidney failure is present. */
export type CkmSubStage = '4a' | '4b';

/** KDIGO risk category from the eGFR x albuminuria heat map. */
export type RiesgoKdigo = 'bajo' | 'moderado' | 'alto' | 'muy-alto';

/** KDIGO GFR (G1-G5) and albuminuria (A1-A3) categories. */
export interface CategoriaKdigo {
  g?: 'G1' | 'G2' | 'G3a' | 'G3b' | 'G4' | 'G5';
  a?: 'A1' | 'A2' | 'A3';
  riesgo?: RiesgoKdigo;
}

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
  /** Under antihypertensive treatment counts as hypertension (Tabla 4). */
  antihypertensiveTreatment?: boolean;
  metabolicSyndrome?: boolean;
  chronicKidneyDisease?: boolean;
  /** Subclinical CVD evidence (CAC >= 100 or >= p75, plaque on CT angiography, low ABI). */
  subclinicalCvd?: boolean;
  /** Pre-heart failure by echo or biomarkers, without symptoms (Tabla 16): stage 3. */
  preHeartFailure?: boolean;
  /** Established clinical CVD of any kind (set when any specific flag below is set). */
  clinicalCvd?: boolean;
  /** Coronary disease: MI, ACS, angina, revascularisation or documented disease. */
  coronaryDisease?: boolean;
  /** Ischaemic stroke or TIA. */
  stroke?: boolean;
  /** Symptomatic heart failure, any ejection fraction. */
  heartFailure?: boolean;
  /** Symptomatic peripheral artery disease, revascularisation or vascular amputation. */
  peripheralArteryDisease?: boolean;
  /** Documented atrial fibrillation, any pattern. */
  atrialFibrillation?: boolean;
  /** Kidney failure (eGFR < 15 or dialysis): stage 4a -> 4b when CVD is present. */
  kidneyFailure?: boolean;
  /** Chronic dialysis. */
  dialysis?: boolean;
  /**
   * High predicted CVD risk (PREVENT-CVD 10 years >= 20 %), a stage-3 risk
   * equivalent. Computed from the PREVENT module and passed in, or derived from
   * `CkmInput.prevent`.
   */
  highPredictedRisk?: boolean;
}

/** PREVENT risks in percent, when available (30 to 79 years, no clinical CVD). */
export interface CkmPreventInput {
  /** Total CVD, 10 years. */
  cvd10?: number;
  /** ASCVD, 10 years. */
  ascvd10?: number;
  /** ASCVD, 30 years (30 to 59 years old). */
  ascvd30?: number;
  /** Heart failure, 10 years. */
  hf10?: number;
}

/** Structured inputs for CKM staging. All measurements optional. */
export interface CkmInput {
  sexo?: 'female' | 'male' | 'other' | 'unknown';
  /** Age in whole years (for age-conditioned catalog items). */
  edad?: number;
  /** Asian ancestry: BMI >= 23 and waist >= 80/90 cm thresholds (Tabla 4). */
  ancestriaAsiatica?: boolean;
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
  /** Coronary artery calcium, Agatston units. */
  cacAgatston?: number;
  /** Ankle-brachial index (lowest side). */
  itb?: number;
  prevent?: CkmPreventInput;
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
  /** KDIGO categories when eGFR or ACR are known. */
  kdigo?: CategoriaKdigo;
  /** Missing data domains (Spanish), to prompt the patient/team. */
  faltantes: string[];
  /** True when the four base domains (adiposidad, presion, glucemia, lipidos) have data. */
  datosSuficientes: boolean;
}
