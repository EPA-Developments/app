// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// status de Appointment (FHIR R4) → etiqueta en español y color para el paciente.
// Compartido por "Mis turnos" y el seguimiento GLP-1.

export const ESTADOS_TURNO: Record<string, { label: string; color: string }> = {
  proposed: { label: 'Propuesto', color: 'gray' },
  // Reservado (por Recepción o desde el portal); falta la seña para confirmarlo.
  pending: { label: 'Reservado', color: 'yellow' },
  booked: { label: 'Confirmado', color: 'segundaOpinion' },
  arrived: { label: 'Presente', color: 'segundaOpinion' },
  'checked-in': { label: 'Check-in', color: 'segundaOpinion' },
  waitlist: { label: 'En espera', color: 'yellow' },
  fulfilled: { label: 'Realizado', color: 'gray' },
  cancelled: { label: 'Cancelado', color: 'red' },
  noshow: { label: 'No asististe', color: 'red' },
  'entered-in-error': { label: 'Error de carga', color: 'red' },
};

export function etiquetaTurno(status: string | undefined): string {
  return (status && ESTADOS_TURNO[status]?.label) || status || '—';
}
