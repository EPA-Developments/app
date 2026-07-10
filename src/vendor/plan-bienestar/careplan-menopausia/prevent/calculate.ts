import {
  COEFFICIENTS_10Y,
  COEFFICIENTS_30Y,
  MMOL_PER_MGDL,
  PREVENT_VERIFIED,
  type PreventCoefficients,
  type PreventSex,
} from './coefficients.js';

/** Structured inputs for the PREVENT base model. Cholesterol in mg/dL. */
export interface PreventInput {
  sexo: PreventSex;
  /** Age in years (model valid 30-79). */
  edad: number;
  /** Total cholesterol mg/dL (used with HDL to derive non-HDL). */
  colesterolTotalMgDl?: number;
  /** Non-HDL cholesterol mg/dL (takes precedence over total-HDL). */
  colesterolNoHdlMgDl?: number;
  hdlMgDl?: number;
  systolicMmHg?: number;
  bmi?: number;
  /** eGFR mL/min/1.73m2. */
  egfr?: number;
  diabetes?: boolean;
  fumadorActual?: boolean;
  tratamientoHipertension?: boolean;
  usaEstatina?: boolean;
}

export interface PreventRiesgos {
  /** 10-year risk (%) for total CVD, ASCVD and heart failure. */
  totalCvd: number;
  ascvd: number;
  heartFailure: number;
}

export interface PreventResult {
  diezAnios: PreventRiesgos;
  treintaAnios: PreventRiesgos;
  /** Fields that were missing (Spanish), for prompting the patient. */
  faltantes: string[];
}

/** Non-HDL cholesterol in mmol/L, centered at 3.5. Returns undefined if unknown. */
function nonHdlTerm(input: PreventInput): number | undefined {
  const mgdl =
    input.colesterolNoHdlMgDl ??
    (input.colesterolTotalMgDl !== undefined && input.hdlMgDl !== undefined
      ? input.colesterolTotalMgDl - input.hdlMgDl
      : undefined);
  if (mgdl === undefined) return undefined;
  return mgdl * MMOL_PER_MGDL - 3.5;
}

function hdlTerm(input: PreventInput): number | undefined {
  if (input.hdlMgDl === undefined) return undefined;
  return (input.hdlMgDl * MMOL_PER_MGDL - 1.3) / 0.3;
}

interface Terms {
  age: number;
  nonHdl: number;
  hdl: number;
  sbpLow: number;
  sbpHigh: number;
  bmiLow: number;
  bmiHigh: number;
  egfrLow: number;
  egfrHigh: number;
  diabetes: number;
  smoking: number;
  bpMed: number;
  statin: number;
}

function buildTerms(input: PreventInput): Terms {
  const age = (input.edad - 55) / 10;
  const sbp = input.systolicMmHg ?? 130;
  const bmi = input.bmi ?? 25;
  const egfr = input.egfr ?? 90;
  return {
    age,
    nonHdl: nonHdlTerm(input) ?? 0,
    hdl: hdlTerm(input) ?? 0,
    sbpLow: (Math.min(sbp, 110) - 110) / 20,
    sbpHigh: (Math.max(sbp, 110) - 130) / 20,
    bmiLow: (Math.min(bmi, 30) - 25) / 5,
    bmiHigh: (Math.max(bmi, 30) - 30) / 5,
    egfrLow: (Math.min(egfr, 60) - 60) / -15,
    egfrHigh: (Math.max(egfr, 60) - 90) / -15,
    diabetes: input.diabetes ? 1 : 0,
    smoking: input.fumadorActual ? 1 : 0,
    bpMed: input.tratamientoHipertension ? 1 : 0,
    statin: input.usaEstatina ? 1 : 0,
  };
}

function logistic(logOdds: number): number {
  return (1 / (1 + Math.exp(-logOdds))) * 100;
}

function riskFor(c: PreventCoefficients, t: Terms): number {
  let sum = c.intercept;
  sum += c.age * t.age;
  sum += (c.nonHdl ?? 0) * t.nonHdl;
  sum += (c.hdl ?? 0) * t.hdl;
  sum += c.sbpLow * t.sbpLow;
  sum += c.sbpHigh * t.sbpHigh;
  sum += (c.bmiLow ?? 0) * t.bmiLow;
  sum += (c.bmiHigh ?? 0) * t.bmiHigh;
  sum += c.egfrLow * t.egfrLow;
  sum += c.egfrHigh * t.egfrHigh;
  sum += c.diabetes * t.diabetes;
  sum += c.smoking * t.smoking;
  sum += c.bpMed * t.bpMed;
  sum += (c.statin ?? 0) * t.statin;
  sum += c.bpMedSbp * (t.bpMed * t.sbpHigh);
  sum += (c.statinNonHdl ?? 0) * (t.statin * t.nonHdl);
  sum += (c.ageNonHdl ?? 0) * (t.age * t.nonHdl);
  sum += (c.ageHdl ?? 0) * (t.age * t.hdl);
  sum += c.ageSbp * (t.age * t.sbpHigh);
  sum += (c.ageBmi ?? 0) * (t.age * t.bmiHigh);
  sum += c.ageDiabetes * (t.age * t.diabetes);
  sum += c.ageSmoking * (t.age * t.smoking);
  sum += c.ageEgfr * (t.age * t.egfrLow);
  return Math.round(logistic(sum) * 10) / 10;
}

function riesgos(set: (typeof COEFFICIENTS_10Y)[PreventSex], t: Terms): PreventRiesgos {
  return {
    totalCvd: riskFor(set.totalCvd, t),
    ascvd: riskFor(set.ascvd, t),
    heartFailure: riskFor(set.heartFailure, t),
  };
}

/**
 * Whether PREVENT can be computed: the base model needs age, sex, cholesterol
 * (total+HDL or non-HDL), SBP and eGFR. Missing BMI/flags default to reference.
 */
export function preventDataFaltante(input: PreventInput): string[] {
  const faltantes: string[] = [];
  if (nonHdlTerm(input) === undefined) faltantes.push('colesterol total y HDL');
  if (input.hdlMgDl === undefined) faltantes.push('colesterol HDL');
  if (input.systolicMmHg === undefined) faltantes.push('presion arterial');
  if (input.egfr === undefined) faltantes.push('funcion renal (eGFR)');
  return [...new Set(faltantes)];
}

/**
 * Computes 10- and 30-year PREVENT risk (base model) for total CVD, ASCVD and
 * heart failure. Returns `undefined` when cholesterol is missing (the model
 * cannot run) or coefficients are unverified.
 */
export function calculatePrevent(input: PreventInput): PreventResult | undefined {
  if (!PREVENT_VERIFIED) return undefined;
  if (nonHdlTerm(input) === undefined || hdlTerm(input) === undefined) return undefined;

  const terms = buildTerms(input);
  return {
    diezAnios: riesgos(COEFFICIENTS_10Y[input.sexo], terms),
    treintaAnios: riesgos(COEFFICIENTS_30Y[input.sexo], terms),
    faltantes: preventDataFaltante(input),
  };
}

/** AHA risk band for 10-year ASCVD: bajo <5, limite 5-7.5, intermedio 7.5-20, alto >=20. */
export type PreventBanda = 'bajo' | 'limite' | 'intermedio' | 'alto';

export function bandaAscvd(ascvd10: number): PreventBanda {
  if (ascvd10 < 5) return 'bajo';
  if (ascvd10 < 7.5) return 'limite';
  if (ascvd10 < 20) return 'intermedio';
  return 'alto';
}
