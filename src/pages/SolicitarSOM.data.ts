// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Opciones del formulario de solicitud de Segunda Opinión (SOM).

/** Antecedentes cardiovasculares frecuentes (checkboxes del formulario). */
export const ANTECEDENTES_CV: readonly string[] = [
  'Hipertensión arterial',
  'Diabetes',
  'Dislipemia (colesterol alto)',
  'Infarto de miocardio previo',
  'Angina de pecho',
  'Insuficiencia cardíaca',
  'Arritmia / Fibrilación auricular',
  'Stent / Angioplastia',
  'Cirugía cardíaca (bypass, válvula)',
  'ACV / AIT',
  'Enfermedad renal crónica',
  'Tabaquismo',
  'Antecedentes familiares de enfermedad cardiovascular',
];

/** Quién origina la solicitud (mapea a la extensión som-origin de la ServiceRequest). */
export const ORIGENES_SOM = [
  { value: 'self', label: 'Soy el paciente' },
  { value: 'referral', label: 'Soy un profesional derivando a un paciente' },
] as const;
