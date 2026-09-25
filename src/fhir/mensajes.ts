// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Mensajes (chat con el equipo) sobre FHIR `Communication`, con el mismo modelo que el
// `ThreadInbox` de Medplum que usa Recepción, así la bandeja del equipo ve todo:
//  - Conversación = Communication "topic": sin `partOf`, con `topic` (el MOTIVO).
//  - Mensaje = Communication hija: `partOf` → la conversación, `sender`, `sent`, `payload`.
// Las Novedades de la campanita también son Communication sin `partOf`, pero sin `topic` y
// sin hijas: nunca aparecen acá (src/fhir/notificaciones.ts).
//
// El motivo es obligatorio al escribir: `topic` lleva el código del CodeSystem SOM
// `motivo-mensaje` y su texto (que es lo que muestra el ThreadInbox como título).
import type { MedplumClient, WithId } from '@medplum/core';
import { createReference, generateId, getReferenceString } from '@medplum/core';
import type { Bundle, Communication, Patient } from '@medplum/fhirtypes';
import { SOM_SYSTEM } from './som';

export const MOTIVO_MENSAJE_SYSTEM = `${SOM_SYSTEM}/motivo-mensaje`;

export interface MotivoMensaje {
  readonly code: string;
  readonly titulo: string;
  readonly descripcion: string;
  /** Ayuda para escribir, adentro de la caja de texto. */
  readonly placeholder: string;
}

export const MOTIVOS_MENSAJE: readonly MotivoMensaje[] = [
  {
    code: 'turnos',
    titulo: 'Turnos y reservas',
    descripcion: 'Pedir, cambiar o cancelar un turno.',
    placeholder: 'Ej.: Quiero cambiar mi turno del miércoles para la semana que viene, por la mañana.',
  },
  {
    code: 'estudios',
    titulo: 'Estudios y resultados',
    descripcion: 'Tus estudios, su carga o sus resultados.',
    placeholder: 'Ej.: Subí el PDF de mi laboratorio pero no veo los valores en mis biomarcadores.',
  },
  {
    code: 'consulta-salud',
    titulo: 'Consulta sobre mi salud',
    descripcion: 'Una pregunta para tu equipo de salud.',
    placeholder: 'Contanos qué te pasa o qué querés consultar, desde cuándo y si tomás alguna medicación.',
  },
  {
    code: 'plan-bienestar',
    titulo: 'Mi Plan Bienestar',
    descripcion: 'Dudas sobre tus pasos, metas o cuestionarios.',
    placeholder: 'Ej.: No entiendo cómo registrar la actividad física de esta semana.',
  },
  {
    code: 'pagos',
    titulo: 'Pagos y membresía',
    descripcion: 'Pagos, señas, cobertura o tu membresía.',
    placeholder: 'Ej.: Hice la transferencia de la seña y no la veo registrada.',
  },
  {
    code: 'otro',
    titulo: 'Otro motivo',
    descripcion: 'Cualquier otra consulta.',
    placeholder: 'Escribí tu consulta.',
  },
];

export function motivoPorCodigo(code: string | null | undefined): MotivoMensaje | undefined {
  return MOTIVOS_MENSAJE.find((m) => m.code === code);
}

/** Motivo de una conversación; las que creó el equipo sin código muestran su texto. */
export function motivoDe(topic: Communication): { code?: string; titulo: string } {
  const code = topic.topic?.coding?.find((c) => c.system === MOTIVO_MENSAJE_SYSTEM)?.code;
  const motivo = motivoPorCodigo(code);
  return motivo ? { code: motivo.code, titulo: motivo.titulo } : { titulo: topic.topic?.text ?? 'Conversación' };
}

export function esMio(mensaje: Communication, patient: Patient): boolean {
  return mensaje.sender?.reference === getReferenceString(patient);
}

export function textoMensaje(mensaje: Communication): string {
  return (mensaje.payload ?? [])
    .map((p) => p.contentString)
    .filter((t): t is string => !!t?.trim())
    .join('\n');
}

/** Un mensaje del equipo que el paciente todavía no vio. */
export function esNoLeido(mensaje: Communication, patient: Patient): boolean {
  return !esMio(mensaje, patient) && mensaje.status === 'in-progress';
}

type Destinatario = NonNullable<Communication['recipient']>[number];

/** A quién le escribe el paciente: su médico de cabecera, si eligió uno. */
function destinatarios(patient: Patient): Destinatario[] {
  return [createReference(patient), ...(patient.generalPractitioner ?? []).slice(0, 1)];
}

/**
 * Crea la conversación y su primer mensaje en una sola transacción (así nunca queda una
 * conversación vacía, que la bandeja de Recepción no mostraría).
 */
