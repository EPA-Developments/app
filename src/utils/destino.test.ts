// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { destinoSeguro, rutaIngresar } from './destino';

const RUTA = '/health-record/consent/teleconsulta';

test('acepta las rutas internas del portal, con su query', () => {
  expect(destinoSeguro(RUTA)).toBe(RUTA);
  expect(destinoSeguro(`${RUTA}?utm_source=whatsapp`)).toBe(`${RUTA}?utm_source=whatsapp`);
  expect(destinoSeguro('/get-care')).toBe('/get-care');
});

test('rechaza lo que no es una ruta interna (open redirect) y el ingreso mismo (loop)', () => {
  for (const malo of [
    null,
    undefined,
    '',
    'health-record/x',
    '//evil.example',
    '/\\evil.example',
    '/x\\y',
    'https://evil.example',
    'javascript:alert(1)',
    '/x\u0000y',
    '/x\ny',
    `/${'a'.repeat(600)}`,
    '/',
    '/?a=1',
    '/signin',
    '/signin/',
    '/signin?next=/x',
    '/register',
    '/signout',
    '/setpassword/a/b',
    // El router no distingue mayúsculas: también son el ingreso, el registro y la salida.
    '/SignOut',
    '/SIGNIN',
    '/SIGNIN?next=/x',
    '/Register',
    '/SetPassword/a/b',
  ]) {
    expect(destinoSeguro(malo), String(malo)).toBeUndefined();
  }
});

test('rutaIngresar: el ingreso que vuelve al destino, o el inicio si el destino no sirve', () => {
  expect(rutaIngresar(RUTA)).toBe('/signin?next=%2Fhealth-record%2Fconsent%2Fteleconsulta');
  expect(rutaIngresar(`${RUTA}?utm_source=whatsapp`)).toBe(
    '/signin?next=%2Fhealth-record%2Fconsent%2Fteleconsulta%3Futm_source%3Dwhatsapp'
  );
  expect(rutaIngresar('/')).toBe('/');
  expect(rutaIngresar('/signin')).toBe('/');
  expect(rutaIngresar('/signin?next=%2Fget-care')).toBe('/');
  expect(rutaIngresar('//evil.example')).toBe('/');
  expect(rutaIngresar('/SignOut')).toBe('/');
});
