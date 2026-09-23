// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Solicitudes de turno (modelo de "solicitud"): el paciente PIDE un turno para una
// consulta o estudio cardiovascular y Recepción lo CONFIRMA con los bots de reserva
// (que aplican las reglas). El portal nunca escribe la agenda: solo ejecuta el bot
// `som-solicitar-turno` (único bot de turnos que su AccessPolicy le permite) y lee sus
// propias solicitudes (Task).
import type { MedplumClient } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { Patient, Task } from '@medplum/fhirtypes';
import { buscarBotSOM } from './bots';

const BOT_SOLICITAR = 'som-solicitar-turno';

/**
 * Servicios cardiovasculares ofrecibles en la solicitud de turno. Son las "familias"
 * públicas del catálogo (sin precios ni reglas, que viven en Recepción). Recepción elige
 * el servicio/práctica exacto al confirmar.
 *
 * ⚠️ Estos `codigo` deben COINCIDIR con el catálogo del backend `recepcionistas` y con lo
 * que valida el bot `som-solicitar-turno`. Validar también contra segundaopinionmedica.org.
 */
export const SERVICIOS: { codigo: string; label: string }[] = [
  { codigo: 'CONSULTA_CARDIO', label: 'Consulta cardiológica' },
  { codigo: 'EVALUACION_INICIAL', label: 'Evaluación inicial' },
  { codigo: 'TELECONSULTA', label: 'Teleconsulta' },
  { codigo: 'ECG', label: 'Electrocardiograma (ECG)' },
  { codigo: 'ECOCARDIOGRAMA', label: 'Ecocardiograma Doppler' },
  { codigo: 'ERGOMETRIA', label: 'Ergometría' },
  { codigo: 'HOLTER', label: 'Holter 24 h' },
  { codigo: 'MAPA', label: 'MAPA (presión 24 h)' },
  { codigo: 'MONITOREO_REMOTO', label: 'Monitoreo remoto' },
  { codigo: 'REHABILITACION_CV', label: 'Rehabilitación cardiovascular' },
  { codigo: 'LABORATORIO_CARDIO', label: 'Laboratorio cardiometabólico' },
];

export interface NuevaSolicitud {
  servicio: string;
  servicioCodigo?: string;
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
  const bot = await buscarBotSOM(medplum, BOT_SOLICITAR);
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
  accepted: { label: 'En proceso', color: 'segundaOpinion' },
  'in-progress': { label: 'En proceso', color: 'segundaOpinion' },
  completed: { label: 'Resuelta', color: 'gray' },
  cancelled: { label: 'Cancelada', color: 'red' },
  rejected: { label: 'Rechazada', color: 'red' },
};
