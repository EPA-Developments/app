// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import type { Bot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { buscarBotSOM, esBotSOM } from './bots';

const SOM = '7ce5e559-f315-4538-abf2-61fa4922f996';

test('esBotSOM acepta solo bots som-* con el nombre exacto', () => {
  const bot: Bot = { resourceType: 'Bot', name: 'som-solicitar' };
  expect(esBotSOM(bot, 'som-solicitar', SOM)).toBe(true);
  expect(esBotSOM({ ...bot, name: 'som-solicitar-turno' }, 'som-solicitar', SOM)).toBe(false);
  expect(esBotSOM({ ...bot, name: 'bw-solicitar-turno' }, 'bw-solicitar-turno', SOM)).toBe(false);
});

test('esBotSOM rechaza bots de otro proyecto', () => {
  const bot: Bot = { resourceType: 'Bot', name: 'som-solicitar', meta: { project: SOM } };
  expect(esBotSOM(bot, 'som-solicitar', SOM)).toBe(true);
  expect(esBotSOM({ ...bot, meta: { project: '7f068d7d-otro-proyecto' } }, 'som-solicitar', SOM)).toBe(false);
});

test('buscarBotSOM se niega a resolver bots que no son de SOM', async () => {
  await expect(buscarBotSOM(new MockClient(), 'bw-reservar-turno')).rejects.toThrow('solo ejecuta bots de SOM');
});