export async function crearConversacion(
  medplum: MedplumClient,
  patient: Patient,
  motivoCode: string,
  texto: string
): Promise<WithId<Communication>> {
  const motivo = motivoPorCodigo(motivoCode);
  if (!motivo) {
    throw new Error('Elegí el motivo de tu mensaje.');
  }
  if (!texto.trim()) {
    throw new Error('Escribí tu mensaje.');
  }
  const paciente = createReference(patient);
  const recipient = destinatarios(patient);
  const uuidTopic = `urn:uuid:${generateId()}`;
  const resultado = await medplum.executeBatch({
    resourceType: 'Bundle',
    type: 'transaction',
    entry: [
      {
        fullUrl: uuidTopic,
        request: { method: 'POST', url: 'Communication' },
        resource: {
          resourceType: 'Communication',
          status: 'in-progress',
          subject: paciente,
          sender: paciente,
          recipient,
          topic: {
            coding: [{ system: MOTIVO_MENSAJE_SYSTEM, code: motivo.code, display: motivo.titulo }],
            text: motivo.titulo,
          },
        },
      },
      {
        request: { method: 'POST', url: 'Communication' },
        resource: {
          resourceType: 'Communication',
          status: 'in-progress',
          subject: paciente,
          sender: paciente,
          recipient: recipient.slice(1),
          partOf: [{ reference: uuidTopic }],
          sent: new Date().toISOString(),
          payload: [{ contentString: texto.trim() }],
        },
      },
    ],
  });
  const topic = resultado.entry?.[0]?.resource as WithId<Communication> | undefined;
  if (!topic?.id) {
    throw new Error('No pudimos enviar tu mensaje. Probá de nuevo en un rato.');
  }
  return topic;
}

/** Responde en una conversación (mismo formato que el ThreadChat del equipo). */
export async function enviarMensaje(
  medplum: MedplumClient,
  patient: Patient,
  topic: WithId<Communication>,
  texto: string
): Promise<WithId<Communication>> {
  const yo = getReferenceString(patient);
  return medplum.createResource<Communication>({
    resourceType: 'Communication',
    status: 'in-progress',
    subject: topic.subject ?? createReference(patient),
    sender: createReference(patient),
    recipient: topic.recipient?.filter((r) => r.reference !== yo) ?? [],
    partOf: [createReference(topic)],
    sent: new Date().toISOString(),
    payload: [{ contentString: texto.trim() }],
  });
}

/** Mensajes de una conversación, del más viejo al más nuevo. */
export async function cargarMensajes(
  medplum: MedplumClient,
  topic: WithId<Communication>
): Promise<WithId<Communication>[]> {
  return medplum.searchResources(
    'Communication',
    { 'part-of': getReferenceString(topic), _sort: 'sent', _count: '200' },
    { cache: 'no-cache' }
  );
}

/** Marca como leídos los mensajes del equipo (`completed` + `received`), como el ThreadChat. */
export async function marcarRecibidos(
  medplum: MedplumClient,
  patient: Patient,
  mensajes: WithId<Communication>[]
): Promise<void> {
  const ahora = new Date().toISOString();
  await Promise.all(
    mensajes
      .filter((m) => esNoLeido(m, patient))
      .map((m) =>
        medplum.patchResource('Communication', m.id, [
          { op: 'replace', path: '/status', value: 'completed' },
          { op: 'add', path: '/received', value: ahora },
        ])
      )
  );
}

export interface ResumenConversacion {
  readonly topic: WithId<Communication>;
  readonly titulo: string;
  readonly motivo?: string;
  readonly ultimo?: WithId<Communication>;
  readonly noLeidos: number;
  /** Última actividad (ISO), para ordenar. */
  readonly actividad: string;
}

/**
 * Conversaciones del paciente con al menos un mensaje, de la más activa a la menos.
 * Toma los últimos 200 mensajes y trae sus conversaciones (2 búsquedas, sin GraphQL).
 */
export async function cargarConversaciones(medplum: MedplumClient, patient: Patient): Promise<ResumenConversacion[]> {
  const mensajes = await medplum.searchResources(
    'Communication',
    { subject: getReferenceString(patient), 'part-of:missing': 'false', _sort: '-sent', _count: '200' },
    { cache: 'no-cache' }
  );
  const porConversacion = new Map<string, WithId<Communication>[]>();
  for (const m of mensajes) {
    const ref = m.partOf?.[0]?.reference;
    if (ref?.startsWith('Communication/')) {
      porConversacion.set(ref, [...(porConversacion.get(ref) ?? []), m]);
    }
  }
  if (porConversacion.size === 0) {
    return [];
  }
  const ids = [...porConversacion.keys()].map((r) => r.slice('Communication/'.length));
  const bundle: Bundle<Communication> = await medplum.search(
    'Communication',
    { _id: ids.join(','), _count: String(ids.length) },
    { cache: 'no-cache' }
  );
  const resumenes: ResumenConversacion[] = [];
  for (const entry of bundle.entry ?? []) {
    const topic = entry.resource as WithId<Communication> | undefined;
    if (!topic?.id) {
      continue;
    }
    const suyos = porConversacion.get(`Communication/${topic.id}`) ?? [];
    const ultimo = suyos[0];
    const { code, titulo } = motivoDe(topic);
    resumenes.push({
      topic,
      titulo,
      motivo: code,
      ultimo,
      noLeidos: suyos.filter((m) => esNoLeido(m, patient)).length,
      actividad: ultimo?.sent ?? topic.meta?.lastUpdated ?? '',
    });
  }
  return resumenes.sort((a, b) => b.actividad.localeCompare(a.actividad));
}
