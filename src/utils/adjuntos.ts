// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import type { Attachment, DocumentReference } from '@medplum/fhirtypes';

/** Lo que ve la paciente cuando el server no le da el archivo (p. ej. su link ya venció). */
export const ERROR_DESCARGA = 'No pudimos bajar el archivo. Recargá la página y probá de nuevo.';

/**
 * Descarga un adjunto (Binary o embebido). `medplum.downloadResponse` resuelve la
 * autenticación. Se mira el estado de la respuesta porque `medplum.download` no lo hace: con
 * un link firmado que ya venció, guardaría el error del server como si fuera el archivo.
 */
export async function descargarAdjunto(medplum: MedplumClient, a: Attachment): Promise<void> {
  let blob: Blob;
  if (a.url) {
    const respuesta = await medplum.downloadResponse(a.url);
    if (!respuesta.ok) {
      throw new Error(ERROR_DESCARGA);
    }
    blob = await respuesta.blob();
  } else {
    blob = await fetch(`data:${a.contentType ?? 'application/octet-stream'};base64,${a.data}`).then((r) => r.blob());
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = a.title ?? 'adjunto';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** El PDF de un documento: el adjunto que dice ser PDF o, si ninguno lo dice, el primero. */
export function adjuntoPdf(doc: DocumentReference): Attachment | undefined {
  return (
    doc.content?.find((c) => c.attachment?.contentType === 'application/pdf')?.attachment ?? doc.content?.[0]?.attachment
  );
}

/**
 * Baja el PDF de un `DocumentReference` (un informe). Antes lo vuelve a leer: el link al
 * archivo que devuelve el server al leer es firmado y vence, y la pantalla pudo quedar
 * abierta un rato. `nombre` es el del archivo si el adjunto no trae título.
 */
export async function descargarPdfDelDocumento(
  medplum: MedplumClient,
  doc: DocumentReference,
  nombre: string
): Promise<void> {
  const fresco = doc.id ? await medplum.readResource('DocumentReference', doc.id, { cache: 'no-cache' }) : doc;
  const archivo = adjuntoPdf(fresco) ?? adjuntoPdf(doc);
  if (!archivo?.url && !archivo?.data) {
    return;
  }
  await descargarAdjunto(medplum, { ...archivo, title: archivo.title ?? nombre });
}
