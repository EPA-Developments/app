import type { CkmCriterion, CkmInput, CkmResult, CkmStage } from './types.js';

/**
 * Prevention-default thresholds for CKM staging, following the AHA
 * Presidential Advisory (Ndumele et al., Circulation 2023). They are template
 * values for a health-promotion plan — the care team individualises them —
 * and use general-population cutoffs (Asian-ancestry cutoffs pending).
 */
export const CKM_LIMITES = {
  bmiSobrepeso: 25,
  cinturaMujerCm: 88,
  cinturaHombreCm: 102,
  glucosaPrediabetesMin: 100,
  glucosaDiabetes: 126,
  hba1cPrediabetesMin: 5.7,
  hba1cDiabetes: 6.5,
  /** Hypertriglyceridemia as CKM stage-2 risk factor. */
  trigliceridosRiesgo: 135,
  /** Triglycerides criterion inside the metabolic-syndrome definition. */
  trigliceridosSindrome: 150,
  hdlBajoMujer: 50,
  hdlBajoHombre: 40,
  sistolicaHipertension: 130,
  diastolicaHipertension: 80,
  sistolicaSindrome: 130,
  diastolicaSindrome: 85,
  /** KDIGO: moderately increased albuminuria (A2). */
  acrModerado: 30,
  /** KDIGO: severely increased albuminuria (A3) — stage-3 risk equivalent. */
  acrSevero: 300,
  egfrModerado: 60,
  /** eGFR < 30 (G4+) — stage-3 risk equivalent (very-high-risk CKD, simplified). */
  egfrSevero: 30,
  /** Kidney failure (G5): stage 4b. */
  egfrFalla: 15,
} as const;

export const CKM_STAGE_LABEL: Record<CkmStage, string> = {
  0: 'Salud cardiometabolica preservada',
  1: 'Exceso de adiposidad o prediabetes',
  2: 'Factores de riesgo metabolicos o renales',
  3: 'Enfermedad cardiovascular subclinica o rinon de alto riesgo',
  4: 'Enfermedad cardiovascular establecida',
};

function cinturaLimite(sexo: CkmInput['sexo']): number {
  return sexo === 'male' ? CKM_LIMITES.cinturaHombreCm : CKM_LIMITES.cinturaMujerCm;
}

function hdlLimite(sexo: CkmInput['sexo']): number {
  return sexo === 'male' ? CKM_LIMITES.hdlBajoHombre : CKM_LIMITES.hdlBajoMujer;
}

/** Count of metabolic-syndrome criteria met (>=3 of 5 => syndrome). */
function criteriosSindromeMetabolico(input: CkmInput): number {
  let cumplidos = 0;
  if (input.waistCm !== undefined && input.waistCm >= cinturaLimite(input.sexo)) cumplidos += 1;
  if (input.triglyceridesMgDl !== undefined && input.triglyceridesMgDl >= CKM_LIMITES.trigliceridosSindrome) cumplidos += 1;
  if (input.hdlMgDl !== undefined && input.hdlMgDl < hdlLimite(input.sexo)) cumplidos += 1;
  if (
    (input.systolicMmHg !== undefined && input.systolicMmHg >= CKM_LIMITES.sistolicaSindrome) ||
    (input.diastolicMmHg !== undefined && input.diastolicMmHg >= CKM_LIMITES.diastolicaSindrome) ||
    input.conditions?.hypertension
  ) {
    cumplidos += 1;
  }
  if (
    (input.fastingGlucoseMgDl !== undefined && input.fastingGlucoseMgDl >= CKM_LIMITES.glucosaPrediabetesMin) ||
    input.conditions?.diabetes
  ) {
    cumplidos += 1;
  }
  return cumplidos;
}

/**
 * Deterministic CKM staging (0-4) from structured inputs. The highest matched
 * stage wins; stage 0 is only asserted when the four base domains have data.
 *
 * Simplifications documented for this version: very-high-risk CKD uses
 * eGFR < 30 or ACR >= 300 (full KDIGO matrix pending); the "high predicted
 * CVD risk" stage-3 pathway arrives with the PREVENT module.
 */
