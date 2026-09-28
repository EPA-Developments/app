// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Los errores de autenticación del servidor Medplum llegan en inglés: acá se pasan a
// castellano los habituales. Lo que no está en la lista se muestra como vino.
import { normalizeOperationOutcome } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';

const TRADUCCIONES: [RegExp, string][] = [
  [/email or password is invalid|invalid password|incorrect password/i, 'El email o la contraseña no son correctos.'],
  [/email already registered|user already exists/i, 'Ya existe una cuenta con ese email. Probá iniciar sesión.'],
  [/breach/i, 'Esa contraseña apareció en filtraciones de datos. Elegí otra.'],
  [/password.*(8|characters|too short)/i, 'La contraseña tiene que tener al menos 8 caracteres.'],
  [/recaptcha/i, 'No pudimos verificar que no seas un robot. Probá de nuevo.'],
  [/(invalid|valid) email|email.*(invalid|format)/i, 'El email no es válido.'],
  [/email not found|user not found/i, 'No encontramos una cuenta con ese email.'],
  [/too many/i, 'Hiciste muchos intentos. Esperá unos minutos y probá de nuevo.'],
  [/login (revoked|expired)|already (used|granted)/i, 'Ese ingreso venció. Volvé a empezar.'],
  [/invalid (mfa|token|code)/i, 'El código no es correcto.'],
  [/not verified|verify your email/i, 'Primero confirmá tu email con el link que te enviamos.'],
];

export function traducirMensaje(texto: string | undefined): string | undefined {
  if (!texto) {
    return texto;
  }
  return TRADUCCIONES.find(([patron]) => patron.test(texto))?.[1] ?? texto;
}

/** Error de la API (OperationOutcome, Error o texto) con sus mensajes en castellano. */
export function errorEnCastellano(err: unknown): OperationOutcome {
  const outcome = normalizeOperationOutcome(err);
  return {
    ...outcome,
    issue: outcome.issue.map((i) => ({
      ...i,
      ...(i.details ? { details: { ...i.details, text: traducirMensaje(i.details.text) } } : {}),
      ...(i.diagnostics ? { diagnostics: traducirMensaje(i.diagnostics) } : {}),
    })),
  };
}
