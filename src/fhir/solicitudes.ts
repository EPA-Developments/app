// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Solicitudes de turno (modelo de "solicitud"): la paciente PIDE que Recepción coordine
// un turno y Recepción lo CONFIRMA con los bots de reserva (que aplican las reglas). Es la
// alternativa a reservar el horario directo (`src/fhir/agenda.ts`, bot
// `som-reservar-portal`). El portal nunca escribe la agenda: solo ejecuta el bot
// `som-solicitar-turno` y lee sus propias solicitudes (Task). Las consultas salen del
// catálogo FHIR (ActivityDefinition): nada de listas escritas a mano.
import type { MedplumClient } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { Patient, Task } from '@medplum/fhirtypes';
import type { Modalidad } from './agenda';
import { modalidadDeCoding } from './agenda';
import { buscarBotSOM } from './bots';

const BOT_SOLICITAR = 'som-solicitar-turno';

export interface NuevaSolicitud {
  servicio: string;
  servicioCodigo?: string;
  /** Fecha/hora preferida en ISO (opcional). */
  preferenciaInicio?: string;
  /** Preferencia en texto libre (opcional). */
  preferenciaTexto?: string;
  nota?: string;
  /** Teleconsulta o presencial. La teleconsulta exige el consentimiento (lo verifica el bot). */
  modalidad?: Modalidad;
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

/**
 * Pedido a Recepción con lo que la paciente eligió en "Reservar un turno" cuando la reserva
 * online no salió: la consulta, la modalidad y, si llegó a elegirlos, el horario y el profesional.
 */
export function pedidoDesdeReserva(eleccion: {
  consulta: string;
  servicioCodigo: string;
  modalidad: Modalidad;
  horarioInicio?: Date;
  profesional?: string;
}): NuevaSolicitud {
  return {
    servicio: eleccion.consulta,
    servicioCodigo: eleccion.servicioCodigo,
    modalidad: eleccion.modalidad,
    ...(eleccion.horarioInicio ? { preferenciaInicio: eleccion.horarioInicio.toISOString() } : {}),
    ...(eleccion.profesional ? { preferenciaTexto: `Con ${eleccion.profesional}` } : {}),
    nota: 'No se pudo reservar online: pedido desde "Reservar un turno".',
  };
}

/** Modalidad pedida en la solicitud (Task.input "modalidad", v3-ActCode VR / AMB). */
export function modalidadDeSolicitud(t: Task): Modalidad | undefined {
  return modalidadDeCoding(t.input?.find((i) => i.type?.text === 'modalidad')?.valueCoding);
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
