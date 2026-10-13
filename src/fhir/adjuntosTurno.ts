// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Estudios adjuntos a un turno: la persona suma PDFs o fotos (o elige uno de los PDFs que
// ya mandó) para que el profesional que la atiende los vea antes de la consulta.
//
// CONTRATO con el dashboard de los profesionales (su ficha previa, «Adjuntó a este turno»):
// busca `DocumentReference?related=Appointment/<id>&subject=Patient/<id>&status=current`
// (el search param `related` es `context.related`), sin filtrar por categoría, y muestra
// `content[0].attachment.title ?? description` (con link si hay `attachment.url`) y `date`.
// Su «historia de documentos» trae los vigentes de la persona (`subject` + `status=current`).
// El vínculo con el turno vive en el documento y no en `Appointment.supportingInformation`,
// porque la persona no puede escribir el turno (solo lo lee). Por eso:
//  - Adjuntar = crear un `DocumentReference` con `context.related` → `Appointment/<id>`.
//  - Quitar = SACAR esa referencia de `context.related` y pasar el documento a
//    `entered-in-error`. La ficha previa del dashboard lee solo `status=current`, así que ahí
//    deja de aparecer (la próxima vez que se abre: no se relee sola). Sus pantallas genéricas
//    (`/DocumentReference`, sin link desde la ficha) no filtran por status. Sacar la referencia
//    igual queda, para quien lea el turno sin filtrar por status.
//
// No es «Enviar estudios en PDF» (src/fhir/estudios.ts): la categoría `adjunto-turno` no
// dispara al bot `som-procesar-laboratorio` (su Subscription es solo sobre
// `resultado-laboratorio`, en create), así que lo adjunto no lo lee la IA ni se suma a los
// biomarcadores. Ver docs/adjuntos-turno.md.
//
// Todo se escribe en el compartimento de la persona (`DocumentReference` y `Binary`), que su
// AccessPolicy ya permite (docs/medplum/README.md). Sin consentimiento informado firmado no
// se escribe nada, igual que al enviar estudios.
//
// El archivo siempre va como `Binary` (`attachment.url`): el dashboard solo linkea la URL, así
// que un archivo embebido (`attachment.data`) el profesional no lo podría abrir. Por eso acá no
// hay el plan B de «Enviar estudios» (embeber los chicos si el server no deja crear el Binary):
// si no se puede subir, se dice, y un PDF que se mandó embebido no se ofrece para elegir.
import type { MedplumClient, WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { Appointment, Attachment, DocumentReference, Patient } from '@medplum/fhirtypes';
import { estadoReservaPortal, fmtHoraArg, TZ } from './agenda';
import { buscarConsentimiento } from './consentimiento';
import {
  ArchivoNoEnviable,
  detectarTipoArchivo,
  DOCUMENTO_CATEGORY_SYSTEM,
  esProhibido,
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
/** El server no deja crear el `Binary`: embebido, el profesional no lo podría abrir. */
export const MENSAJE_SIN_BINARIO =
  'Por ahora no podemos guardar el archivo para que lo abra el profesional. Mandalo por Mensajes y lo sumamos nosotros.';
/** Un PDF que se mandó embebido (sin `Binary`): el dashboard solo mostraría el nombre. */
export const MENSAJE_EMBEBIDO =
  'Ese estudio no se puede adjuntar desde acá: el profesional no podría abrirlo. Subilo de nuevo con «Subir un PDF o una foto».';
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

/** Por qué un turno ya no recibe estudios (lo que le dice la pantalla a la persona). */
export type MotivoSinAdjuntos = 'cancelado' | 'reserva-vencida' | 'terminado';

type TurnoParaAdjuntar = Pick<Appointment, 'status' | 'start' | 'end' | 'extension'>;

/**
 * Por qué no se pueden sumar (ni quitar) estudios a este turno, o undefined si se puede: se
 * canceló o fue un error de carga; la reserva del portal venció sin la seña (Recepción libera
 * el horario y lo cancela); no vino o ya se hizo; o ya terminó (`end`, o una hora después de
 * `start` si no dice cuándo termina). Un turno sin fecha todavía no terminó.
 */
export function porQueNoSeAdjunta(appt: TurnoParaAdjuntar, ahora: Date = new Date()): MotivoSinAdjuntos | undefined {
  if (appt.status === 'cancelled' || appt.status === 'entered-in-error') {
    return 'cancelado';
  }
  if (ESTADOS_CERRADOS.includes(appt.status)) {
    return 'terminado';
  }
  if (estadoReservaPortal(appt, ahora)?.estado === 'vencido') {
    return 'reserva-vencida';
  }
  const fin = appt.end ? Date.parse(appt.end) : appt.start ? Date.parse(appt.start) + DURACION_POR_OMISION_MS : NaN;
  return Number.isNaN(fin) || fin > ahora.getTime() ? undefined : 'terminado';
}

/** ¿Se pueden sumar (o quitar) estudios a este turno? (`porQueNoSeAdjunta` no tiene motivo.) */
export function puedeAdjuntar(appt: TurnoParaAdjuntar, ahora: Date = new Date()): boolean {
  return porQueNoSeAdjunta(appt, ahora) === undefined;
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

/**
 * ¿Este PDF que mandó se puede elegir para el turno? Vigente (no anulado) y guardado como
 * `Binary`, con URL: uno embebido el profesional no lo podría abrir desde el dashboard.
 */
export function sePuedeElegir(doc: DocumentReference): boolean {
  return doc.status !== 'entered-in-error' && !!doc.content?.[0]?.attachment?.url;
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
  if (esProhibido(err)) {
    console.error('Adjuntar al turno (el server no dejó crear el archivo):', err);
    return MENSAJE_SIN_BINARIO;
  }
  console.error('Adjuntar al turno:', err);
  return MENSAJE_SIN_CONEXION;
}

/**
 * Adjunta un archivo nuevo al turno: consentimiento → validar → subir el `Binary` → crear el
 * `DocumentReference`. Nunca lanza: si algo falla, `ok: false` con el mensaje para la persona.
 * Si el server no deja crear el `Binary`, no se embebe (el profesional no lo podría abrir):
 * `MENSAJE_SIN_BINARIO`.
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
    const attachment = await subirArchivo(medplum, patient, file, valido.contentType, { embeber: false });
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
 * Si ese archivo ya está adjunto (y vigente) en el turno, no crea otro. Uno que se mandó
 * embebido (sin `Binary`) no se adjunta: el profesional vería solo el nombre.
 */
export async function adjuntarDeMisEstudios(
  medplum: MedplumClient,
  patient: Patient,
  appointment: WithId<Appointment>,
  documento: DocumentReference
): Promise<ResultadoEnvioEstudio> {
  const original = documento.content?.[0]?.attachment;
  const clave = claveDeArchivo(original);
  if (!original?.url || !clave) {
    return { ok: false, mensaje: original?.data ? MENSAJE_EMBEBIDO : MENSAJE_SIN_ARCHIVO };
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
      url: original.url,
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
 * Quita un estudio del turno: saca `Appointment/<id>` de `context.related` y pasa el
 * documento a `entered-in-error` (así el dashboard deja de mostrarlo), en un solo update. Solo toca
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
