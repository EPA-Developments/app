import type { Coding, Condition, Patient, Reference } from '@medplum/fhirtypes';
import { concept } from '../fhir/codeable.js';
import { SYSTEM } from '../terminology/systems.js';

export interface ConditionContext {
  patient: Reference<Patient>;
  id?: string;
  now?: string;
}

/** Builds a FHIR Condition addressed by the CarePlan (e.g. menopause finding). */
export function buildCondition(coding: Coding, ctx: ConditionContext): Condition {
  const condition: Condition = {
    resourceType: 'Condition',
    clinicalStatus: {
      coding: [{ system: SYSTEM.conditionClinical, code: 'active', display: 'Active' }],
    },
    verificationStatus: {
      coding: [{ system: SYSTEM.conditionVerStatus, code: 'confirmed', display: 'Confirmed' }],
    },
    category: [
      {
        coding: [
          { system: SYSTEM.conditionCategory, code: 'problem-list-item', display: 'Problem List Item' },
        ],
      },
    ],
    code: concept(coding),
    subject: ctx.patient,
  };

  if (ctx.id) condition.id = ctx.id;
  if (ctx.now) condition.recordedDate = ctx.now;

  return condition;
}
