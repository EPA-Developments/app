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

  // Behaviours / lifestyle ----------------------------------------------
  smokingStatus: loinc('72166-2', 'Tobacco smoking status'),
  steps24h: loinc('55423-8', 'Number of steps in 24 hour Measured'),
  sleepDuration: loinc('93832-4', 'Sleep duration'),
} as const;

export type LoincKey = keyof typeof LOINC;
