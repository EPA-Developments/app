import type { Patient, PlanDefinition } from '@medplum/fhirtypes';

/** Outcome of matching a Patient against a PlanDefinition's `useContext`. */
export interface EligibilityResult {
  eligible: boolean;
  /** Patient-safe (Spanish) explanations for each unmatched criterion. Empty when eligible. */
  reasons: string[];
  /** Age in whole years at the evaluation date, when birthDate is known. */
  age?: number;
}

export interface EvaluateEligibilityOptions {
  /** ISO date (`YYYY-MM-DD`) at which to compute the age. Defaults to today. */
  on?: string;
}

/** Age in whole years at `on`, or undefined when either date is invalid. */
export function calculateAge(birthDate: string, on: string): number | undefined {
  const birth = new Date(birthDate);
  const reference = new Date(on);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(reference.getTime())) {
    return undefined;
  }
  let age = reference.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = reference.getUTCMonth() - birth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && reference.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }
  return age;
}

/**
 * Evaluates whether a Patient matches a PlanDefinition's `useContext`
 * (the declarative eligibility rule: `gender` and `age` contexts).
 *
 * Semantics:
 *  - Several contexts of the same type are alternatives (OR); distinct types
 *    must all match (AND).
 *  - Context types other than `gender`/`age` are informative and do not block.
 *  - A non-`active` definition is never eligible.
 */
export function evaluateEligibility(
  patient: Patient,
  planDefinition: PlanDefinition,
  options: EvaluateEligibilityOptions = {},
): EligibilityResult {
  const reasons: string[] = [];
  const on = options.on ?? new Date().toISOString().slice(0, 10);
  const age = patient.birthDate ? calculateAge(patient.birthDate, on) : undefined;

  if (planDefinition.status !== 'active') {
    reasons.push('El plan no esta disponible por el momento.');
  }

  const contexts = planDefinition.useContext ?? [];
  const genderContexts = contexts.filter((context) => context.code?.code === 'gender');
  const ageContexts = contexts.filter((context) => context.code?.code === 'age');

  if (genderContexts.length > 0) {
    const allowed = genderContexts.flatMap((context) =>
      (context.valueCodeableConcept?.coding ?? [])
        .map((coding) => coding.code)
        .filter((code): code is string => code !== undefined),
    );
    if (!patient.gender) {
      reasons.push('Falta el dato de sexo en el perfil.');
    } else if (!allowed.includes(patient.gender)) {
      reasons.push('El plan esta dirigido a otro sexo.');
    }
  }

  if (ageContexts.length > 0) {
    if (age === undefined) {
      reasons.push('Falta la fecha de nacimiento en el perfil.');
    } else {
      const inRange = ageContexts.some((context) => {
        const low = context.valueRange?.low?.value;
        const high = context.valueRange?.high?.value;
        return (low === undefined || age >= low) && (high === undefined || age <= high);
      });
      if (!inRange) {
        reasons.push('La edad esta fuera del rango previsto para este plan.');
      }
    }
  }

  return { eligible: reasons.length === 0, reasons, age };
}
