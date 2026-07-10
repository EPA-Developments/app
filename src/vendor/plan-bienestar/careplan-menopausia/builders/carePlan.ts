import type { CarePlan, Patient, Reference } from '@medplum/fhirtypes';
import { concept } from '../fhir/codeable.js';
import { SNOMED } from '../terminology/snomed.js';

export interface CarePlanContext {
  patient: Reference<Patient>;
  title: string;
  description: string;
  /** urn:uuid / reference strings of the plan Goals. */
  goals: string[];
  /** urn:uuid / reference strings of the plan Tasks (activities). */
  tasks: string[];
  /** urn:uuid / reference string of the CareTeam. */
  careTeam?: string;
  /** urn:uuid / reference string of the addressed Condition. */
  condition?: string;
  /** Canonical URL(s) of the PlanDefinition(s) this plan instantiates. */
  instantiatesCanonical?: string[];
  id?: string;
  now?: string;
}

/** Builds the top-level FHIR CarePlan wiring together goals, activities and team. */
export function buildCarePlan(ctx: CarePlanContext): CarePlan {
  const carePlan: CarePlan = {
    resourceType: 'CarePlan',
    status: 'active',
    intent: 'plan',
    title: ctx.title,
    description: ctx.description,
    subject: ctx.patient,
    category: [concept(SNOMED.carePlanRecord)],
    goal: ctx.goals.map((reference) => ({ reference })),
    activity: ctx.tasks.map((reference) => ({ reference: { reference } })),
  };

  if (ctx.id) carePlan.id = ctx.id;
  if (ctx.instantiatesCanonical?.length) carePlan.instantiatesCanonical = ctx.instantiatesCanonical;
  if (ctx.careTeam) carePlan.careTeam = [{ reference: ctx.careTeam }];
  if (ctx.condition) carePlan.addresses = [{ reference: ctx.condition }];
  if (ctx.now) {
    carePlan.created = ctx.now;
    carePlan.period = { start: ctx.now };
  }

  return carePlan;
}
