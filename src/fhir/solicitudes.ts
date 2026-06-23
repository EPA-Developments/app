// SPDX-FileCopyrightText: Copyright BioWellness
// SPDX-License-Identifier: Apache-2.0
//
// Solicitudes de turno (modelo de "solicitud"): el paciente PIDE un turno y
// Recepción lo CONFIRMA con los bots de reserva (que aplican las reglas). El portal
// nunca escribe la agenda: solo ejecuta el bot `bw-solicitar-turno` (único bot que
// su AccessPolicy le permite) y lee sus propias solicitudes (Task).
import type { MedplumClient } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { Patient, Task } from '@medplum/fhirtypes';

const BOT_SOLICITAR = 'bw-solicitar-turno';

/**
 * Terapias ofrecibles en la solicitud. Son las "familias" públicas del catálogo
 * (sin precios ni reglas, que viven en Recepción). Recepción elige el servicio
 * exacto al confirmar.
 */
export const TERAPIAS: { codigo: string; label: string }[] = [
  { codigo: 'HBOT', label: 'Cámara hiperbárica (HBOT)' },
  { codigo: 'IHHT', label: 'IHHT (hipoxia–hiperoxia)' },
  { codigo: 'RED_LIGHT', label: 'Red Light' },
  { codigo: 'RECOVERY_PRO', label: 'Recovery Pro' },
  { codigo: 'COMPRESION', label: 'Compresión' },
  { codigo: 'CRIO', label: 'Crioterapia' },
  { codigo: 'IV_THERAPY', label: 'Terapia IV' },
  { codigo: 'TERAPIA_BIOLOGICA', label: 'Terapia biológica' },
  { codigo: 'MASAJE_OSTEOPATIA', label: 'Masaje / Osteopatía' },
  { codigo: 'CONSULTA', label: 'Consulta médica' },
];

export interface NuevaSolicitud {
  terapia: string;
  terapiaCodigo?: string;
  /** Fecha/hora preferida en ISO (opcional). */
  preferenciaInicio?: string;
  /** Preferencia en texto libre (opcional). */
  preferenciaTexto?: string;
  nota?: string;
}

export interface ResultadoSolicitud {
  ok: boolean;
  mensaje?: string;
  taskId?: string;
  avisada?: boolean;
}

/** Crea una solicitud llamando al bot de recepción (no escribe la agenda). */
export async function crearSolicitud(
  medplum: MedplumClient,
  patient: Patient,
  s: NuevaSolicitud
): Promise<ResultadoSolicitud> {
  const bot = await medplum.searchOne('Bot', `name=${BOT_SOLICITAR}`);
  if (!bot?.id) {
    return {
      ok: false,
      mensaje: 'La reserva online todavía no está disponible. Escribinos por Mensajes y coordinamos tu turno.',
    };
  }
  return (await medplum.executeBot(bot.id, {
    pacienteRef: getReferenceString(patient),
    ...s,
  })) as ResultadoSolicitud;
}

/** Solicitudes del propio paciente (las crea el bot; el paciente solo las lee). */
export async function cargarMisSolicitudes(medplum: MedplumClient, patient: Patient): Promise<Task[]> {
  return medplum.searchResources(
    'Task',
    `patient=${getReferenceString(patient)}&code=solicitud-turno&_sort=-_lastUpdated&_count=50`
  );
}

/** Estado de la solicitud (Task.status) → etiqueta y color para el paciente. */
export const ESTADO_SOLICITUD: Record<string, { label: string; color: string }> = {
  requested: { label: 'Pendiente', color: 'yellow' },
  received: { label: 'Recibida', color: 'yellow' },
  accepted: { label: 'En proceso', color: 'biowellness' },
  'in-progress': { label: 'En proceso', color: 'biowellness' },
  completed: { label: 'Resuelta', color: 'gray' },
  cancelled: { label: 'Cancelada', color: 'red' },
  rejected: { label: 'Rechazada', color: 'red' },
};
