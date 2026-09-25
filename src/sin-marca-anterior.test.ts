// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Regla de marca: el portal de SOM no nombra ni apunta a la marca anterior (ni prefijos de
// sus bots, ni su dominio, ni su servidor). Es el mismo chequeo que `recepcionistas`
// documenta en su CLAUDE.md:
//   git grep -nIiE '\bbw[-_]|biowellness|bio\.medplum' -- . ':!src/sin-marca-anterior.test.ts'
// Recorre los archivos del repo (sin depender de git) y salta los binarios, como `-I`.
// Este archivo es la única excepción: acá vive la regla.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Vitest corre desde la raíz del portal (donde está vite.config.ts).
const RAIZ = process.cwd();
const PATRON = /\bbw[-_]|biowellness|bio\.medplum/i;
const ESTE_ARCHIVO = 'src/sin-marca-anterior.test.ts';

// Lo que no es del repo (dependencias, builds, locales) no se revisa.
const IGNORADOS = new Set([
  'node_modules',
  'dist',
  'dist-ssr',
  'coverage',
  '.git',
  '.harness',
  '.env',
  'package-lock.json',
]);
const MAX_BYTES = 2 * 1024 * 1024;

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    if (IGNORADOS.has(nombre)) {
      return [];
    }
    const ruta = join(dir, nombre);
    return statSync(ruta).isDirectory() ? archivos(ruta) : [ruta];
  });
}

function coincidencias(ruta: string): string[] {
  if (statSync(ruta).size > MAX_BYTES) {
    return [];
  }
  const contenido = readFileSync(ruta);
  if (contenido.includes(0)) {
    return []; // binario (imágenes, etc.)
  }
  return contenido
    .toString('utf8')
    .split('\n')
    .flatMap((linea, i) => (PATRON.test(linea) ? [`${relative(RAIZ, ruta)}:${i + 1}: ${linea.trim()}`] : []));
}

test('revisa el portal entero (la raíz es la del repo)', () => {
  expect(JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')).name).toBe('foomedical');
  expect(archivos(RAIZ).map((r) => relative(RAIZ, r))).toEqual(expect.arrayContaining([ESTE_ARCHIVO, 'README.md']));
});

test('el patrón detecta la marca anterior en sus tres formas', () => {
  expect(['bw-reservar-turno', 'https://biowellness.ar/x', 'bio.medplum.com.ar'].every((s) => PATRON.test(s))).toBe(
    true
  );
  expect(['som-reservar-turno', 'segundaopinionmedica.org', 'biomarcadores'].some((s) => PATRON.test(s))).toBe(false);
});

test('ningún archivo del portal nombra ni apunta a la marca anterior', () => {
  const encontradas = archivos(RAIZ)
    .filter((ruta) => relative(RAIZ, ruta) !== ESTE_ARCHIVO)
    .flatMap(coincidencias);
  expect(encontradas).toEqual([]);
});
