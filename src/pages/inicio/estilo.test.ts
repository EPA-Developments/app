// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import type { Patient, Practitioner } from '@medplum/fhirtypes';
import { estiloDeHome, estiloForzado } from './estilo';

const HOY = '2026-10-10';

function paciente(gender: Patient['gender'], birthDate?: string): Patient {
  return { resourceType: 'Patient', gender, birthDate };
}

describe('estiloDeHome: mujeres de 45 a 55 años ven el E; el resto, el D', () => {
  test.each([
    ['cumple 55 hoy', '1971-10-10', 'E'],
    ['tiene 55 y cumple 56 mañana', '1970-10-11', 'E'],
    ['cumple 56 hoy', '1970-10-10', 'D'],
    ['cumple 45 hoy', '1981-10-10', 'E'],
    ['tiene 44 y cumple 45 mañana', '1981-10-11', 'D'],
    ['tiene 50', '1976-03-15', 'E'],
    ['tiene 30', '1996-01-01', 'D'],
    ['tiene 70', '1956-01-01', 'D'],
  ] as const)('mujer que %s → %s', (_caso, nacimiento, esperado) => {
    expect(estiloDeHome(paciente('female', nacimiento), HOY)).toBe(esperado);
  });

  test.each(['male', 'other', 'unknown', undefined] as const)('sexo %s → D aunque tenga 50 años', (gender) => {
    expect(estiloDeHome(paciente(gender, '1976-03-15'), HOY)).toBe('D');
  });

  test('sin fecha de nacimiento, vacía o ilegible → D', () => {
    expect(estiloDeHome(paciente('female'), HOY)).toBe('D');
    expect(estiloDeHome(paciente('female', ''), HOY)).toBe('D');
    expect(estiloDeHome(paciente('female', 'no-es-fecha'), HOY)).toBe('D');
  });

  test('una fecha de nacimiento futura → D', () => {
    expect(estiloDeHome(paciente('female', '2030-01-01'), HOY)).toBe('D');
  });

  test('un perfil que no es Patient → D (aunque sea mujer de 50)', () => {
    const profesional: Practitioner = { resourceType: 'Practitioner', gender: 'female', birthDate: '1976-03-15' };
    expect(estiloDeHome(profesional, HOY)).toBe('D');
    expect(estiloDeHome(undefined, HOY)).toBe('D');
  });

  test('fecha parcial: se toma el primer día del período (la mayor edad posible), como la elegibilidad del plan', () => {
    expect(estiloDeHome(paciente('female', '1971'), HOY)).toBe('E'); // 55
    expect(estiloDeHome(paciente('female', '1970'), HOY)).toBe('D'); // 56
    expect(estiloDeHome(paciente('female', '1981-11'), HOY)).toBe('D'); // 44
  });
});

describe('estiloForzado: ?estilo= en la URL', () => {
  test('acepta e / d sin importar mayúsculas ni espacios', () => {
    expect(estiloForzado('e')).toBe('E');
    expect(estiloForzado(' D ')).toBe('D');
  });

  test('cualquier otro valor no fuerza nada', () => {
    expect(estiloForzado(null)).toBeUndefined();
    expect(estiloForzado(undefined)).toBeUndefined();
    expect(estiloForzado('')).toBeUndefined();
    expect(estiloForzado('clasica')).toBeUndefined();
  });
});
