import type { CareTeam, Patient, Reference } from '@medplum/fhirtypes';
import type { CareTeamMember, CareTeamOptions } from './options.js';

export interface CareTeamContext {
  patient: Reference<Patient>;
  id?: string;
  lifeStageLabel?: string;
}

/** Builds a FHIR CareTeam for the plan. */
export function buildCareTeam(options: CareTeamOptions | undefined, ctx: CareTeamContext): CareTeam {
  const defaultName = ctx.lifeStageLabel
    ? `Equipo Plan Bienestar 100 Dias - ${ctx.lifeStageLabel}`
    : 'Equipo Plan Bienestar 100 Dias';

  const careTeam: CareTeam = {
    resourceType: 'CareTeam',
    status: 'active',
    name: options?.name ?? defaultName,
    subject: ctx.patient,
  };

  if (ctx.id) careTeam.id = ctx.id;

  if (options?.members && options.members.length > 0) {
    careTeam.participant = options.members.map((member: CareTeamMember) => ({ member }));
  }

  if (options?.managingOrganization) {
    careTeam.managingOrganization = [options.managingOrganization];
  }

  return careTeam;
}