export function evaluateCkmStage(input: CkmInput): CkmResult {
  const criterios: CkmCriterion[] = [];
  const marcar = (key: string, stage: CkmStage, label: string): void => {
    criterios.push({ key, stage, label });
  };
  const condiciones = input.conditions ?? {};

  // Stage 4: established clinical CVD --------------------------------------
  if (condiciones.clinicalCvd) {
    marcar('cvd-clinica', 4, 'Enfermedad cardiovascular diagnosticada');
  }

  // Stage 3: subclinical CVD or very-high-risk kidney disease --------------
  if (condiciones.subclinicalCvd) {
    marcar('cvd-subclinica', 3, 'Evidencia de enfermedad cardiovascular subclinica');
  }
  if (input.egfr !== undefined && input.egfr < CKM_LIMITES.egfrSevero) {
    marcar('rinon-alto-riesgo', 3, 'Funcion renal severamente reducida');
  }
  if (input.acrMgG !== undefined && input.acrMgG >= CKM_LIMITES.acrSevero) {
    marcar('albuminuria-severa', 3, 'Albuminuria severamente aumentada');
  }
  if (condiciones.highPredictedRisk) {
    marcar('riesgo-predicho-alto', 3, 'Riesgo cardiovascular predicho alto (PREVENT)');
  }

  // Stage 2: metabolic risk factors / CKD -----------------------------------
  if (
    condiciones.diabetes ||
    (input.fastingGlucoseMgDl !== undefined && input.fastingGlucoseMgDl >= CKM_LIMITES.glucosaDiabetes) ||
    (input.hba1cPercent !== undefined && input.hba1cPercent >= CKM_LIMITES.hba1cDiabetes)
  ) {
    marcar('diabetes', 2, 'Diabetes o glucemia en rango de diabetes');
  }
  if (
    condiciones.hypertension ||
    (input.systolicMmHg !== undefined && input.systolicMmHg >= CKM_LIMITES.sistolicaHipertension) ||
    (input.diastolicMmHg !== undefined && input.diastolicMmHg >= CKM_LIMITES.diastolicaHipertension)
  ) {
    marcar('hipertension', 2, 'Presion arterial elevada o hipertension');
  }
  if (input.triglyceridesMgDl !== undefined && input.triglyceridesMgDl >= CKM_LIMITES.trigliceridosRiesgo) {
    marcar('trigliceridos', 2, 'Trigliceridos elevados');
  }
  if (condiciones.metabolicSyndrome || criteriosSindromeMetabolico(input) >= 3) {
    marcar('sindrome-metabolico', 2, 'Sindrome metabolico');
  }
  if (
    condiciones.chronicKidneyDisease ||
    (input.egfr !== undefined && input.egfr < CKM_LIMITES.egfrModerado) ||
    (input.acrMgG !== undefined && input.acrMgG >= CKM_LIMITES.acrModerado)
  ) {
    marcar('enfermedad-renal', 2, 'Enfermedad renal cronica (riesgo moderado o mayor)');
  }

  // Stage 1: excess adiposity / prediabetes ---------------------------------
  if (input.bmi !== undefined && input.bmi >= CKM_LIMITES.bmiSobrepeso) {
    marcar('imc', 1, 'Indice de masa corporal en sobrepeso u obesidad');
  }
  if (input.waistCm !== undefined && input.waistCm >= cinturaLimite(input.sexo)) {
    marcar('cintura', 1, 'Circunferencia de cintura aumentada');
  }
  if (
    (input.fastingGlucoseMgDl !== undefined &&
      input.fastingGlucoseMgDl >= CKM_LIMITES.glucosaPrediabetesMin &&
      input.fastingGlucoseMgDl < CKM_LIMITES.glucosaDiabetes) ||
    (input.hba1cPercent !== undefined &&
      input.hba1cPercent >= CKM_LIMITES.hba1cPrediabetesMin &&
      input.hba1cPercent < CKM_LIMITES.hba1cDiabetes)
  ) {
    marcar('prediabetes', 1, 'Glucemia en rango de prediabetes');
  }

  // Missing data domains -----------------------------------------------------
  const faltantes: string[] = [];
  if (input.bmi === undefined && input.waistCm === undefined) faltantes.push('peso y cintura');
  if (input.systolicMmHg === undefined) faltantes.push('presion arterial');
  if (input.fastingGlucoseMgDl === undefined && input.hba1cPercent === undefined) faltantes.push('glucemia o HbA1c');
  if (input.triglyceridesMgDl === undefined) faltantes.push('perfil lipidico');
  if (input.acrMgG === undefined && input.egfr === undefined && !condiciones.chronicKidneyDisease) {
    faltantes.push('chequeo renal (albumina/creatinina)');
  }

  const datosSuficientes =
    (input.bmi !== undefined || input.waistCm !== undefined) &&
    input.systolicMmHg !== undefined &&
    (input.fastingGlucoseMgDl !== undefined || input.hba1cPercent !== undefined) &&
    input.triglyceridesMgDl !== undefined;

  criterios.sort((a, b) => b.stage - a.stage);
  const maxima = criterios[0]?.stage;
  const stage: CkmStage | undefined = maxima !== undefined ? maxima : datosSuficientes ? 0 : undefined;

  const result: CkmResult = {
    stage,
    criterios,
    faltantes,
    datosSuficientes,
  };
  if (stage !== undefined) {
    result.label = CKM_STAGE_LABEL[stage];
  }
  if (stage === 4) {
    result.subStage =
      condiciones.kidneyFailure || (input.egfr !== undefined && input.egfr < CKM_LIMITES.egfrFalla)
        ? '4b'
        : '4a';
  }
  return result;
}
