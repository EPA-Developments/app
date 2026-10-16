// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import type { Attachment } from '@medplum/fhirtypes';

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
