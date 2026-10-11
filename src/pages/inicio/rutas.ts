// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Rutas del portal que usan las Homes E y D (las que no exporta ya otro módulo).

export const RUTA_PLAN_BIENESTAR = '/care-plan/plan-100-dias';
export const RUTA_TABLERO_LE8 = '/care-plan/plan-100-dias/tablero';
export const RUTA_MI_SEGUNDA_OPINION = '/mi-segunda-opinion';
export const RUTA_SOLICITAR_SEGUNDA_OPINION = '/solicitar-som';
/** Reservar una consulta por videollamada: el asistente de reserva arranca con esa modalidad elegida. */
export const RUTA_RESERVAR_TELECONSULTA = '/get-care?modalidad=teleconsulta';
/** Donde están los turnos de la paciente («Mis turnos», en Membresía). */
export const RUTA_MIS_TURNOS = '/membership';
