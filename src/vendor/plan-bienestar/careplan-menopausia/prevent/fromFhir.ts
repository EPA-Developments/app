import type { Condition, Observation, Patient } from '@medplum/fhirtypes';
import { LOINC } from '../terminology/loinc.js';
import { extractCkmInput, type CkmFhirContext } from '../ckm/fromFhir.js';
import type { PreventInput } from './calculate.js';

function edadEn(patient: Patient | undefined, hoy: string): number | undefined {
  if (!patient?.birthDate) return undefined;
  const nacimiento = new Date(patient.birthDate);
  const referencia = new Date(hoy);
  if (Number.isNaN(nacimiento.getTime()) || Number.isNaN(referencia.getTime())) return undefined;
  let edad = referencia.getUTCFullYear() - nacimiento.getUTCFullYear();
  const meses = referencia.getUTCMonth() - nacimiento.getUTCMonth();
  if (meses < 0 || (meses === 0 && referencia.getUTCDate() < nacimiento.getUTCDate())) edad -= 1;
  return edad;
}

function ultimoValor(observations: Observation[], code: string): number | undefined {
  let mejor: Observation | undefined;
  for (const o of observations) {
    if ((o.code?.coding ?? []).some((c) => c.code === code) && o.valueQuantity?.value !== undefined) {
      const fecha = o.effectiveDateTime ?? o.issued ?? '';
      const fechaMejor = mejor?.effectiveDateTime ?? mejor?.issued ?? '';
      if (!mejor || fecha >= fechaMejor) mejor = o;
    }
  }
  return mejor?.valueQuantity?.value;
}

export interface PreventFhirContext extends CkmFhirContext {
  /** Date to compute age at. Defaults to today. */
  on?: string;
  /** Statin use (no standard Observation; pass from meds/questionnaire). */
  usaEstatina?: boolean;
}

/**
 * Builds PREVENT inputs from the patient's FHIR record. Reuses CKM extraction
 * for BP/glucose/eGFR/conditions and adds the cholesterol values PREVENT needs.
 */
export function extractPreventInput(ctx: PreventFhirContext): PreventInput {
  const observations = ctx.observations ?? [];
  const on = ctx.on ?? new Date().toISOString().slice(0, 10);
  const ckm = extractCkmInput(ctx);
  const sexo = ctx.patient?.gender === 'male' ? 'male' : 'female';

  return {
    sexo,
    edad: edadEn(ctx.patient, on) ?? 55,
    colesterolTotalMgDl: ultimoValor(observations, LOINC.totalCholesterol.code as string),
    colesterolNoHdlMgDl: ultimoValor(observations, LOINC.nonHdlCholesterol.code as string),
    hdlMgDl: ultimoValor(observations, LOINC.hdlCholesterol.code as string),
    systolicMmHg: ckm.systolicMmHg,
    bmi: ckm.bmi,
    egfr: ckm.egfr,
    diabetes: ckm.conditions?.diabetes,
    tratamientoHipertension: ckm.conditions?.hypertension,
    usaEstatina: ctx.usaEstatina,
  };
}

export type { Condition, Observation, Patient };
