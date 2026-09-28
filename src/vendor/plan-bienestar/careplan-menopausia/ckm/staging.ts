import type { CategoriaKdigo, CkmCriterion, CkmInput, CkmResult, CkmStage, RiesgoKdigo } from './types.js';

/**
 * Thresholds for CKM staging, following Tabla 4 of the 2026 AHA/ACC/ADA/ASN
 * Guideline for Cardiovascular-Kidney-Metabolic Syndrome (Ndumele et al.,
 * Circulation 2026) and the KDIGO heat map for CKD risk. They are template
 * values for a health-promotion plan: the care team individualises them.
 */
export const CKM_LIMITES = {
  bmiSobrepeso: 25,
  /** Asian ancestry (Tabla 4). */
  bmiSobrepesoAsiatico: 23,
  cinturaMujerCm: 88,
  cinturaHombreCm: 102,
  /** Asian ancestry (Tabla 4). */
  cinturaMujerAsiaticaCm: 80,
  cinturaHombreAsiaticoCm: 90,
  glucosaPrediabetesMin: 100,
  glucosaDiabetes: 126,
  hba1cPrediabetesMin: 5.7,
  hba1cDiabetes: 6.5,
  /** Hypertriglyceridemia as a stage-2 risk factor (fasting; 175 non-fasting). */
  trigliceridosRiesgo: 150,
  /** Triglycerides criterion inside the metabolic-syndrome definition. */
  trigliceridosSindrome: 150,
  hdlBajoMujer: 50,
  hdlBajoHombre: 40,
  /** Hypertension: >= 130/80 on average, or antihypertensive treatment (2025 HTA guideline). */
  sistolicaHipertension: 130,
  diastolicaHipertension: 80,
  sistolicaSindrome: 130,
  diastolicaSindrome: 80,
  /** KDIGO: moderately increased albuminuria (A2). */
  acrModerado: 30,
  /** KDIGO: severely increased albuminuria (A3). */
  acrSevero: 300,
  /** KDIGO G3a. */
  egfrModerado: 60,
  /** KDIGO G3b. */
  egfrG3b: 45,
  /** KDIGO G4. */
  egfrSevero: 30,
  /** Kidney failure (G5): stage 4b with CVD. */
  egfrFalla: 15,
  /** Subclinical atherosclerosis: CAC >= 100 Agatston (or >= p75 in women and young adults). */
  cacSubclinico: 100,
  /** Low ankle-brachial index (signed by the project: <= 0.90). */
  itbBajo: 0.9,
  /** PREVENT-CVD 10 years >= 20 %: stage-3 risk equivalent. */
  preventCvdAlto: 20,
} as const;

/** Labels signed with the stage-1 catalog (27/09/2026). */
export const CKM_STAGE_LABEL: Record<CkmStage, string> = {
  0: 'Salud cardiometabólica preservada',
  1: 'Exceso de adiposidad o prediabetes',
  2: 'Factores de riesgo metabólicos o renales',
  3: 'Señales tempranas en corazón o riñón',
  4: 'Enfermedad cardiovascular establecida',
};

export function cinturaLimite(sexo: CkmInput['sexo'], ancestriaAsiatica = false): number {
  if (ancestriaAsiatica) {
    return sexo === 'male' ? CKM_LIMITES.cinturaHombreAsiaticoCm : CKM_LIMITES.cinturaMujerAsiaticaCm;
  }
  return sexo === 'male' ? CKM_LIMITES.cinturaHombreCm : CKM_LIMITES.cinturaMujerCm;
}

export function bmiLimite(ancestriaAsiatica = false): number {
  return ancestriaAsiatica ? CKM_LIMITES.bmiSobrepesoAsiatico : CKM_LIMITES.bmiSobrepeso;
}

function hdlLimite(sexo: CkmInput['sexo']): number {
  return sexo === 'male' ? CKM_LIMITES.hdlBajoHombre : CKM_LIMITES.hdlBajoMujer;
}

function presionAlta(input: CkmInput): boolean {
  return (
    (input.systolicMmHg !== undefined && input.systolicMmHg >= CKM_LIMITES.sistolicaHipertension) ||
    (input.diastolicMmHg !== undefined && input.diastolicMmHg >= CKM_LIMITES.diastolicaHipertension)
  );
}

