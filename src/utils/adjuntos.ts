// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import type { Attachment } from '@medplum/fhirtypes';

/** Descarga un adjunto (Binary o embebido). `medplum.download` resuelve la autenticación. */
export async function descargarAdjunto(medplum: MedplumClient, a: Attachment): Promise<void> {
  const blob = a.url
    ? await medplum.download(a.url)
    : await fetch(`data:${a.contentType ?? 'application/octet-stream'};base64,${a.data}`).then((r) => r.blob());
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = a.title ?? 'adjunto';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
