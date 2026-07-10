// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import type { Patient } from '@medplum/fhirtypes';
import { DNI_SYSTEM, aplicarDemografia, leerDemografia } from './demografia';

const base: Patient = {
  resourceType: 'Patient',
  id: 'p1',
  name: [{ given: ['Ana'], family: 'García' }],
  telecom: [{ system: 'email', value: 'ana@example.com' }],
  identifier: [{ system: 'https://example.com/obra-social', value: 'OS-123' }],
};

test('aplicarDemografia escribe gender, birthDate, celular, DNI y domicilio', () => {
  const out = aplicarDemografia(base, {
    sexo: 'female',
    fechaNacimiento: '1972-05-10',
    celular: '+54 9 11 5555-1234',
    dni: '12345678',
    calle: 'Av. Belgrano 1782',
    localidad: 'CABA',
    provincia: 'Buenos Aires',
  });

  expect(out.gender).toBe('female');
  expect(out.birthDate).toBe('1972-05-10');
  expect(out.telecom).toContainEqual({ system: 'phone', use: 'mobile', value: '+54 9 11 5555-1234' });
  expect(out.identifier).toContainEqual({ system: DNI_SYSTEM, value: '12345678' });
  expect(out.address?.[0]).toMatchObject({
    use: 'home',
    line: ['Av. Belgrano 1782'],
    city: 'CABA',
    state: 'Buenos Aires',
    country: 'AR',
  });
});

test('aplicarDemografia preserva telecom e identifiers ajenos al formulario', () => {
  const out = aplicarDemografia(base, { sexo: 'male', celular: '111', dni: '99' });
  expect(out.telecom).toContainEqual({ system: 'email', value: 'ana@example.com' });
  expect(out.identifier).toContainEqual({ system: 'https://example.com/obra-social', value: 'OS-123' });
});

test('aplicarDemografia reemplaza celular y DNI previos sin duplicar', () => {
  const previo = aplicarDemografia(base, { celular: '111', dni: '11111111' });
  const out = aplicarDemografia(previo, { celular: '222', dni: '22222222' });
  expect(out.telecom?.filter((t) => t.system === 'phone')).toEqual([
    { system: 'phone', use: 'mobile', value: '222' },
  ]);
  expect(out.identifier?.filter((i) => i.system === DNI_SYSTEM)).toEqual([{ system: DNI_SYSTEM, value: '22222222' }]);
});

test('aplicarDemografia sin domicilio nuevo conserva el address existente', () => {
  const conDomicilio: Patient = { ...base, address: [{ use: 'home', city: 'Rosario' }] };
  const out = aplicarDemografia(conDomicilio, { sexo: 'other' });
  expect(out.address).toEqual([{ use: 'home', city: 'Rosario' }]);
});

test('leerDemografia hace round-trip con aplicarDemografia (prefill de invitados)', () => {
  const guardado = aplicarDemografia(base, {
    sexo: 'female',
    fechaNacimiento: '1970-01-15',
    celular: '+54 9 351 555-0000',
    dni: '20111222',
    calle: 'San Martín 450',
    localidad: 'Córdoba',
    provincia: 'Córdoba',
  });
  expect(leerDemografia(guardado)).toEqual({
    sexo: 'female',
    fechaNacimiento: '1970-01-15',
    celular: '+54 9 351 555-0000',
    dni: '20111222',
    calle: 'San Martín 450',
    localidad: 'Córdoba',
    provincia: 'Córdoba',
  });
});
