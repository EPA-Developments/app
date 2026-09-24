// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Enviar estudios en PDF — por ahora, solo resultados de laboratorio.
//
// El paciente sube el informe tal como se lo entregó el laboratorio. El portal escribe
// SOLO en su compartimento:
//  1. El archivo: `Binary` (con `securityContext` = el paciente), como Attachment.
//  2. El documento clínico: `DocumentReference` con type LOINC 11502-2 (Laboratory
//     report) + category propia (CodeSystem `documento` | `resultado-laboratorio`).
//     Es lo que dispara la Subscription del bot `som-procesar-laboratorio`, que lee el
//     PDF y crea las Observation/DiagnosticReport (ver docs/medplum/bot-som-interface.md).
//     La category propia deja filtrar sin ambigüedad: el consentimiento firmado también
//     es un DocumentReference y no tiene que disparar el bot.
//  3. Un `Consent` vinculado al documento (la casilla "Autorizo…" es obligatoria: el
//     paciente es el dueño de sus datos). Nunca bloquea el envío.
//
// REGLA de aislamiento: todo es de SOM (systems `segundaopinionmedica.org`, bot `som-*`).
// Nada de Biowellness (`biowellness.ar`, agente-archivos, `bw-*`).
import type { MedplumClient, WithId } from '@medplum/core';
import { createReference, getReferenceString, OperationOutcomeError } from '@medplum/core';
import type { Attachment, Consent, DocumentReference, Patient } from '@medplum/fhirtypes';
import { MARCA } from '../marca';
import { buscarConsentimiento } from './consentimiento';
import { SOM_SYSTEM } from './som';

/** CodeSystem propio de SOM para clasificar los documentos que manda el paciente. */
export const DOCUMENTO_CATEGORY_SYSTEM = `${SOM_SYSTEM}/documento`;
export const CATEGORIA_LABORATORIO = 'resultado-laboratorio';
export const CATEGORIA_LABORATORIO_DISPLAY = 'Resultado de laboratorio (PDF)';

/** Tipo del documento en la historia clínica: LOINC 11502-2 "Laboratory report". */
export const LOINC_INFORME_LABORATORIO = { system: 'http://loinc.org', code: '11502-2', display: 'Laboratory report' };

/** Política bajo la que se otorga el Consent (FHIR R4, invariante ppc-1). */
export const CONSENTIMIENTO_SYSTEM = `${SOM_SYSTEM}/consentimiento`;
export const CONSENTIMIENTO_PROCESAMIENTO = 'procesamiento-datos-salud';
export const TEXTO_AUTORIZACION = `Autorizo a ${MARCA.nombre} a procesar este documento e incorporar sus resultados a mi historia clínica. Sé que puedo revocar esta autorización cuando quiera.`;

export const PDF = 'application/pdf';
export const MAX_MB = 15;
const MAX_BYTES = MAX_MB * 1024 * 1024;
/**
 * Tope para mandar el PDF embebido (base64) en el DocumentReference cuando el server
 * todavía no deja crear el `Binary`: el JSON no puede superar el límite del server
 * (1 MB por defecto en Medplum) y el base64 agrega un tercio.
 */
export const MAX_INLINE_BYTES = 700 * 1024;

export const MENSAJE_SIN_CONSENTIMIENTO =
  'Antes de enviarnos tus estudios necesitamos que firmes el consentimiento informado.';

export interface ResultadoEnvioEstudio {
  ok: boolean;
  mensaje?: string;
  documento?: WithId<DocumentReference>;
  /** Undefined si el server no dejó registrar el Consent (el envío igual es válido). */
  consentimiento?: WithId<Consent>;
}

export type EstadoEstudio = { estado: 'en-proceso' } | { estado: 'procesado'; informeId: string };

function leerComo<T extends ArrayBuffer | string>(blob: Blob, modo: 'buffer' | 'dataUrl'): Promise<T> {
  // FileReader (y no Blob.arrayBuffer) para andar igual en todos los navegadores móviles.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as T);
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo.'));
    if (modo === 'buffer') {
      reader.readAsArrayBuffer(blob);
    } else {
      reader.readAsDataURL(blob);
    }
  });
}

/**
 * Valida que el archivo sea un PDF enviable. Devuelve el mensaje para el paciente, o
 * undefined si está OK. Mira la firma `%PDF-` (en el primer KB, como dice la norma) y
 * no el `type`: en muchos celulares el selector de archivos no lo informa.
 */
export async function validarPdf(file: File): Promise<string | undefined> {
  if (file.size === 0) {
    return 'El archivo está vacío. Elegí el PDF de nuevo.';
  }
  if (file.size > MAX_BYTES) {
    return `El archivo supera los ${MAX_MB} MB. Comprimilo o dividilo e intentá de nuevo.`;
  }
  const inicio = new Uint8Array(await leerComo<ArrayBuffer>(file.slice(0, 1024), 'buffer'));
  if (!String.fromCharCode(...inicio).includes('%PDF-')) {
    return 'El archivo no es un PDF. Subí el informe del laboratorio en PDF.';
  }
  return undefined;
}

function esProhibido(err: unknown): boolean {
  return err instanceof OperationOutcomeError && !!err.outcome.issue?.some((i) => i.code === 'forbidden');
}