/** Count of metabolic-syndrome criteria met (>= 3 of 5 => syndrome). */
export function criteriosSindromeMetabolico(input: CkmInput): number {
  let cumplidos = 0;
  if (input.waistCm !== undefined && input.waistCm >= cinturaLimite(input.sexo, input.ancestriaAsiatica)) cumplidos += 1;
  if (input.triglyceridesMgDl !== undefined && input.triglyceridesMgDl >= CKM_LIMITES.trigliceridosSindrome) cumplidos += 1;
  if (input.hdlMgDl !== undefined && input.hdlMgDl < hdlLimite(input.sexo)) cumplidos += 1;
  if (presionAlta(input) || input.conditions?.hypertension || input.conditions?.antihypertensiveTreatment) {
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
 * KDIGO categories and risk from the eGFR x albuminuria heat map, with the
 * simplification signed in the stage 2 and 3 catalogs (27/09/2026): very high =
 * eGFR < 30 (G4-G5), eGFR 30 a 44 with UACR >= 30 (G3b + A2/A3), or UACR >= 300
 * (A3) with any eGFR; high = G3b + A1 or G3a + A2; moderate = G3a + A1 or
 * G1-G2 + A2; low = G1-G2 with A1. A single known dimension is classified alone.
 */
export function categoriaKdigo(egfr?: number, acrMgG?: number): CategoriaKdigo {
  const categoria: CategoriaKdigo = {};
  if (egfr !== undefined) {
    if (egfr >= 90) categoria.g = 'G1';
    else if (egfr >= 60) categoria.g = 'G2';
    else if (egfr >= 45) categoria.g = 'G3a';
    else if (egfr >= 30) categoria.g = 'G3b';
    else if (egfr >= 15) categoria.g = 'G4';
    else categoria.g = 'G5';
  }
  if (acrMgG !== undefined) {
    if (acrMgG < CKM_LIMITES.acrModerado) categoria.a = 'A1';
    else if (acrMgG < CKM_LIMITES.acrSevero) categoria.a = 'A2';
    else categoria.a = 'A3';
  }

  const g = categoria.g;
  const a = categoria.a;
  let riesgo: RiesgoKdigo | undefined;
  if (g === 'G4' || g === 'G5' || a === 'A3' || (g === 'G3b' && a === 'A2')) {
    riesgo = 'muy-alto';
  } else if (g === 'G3b' || (g === 'G3a' && a === 'A2')) {
    riesgo = 'alto';
  } else if (g === 'G3a' || a === 'A2') {
    riesgo = 'moderado';
  } else if (g !== undefined || a !== undefined) {
    // G1-G2 with A1, or a single known dimension in the normal range.
    riesgo = 'bajo';
  }
  if (riesgo) categoria.riesgo = riesgo;
  return categoria;
}

/**
 * Deterministic CKM staging (0-4) from structured inputs, per Tabla 4 of the
 * 2026 guideline. The highest matched stage wins; stage 0 is only asserted when
 * the four base domains have data. The physician confirms the stage; this is
 * the proposal the system shows.
 */
export function evaluateCkmStage(input: CkmInput): CkmResult {
  const criterios: CkmCriterion[] = [];
  const marcar = (key: string, stage: CkmStage, label: string): void => {
    criterios.push({ key, stage, label });
  };
  const condiciones = input.conditions ?? {};
  const kdigo = categoriaKdigo(input.egfr, input.acrMgG);

  const cvdClinica =
    condiciones.clinicalCvd ||
    condiciones.coronaryDisease ||
    condiciones.stroke ||
    condiciones.heartFailure ||
    condiciones.peripheralArteryDisease ||
    condiciones.atrialFibrillation;
  const fallaRenal =
    condiciones.kidneyFailure || condiciones.dialysis || (input.egfr !== undefined && input.egfr < CKM_LIMITES.egfrFalla);

  // Stage 4: established clinical CVD --------------------------------------
  if (cvdClinica) {
    marcar('cvd-clinica', 4, 'Enfermedad cardiovascular diagnosticada');
  }
  if (condiciones.coronaryDisease) marcar('coronaria', 4, 'Enfermedad coronaria');
  if (condiciones.stroke) marcar('acv', 4, 'Accidente cerebrovascular o isquémico transitorio');
  if (condiciones.heartFailure) marcar('insuficiencia-cardiaca', 4, 'Insuficiencia cardíaca');
  if (condiciones.peripheralArteryDisease) marcar('eap', 4, 'Arteriopatía periférica');
  if (condiciones.atrialFibrillation) marcar('fibrilacion-auricular', 4, 'Fibrilación auricular');
  if (cvdClinica && fallaRenal) {
    marcar('falla-renal', 4, 'Falla renal (eGFR < 15 o diálisis)');
  }

  // Stage 3: subclinical CVD, pre-HF, very-high-risk CKD, high predicted risk --
  const cacSubclinico = input.cacAgatston !== undefined && input.cacAgatston >= CKM_LIMITES.cacSubclinico;
  const itbBajo = input.itb !== undefined && input.itb <= CKM_LIMITES.itbBajo;
  if (condiciones.subclinicalCvd || cacSubclinico || itbBajo) {
    marcar('cvd-subclinica', 3, 'Evidencia de enfermedad cardiovascular subclínica');
  }
  if (condiciones.preHeartFailure) {
    marcar('pre-insuficiencia-cardiaca', 3, 'Pre-insuficiencia cardíaca (eco o biomarcadores, sin síntomas)');
  }
  if (kdigo.riesgo === 'muy-alto') {
    marcar('rinon-muy-alto-riesgo', 3, 'Enfermedad renal crónica de muy alto riesgo (KDIGO)');
  }
  if (!cvdClinica && fallaRenal) {
    marcar('falla-renal', 3, 'Falla renal (eGFR < 15 o diálisis)');
  }
  const preventAlto =
    condiciones.highPredictedRisk ||
    (input.prevent?.cvd10 !== undefined && input.prevent.cvd10 >= CKM_LIMITES.preventCvdAlto);
  if (preventAlto) {
    marcar('riesgo-predicho-alto', 3, 'Riesgo cardiovascular predicho alto (PREVENT-CVD ≥ 20 %)');
  }

  // Stage 2: metabolic risk factors / CKD -----------------------------------
  if (
    condiciones.diabetes ||
    (input.fastingGlucoseMgDl !== undefined && input.fastingGlucoseMgDl >= CKM_LIMITES.glucosaDiabetes) ||
    (input.hba1cPercent !== undefined && input.hba1cPercent >= CKM_LIMITES.hba1cDiabetes)
  ) {
    marcar('diabetes', 2, 'Diabetes o glucemia en rango de diabetes');
  }
  if (condiciones.hypertension || condiciones.antihypertensiveTreatment || presionAlta(input)) {
    marcar('hipertension', 2, 'Hipertensión (PA ≥ 130/80 o tratamiento)');
  }
  if (input.triglyceridesMgDl !== undefined && input.triglyceridesMgDl >= CKM_LIMITES.trigliceridosRiesgo) {
    marcar('trigliceridos', 2, 'Triglicéridos elevados (≥ 150 mg/dL)');
  }
  if (condiciones.metabolicSyndrome || criteriosSindromeMetabolico(input) >= 3) {
    marcar('sindrome-metabolico', 2, 'Síndrome metabólico');
  }
  if (
    condiciones.chronicKidneyDisease ||
    kdigo.riesgo === 'moderado' ||
    kdigo.riesgo === 'alto' ||
    kdigo.riesgo === 'muy-alto'
  ) {
    marcar('enfermedad-renal', 2, 'Enfermedad renal crónica (riesgo moderado o mayor)');
  }

  // Stage 1: excess adiposity / prediabetes ---------------------------------
  if (input.bmi !== undefined && input.bmi >= bmiLimite(input.ancestriaAsiatica)) {
    marcar('imc', 1, 'Índice de masa corporal en sobrepeso u obesidad');
  }
  if (input.waistCm !== undefined && input.waistCm >= cinturaLimite(input.sexo, input.ancestriaAsiatica)) {
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
  if (input.systolicMmHg === undefined) faltantes.push('presión arterial');
  if (input.fastingGlucoseMgDl === undefined && input.hba1cPercent === undefined) faltantes.push('glucemia o HbA1c');
  if (input.triglyceridesMgDl === undefined) faltantes.push('perfil lipídico');
  if (input.acrMgG === undefined && input.egfr === undefined && !condiciones.chronicKidneyDisease) {
    faltantes.push('chequeo renal (albúmina/creatinina)');
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
  if (kdigo.g !== undefined || kdigo.a !== undefined) {
    result.kdigo = kdigo;
  }
  if (stage !== undefined) {
    result.label = CKM_STAGE_LABEL[stage];
  }
  if (stage === 4) {
    result.subStage = fallaRenal ? '4b' : '4a';
  }
  return result;
}
