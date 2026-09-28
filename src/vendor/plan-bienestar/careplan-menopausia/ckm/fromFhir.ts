import type { Coding, Condition, Observation, Patient } from '@medplum/fhirtypes';
import { LOINC } from '../terminology/loinc.js';
import { SNOMED } from '../terminology/snomed.js';
import { SYSTEM } from '../terminology/systems.js';
import { calculateAge } from '../eligibility.js';
import type { CkmConditions, CkmInput } from './types.js';

export interface CkmFhirContext {
  patient?: Patient;
  observations?: Observation[];
  conditions?: Condition[];
  /** ISO date (`YYYY-MM-DD`) at which to compute the age. Defaults to today. */
  on?: string;
}

function fecha(observation: Observation): string {
  return observation.effectiveDateTime ?? observation.issued ?? '';
}

function tieneCodigo(coding: Coding[] | undefined, code: string): boolean {
  return (coding ?? []).some((c) => c.system === SYSTEM.loinc && c.code === code);
}

/** Latest Observation matching a LOINC code (by effective date). */
function ultima(observations: Observation[], code: string): Observation | undefined {
  let mejor: Observation | undefined;
  for (const observation of observations) {
    const matchDirecto = tieneCodigo(observation.code?.coding, code);
    const matchComponente = (observation.component ?? []).some((comp) => tieneCodigo(comp.code?.coding, code));
    if (!matchDirecto && !matchComponente) continue;
    if (!mejor || fecha(observation) >= fecha(mejor)) {
      mejor = observation;
    }
  }
  return mejor;
}

function valor(observations: Observation[], code: string): number | undefined {
  const observation = ultima(observations, code);
  if (!observation) return undefined;
  if (tieneCodigo(observation.code?.coding, code) && observation.valueQuantity?.value !== undefined) {
    return observation.valueQuantity.value;
  }
  const componente = (observation.component ?? []).find((comp) => tieneCodigo(comp.code?.coding, code));
  return componente?.valueQuantity?.value;
}

function activa(condition: Condition): boolean {
  const estado = condition.clinicalStatus?.coding?.[0]?.code;
  return estado === undefined || estado === 'active' || estado === 'recurrence' || estado === 'relapse';
}

function tieneCondicion(conditions: Condition[], codes: string[]): boolean {
  return conditions.some(
    (condition) =>
      activa(condition) &&
      (condition.code?.coding ?? []).some((c) => c.system === SYSTEM.snomed && c.code !== undefined && codes.includes(c.code)),
  );
}

const CODIGOS_DIABETES = [SNOMED.diabetesMellitus.code!, SNOMED.type2Diabetes.code!];
const CODIGOS_CORONARIA = [SNOMED.coronaryArteriosclerosis.code!, SNOMED.myocardialInfarction.code!];

/**
 * Extracts the CKM staging inputs from FHIR resources: latest Observation per
 * LOINC code (supports BP as components of the blood-pressure panel), active
 * SNOMED-coded Conditions (with the specific clinical-CVD flags the stage 4
 * catalog needs) and the age from the Patient's birth date.
 */
export function extractCkmInput(ctx: CkmFhirContext): CkmInput {
  const observations = ctx.observations ?? [];
  const conditions = ctx.conditions ?? [];

  const coronaryDisease = tieneCondicion(conditions, CODIGOS_CORONARIA) || undefined;
  const stroke = tieneCondicion(conditions, [SNOMED.stroke.code!]) || undefined;
  const heartFailure = tieneCondicion(conditions, [SNOMED.heartFailure.code!]) || undefined;
  const peripheralArteryDisease = tieneCondicion(conditions, [SNOMED.peripheralVascularDisease.code!]) || undefined;
  const atrialFibrillation = tieneCondicion(conditions, [SNOMED.atrialFibrillation.code!]) || undefined;
  const clinicalCvd = coronaryDisease || stroke || heartFailure || peripheralArteryDisease || atrialFibrillation || undefined;

  const condiciones: CkmConditions = {
    diabetes: tieneCondicion(conditions, CODIGOS_DIABETES) || undefined,
    hypertension: tieneCondicion(conditions, [SNOMED.hypertension.code!]) || undefined,
    metabolicSyndrome: tieneCondicion(conditions, [SNOMED.metabolicSyndrome.code!]) || undefined,
    chronicKidneyDisease: tieneCondicion(conditions, [SNOMED.chronicKidneyDisease.code!]) || undefined,
    clinicalCvd,
    coronaryDisease,
    stroke,
    heartFailure,
    peripheralArteryDisease,
    atrialFibrillation,
    kidneyFailure: tieneCondicion(conditions, [SNOMED.endStageRenalDisease.code!]) || undefined,
  };

  const on = ctx.on ?? new Date().toISOString().slice(0, 10);
  const edad = ctx.patient?.birthDate ? calculateAge(ctx.patient.birthDate, on) : undefined;

  const input: CkmInput = {
    sexo: ctx.patient?.gender,
    bmi: valor(observations, LOINC.bmi.code!),
    waistCm: valor(observations, LOINC.waistCircumference.code!),
    systolicMmHg: valor(observations, LOINC.systolicBloodPressure.code!),
    diastolicMmHg: valor(observations, LOINC.diastolicBloodPressure.code!),
    fastingGlucoseMgDl: valor(observations, LOINC.fastingGlucose.code!),
    hba1cPercent: valor(observations, LOINC.hba1c.code!),
    triglyceridesMgDl: valor(observations, LOINC.triglycerides.code!),
    hdlMgDl: valor(observations, LOINC.hdlCholesterol.code!),
    acrMgG: valor(observations, LOINC.urineAlbuminCreatinineRatio.code!),
    egfr: valor(observations, LOINC.egfr.code!),
    conditions: condiciones,
  };
  if (edad !== undefined) input.edad = edad;
  return input;
}
