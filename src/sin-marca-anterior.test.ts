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

// ───────────────────────── marca actual: solo en la configuración ─────────────────────────
//
// Marca blanca (README, "Marca blanca"): el nombre y el dominio de la marca actual salen de
// `src/marca.json` / `src/marca.ts` (o de las variables MARCA_* del deploy). Ningún otro
// archivo de `src/` los escribe a mano, así otra marca despliega el portal sin textos de SOM.
// Se busca el nombre como marca (con mayúsculas, sin tildes o partido en dos líneas de JSX) y
// el dominio. En minúscula ("tu segunda opinión médica") es la descripción del servicio, no
// la marca. Para nombrarla en un texto: `MARCA.nombre`, `MARCA.email`, `MARCA.producto`, etc.
const NOMBRE_MARCA = /Segunda\s+Opini[oó]n\s+M[eé]dica|SEGUNDA\s+OPINI[OÓ]N\s+M[EÉ]DICA/g;
const DOMINIO_MARCA = /segundaopinionmedica\\?\./gi; // también escapado en una regex

// Lo que puede quedar en cualquier archivo porque no es un texto ni un link de la marca.
const PERMITIDO_EN_TODOS = [
  // El aviso de copyright (legal) del código: quién lo escribió, no la marca del deploy.
  /^\/\/ SPDX-FileCopyrightText: Copyright Segunda Opinión Médica$/gm,
  // Las URLs canónicas FHIR (CodeSystem, StructureDefinition, Identifier, Questionnaire):
  // identifican los datos del contrato con Recepción y el servidor
  // (docs/medplum/bot-som-interface.md); no son links y cambiarlas rompe los datos guardados.
  /https:\/\/segundaopinionmedica\.org\/(?:fhir|Questionnaire)\b[^\s'"`|,)]*/g,
  // El ejemplo del link de activación que arma Recepción (otra app, con su propio dominio),
  // tal como lo documenta el comentario de la página que lo resuelve.
  /un link mágico https:\/\/app\.segundaopinionmedica\.org\//g,
];

interface Excepcion {
  /** Archivo, o carpeta si termina en "/". */
  readonly ruta: string;
  readonly motivo: string;
}

// Lista blanca: los únicos archivos de `src/` que pueden nombrar a la marca, y por qué.
const EXCEPCIONES: readonly Excepcion[] = [
  { ruta: 'src/marca.json', motivo: 'la configuración de marca: los valores por defecto del repo' },
  { ruta: 'src/marca.ts', motivo: 'el módulo de marca: documenta esos valores por defecto' },
  { ruta: ESTE_ARCHIVO, motivo: 'acá vive la regla: sus patrones y sus ejemplos' },
  {
    ruta: 'src/vendor/',
    motivo: 'copia del monorepo de Plan Bienestar: no se edita a mano, se resincroniza (ver su README)',
  },
  { ruta: 'src/marca.test.ts', motivo: 'fija que, con la marca por defecto, todo se vea igual que antes' },
  { ruta: 'src/pages/MarcaPorDefecto.test.tsx', motivo: 'ídem: landing, CKM, teleconsulta y la solicitud' },
  { ruta: 'src/components/auth/auth.test.tsx', motivo: 'ídem: el registro con la marca por defecto' },
  { ruta: 'src/pages/LegalPage.test.tsx', motivo: 'ídem: términos y privacidad con la marca por defecto' },
  {
    ruta: 'src/pages/health-record/InformedConsent.test.tsx',
    motivo: 'ídem: el consentimiento informado (texto legal) con la marca por defecto',
  },
  { ruta: 'src/fhir/estudios.test.ts', motivo: 'verifica que los systems que escribe el portal sean los canónicos' },
  {
    ruta: 'src/pages/Teleconsulta.test.tsx',
    motivo: 'dato de prueba: el link de la sala de videollamada lo arma el servidor (recepcionistas)',
  },
];

interface Hallazgo {
  readonly n: number;
  readonly linea: string;
}

// Dónde nombra un texto a la marca actual, descontando lo permitido en todos los archivos.
function marcaEnTexto(contenido: string): Hallazgo[] {
  const texto = PERMITIDO_EN_TODOS.reduce((t, permitido) => t.replace(permitido, ''), contenido.normalize('NFC'));
  const lineas = texto.split('\n');
  return [NOMBRE_MARCA, DOMINIO_MARCA]
    .flatMap((patron) => [...texto.matchAll(patron)])
    .map((m) => {
      const n = texto.slice(0, m.index).split('\n').length;
      return { n, linea: lineas[n - 1].trim() };
    });
}

function marcaEnArchivo(ruta: string): Hallazgo[] {
  if (statSync(ruta).size > MAX_BYTES) {
    return [];
  }
  const contenido = readFileSync(ruta);
  return contenido.includes(0) ? [] : marcaEnTexto(contenido.toString('utf8'));
}

function excepcionDe(rel: string): Excepcion | undefined {
  return EXCEPCIONES.find((e) => (e.ruta.endsWith('/') ? rel.startsWith(e.ruta) : rel === e.ruta));
}

test('el patrón de la marca actual: el nombre y el dominio, no el servicio ni los identificadores', () => {
  const nombra = (s: string): boolean => marcaEnTexto(s).length > 0;
  for (const s of [
    'Segunda Opinión Médica',
    'del equipo de\n                Segunda Opinión\n                Médica.',
    'SEGUNDA OPINIÓN MÉDICA',
    'Segunda Opinion Medica',
    'Segunda Opinio\u0301n Me\u0301dica', // tildes descompuestas (NFD)
    'info@segundaopinionmedica.org',
    'https://app.segundaopinionmedica.org/x',
    'https://segundaopinionmedica.org/terminos',
    '/escribí a info@segundaopinionmedica\\.org/',
  ]) {
    expect(nombra(s), s).toBe(true);
  }
  for (const s of [
    'Tu segunda opinión médica, con los líderes globales en salud',
    'Mi Segunda Opinión',
    '// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica',
    "export const BIOMARKER_SYSTEM = 'https://segundaopinionmedica.org/fhir/CodeSystem/biomarker';",
    "const SOM_FHIR = 'https://segundaopinionmedica.org/fhir';",
    '"url": "https://segundaopinionmedica.org/Questionnaire/som-intake"',
    'category=https://segundaopinionmedica.org/fhir/CodeSystem/notificacion|pendiente',
    '// un link mágico https://app.segundaopinionmedica.org/activar/:id que envía por',
  ]) {
    expect(nombra(s), s).toBe(false);
  }
  expect(marcaEnTexto('a\nb Segunda Opinión Médica')).toEqual([{ n: 2, linea: 'b Segunda Opinión Médica' }]);
});

test('cada excepción de la lista blanca existe y sigue haciendo falta', () => {
  for (const e of EXCEPCIONES) {
    const ruta = join(RAIZ, e.ruta);
    expect(statSync(ruta).isDirectory(), e.ruta).toBe(e.ruta.endsWith('/'));
    if (!e.ruta.endsWith('/')) {
      expect(marcaEnArchivo(ruta).length, `${e.ruta} ya no nombra a la marca: sacalo`).toBeGreaterThan(0);
    }
  }
  const todo = archivos(join(RAIZ, 'src'))
    .map((ruta) => readFileSync(ruta))
    .filter((contenido) => !contenido.includes(0))
    .map((contenido) => contenido.toString('utf8').normalize('NFC'))
    .join('\n');
  for (const permitido of PERMITIDO_EN_TODOS) {
    expect(todo.search(permitido), `${permitido} ya no aparece en src/: sacalo`).toBeGreaterThan(-1);
  }
});

test('fuera de la configuración de marca, ningún archivo de src/ escribe el nombre ni el dominio de la marca', () => {
  const encontradas = archivos(join(RAIZ, 'src')).flatMap((ruta) => {
    const rel = relative(RAIZ, ruta);
    return excepcionDe(rel) ? [] : marcaEnArchivo(ruta).map((h) => `${rel}:${h.n}: ${h.linea}`);
  });
  expect(encontradas, 'usá MARCA (src/marca.ts) en lugar del nombre o el dominio escritos a mano').toEqual([]);
});
