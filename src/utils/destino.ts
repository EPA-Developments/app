// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// A dónde volver después de iniciar sesión (`/signin?next=…`). Un link del portal (p. ej. el
// del consentimiento de teleconsulta que Recepción manda por WhatsApp) abierto sin sesión, o con
// la sesión vencida, pasa por el ingreso y vuelve a la misma página.
//
// Solo rutas internas del portal: nada de `//otro-sitio`, `https://…` ni `javascript:` (open
// redirect), y nunca de vuelta al ingreso, al registro o a la salida (no puede quedar en loop).

const MAX_LARGO = 512;
const RUTAS_PUBLICAS = new Set(['/', '/signin', '/register', '/signout']);
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

/** El destino si es una ruta interna segura del portal; si no, undefined. */
export function destinoSeguro(next: string | null | undefined): string | undefined {
  if (typeof next !== 'string' || next.length > MAX_LARGO || !next.startsWith('/')) {
    return undefined;
  }
  if (next[1] === '/' || next[1] === '\\' || next.includes('\\') || CONTROL.test(next)) {
    return undefined;
  }
  // Sin la barra final (`/signin/` también es el ingreso) y en minúsculas: el router no distingue
  // mayúsculas, así que `/SignOut` también es la salida.
  const pathname = next.split(/[?#]/, 1)[0].replace(/\/+$/, '').toLowerCase() || '/';
  if (RUTAS_PUBLICAS.has(pathname) || pathname.startsWith('/setpassword')) {
    return undefined;
  }
  return next;
}

/** El ingreso que vuelve al destino (`/signin?next=…`); si el destino no sirve, el inicio. */
export function rutaIngresar(destino: string): string {
  const d = destinoSeguro(destino);
  return d ? `/signin?next=${encodeURIComponent(d)}` : '/';
}
