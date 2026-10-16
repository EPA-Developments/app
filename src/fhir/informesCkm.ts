// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Informes CKM: el médico los firma en el dashboard clínico y la paciente los ve y los baja
// desde Salud («Informes de tu médico»). El portal SOLO LEE: no crea ni cambia estos
// documentos.
//
// CONTRATO con el dashboard: un `DocumentReference` con `subject` = la paciente, `status`
// `current`, `docStatus` `final`, autor y firmante = el `Practitioner`, una `description`
// («Informe CKM · estadío …») y el PDF en `content[0].attachment` (`url` = `Binary/<id>`).
// Trae dos `category`: la nuestra (CodeSystem `documento` | `informe-ckm`), que es la que se
// busca acá, y otra del CodeSystem propio del dashboard, que el portal no mira.
//
// `docStatus` no es un parámetro de búsqueda de FHIR R4: el server trae los vigentes
// (`status=current`) y el filtro de «firmado» (`docStatus` `final`) se hace acá. Un borrador
// (`preliminary`) todavía no es un informe para la paciente.
//
// Tampoco es «de tu médico» un documento que la tiene a ella como autora. Su AccessPolicy no
// le deja dar de alta uno con la categoría `informe-ckm` (seed de Recepción), pero si alguno
// quedó de antes, no se muestra: todo lo que sube la paciente la lleva como autora.
import type { MedplumClient, WithId } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { Attachment, DocumentReference, Patient } from '@medplum/fhirtypes';
import { DOCUMENTO_CATEGORY_SYSTEM, PDF } from './estudios';

/** Categoría propia (CodeSystem `documento`) del informe CKM que firma el médico. */
export const CATEGORIA_INFORME_CKM = 'informe-ckm';

/** Informes CKM firmados de la paciente, del más nuevo al más viejo. */
export async function cargarInformesCkm(
  medplum: MedplumClient,
  patient: Patient
): Promise<WithId<DocumentReference>[]> {
  const documentos = await medplum.searchResources(
    'DocumentReference',
    {
      subject: getReferenceString(patient),
      category: `${DOCUMENTO_CATEGORY_SYSTEM}|${CATEGORIA_INFORME_CKM}`,
      status: 'current',
      _sort: '-date',
      _count: '20',
    },
    { cache: 'no-cache' }
  );
  return documentos.filter((d) => d.docStatus === 'final' && !escritoPorLaPaciente(d));
}

function escritoPorLaPaciente(doc: DocumentReference): boolean {
  return doc.author?.some((a) => a.reference?.startsWith('Patient/')) ?? false;
}

/** El PDF del informe: el adjunto que dice ser PDF o, si ninguno lo dice, el primero. */
export function adjuntoPdf(doc: DocumentReference): Attachment | undefined {
  return doc.content?.find((c) => c.attachment?.contentType === PDF)?.attachment ?? doc.content?.[0]?.attachment;
}
