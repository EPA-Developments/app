import type { Coding } from '@medplum/fhirtypes';
import { SYSTEM } from './systems.js';

function loinc(code: string, display: string): Coding {
  return { system: SYSTEM.loinc, code, display };
}

/**
 * LOINC codings for the observations tracked by the menopause care plan.
 *
 * Codes reused from the EPA Bienestar "Salud Digital / Interoperabilidad" table
 * and verified against loinc.org at authoring time. The CKM lab panel
 * (non-HDL, fasting glucose, HbA1c, urine ACR) and lipid/kidney markers were
 * cross-checked individually.
 */
export const LOINC = {
  // Anthropometry --------------------------------------------------------
  bodyWeight: loinc('29463-7', 'Body weight'),
  bodyHeight: loinc('8302-2', 'Body height'),
  bmi: loinc('39156-5', 'Body mass index (BMI) [Ratio]'),
  waistCircumference: loinc('8280-0', 'Waist Circumference at umbilicus by Tape measure'),

  // Vital signs ----------------------------------------------------------
  bloodPressurePanel: loinc('85354-9', 'Blood pressure panel with all children optional'),
  systolicBloodPressure: loinc('8480-6', 'Systolic blood pressure'),
  diastolicBloodPressure: loinc('8462-4', 'Diastolic blood pressure'),
  heartRate: loinc('8867-4', 'Heart rate'),

  // Lipid panel (cardiovascular) ----------------------------------------
  totalCholesterol: loinc('2093-3', 'Cholesterol [Mass/volume] in Serum or Plasma'),
  hdlCholesterol: loinc('2085-9', 'Cholesterol in HDL [Mass/volume] in Serum or Plasma'),
  ldlCholesterol: loinc('13457-7', 'Cholesterol in LDL [Mass/volume] in Serum or Plasma by calculation'),
  nonHdlCholesterol: loinc('43396-1', 'Cholesterol non HDL [Mass/volume] in Serum or Plasma'),
  triglycerides: loinc('2571-8', 'Triglyceride [Mass/volume] in Serum or Plasma'),

  // Metabolic (glucose) --------------------------------------------------
  fastingGlucose: loinc('1558-6', 'Fasting glucose [Mass/volume] in Serum or Plasma'),
  hba1c: loinc('4548-4', 'Hemoglobin A1c/Hemoglobin.total in Blood'),

  // Kidney (CKM syndrome component) -------------------------------------
  urineAlbuminCreatinineRatio: loinc('9318-7', 'Albumin/Creatinine [Mass Ratio] in Urine'),
  egfr: loinc('33914-3', 'Glomerular filtration rate/1.73 sq M.predicted'),
  creatinine: loinc('2160-0', 'Creatinine [Mass/volume] in Serum or Plasma'),
  potassium: loinc('2823-3', 'Potassium [Moles/volume] in Serum or Plasma'),

  // Cardiac and endocrine markers used by the CKM catalog (stages 2 to 4) ---
  ntProBnp: loinc('33762-6', 'Natriuretic peptide.B prohormone N-Terminal [Mass/volume] in Serum or Plasma'),
  tsh: loinc('3016-3', 'Thyrotropin [Units/volume] in Serum or Plasma'),

  // Behaviours / lifestyle ----------------------------------------------
  smokingStatus: loinc('72166-2', 'Tobacco smoking status'),
  steps24h: loinc('55423-8', 'Number of steps in 24 hour Measured'),
  sleepDuration: loinc('93832-4', 'Sleep duration'),

  // Liver panel (FIB-4: AST, ALT, platelets) ----------------------------
  ast: loinc('1920-8', 'Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma'),
  alt: loinc('1742-6', 'Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma'),
  platelets: loinc('777-3', 'Platelets [#/volume] in Blood by Automated count'),
} as const;

export type LoincKey = keyof typeof LOINC;
