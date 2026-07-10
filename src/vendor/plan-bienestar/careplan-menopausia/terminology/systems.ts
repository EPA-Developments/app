/**
 * Canonical terminology and identifier system URIs used across the module.
 */
export const SYSTEM = {
  loinc: 'http://loinc.org',
  snomed: 'http://snomed.info/sct',
  ucum: 'http://unitsofmeasure.org',
  /** FHIR base code systems */
  goalCategory: 'http://terminology.hl7.org/CodeSystem/goal-category',
  goalPriority: 'http://terminology.hl7.org/CodeSystem/goal-priority',
  usageContextType: 'http://terminology.hl7.org/CodeSystem/usage-context-type',
  administrativeGender: 'http://hl7.org/fhir/administrative-gender',
  planDefinitionType: 'http://terminology.hl7.org/CodeSystem/plan-definition-type',
  careTeamCategory: 'http://loinc.org',
  taskCode: 'http://hl7.org/fhir/CodeSystem/task-code',
  conditionClinical: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
  conditionVerStatus: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
  conditionCategory: 'http://terminology.hl7.org/CodeSystem/condition-category',
  /**
   * Local code system for module-specific concepts that do not yet have a
   * stable LOINC/SNOMED mapping (e.g. questionnaire answer options). Replace the
   * host with the deployment's canonical base when publishing.
   */
  epa: 'https://epa-bienestar.ar/fhir/CodeSystem/plan-bienestar-100-dias',
} as const;
