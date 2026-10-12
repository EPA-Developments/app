// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Estudios adjuntos a un turno: la persona suma PDFs o fotos (o elige uno de los PDFs que
// ya mandó) para que el profesional que la atiende los vea antes de la consulta.
//
// CONTRATO con el dashboard de los profesionales (su ficha previa, «Adjuntó a este turno»):
// busca `DocumentReference?related=Appointment/<id>` (el search param `related` es
// `context.related`), SIN filtrar por status ni por categoría, y muestra
// `content[0].attachment.title ?? description` (con link si hay `attachment.url`) y `date`.
// El vínculo con el turno vive en el documento y no en `Appointment.supportingInformation`,
// porque la persona no puede escribir el turno (solo lo lee). Por eso:
//  - Adjuntar = crear un `DocumentReference` con `context.related` → `Appointment/<id>`.
//  - Quitar = SACAR esa referencia de `context.related` y pasar el documento a
//    `entered-in-error`. Si quedara la referencia, el dashboard lo seguiría mostrando.
//
// No es «Enviar estudios en PDF» (src/fhir/estudios.ts): la categoría `adjunto-turno` no
// dispara al bot `som-procesar-laboratorio` (su Subscription es solo sobre
// `resultado-laboratorio`, en create), así que lo adjunto no lo lee la IA ni se suma a los
// biomarcadores. Ver docs/adjuntos-turno.md.
//
// Todo se escribe en el compartimento de la persona (`DocumentReference` y `Binary`), que su
// AccessPolicy ya permite (docs/medplum/README.md). Sin consentimiento informado firmado no
// se escribe nada, igual que al enviar estudios.
import type { MedplumClient, WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { Appointment, Attachment, DocumentReference, Patient } from '@medplum/fhirtypes';
import { fmtHoraArg, TZ } from './agenda';
import { buscarConsentimiento } from './consentimiento';
import {
  ArchivoNoEnviable,
  detectarTipoArchivo,
  DOCUMENTO_CATEGORY_SYSTEM,
  JPEG,
  MAX_MB,
  PDF,
  PNG,
  subirArchivo,
  validarTamano,
} from './estudios';
import type { ResultadoEnvioEstudio, TipoArchivo } from './estudios';

/** Categoría propia (CodeSystem `documento`): no es la de laboratorio, no dispara al bot. */
export const CATEGORIA_ADJUNTO_TURNO = 'adjunto-turno';
export const CATEGORIA_ADJUNTO_TURNO_DISPLAY = 'Estudio adjunto a un turno';

/** Lo que se puede adjuntar: PDF y fotos. Se valida por la firma del archivo, no por esto. */
export const TIPOS_ADJUNTO: readonly TipoArchivo[] = [PDF, JPEG, PNG];
/** Para el `accept` del selector de archivos (tipos y extensiones: algunos celulares solo miran una). */
export const ACCEPT_ADJUNTO = 'application/pdf,.pdf,image/jpeg,.jpg,.jpeg,image/png,.png';

export const MENSAJE_SIN_CONSENTIMIENTO_ADJUNTO =
  'Antes de adjuntar estudios necesitamos que firmes el consentimiento informado.';
export const MENSAJE_TIPO_NO_ADMITIDO = `Ese archivo no es un PDF ni una foto en JPG o PNG. Subí el estudio en uno de esos formatos (hasta ${MAX_MB} MB).`;
export const MENSAJE_TURNO_CERRADO = 'Este turno ya no admite estudios adjuntos.';
const MENSAJE_SIN_CONEXION = 'No pudimos adjuntar el estudio. Revisá tu conexión y probá de nuevo en unos segundos.';
const MENSAJE_SIN_ARCHIVO = 'Ese estudio no tiene un archivo para adjuntar.';
const MENSAJE_NO_ES_ADJUNTO = 'Ese documento no es un estudio adjunto al turno: no se puede quitar desde acá.';
const MENSAJE_NO_ESTA_EN_EL_TURNO = 'Ese estudio no está adjunto a este turno.';
const MENSAJE_NO_SE_PUDO_QUITAR = 'No pudimos quitar el estudio. Revisá tu conexión y probá de nuevo en unos segundos.';

/** Si el turno no dice cuándo termina, se lo da por terminado una hora después del inicio. */
const DURACION_POR_OMISION_MS = 60 * 60_000;
const ESTADOS_CERRADOS: readonly Appointment['status'][] = ['cancelled', 'noshow', 'entered-in-error', 'fulfilled'];

const fmtFechaArg = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: TZ,
});

/** La referencia con la que el documento apunta al turno (y la que busca el dashboard). */
export function referenciaTurno(appointmentId: string): string {
  return `Appointment/${appointmentId}`;
}

/** «12 de octubre de 2026 a las 15:00», en hora de Argentina. */
export function cuandoEsElTurno(start: string): string {
  const d = new Date(start);
  return `${fmtFechaArg.format(d)} a las ${fmtHoraArg.format(d)}`;
}

