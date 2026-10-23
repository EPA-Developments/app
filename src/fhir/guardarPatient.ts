// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Guardar el Patient de la paciente sin pisar lo que escribió otro.
//
// El perfil de `medplum.getProfile()` se carga al iniciar sesión y no se refresca. Mientras
// tanto, el bot `ckm-recalculate` del dashboard puede escribir en el Patient las extensiones
// `CKMStage` y `hGraphData`. Si «Mis datos» o la Bienvenida guardan el Patient entero armado
// sobre ese perfil viejo:
// - sin más reglas, vuelven esas extensiones a sus valores viejos;
// - con la `writeConstraint` de la policy de la paciente (recepcionistas#115: ella no puede
//   cambiar `CKMStage` ni `hGraphData`), el servidor responde 403.
//
// Por eso se guarda siempre sobre la versión más nueva: se relee el Patient sin caché, se le
// aplican sólo los cambios de la pantalla y se guarda con If-Match sobre la versión leída. Si
// otro escribió en el medio (412), se relee y se reintenta una vez. Si vuelve a fallar, o si el
// servidor no lo deja (403), la pantalla avisa con TEXTO_NO_SE_PUDO_GUARDAR y no pierde lo que
// cargó la paciente. Contrato: docs/handoff-app-serie-ckm.md de recepcionistas.
import type { MedplumClient, WithId } from '@medplum/core';
import { getStatus, isOperationOutcome, OperationOutcomeError } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';

/** Lo que ve la paciente cuando no se pudo guardar (412 dos veces, o 403). */
export const TEXTO_NO_SE_PUDO_GUARDAR = 'No pudimos guardar, probá de nuevo.';

/** El HTTP de un error del cliente de Medplum, si lo trae. */
function estadoDe(err: unknown): number | undefined {
  if (err instanceof OperationOutcomeError) {
    return getStatus(err.outcome);
  }
  const outcome = (err as { outcome?: unknown } | undefined)?.outcome;
  return isOperationOutcome(outcome) ? getStatus(outcome) : undefined;
}

/** El encabezado If-Match de una versión (vacío si el recurso no trae versión). */
function siCoincide(patient: Patient): Record<string, string> {
  const version = patient.meta?.versionId;
  return version ? { 'If-Match': `W/"${version}"` } : {};
}

/**
 * Relee el Patient `id` sin caché, le aplica `aplicar` y lo guarda con If-Match. Ante un 412
 * relee y reintenta una vez; un segundo 412 o un 403 se convierten en un Error con
 * TEXTO_NO_SE_PUDO_GUARDAR (el original va en `cause`). Cualquier otro error sube tal cual.
 *
 * `aplicar` recibe la versión recién leída: tiene que tocar sólo los campos de la pantalla y
 * nunca copiar extensiones de un perfil viejo.
 */
export async function guardarPatient(
  medplum: MedplumClient,
  id: string,
  aplicar: (patient: Patient) => Patient
): Promise<WithId<Patient>> {
  for (let intento = 1; ; intento++) {
    const leido = await medplum.readResource('Patient', id, { cache: 'no-cache' });
    try {
      return await medplum.updateResource<Patient>(aplicar(leido), { headers: siCoincide(leido) });
    } catch (err) {
      const estado = estadoDe(err);
      if (estado === 412 && intento === 1) {
        continue;
      }
      if (estado === 412 || estado === 403) {
        throw new Error(TEXTO_NO_SE_PUDO_GUARDAR, { cause: err });
      }
      throw err;
    }
  }
}
