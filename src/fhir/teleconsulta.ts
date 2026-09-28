// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Teleconsulta del paciente: entrar a la videollamada, cancelar (R-14) y pagar la seña
// (R-23). Todo pasa por los bots de SOM `som-teleconsulta-*` de recepcionistas (resueltos
// con `buscarBotSOM`): el portal nunca escribe el turno ni ejecuta bots de otro proyecto.
// Modelo de SOM: modalidad v3-ActCode `VR` en la extensión `modalidad`, link de Jitsi en
// `teleconsulta-url` y seña en `link-pago-sena`.
import type { MedplumClient } from '@medplum/core';
import type { Appointment } from '@medplum/fhirtypes';
import { buscarBotSOM } from './bots';
import { modalidadesDe } from './agenda';

export const BOT_TELECONSULTA = {
  entrar: 'som-teleconsulta-entrar',
  cancelar: 'som-teleconsulta-cancelar',
  pago: 'som-teleconsulta-pago',
} as const;

type NombreBotTeleconsulta = (typeof BOT_TELECONSULTA)[keyof typeof BOT_TELECONSULTA];

export const MENSAJE_TELECONSULTA_NO_DISPONIBLE =
  'Esta acción todavía no está disponible en el portal. Escribinos por Mensajes y lo resolvemos.';
const MENSAJE_SIN_CONEXION = 'No pudimos conectar. Probá de nuevo en unos segundos.';

export interface RespuestaTeleconsulta {
  ok: boolean;
  mensaje?: string;
}

/** Respuesta de `som-teleconsulta-entrar`. */
export interface RespuestaEntrar extends RespuestaTeleconsulta {
  url?: string;
  /** Si la sala todavía no abrió: desde cuándo (ISO). */
  abre?: string;
  /** Falta la seña. */
  pagar?: boolean;
}

/** Respuesta de `som-teleconsulta-cancelar`. */
export interface RespuestaCancelar extends RespuestaTeleconsulta {
  cancelado?: boolean;
  conSena?: boolean;
  incluida?: boolean;
  consumeSesion?: boolean;
  devuelveSaldo?: boolean;
}

/** Respuesta de `som-teleconsulta-pago`. */
export interface RespuestaPago extends RespuestaTeleconsulta {
  url?: string;
  senaARS?: number;
  expira?: string;
}

async function ejecutar<T extends RespuestaTeleconsulta>(
  medplum: MedplumClient,
  nombre: NombreBotTeleconsulta,
  input: Record<string, unknown>
): Promise<T> {
  try {
    const bot = await buscarBotSOM(medplum, nombre);
    if (!bot?.id) {
      return { ok: false, mensaje: MENSAJE_TELECONSULTA_NO_DISPONIBLE } as T;
    }
    return (await medplum.executeBot(bot.id, input)) as T;
  } catch {
    return { ok: false, mensaje: MENSAJE_SIN_CONEXION } as T;
  }
}

export function entrarTeleconsulta(medplum: MedplumClient, appointmentId: string): Promise<RespuestaEntrar> {
  return ejecutar<RespuestaEntrar>(medplum, BOT_TELECONSULTA.entrar, { appointmentId });
}

/** Sin `confirmar` solo informa qué pasaría (R-14); con `confirmar` cancela. */
export function cancelarTeleconsulta(medplum: MedplumClient, appointmentId: string, confirmar: boolean): Promise<RespuestaCancelar> {
  return ejecutar<RespuestaCancelar>(medplum, BOT_TELECONSULTA.cancelar, { appointmentId, confirmar });
}

export function pagarSenaTeleconsulta(medplum: MedplumClient, appointmentId: string): Promise<RespuestaPago> {
  return ejecutar<RespuestaPago>(medplum, BOT_TELECONSULTA.pago, { appointmentId });
}

/** ¿Es una teleconsulta de SOM? (extensión `modalidad` = v3-ActCode `VR`). */
export function esTeleconsulta(appt: Appointment): boolean {
  return modalidadesDe(appt).includes('teleconsulta');
}

/** Estados en los que la paciente puede cancelar una teleconsulta futura desde el portal. */
export function puedeCancelar(appt: Appointment, ahora: Date = new Date()): boolean {
  return (
    esTeleconsulta(appt) &&
    (appt.status === 'pending' || appt.status === 'proposed' || appt.status === 'booked') &&
    !!appt.start &&
    Date.parse(appt.start) > ahora.getTime()
  );
}

/** ¿Puede ir a la sala? (confirmada y sin terminar; la hora la controla el bot). */
export function puedeEntrar(appt: Appointment, ahora: Date = new Date()): boolean {
  return (
    esTeleconsulta(appt) &&
    (appt.status === 'booked' || appt.status === 'arrived' || appt.status === 'checked-in') &&
    (!appt.end || Date.parse(appt.end) > ahora.getTime())
  );
}

const CHECKOUT_MP = /^https:\/\/([a-z0-9-]+\.)*mercadopago\.com(\.[a-z]{2})?\//i;

/** Solo se sigue un checkout de Mercado Pago (nunca `javascript:` ni otro host). */
export function esUrlDePago(url: string | undefined): url is string {
  return typeof url === 'string' && CHECKOUT_MP.test(url);
}

/** El link de la videollamada tiene que ser https (el Jitsi de SOM). */
export function esUrlDeSala(url: string | undefined): url is string {
  if (!url) {
    return false;
  }
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}
