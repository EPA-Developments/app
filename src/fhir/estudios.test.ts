// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { forbidden, OperationOutcomeError } from '@medplum/core';
import type { Consent, DocumentReference, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { vi } from 'vitest';
import { indexarDefinicionesFhir } from './__fixtures__/glp1';
import { CONSENT_TYPE_CODE, CONSENT_TYPE_SYSTEM } from './consentimiento';
import {
  armarConsentimientoProcesamiento,
  armarDocumentoLaboratorio,
  cargarEstudiosEnviados,
  CATEGORIA_LABORATORIO,
  DOCUMENTO_CATEGORY_SYSTEM,
  enviarLaboratorioPdf,
  estadoEstudio,
  MAX_INLINE_BYTES,
  MENSAJE_SIN_CONSENTIMIENTO,
  subirPdf,
  validarPdf,
} from './estudios';

/** Systems que no son de SOM ni de una terminología estándar (LOINC, HL7). */
function systemsAjenos(recurso: unknown): string[] {
  const systems = [...JSON.stringify(recurso).matchAll(/"system":"([^"]+)"/g)].map((m) => m[1]);
  return systems.filter(
    (s) =>
      !s.startsWith('https://segundaopinionmedica.org/') &&
      s !== 'http://loinc.org' &&
      !s.startsWith('http://terminology.hl7.org/')
  );
}

/** Un PDF mínimo (lo que importa es la firma `%PDF-`). */
function pdf(nombre = 'laboratorio.pdf', bytes = 64, type = 'application/pdf'): File {
  const contenido = new Uint8Array(bytes);
  contenido.set(new TextEncoder().encode('%PDF-1.7\n'));
  return new File([contenido], nombre, { type });
}

async function paciente(firmoConsentimiento = true): Promise<{ medplum: MockClient; patient: Patient }> {
  indexarDefinicionesFhir();
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Ana'], family: 'García' }],
  });
  medplum.setProfile(patient);
  if (firmoConsentimiento) {
    await medplum.createResource<DocumentReference>({
      resourceType: 'DocumentReference',
      status: 'current',
      type: { coding: [{ system: CONSENT_TYPE_SYSTEM, code: CONSENT_TYPE_CODE }] },
      subject: { reference: `Patient/${patient.id}` },
      date: new Date().toISOString(),
      content: [{ attachment: { contentType: 'text/plain', data: 'ZmlybWFkbw==' } }],
    });
  }
  return { medplum, patient };
}

test('el DocumentReference es un informe de laboratorio (LOINC 11502-2) con la category de SOM', () => {
  const doc = armarDocumentoLaboratorio(
    { resourceType: 'Patient', id: 'p1' },
    { contentType: 'application/pdf', url: 'Binary/b1', title: 'lab.pdf' },
    new Date('2026-09-24T12:00:00Z')
  );
  expect(doc).toMatchObject({
    status: 'current',
    type: { coding: [{ system: 'http://loinc.org', code: '11502-2' }] },
    category: [
      {
        coding: [
          { system: 'https://segundaopinionmedica.org/fhir/CodeSystem/documento', code: 'resultado-laboratorio' },
        ],
      },
    ],
    subject: { reference: 'Patient/p1' },
    author: [{ reference: 'Patient/p1' }],
    date: '2026-09-24T12:00:00.000Z',
    content: [{ attachment: { url: 'Binary/b1', title: 'lab.pdf' } }],
  });
  // Aislamiento de proyecto: solo systems de SOM o terminologías estándar.
  expect(systemsAjenos(doc)).toEqual([]);
});

test('el Consent cumple ppc-1 (policyRule) y autoriza ese documento puntual', () => {
  const c: Consent = armarConsentimientoProcesamiento(
    { resourceType: 'Patient', id: 'p1' },
    { resourceType: 'DocumentReference', id: 'd1', status: 'current', content: [] }
  );
  expect(c).toMatchObject({
    status: 'active',
    scope: { coding: [{ code: 'patient-privacy' }] },
    patient: { reference: 'Patient/p1' },
    performer: [{ reference: 'Patient/p1' }],
    policyRule: { coding: [{ code: 'procesamiento-datos-salud' }] },
    provision: { type: 'permit', data: [{ meaning: 'instance', reference: { reference: 'DocumentReference/d1' } }] },
  });
  expect(c.category?.length).toBeGreaterThan(0);
  expect(systemsAjenos(c)).toEqual([]);
});

describe('validarPdf', () => {
  test('acepta un PDF aunque el celular no informe el type', async () => {
    expect(await validarPdf(pdf('lab.pdf', 64, ''))).toBeUndefined();
  });

  test('rechaza lo que no es PDF, aunque diga .pdf', async () => {
    const foto = new File([new TextEncoder().encode('\xFF\xD8\xFF\xE0 jpeg')], 'lab.pdf', { type: 'application/pdf' });
    expect(await validarPdf(foto)).toMatch(/no es un PDF/);
  });

  test('rechaza archivos vacíos y de más de 15 MB', async () => {
    expect(await validarPdf(new File([], 'vacio.pdf'))).toMatch(/vacío/);
    const grande = pdf();
    Object.defineProperty(grande, 'size', { value: 16 * 1024 * 1024 });
    expect(await validarPdf(grande)).toMatch(/15 MB/);
  });
});

