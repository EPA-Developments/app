// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Cuestionarios de Life's Essential 8 que completa el paciente en el portal.
// Las URLs canónicas son las mismas que el dashboard sube (`npm run upload-le8`)
// y luego interpreta: son el contrato entre ambas apps, no cambiar sin coordinar.
export const LE8_QUESTIONNAIRES = [
  {
    slug: 'le8-sleep-psqi-v1',
    url: 'https://segundaopinionmedica.org/fhir/Questionnaire/le8-sleep-psqi-v1',
    label: 'Calidad del sueño',
    description: 'Cuestionario de sueño (PSQI).',
  },
  {
    slug: 'le8-diet-mepa-v1',
    url: 'https://segundaopinionmedica.org/fhir/Questionnaire/le8-diet-mepa-v1',
    label: 'Alimentación',
    description: 'Patrón alimentario mediterráneo (MEPA).',
  },
  {
    slug: 'le8-activity-evs-v1',
    url: 'https://segundaopinionmedica.org/fhir/Questionnaire/le8-activity-evs-v1',
    label: 'Actividad física',
    description: 'Minutos de actividad por semana.',
  },
  {
    slug: 'le8-tobacco-v1',
    url: 'https://segundaopinionmedica.org/fhir/Questionnaire/le8-tobacco-v1',
    label: 'Tabaco',
    description: 'Situación tabáquica.',
  },
] as const;

export type LE8QuestionnaireSlug = (typeof LE8_QUESTIONNAIRES)[number]['slug'];

export function le8QuestionnaireBySlug(slug: string): (typeof LE8_QUESTIONNAIRES)[number] | undefined {
  return LE8_QUESTIONNAIRES.find((q) => q.slug === slug);
}