/** ¿Es un estudio adjunto a un turno (y no, p. ej., un laboratorio o el consentimiento)? */
export function esAdjuntoDeTurno(doc: DocumentReference): boolean {
  return (doc.category ?? []).some((c) =>
    (c.coding ?? []).some((k) => k.system === DOCUMENTO_CATEGORY_SYSTEM && k.code === CATEGORIA_ADJUNTO_TURNO)
  );
}

/**
 * ¿Se pueden sumar (o quitar) estudios a este turno? No si se canceló, no vino, fue un
 * error de carga o ya se hizo; tampoco si ya terminó (`end`, o una hora después de `start`
 * si no dice cuándo termina). Un turno sin fecha todavía no terminó.
 */
export function puedeAdjuntar(appt: Pick<Appointment, 'status' | 'start' | 'end'>, ahora: Date = new Date()): boolean {
  if (ESTADOS_CERRADOS.includes(appt.status)) {
    return false;
  }
  const fin = appt.end ? Date.parse(appt.end) : appt.start ? Date.parse(appt.start) + DURACION_POR_OMISION_MS : NaN;
  return Number.isNaN(fin) || fin > ahora.getTime();
}

/** El DocumentReference que adjunta un archivo al turno (lo que lee el dashboard). */
export function armarAdjuntoTurno(
  patient: Patient,
  appointment: Pick<WithId<Appointment>, 'id' | 'start'>,
  attachment: Attachment,
  ahora: Date = new Date()
): DocumentReference {
  const titulo = attachment.title ?? 'estudio';
  const turno = appointment.start ? `el turno del ${cuandoEsElTurno(appointment.start)}` : 'el turno';
  return {
    resourceType: 'DocumentReference',
    status: 'current',
    type: { text: CATEGORIA_ADJUNTO_TURNO_DISPLAY },
    category: [
      {
        coding: [
          {
            system: DOCUMENTO_CATEGORY_SYSTEM,
            code: CATEGORIA_ADJUNTO_TURNO,
            display: CATEGORIA_ADJUNTO_TURNO_DISPLAY,
          },
        ],
      },
    ],
    subject: createReference(patient),
    author: [createReference(patient)],
    date: ahora.toISOString(),
    description: `Adjuntado para ${turno}: ${titulo}`,
    content: [{ attachment }],
    context: {
      related: [{ reference: referenciaTurno(appointment.id) }],
      ...(appointment.start ? { period: { start: appointment.start } } : {}),
    },
  };
}

/**
 * Valida un archivo para adjuntar: tamaño (hasta `MAX_MB`) y tipo por su firma (PDF, JPEG
 * o PNG). Devuelve el tipo detectado, o el mensaje para la persona.
 */
export async function validarAdjunto(
  file: File
): Promise<{ ok: true; contentType: TipoArchivo } | { ok: false; mensaje: string }> {
  const tamano = validarTamano(file, 'el archivo');
  if (tamano) {
    return { ok: false, mensaje: tamano };
  }
  const contentType = await detectarTipoArchivo(file);
  if (!contentType || !TIPOS_ADJUNTO.includes(contentType)) {
    return { ok: false, mensaje: MENSAJE_TIPO_NO_ADMITIDO };
  }
  return { ok: true, contentType };
}

/**
 * La identidad del archivo, para no adjuntar dos veces el mismo: el `Binary` al que apunta
 * (el server firma las URLs de nuevo en cada lectura, así que se mira su id y no la URL
 * entera) o, si viaja embebido, su título y tamaño.
 */
export function claveDeArchivo(a: Attachment | undefined): string | undefined {
  if (!a) {
    return undefined;
  }
  if (a.url) {
    const binario = /\bbinary\/([A-Za-z0-9\-.]{1,64})/i.exec(a.url);
    return binario ? `Binary/${binario[1]}` : a.url.split('?')[0];
  }
  if (a.data) {
    return `embebido:${a.title ?? ''}:${a.size ?? a.data.length}`;
  }
  return undefined;
}

/** Los estudios vigentes adjuntos al turno, del más nuevo al más viejo (sin caché). */
export async function cargarAdjuntosDelTurno(
  medplum: MedplumClient,
  appointmentId: string
): Promise<WithId<DocumentReference>[]> {
  const docs = await medplum.searchResources(
    'DocumentReference',
    { related: referenciaTurno(appointmentId), _sort: '-date', _count: '50' },
    { cache: 'no-cache' }
  );
  return docs.filter((d) => d.status === 'current');
}

/** Consentimiento firmado y turno abierto: si falta algo, el mensaje para la persona. */
async function antesDeEscribir(
  medplum: MedplumClient,
  patient: Patient,
  appointment: Appointment
): Promise<string | undefined> {
  if (!puedeAdjuntar(appointment)) {
    return MENSAJE_TURNO_CERRADO;
  }
  if (!(await buscarConsentimiento(medplum, patient))) {
    return MENSAJE_SIN_CONSENTIMIENTO_ADJUNTO;
  }
  return undefined;
}

