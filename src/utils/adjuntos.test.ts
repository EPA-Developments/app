// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Bajar un adjunto o el PDF de un informe: con el link fresco, y sin guardar el error del
// server como si fuera el archivo. Documentos sintéticos, sin datos de pacientes.
import type { DocumentReference } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { vi } from 'vitest';
import { adjuntoPdf, descargarPdfDelDocumento, ERROR_DESCARGA } from './adjuntos';

afterEach(() => {
  vi.restoreAllMocks();
});

/** jsdom no trae URL.createObjectURL ni navega con el click del link: se reemplazan. */
function capturarDescargas(): string[] {
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:archivo'), revokeObjectURL: vi.fn() });
  const nombres: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    nombres.push(this.download);
  });
  return nombres;
}

const PDF_OK = (): Response => new Response(new Blob(['%PDF-1.7'], { type: 'application/pdf' }), { status: 200 });

function informe(attachment: NonNullable<DocumentReference['content']>[number]['attachment']): DocumentReference {
  return { resourceType: 'DocumentReference', status: 'current', content: [{ attachment }] };
}

test('adjuntoPdf: el adjunto en PDF o, si ninguno lo dice, el primero', () => {
  const conNota: DocumentReference = {
    resourceType: 'DocumentReference',
    status: 'current',
    content: [
      { attachment: { contentType: 'text/plain', url: 'Binary/nota' } },
      { attachment: { contentType: 'application/pdf', url: 'Binary/pdf' } },
    ],
  };
  expect(adjuntoPdf(conNota)?.url).toBe('Binary/pdf');
  expect(adjuntoPdf(informe({ url: 'Binary/sin-tipo' }))?.url).toBe('Binary/sin-tipo');
  expect(adjuntoPdf({ resourceType: 'DocumentReference', status: 'current', content: [] })).toBeUndefined();
});

test('vuelve a leer el documento y baja el PDF con el link fresco', async () => {
  const medplum = new MockClient();
  const guardado = await medplum.createResource(
    informe({ contentType: 'application/pdf', url: 'https://storage.ejemplo.test/viejo?Expires=1' })
  );
  // El server firma de nuevo el link en cada lectura.
  await medplum.updateResource<DocumentReference>({
    ...guardado,
    content: [{ attachment: { contentType: 'application/pdf', url: 'https://storage.ejemplo.test/nuevo?Expires=2' } }],
  });
  const bajar = vi.spyOn(medplum, 'downloadResponse').mockImplementation(async () => PDF_OK());
  const nombres = capturarDescargas();

  await descargarPdfDelDocumento(medplum, guardado, 'informe.pdf');

  expect(bajar).toHaveBeenCalledWith('https://storage.ejemplo.test/nuevo?Expires=2');
  expect(nombres).toEqual(['informe.pdf']);
});

test('si el server no da el archivo, tira el aviso y no guarda nada', async () => {
  const medplum = new MockClient();
  const guardado = await medplum.createResource(informe({ contentType: 'application/pdf', url: 'Binary/vencido' }));
  vi.spyOn(medplum, 'downloadResponse').mockImplementation(
    async () => new Response('<Error>AccessDenied</Error>', { status: 403, headers: { 'Content-Type': 'application/xml' } })
  );
  const nombres = capturarDescargas();

  await expect(descargarPdfDelDocumento(medplum, guardado, 'informe.pdf')).rejects.toThrow(ERROR_DESCARGA);
  expect(nombres).toEqual([]);
});

test('un PDF embebido se baja sin pedirle nada al server, con el título que trae', async () => {
  const medplum = new MockClient();
  const guardado = await medplum.createResource(
    informe({ contentType: 'application/pdf', data: btoa('%PDF-1.7'), title: 'informe-som.pdf' })
  );
  const bajar = vi.spyOn(medplum, 'downloadResponse');
  const nombres = capturarDescargas();

  await descargarPdfDelDocumento(medplum, guardado, 'informe.pdf');

  expect(bajar).not.toHaveBeenCalled();
  expect(nombres).toEqual(['informe-som.pdf']);
});