describe('enviarLaboratorioPdf', () => {
  test('sin consentimiento informado no escribe nada', async () => {
    const { medplum, patient } = await paciente(false);
    const crear = vi.spyOn(medplum, 'createResource');
    const r = await enviarLaboratorioPdf(medplum, patient, pdf());
    expect(r).toEqual({ ok: false, mensaje: MENSAJE_SIN_CONSENTIMIENTO });
    expect(crear).not.toHaveBeenCalled();
  });

  test('un archivo que no es PDF no se sube', async () => {
    const { medplum, patient } = await paciente();
    const subir = vi.spyOn(medplum, 'createAttachment');
    const r = await enviarLaboratorioPdf(medplum, patient, new File(['hola'], 'nota.txt'));
    expect(r.ok).toBe(false);
    expect(subir).not.toHaveBeenCalled();
  });

  test('sube el Binary, crea el DocumentReference y el Consent, y aparece en los enviados', async () => {
    const { medplum, patient } = await paciente();
    const subir = vi.spyOn(medplum, 'createAttachment');
    const r = await enviarLaboratorioPdf(medplum, patient, pdf('hemograma.pdf'));

    expect(r.ok).toBe(true);
    // El Binary queda atado al paciente (securityContext).
    expect(subir.mock.calls[0][0]).toMatchObject({
      contentType: 'application/pdf',
      filename: 'hemograma.pdf',
      securityContext: { reference: `Patient/${patient.id}` },
    });
    const attachment = r.documento?.content[0].attachment;
    expect(attachment?.url).toBeDefined();
    expect(attachment?.data).toBeUndefined();
    expect(attachment).toMatchObject({ contentType: 'application/pdf', title: 'hemograma.pdf', size: 64 });
    expect(r.consentimiento?.provision?.data?.[0].reference.reference).toBe(`DocumentReference/${r.documento?.id}`);

    const enviados = await cargarEstudiosEnviados(medplum, patient);
    expect(enviados.map((d) => d.id)).toEqual([r.documento?.id]);
    expect(enviados[0].category?.[0].coding?.[0]).toMatchObject({
      system: DOCUMENTO_CATEGORY_SYSTEM,
      code: CATEGORIA_LABORATORIO,
    });
  });

  test('si el server no deja registrar el Consent, el envío igual vale', async () => {
    const { medplum, patient } = await paciente();
    const crear = medplum.createResource.bind(medplum);
    vi.spyOn(medplum, 'createResource').mockImplementation((async (resource: { resourceType: string }) => {
      if (resource.resourceType === 'Consent') {
        throw new OperationOutcomeError(forbidden);
      }
      return crear(resource as DocumentReference);
    }) as typeof medplum.createResource);
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const r = await enviarLaboratorioPdf(medplum, patient, pdf());
    expect(r.ok).toBe(true);
    expect(r.documento?.id).toBeDefined();
    expect(r.consentimiento).toBeUndefined();
    expect(aviso).toHaveBeenCalled();
  });
});

describe('subirPdf sin permiso para crear el Binary', () => {
  test('un PDF chico viaja embebido en el DocumentReference', async () => {
    const { medplum, patient } = await paciente();
    vi.spyOn(medplum, 'createAttachment').mockRejectedValue(new OperationOutcomeError(forbidden));
    const archivo = pdf('chico.pdf');
    const attachment = await subirPdf(medplum, patient, archivo);
    expect(attachment.url).toBeUndefined();
    expect(attachment).toMatchObject({ contentType: 'application/pdf', title: 'chico.pdf', size: archivo.size });
    expect(atob(attachment.data ?? '').startsWith('%PDF-')).toBe(true);
  });

  test('uno grande no se manda y explica cómo seguir', async () => {
    const { medplum, patient } = await paciente();
    vi.spyOn(medplum, 'createAttachment').mockRejectedValue(new OperationOutcomeError(forbidden));
    await expect(subirPdf(medplum, patient, pdf('grande.pdf', MAX_INLINE_BYTES + 1))).rejects.toThrow(/Mensajes/);
  });

  test('otros errores del server no se disimulan', async () => {
    const { medplum, patient } = await paciente();
    vi.spyOn(medplum, 'createAttachment').mockRejectedValue(new Error('sin conexión'));
    await expect(subirPdf(medplum, patient, pdf())).rejects.toThrow('sin conexión');
  });
});

test('estadoEstudio: procesado cuando el bot vincula el DiagnosticReport', () => {
  const doc: DocumentReference = { resourceType: 'DocumentReference', status: 'current', content: [] };
  expect(estadoEstudio(doc)).toEqual({ estado: 'en-proceso' });
  expect(
    estadoEstudio({ ...doc, context: { related: [{ reference: 'Binary/x' }, { reference: 'DiagnosticReport/dr1' }] } })
  ).toEqual({ estado: 'procesado', informeId: 'dr1' });
});