function mensajeDeError(err: unknown): string {
  if (err instanceof ArchivoNoEnviable) {
    return err.message;
  }
  console.error('Adjuntar al turno:', err);
  return MENSAJE_SIN_CONEXION;
}

/**
 * Adjunta un archivo nuevo al turno: consentimiento → validar → subir el `Binary` → crear el
 * `DocumentReference`. Nunca lanza: si algo falla, `ok: false` con el mensaje para la persona.
 */
export async function adjuntarArchivo(
  medplum: MedplumClient,
  patient: Patient,
  appointment: WithId<Appointment>,
  file: File
): Promise<ResultadoEnvioEstudio> {
  try {
    const falta = await antesDeEscribir(medplum, patient, appointment);
    if (falta) {
      return { ok: false, mensaje: falta };
    }
    const valido = await validarAdjunto(file);
    if (!valido.ok) {
      return { ok: false, mensaje: valido.mensaje };
    }
    const attachment = await subirArchivo(medplum, patient, file, valido.contentType);
    const documento = await medplum.createResource(armarAdjuntoTurno(patient, appointment, attachment));
    return { ok: true, documento };
  } catch (err) {
    return { ok: false, mensaje: mensajeDeError(err) };
  }
}

/**
 * Adjunta al turno un PDF que ya mandó (de `cargarEstudiosEnviados`): crea un
 * `DocumentReference` NUEVO, de categoría `adjunto-turno`, que apunta al MISMO archivo. El
 * original no se toca: es un registro clínico que también actualiza el bot de laboratorio.
 * Si ese archivo ya está adjunto (y vigente) en el turno, no crea otro.
 */
export async function adjuntarDeMisEstudios(
  medplum: MedplumClient,
  patient: Patient,
  appointment: WithId<Appointment>,
  documento: DocumentReference
): Promise<ResultadoEnvioEstudio> {
  const original = documento.content?.[0]?.attachment;
  const clave = claveDeArchivo(original);
  if (!original || !clave) {
    return { ok: false, mensaje: MENSAJE_SIN_ARCHIVO };
  }
  try {
    const falta = await antesDeEscribir(medplum, patient, appointment);
    if (falta) {
      return { ok: false, mensaje: falta };
    }
    const vigentes = await cargarAdjuntosDelTurno(medplum, appointment.id);
    const yaAdjunto = vigentes.find((d) => claveDeArchivo(d.content?.[0]?.attachment) === clave);
    if (yaAdjunto) {
      return { ok: true, documento: yaAdjunto };
    }
    const attachment: Attachment = {
      contentType: original.contentType ?? PDF,
      ...(original.url ? { url: original.url } : { data: original.data }),
      ...(original.title ? { title: original.title } : {}),
      ...(original.size === undefined ? {} : { size: original.size }),
    };
    const copia = await medplum.createResource(armarAdjuntoTurno(patient, appointment, attachment));
    return { ok: true, documento: copia };
  } catch (err) {
    return { ok: false, mensaje: mensajeDeError(err) };
  }
}

/**
 * Quita un estudio del turno: saca `Appointment/<id>` de `context.related` (así el dashboard
 * deja de mostrarlo) y pasa el documento a `entered-in-error`, en un solo update. Solo toca
 * documentos de categoría `adjunto-turno`: un laboratorio, el consentimiento o cualquier
 * otro documento no se modifica nunca desde acá.
 */
export async function quitarAdjunto(
  medplum: MedplumClient,
  documento: WithId<DocumentReference>,
  appointmentId: string
): Promise<ResultadoEnvioEstudio> {
  if (!esAdjuntoDeTurno(documento)) {
    return { ok: false, mensaje: MENSAJE_NO_ES_ADJUNTO };
  }
  const { related, ...restoDelContexto } = documento.context ?? {};
  const quedan = (related ?? []).filter((r) => r.reference !== referenciaTurno(appointmentId));
  if (quedan.length === (related ?? []).length) {
    // No apunta a este turno: no hay nada que quitar (y no se marca un documento ajeno).
    return { ok: false, mensaje: MENSAJE_NO_ESTA_EN_EL_TURNO };
  }
  const context = { ...restoDelContexto, ...(quedan.length > 0 ? { related: quedan } : {}) };
  const quitado: WithId<DocumentReference> = { ...documento, status: 'entered-in-error', context };
  if (Object.keys(context).length === 0) {
    delete quitado.context; // FHIR no admite objetos vacíos
  }
  try {
    const actualizado = await medplum.updateResource(quitado);
    return { ok: true, documento: actualizado };
  } catch (err) {
    console.error('Quitar el adjunto del turno:', err);
    return { ok: false, mensaje: MENSAJE_NO_SE_PUDO_QUITAR };
  }
}
