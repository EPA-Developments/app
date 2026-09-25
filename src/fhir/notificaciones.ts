// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Novedades (campanita del Header): notificaciones del sistema sobre FHIR `Communication`.
//
// Un solo recurso, dos superficies:
//  - Chat (Mensajes, `ThreadInbox`): hilos = Communication "topic" con hijas (`partOf`).
//  - Novedades: Communication SIN `partOf`, SIN hijas y con `category` de nuestro
//    CodeSystem `notificacion`. Nunca aparecen en el chat, y los mensajes del chat (que no
//    llevan esa category) nunca inflan el contador.
//
// Las crean los bots de Recepción / clínicos (`recepcionistas`). Contrato completo en
// docs/medplum/notificaciones.md. Estado: `in-progress` = no leída; al abrirla el portal
// la pasa a `completed` + `received`.
import type { MedplumClient, WithId } from '@medplum/core';
import type { Attachment, Communication } from '@medplum/fhirtypes';
import { SOM_SYSTEM } from './som';

/** CodeSystem propio de SOM para clasificar las notificaciones. */
export const NOTIFICACION_SYSTEM = `${SOM_SYSTEM}/notificacion`;

/** Tipos conocidos. Un código nuevo que mande un bot se muestra igual, como aviso general. */
export const TIPOS_NOTIFICACION = {
  'reserva-confirmada': 'Turno confirmado',
  recordatorio: 'Recordatorio',
  'pago-recibido': 'Pago recibido',
  'resultados-listos': 'Resultados listos',
  'documento-nuevo': 'Documento nuevo',
  general: 'Aviso',
} as const;

export type TipoNotificacion = keyof typeof TIPOS_NOTIFICACION;

const MAX_NOTIFICACIONES = 30;

function busqueda(recipient: string): Record<string, string> {
  return {
    recipient,
    // Cualquier código de nuestro CodeSystem: así el chat queda afuera.
    category: `${NOTIFICACION_SYSTEM}|`,
    'part-of:missing': 'true',
  };
}

/** Criteria de la Subscription (tiempo real) para las novedades del paciente. */
export function criteriaNotificaciones(recipient: string): string {
  return `Communication?recipient=${recipient}&category=${NOTIFICACION_SYSTEM}|`;
}

/** Últimas novedades del paciente, de la más nueva a la más vieja. */
export async function cargarNotificaciones(
  medplum: MedplumClient,
  recipient: string
): Promise<WithId<Communication>[]> {
  const lista = await medplum.searchResources(
    'Communication',
    { ...busqueda(recipient), _sort: '-sent', _count: String(MAX_NOTIFICACIONES) },
    { cache: 'no-cache' }
  );
  // Por las dudas: si algo tiene `partOf` es chat, no una notificación.
  return lista.filter((c) => !c.partOf?.length);
}

/** Cantidad de novedades sin leer (lo que muestra el badge). */
export async function contarNoLeidas(medplum: MedplumClient, recipient: string): Promise<number> {
  const bundle = await medplum.search(
    'Communication',
    { ...busqueda(recipient), status: 'in-progress', _summary: 'count' },
    { cache: 'no-cache' }
  );
  return bundle.total ?? 0;
}

export function esNoLeida(c: Communication): boolean {
  return c.status === 'in-progress';
}

/** Marca la novedad como leída (`completed` + `received`). Si ya lo estaba, no escribe. */
export async function marcarLeida(medplum: MedplumClient, c: WithId<Communication>): Promise<WithId<Communication>> {
  if (!esNoLeida(c)) {
    return c;
  }
  return medplum.patchResource('Communication', c.id, [
    { op: 'replace', path: '/status', value: 'completed' },
    { op: 'add', path: '/received', value: new Date().toISOString() },
  ]);
}

export async function marcarTodasLeidas(
  medplum: MedplumClient,
  lista: WithId<Communication>[]
): Promise<WithId<Communication>[]> {
  return Promise.all(lista.map((c) => marcarLeida(medplum, c)));
}

/** Tipo y título de la novedad según su `category`. */
export function tipoNotificacion(c: Communication): { tipo: TipoNotificacion; titulo: string } {
  const coding = c.category?.flatMap((cc) => cc.coding ?? []).find((cd) => cd.system === NOTIFICACION_SYSTEM);
  const code = coding?.code;
  if (code && code in TIPOS_NOTIFICACION) {
    const tipo = code as TipoNotificacion;
    return { tipo, titulo: TIPOS_NOTIFICACION[tipo] };
  }
  return { tipo: 'general', titulo: coding?.display ?? TIPOS_NOTIFICACION.general };
}

const relativo = new Intl.RelativeTimeFormat('es-AR', { numeric: 'auto' });

/** "recién", "hace 5 minutos", "ayer"…; después de una semana, la fecha corta. */
export function haceCuanto(iso: string, ahora = new Date()): string {
  const segundos = Math.round((new Date(iso).getTime() - ahora.getTime()) / 1000);
  const abs = Math.abs(segundos);
  if (abs < 60) {
    return 'recién';
  }
  if (abs < 3600) {
    return relativo.format(Math.round(segundos / 60), 'minute');
  }
  if (abs < 86400) {
    return relativo.format(Math.round(segundos / 3600), 'hour');
  }
  if (abs < 7 * 86400) {
    return relativo.format(Math.round(segundos / 86400), 'day');
  }
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

export function textoNotificacion(c: Communication): string {
  return (c.payload ?? [])
    .map((p) => p.contentString)
    .filter((t): t is string => !!t?.trim())
    .join('\n');
}

/** Adjunto de la novedad (p. ej. el comprobante de un pago). */
export function adjuntoNotificacion(c: Communication): Attachment | undefined {
  return c.payload?.find((p) => p.contentAttachment?.url || p.contentAttachment?.data)?.contentAttachment;
}

/**
 * A dónde lleva tocar la novedad: primero según el recurso real (`about`), después según el
 * tipo. Undefined = no navega (el texto ya dice todo).
 */
export function destinoNotificacion(c: Communication): string | undefined {
  const ref = c.about?.[0]?.reference ?? '';
  const [tipoRecurso, id] = ref.split('/');
  switch (tipoRecurso) {
    case 'Appointment':
    case 'Invoice':
      return '/membership';
    case 'DiagnosticReport':
      return id ? `/health-record/lab-results/${id}` : '/health-record';
    case 'MedicationRequest':
      return id ? `/health-record/medications/${id}` : '/health-record/medications';
    case 'CarePlan':
      return '/care-plan';
    case 'ServiceRequest':
      return '/mi-segunda-opinion';
    case 'Task':
      return '/get-care';
    case 'DocumentReference':
      return '/health-record';
    case 'Communication':
      return id ? `/Communication/${id}` : '/Communication';
  }
  switch (tipoNotificacion(c).tipo) {
    case 'reserva-confirmada':
    case 'recordatorio':
    case 'pago-recibido':
      return '/membership';
    case 'resultados-listos':
      return '/health-record/biomarkers';
    default:
      return undefined;
  }
}
