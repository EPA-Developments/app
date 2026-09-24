// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Marca blanca: todo lo que identifica a la marca en el portal (logo, pie de página,
// títulos de ingreso, título de la pestaña y consentimiento informado) sale de acá.
//
// Para cambiar la marca hay dos caminos, sin tocar componentes:
//  1. Editar `src/marca.json` (valores por defecto del repo).
//  2. Definir variables MARCA_* en el entorno del deploy (p. ej. Vercel), que pisan al
//     JSON: MARCA_NOMBRE, MARCA_NOMBRE_CONSENTIMIENTO, MARCA_RESPONSABLE,
//     MARCA_DIRIGIDO_POR, MARCA_DIRECCION, MARCA_EMAIL. Una variable vacía se ignora.
// `nombreConsentimiento` vacío = el nombre en mayúsculas (como figura en el consentimiento).
import base from './marca.json';

export interface Marca {
  /** Nombre comercial, p. ej. "Segunda Opinión Médica". */
  readonly nombre: string;
  /** Logo: todo menos la última palabra va en negrita… */
  readonly logoPrincipal: string;
  /** …y la última palabra, en peso normal. */
  readonly logoSecundario: string;
  /** Cómo se nombra al prestador en el consentimiento, p. ej. "SEGUNDA OPINIÓN MÉDICA". */
  readonly nombreConsentimiento: string;
  /** Profesional o institución responsable, p. ej. "Dr. Alejandro Barbagelata". */
  readonly responsable: string;
  /** El responsable dentro de una frase del consentimiento ("…dirigido por el Dr. …"). */
  readonly dirigidoPor: string;
  readonly direccion: string;
  /** Email de contacto y para ejercer los derechos sobre los datos. */
  readonly email: string;
}

type MarcaBase = typeof base;
type EnvMarca = Partial<Record<string, string | undefined>>;

function valor(env: EnvMarca, clave: string, porDefecto: string): string {
  const v = env[clave];
  return typeof v === 'string' && v.trim() ? v.trim() : porDefecto;
}

/** Resuelve la marca: variables MARCA_* del entorno sobre los valores de `marca.json`. */
export function armarMarca(env: EnvMarca, porDefecto: MarcaBase = base): Marca {
  const nombre = valor(env, 'MARCA_NOMBRE', porDefecto.nombre);
  const consentimientoBase = porDefecto.nombreConsentimiento.trim() || nombre.toLocaleUpperCase('es-AR');
  const palabras = nombre.split(/\s+/);
  const conSecundario = palabras.length > 1;
  return {
    nombre,
    logoPrincipal: conSecundario ? palabras.slice(0, -1).join(' ') : nombre,
    logoSecundario: conSecundario ? (palabras.at(-1) ?? '') : '',
    nombreConsentimiento: valor(
      env,
      'MARCA_NOMBRE_CONSENTIMIENTO',
      env.MARCA_NOMBRE?.trim() ? nombre.toLocaleUpperCase('es-AR') : consentimientoBase
    ),
    responsable: valor(env, 'MARCA_RESPONSABLE', porDefecto.responsable),
    dirigidoPor: valor(
      env,
      'MARCA_DIRIGIDO_POR',
      env.MARCA_RESPONSABLE?.trim() ? env.MARCA_RESPONSABLE.trim() : porDefecto.dirigidoPor
    ),
    direccion: valor(env, 'MARCA_DIRECCION', porDefecto.direccion),
    email: valor(env, 'MARCA_EMAIL', porDefecto.email),
  };
}

export const MARCA: Marca = armarMarca(import.meta.env);
