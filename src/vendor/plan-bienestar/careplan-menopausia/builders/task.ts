import type { Patient, Reference, Task } from '@medplum/fhirtypes';
import { textConcept } from '../fhir/codeable.js';
import type { ActivityKind, ActivityTemplate } from '../model/planTemplate.js';

/** Patient-facing (Spanish) labels for the activity kinds. */
export const ACTIVITY_KIND_LABEL: Record<ActivityKind, string> = {
  educacion: 'Educacion',
  monitoreo: 'Monitoreo',
  conducta: 'Conducta',
  derivacion: 'Derivacion',
};

export interface TaskContext {
  patient: Reference<Patient>;
  /** urn:uuid / reference string of the owning CarePlan. */
  carePlan: string;
  /** urn:uuid / reference string of the Questionnaire, when the activity uses one. */
  questionnaire?: string;
  id?: string;
  now?: string;
}

/** Builds a FHIR Task ("action item") for a plan activity, linked to the CarePlan. */
export function buildTask(template: ActivityTemplate, ctx: TaskContext): Task {
  const task: Task = {
    resourceType: 'Task',
    status: 'requested',
    intent: 'plan',
    code: textConcept(template.title),
    description: template.description,
    for: ctx.patient,
    basedOn: [{ reference: ctx.carePlan }],
    businessStatus: textConcept(ACTIVITY_KIND_LABEL[template.kind]),
  };

  if (ctx.id) task.id = ctx.id;
  if (ctx.now) task.authoredOn = ctx.now;

  if (template.usesQuestionnaire && ctx.questionnaire) {
    task.focus = { reference: ctx.questionnaire };
  }

  return task;
}