/**
 * Sube el PDF como `Binary` y devuelve el Attachment. Si la AccessPolicy del server
 * todavía no deja crear el Binary, un PDF chico viaja embebido en el Attachment (así
 * el envío funciona desde ya); uno grande explica cómo seguir.
 */
export async function subirPdf(medplum: MedplumClient, patient: Patient, file: File): Promise<Attachment> {
  const creation = new Date().toISOString();
  try {
    const attachment = await medplum.createAttachment({
      data: file,
      contentType: PDF,
      filename: file.name,
      securityContext: createReference(patient),
    });
    return { ...attachment, title: file.name, size: file.size, creation };
  } catch (err) {
    if (!esProhibido(err)) {
      throw err;
    }
    if (file.size > MAX_INLINE_BYTES) {
      throw new Error(
        `Por ahora podemos recibir PDFs de hasta ${Math.floor(MAX_INLINE_BYTES / 1024)} KB. Mandanos este por Mensajes y lo sumamos nosotros.`,
        { cause: err }
      );
    }
    const dataUrl = await leerComo<string>(file, 'dataUrl');
    return {
      contentType: PDF,
      title: file.name,
      size: file.size,
      creation,
      data: dataUrl.slice(dataUrl.indexOf(',') + 1),
    };
  }
}

/** DocumentReference del informe de laboratorio (lo que dispara al bot). */
export function armarDocumentoLaboratorio(
  patient: Patient,
  attachment: Attachment,
  ahora = new Date()
): DocumentReference {
  return {
    resourceType: 'DocumentReference',
    status: 'current',
    type: { coding: [LOINC_INFORME_LABORATORIO], text: CATEGORIA_LABORATORIO_DISPLAY },
    category: [
      {
        coding: [
          { system: DOCUMENTO_CATEGORY_SYSTEM, code: CATEGORIA_LABORATORIO, display: CATEGORIA_LABORATORIO_DISPLAY },
        ],
      },
    ],
    subject: createReference(patient),
    author: [createReference(patient)],
    date: ahora.toISOString(),
    description: `Resultados de laboratorio enviados por el paciente (${attachment.title ?? 'PDF'})`,
    content: [{ attachment }],
  };
}

/** Consent del paciente para procesar ese documento puntual. */
export function armarConsentimientoProcesamiento(
  patient: Patient,
  documento: WithId<DocumentReference>,
  ahora = new Date()
): Consent {
  return {
    resourceType: 'Consent',
    status: 'active',
    scope: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'patient-privacy' }],
    },
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
            code: 'IDSCL',
            display: 'information disclosure',
          },
        ],
      },
    ],
    patient: createReference(patient),
    performer: [createReference(patient)],
    dateTime: ahora.toISOString(),
    // FHIR R4 exige (ppc-1) `policy` o `policyRule`: la norma bajo la que se otorga.
    policyRule: {
      coding: [
        {
          system: CONSENTIMIENTO_SYSTEM,
          code: CONSENTIMIENTO_PROCESAMIENTO,
          display: 'Procesamiento de datos de salud (Ley 25.326)',
        },
      ],
      text: TEXTO_AUTORIZACION,
    },
    provision: {
      type: 'permit',
      data: [{ meaning: 'instance', reference: createReference(documento) }],
    },
  };
}

/**
 * Envía un PDF de laboratorio: valida, sube el archivo, crea el DocumentReference y el
 * Consent. Sin consentimiento informado firmado no escribe nada (el bot lo re-verifica).
 */
export async function enviarLaboratorioPdf(
  medplum: MedplumClient,
  patient: Patient,
  file: File
): Promise<ResultadoEnvioEstudio> {
  if (!(await buscarConsentimiento(medplum, patient))) {
    return { ok: false, mensaje: MENSAJE_SIN_CONSENTIMIENTO };
  }
  const invalido = await validarPdf(file);
  if (invalido) {
    return { ok: false, mensaje: invalido };
  }

  const attachment = await subirPdf(medplum, patient, file);
  const documento = await medplum.createResource(armarDocumentoLaboratorio(patient, attachment));

  let consentimiento: WithId<Consent> | undefined;
  try {
    consentimiento = await medplum.createResource(armarConsentimientoProcesamiento(patient, documento));
  } catch (err) {
    console.warn('No se pudo registrar el Consent del estudio (el envío sigue válido):', err);
  }
  return { ok: true, documento, consentimiento };
}

/** PDFs de laboratorio que mandó el paciente, del más nuevo al más viejo. */
export async function cargarEstudiosEnviados(
  medplum: MedplumClient,
  patient: Patient
): Promise<WithId<DocumentReference>[]> {
  return medplum.searchResources(
    'DocumentReference',
    {
      subject: getReferenceString(patient),
      category: `${DOCUMENTO_CATEGORY_SYSTEM}|${CATEGORIA_LABORATORIO}`,
      _sort: '-date',
      _count: '10',
    },
    { cache: 'no-cache' }
  );
}

/**
 * Estado del procesamiento: el bot, al terminar, suma el DiagnosticReport que creó a
 * `context.related` del DocumentReference. Mientras no esté, el estudio está en proceso.
 */
export function estadoEstudio(doc: DocumentReference): EstadoEstudio {
  const informe = doc.context?.related?.find((r) => r.reference?.startsWith('DiagnosticReport/'))?.reference;
  return informe
    ? { estado: 'procesado', informeId: informe.slice('DiagnosticReport/'.length) }
    : { estado: 'en-proceso' };
}
