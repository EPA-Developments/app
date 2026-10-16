// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Un informe CKM tal como lo firma el médico en el dashboard clínico (contrato en
// src/fhir/informesCkm.ts), para los tests. Datos sintéticos: ninguna paciente ni ningún
// médico real.
import type { DocumentReference, Patient } from '@medplum/fhirtypes';
import { DOCUMENTO_CATEGORY_SYSTEM, PDF } from '../estudios';
import { CATEGORIA_INFORME_CKM } from '../informesCkm';

/** La otra category que pone el dashboard, de su propio CodeSystem: el portal no la mira. */
export const CATEGORIA_DEL_DASHBOARD = {
  system: 'https://example.org/fhir/CodeSystem/documento-clinico',
  code: 'informe-ckm',
};

const MEDICO = { reference: 'Practitioner/medico-sintetico' };

export interface OpcionesInforme {
  /** AAAA-MM-DD: el informe se firma ese día a las 12:00 de Argentina. */
  readonly fecha: string;
  readonly estadio?: string;
  readonly status?: DocumentReference['status'];
  readonly docStatus?: DocumentReference['docStatus'];
}

export function informeCkm(patient: Patient, o: OpcionesInforme): DocumentReference {
  return {
    resourceType: 'DocumentReference',
    status: o.status ?? 'current',
    docStatus: o.docStatus ?? 'final',
    category: [
      { coding: [{ system: DOCUMENTO_CATEGORY_SYSTEM, code: CATEGORIA_INFORME_CKM }] },
      { coding: [CATEGORIA_DEL_DASHBOARD] },
    ],
    type: { text: 'Informe CKM' },
    subject: { reference: `Patient/${patient.id}` },
    date: `${o.fecha}T15:00:00.000Z`,
    description: `Informe CKM · estadío ${o.estadio ?? '2'}`,
    author: [MEDICO],
    authenticator: MEDICO,
    content: [
      {
        attachment: { contentType: PDF, url: `Binary/informe-${o.fecha}`, title: `informe-ckm-${o.fecha}.pdf` },
      },
    ],
  };
}
