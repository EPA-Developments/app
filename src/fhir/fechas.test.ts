// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Las fechas que ve la persona salen en castellano y en hora de Argentina, sin importar el
// idioma ni la zona del navegador.
import { fechaDelTurno, fechaYHora } from './fechas';

test('un turno de la tarde sale en hora de Argentina, con reloj de 24 horas', () => {
  // 22:30 UTC = 19:30 en Argentina.
  expect(fechaDelTurno('2026-10-13T22:30:00Z')).toBe('martes 13 de octubre de 2026, 19:30');
  expect(fechaYHora('2026-10-13T22:30:00Z')).toBe('13 de octubre de 2026, 19:30');
});

test('no sale en formato de Estados Unidos ni con a. m. / p. m.', () => {
  const texto = fechaDelTurno('2026-10-13T22:30:00Z');
  expect(texto).not.toMatch(/10\/13|PM|AM|m\./);
});

test('la hora de Argentina puede caer en otro día que la de UTC', () => {
  // 01:00 UTC del 14 = 22:00 del 13 en Argentina.
  expect(fechaDelTurno('2026-10-14T01:00:00Z')).toBe('martes 13 de octubre de 2026, 22:00');
});

test('la medianoche sale 00:00', () => {
  expect(fechaYHora('2026-10-14T03:00:00Z')).toBe('14 de octubre de 2026, 00:00');
});

test('una fecha sin hora es un día de Argentina y sale sin hora', () => {
  expect(fechaYHora('2026-10-13')).toBe('13 de octubre de 2026');
  expect(fechaDelTurno('2026-10-13')).toBe('martes 13 de octubre de 2026');
});

test('sin fecha o con una que no se entiende, vacío', () => {
  expect(fechaYHora(undefined)).toBe('');
  expect(fechaYHora('no es una fecha')).toBe('');
  expect(fechaDelTurno('')).toBe('');
});
