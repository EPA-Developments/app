// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Único punto por el que el portal resuelve un Bot antes de ejecutarlo.
// REGLA: el portal de SOM solo ejecuta bots propios de SOM (prefijo `som-`) del
// proyecto SOM. Nunca bots de otros proyectos, aunque estuvieran visibles por un
// proyecto vinculado.
import type { MedplumClient } from '@medplum/core';
import type { Bot } from '@medplum/fhirtypes';

export const SOM_BOT_PREFIX = 'som-';

/** ¿El bot pertenece a SOM? (nombre `som-*` y, si el server informa el proyecto, el de SOM). */
export function esBotSOM(bot: Bot, nombre: string, projectId: string | undefined): boolean {
  if (!nombre.startsWith(SOM_BOT_PREFIX) || bot.name !== nombre) {
    return false;
  }
  const proyecto = bot.meta?.project;
  return !proyecto || !projectId || proyecto === projectId;
}

/** Busca un bot de SOM por nombre exacto; undefined si no existe o no es de SOM. */
export async function buscarBotSOM(medplum: MedplumClient, nombre: string): Promise<Bot | undefined> {
  if (!nombre.startsWith(SOM_BOT_PREFIX)) {
    throw new Error(`El portal solo ejecuta bots de SOM (${SOM_BOT_PREFIX}*): "${nombre}" no está permitido.`);
  }
  // `name:exact`: la búsqueda FHIR por `name=` es POR PREFIJO ("som-solicitar" también
  // matchea "som-solicitar-turno") y ejecutaríamos el bot equivocado.
  const bot = await medplum.searchOne('Bot', `name:exact=${nombre}`);
  if (!bot?.id || !esBotSOM(bot, nombre, import.meta.env.MEDPLUM_PROJECT_ID)) {
    return undefined;
  }
  return bot;
}
