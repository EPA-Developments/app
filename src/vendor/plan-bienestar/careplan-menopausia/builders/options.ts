import type {
  CareTeam,
  Organization,
  Patient,
  Practitioner,
  PractitionerRole,
  Questionnaire,
  Reference,
  RelatedPerson,
} from '@medplum/fhirtypes';
import type { IdGenerator } from '../fhir/ids.js';
import type { WomanLifeStage } from '../model/lifeStage.js';

/** Reference to a valid CareTeam participant member. */
export type CareTeamMember = Reference<
  CareTeam | Organization | Patient | Practitioner | PractitionerRole | RelatedPerson
>;

export interface CareTeamOptions {
  /** Overrides the default care-team name. */
  name?: string;
  /** Members (Practitioner/Organization/RelatedPerson/... references) of the care team. */
  members?: CareTeamMember[];
  /** Managing organization reference. */
  managingOrganization?: Reference<Organization>;
}

export interface BuildMenopauseCarePlanOptions {
  /** The subject of the plan. Accepts `Patient/<id>` or a Reference. */
  patient: Reference<Patient> | string;
  /** Menopause life stage; selects the addressed condition coding. */
  lifeStage?: WomanLifeStage;
  /** Care-team configuration. */
  careTeam?: CareTeamOptions;
  /** Include a Condition addressed by the CarePlan. Default `true`. */
  includeCondition?: boolean;
  /** Include the screening Questionnaire and link it to a Task. Default `true`. */
  includeQuestionnaire?: boolean;
  /**
   * Reference to a Questionnaire that ALREADY exists on the server (seeded
   * once, like the PlanDefinition). When set, the bundle does not create a
   * Questionnaire and Tasks point to this one instead. Required under
   * restrictive access policies where patients cannot create Questionnaires.
   */
  existingQuestionnaire?: Reference<Questionnaire>;
  /**
   * Canonical URL of the PlanDefinition the CarePlan instantiates. Defaults to
   * the menopause plan definition URL, letting apps find plans created from it.
   */
  planDefinitionUrl?: string;
  /** UUID generator (injectable for deterministic output). */
  idGenerator?: IdGenerator;
  /**
   * ISO date (`YYYY-MM-DD`) stamped on dated fields (CarePlan.created,
   * Goal.startDate, Task.authoredOn, Condition.recordedDate,
   * Questionnaire.date). Omitted when not provided so output stays deterministic
   * and free of ambient clock reads.
   */
  now?: string;
}
