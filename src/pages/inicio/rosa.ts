// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// La rosa de los 8 hábitos (Home estilo E): geometría y colores, puros y testeados.
// RosaLe8.tsx solo dibuja lo que se calcula acá.
//
// Todo está en el viewBox de 520 × 520, con la paciente en el centro (260, 260). Los ángulos
// van en grados desde las 12 y en sentido horario, como un reloj: el pétalo i (en el orden de
// LE8_DOMINIOS) ocupa el sector [i·45°, (i+1)·45°], con un hueco a cada lado. Cada pétalo es
// tan largo como su puntaje: el radio externo va de 70 (puntaje 0) a 138 (puntaje 100).
import { categoriaLe8, LE8_DOMINIOS } from '@epa/careplan-menopausia';
import type { CategoriaLe8, Le8Domain, ModoColorPetalos, NodoEquipo, PuntajeDominio } from './tipos';

/** Lado del viewBox (cuadrado). */
export const LADO = 520;
/** Centro de la rosa, en x y en y. */
export const CENTRO = 260;
/** Núcleo: el círculo con el total. */
export const R_NUCLEO = 64;
/** Donde nacen los pétalos (puntaje 0). */
export const R_INTERNO = 70;
/** Cuánto crece el pétalo por punto: 100 puntos → 68 de largo. */
export const ESCALA = 0.68;
/** Guía de 50 puntos (104): también es hasta donde llega el contorno de un pétalo sin dato. */
export const R_GUIA = R_INTERNO + ESCALA * 50;
/** Anillo punteado de los agentes de IA. */
export const R_IA = 150;
/** Anillo sólido del equipo médico. */
export const R_EQUIPO = 164;

/** Grados de cada sector (8 hábitos → 45°). */
export const SECTOR_GRADOS = 360 / LE8_DOMINIOS.length;
/** Hueco a cada lado del pétalo, en grados (el del diseño aprobado). */
export const HUECO_GRADOS = 5;
/** Radio de las esquinas externas redondeadas del pétalo. */
export const RADIO_ESQUINA = 10;

/** Radio donde se apoyan los rótulos, en el ángulo medio de cada pétalo. */
export const R_ROTULO = 185;
export const TAMANO_ROTULO = 15;
export const INTERLINEA_ROTULO = 18;
/** Los rótulos quedan al menos a este radio, para no pisar el anillo del equipo. */
export const R_LIBRE_ROTULOS = R_EQUIPO + 8;
/** Margen mínimo de cualquier texto contra el borde del viewBox. */
export const MARGEN = 2;

/** Puntos del anillo de IA en la vuelta entera (el punteado se arma con un trazo de largo 0). */
export const PUNTOS_IA = 120;
/** `stroke-dasharray` del anillo de IA: un punto cada 3° (7,854 de arco con r = 150). */
export const PUNTEADO_IA = `0 ${redondear((2 * Math.PI * R_IA) / PUNTOS_IA, 3)}`;

/** Tramo inferior que se enciende mientras la Segunda Opinión está en análisis. */
export const TRAMO_SEGUNDA_OPINION = { desde: 165, hasta: 195 } as const;

/** Nombre corto de cada hábito en la rosa, una línea por elemento; debajo va el puntaje. */
export const ROTULO_CORTO: Readonly<Record<Le8Domain, readonly string[]>> = {
  dieta: ['Alimentación'],
  'actividad-fisica': ['Actividad', 'física'],
  nicotina: ['Nicotina'],
  sueno: ['Sueño'],
  imc: ['Peso (IMC)'],
  lipidos: ['Colesterol'],
  glucemia: ['Glucemia'],
  'presion-arterial': ['Presión'],
};

/** Lo que dice el rótulo de un pétalo sin puntaje. */
export const TEXTO_FALTA = 'Falta';

// ---------------------------------------------------------------------------------------
// Colores
// ---------------------------------------------------------------------------------------

/** Colores fijos del escenario (la sección oscura de la Home E). */
export const COLORES_ROSA = {
  escenario: '#003a6e',
  nucleo: '#004d92',
  texto: '#ffffff',
  secundario: '#cce4ff',
  /** Anillo de IA, contorno de los pétalos sin dato y la marca del laboratorio. */
  ia: '#99c8ff',
  equipo: '#ffffff',
  guia: '#cce4ff',
  /** Bandas LE8 escritas sobre el escenario (en el núcleo). */
  banda: { alta: '#5ad1bf', moderada: '#ffd27a', baja: '#ffa59a' } as Readonly<Record<CategoriaLe8, string>>,
} as const;

export interface ColoresPetalos {
  /** Modo por defecto de toda la rosa. */
  readonly modo: ModoColorPetalos;
  /** `tinta`: todos los pétalos del mismo azul (el diseño aprobado). */
  readonly tinta: string;
  /** `dominio`: un color por hábito. */
  readonly porDominio: Readonly<Record<Le8Domain, string>>;
  /** `banda`: el color de la banda LE8 del puntaje de cada hábito. */
  readonly porBanda: Readonly<Record<CategoriaLe8, string>>;
  /** Borde de todos los pétalos con dato. */
  readonly borde: string;
}

/**
 * Cómo se pintan los pétalos. Para cambiarlo:
 * - para todas: cambiá `modo` acá ('tinta', 'dominio' o 'banda');
 * - en una rosa sola: pasale `modoColor` a <RosaLe8 />;
 * - para probar sin tocar código: `/?petalos=dominio` (o `tinta`, `banda`) en la URL de la Home.
 * Los colores se pueden cambiar libremente mientras sigan dando ≥ 3:1 contra el escenario
 * (#003a6e): lo verifica rosa.test.ts.
 *
 * `porDominio` son 8 tonos de la misma luminosidad (OKLCH L 0,76 · C 0,10, contraste 5,1 a 5,6
 * contra #003a6e) con los matices repartidos en la rueda, en el orden de los pétalos: verde
 * salvia, aguamarina, celeste, lavanda (el sueño), orquídea, rosa, durazno y arena. Ninguno cae
 * cerca del rojo o del verde puros ni de los matices de las bandas, para no leerse como semáforo.
 */
export const COLORES_PETALOS: ColoresPetalos = {
  modo: 'tinta',
  tinta: '#66abff',
  porDominio: {
    dieta: '#7dc494',
    'actividad-fisica': '#57c5c8',
    nicotina: '#75b9eb',
    sueno: '#aba8ee',
    imc: '#d59acf',
    lipidos: '#e9979e',
    glucemia: '#e1a170',
    'presion-arterial': '#beb466',
  },
  porBanda: { alta: '#5ad1bf', moderada: '#ffd27a', baja: '#ffa59a' },
  borde: '#e6f3ff',
};

/** El relleno de un pétalo: 'none' sin puntaje (se dibuja solo el contorno discontinuo). */
export function colorPetalo(
  dominio: Le8Domain,
  puntaje: number | undefined,
  modo: ModoColorPetalos = COLORES_PETALOS.modo
): string {
  if (!esPuntaje(puntaje)) {
    return 'none';
  }
  switch (modo) {
    case 'dominio':
      return COLORES_PETALOS.porDominio[dominio];
    case 'banda':
      return COLORES_PETALOS.porBanda[categoriaLe8(recortar(puntaje))];
    default:
      return COLORES_PETALOS.tinta;
  }
}

// ---------------------------------------------------------------------------------------
// Pétalos
// ---------------------------------------------------------------------------------------

/** Un punto del plano a radio `r` y ángulo `grados` (desde las 12, en sentido horario). */
export function punto(r: number, grados: number): { x: number; y: number } {
  const rad = (grados * Math.PI) / 180;
  return { x: CENTRO + r * Math.sin(rad), y: CENTRO - r * Math.cos(rad) };
}

/** Ángulo medio del pétalo i. */
export function anguloMedio(i: number): number {
  return (i + 0.5) * SECTOR_GRADOS;
}

/** Radio externo del pétalo: 70 + 0,68 × puntaje (recortado a 0–100). Sin puntaje, la guía de 50. */
export function radioPetalo(puntaje?: number): number {
  if (!esPuntaje(puntaje)) {
    return R_GUIA;
  }
  return R_INTERNO + ESCALA * recortar(puntaje);
}

/**
 * El path SVG del pétalo i: un sector de corona entre R_INTERNO y su radio, con las esquinas
 * externas redondeadas (una curva cuadrática con control en la esquina). Sin puntaje, el
 * contorno llega hasta la guía de 50 puntos.
 */
export function caminoPetalo(i: number, puntaje?: number): string {
  const r = radioPetalo(puntaje);
  const desde = i * SECTOR_GRADOS + HUECO_GRADOS;
  const hasta = (i + 1) * SECTOR_GRADOS - HUECO_GRADOS;
  // Con un puntaje bajo, la esquina se achica: no puede ser más larga que el pétalo.
  const esquina = Math.min(RADIO_ESQUINA, r - R_INTERNO);
  const giro = r > 0 ? ((esquina / r) * 180) / Math.PI : 0;
  return [
    `M${xy(punto(R_INTERNO, desde))}`,
    `L${xy(punto(r - esquina, desde))}`,
    `Q${xy(punto(r, desde))} ${xy(punto(r, desde + giro))}`,
    `A${n(r)} ${n(r)} 0 0 1 ${xy(punto(r, hasta - giro))}`,
    `Q${xy(punto(r, hasta))} ${xy(punto(r - esquina, hasta))}`,
    `L${xy(punto(R_INTERNO, hasta))}`,
    `A${n(R_INTERNO)} ${n(R_INTERNO)} 0 0 0 ${xy(punto(R_INTERNO, desde))}`,
    'Z',
  ].join(' ');
}

/** Hacia dónde se corre el pétalo i al pasar el mouse (`distancia` hacia afuera). */
export function corrimientoPetalo(i: number, distancia = 4): { dx: number; dy: number } {
  const p = punto(distancia, anguloMedio(i));
  return { dx: redondear(p.x - CENTRO, 1), dy: redondear(p.y - CENTRO, 1) };
}

/** Un arco sobre un anillo, de `desde` a `hasta` en sentido horario. */
export function arco(r: number, desde: number, hasta: number): string {
  const grande = hasta - desde > 180 ? 1 : 0;
  return `M${xy(punto(r, desde))} A${n(r)} ${n(r)} 0 ${grande} 1 ${xy(punto(r, hasta))}`;
}

/** Un sector de corona entre dos radios (el fondo del tramo encendido). */
export function sectorAnular(rInterno: number, rExterno: number, desde: number, hasta: number): string {
  const grande = hasta - desde > 180 ? 1 : 0;
  return [
    `M${xy(punto(rExterno, desde))}`,
    `A${n(rExterno)} ${n(rExterno)} 0 ${grande} 1 ${xy(punto(rExterno, hasta))}`,
    `L${xy(punto(rInterno, hasta))}`,
    `A${n(rInterno)} ${n(rInterno)} 0 ${grande} 0 ${xy(punto(rInterno, desde))}`,
    'Z',
  ].join(' ');
}

/** El puntaje de un hábito, si es un número de verdad (sin dato, NaN o infinito → undefined). */
export function puntajeDe(dominios: readonly PuntajeDominio[], dominio: Le8Domain): number | undefined {
  const puntaje = dominios.find((d) => d.dominio === dominio)?.puntaje;
  return esPuntaje(puntaje) ? puntaje : undefined;
}

/**
 * El hábito con más margen para mejorar: el de menor puntaje con dato (en un empate, el
 * primero en el orden recibido). Sin ningún dato, undefined.
 */
export function dominioConMasMargen(dominios: readonly PuntajeDominio[]): Le8Domain | undefined {
  let elegido: { dominio: Le8Domain; puntaje: number } | undefined;
  for (const { dominio, puntaje } of dominios) {
    if (esPuntaje(puntaje) && (elegido === undefined || puntaje < elegido.puntaje)) {
      elegido = { dominio, puntaje };
    }
  }
  return elegido?.dominio;
}

// ---------------------------------------------------------------------------------------
// Rótulos, nodos del equipo y marca del laboratorio
// ---------------------------------------------------------------------------------------

/** Una caja en coordenadas del viewBox. */
export interface Caja {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

const LETRAS_ANGOSTAS = /[iíìjlrtfI.,:;'()|\s]/;
const LETRAS_ANCHAS = /[mwMW]/;

/**
 * Ancho estimado de un texto en Figtree semibold, por clase de letra (angostas 0,34 em, anchas
 * 0,86, otras mayúsculas 0,68 y el resto 0,58: un poco más que Figtree y que las fuentes de
 * respaldo). Sirve para ubicar los textos sin medir el DOM, no para medirlos.
 */
export function anchoTexto(texto: string, tamano: number): number {
  let em = 0;
  for (const c of texto) {
    if (LETRAS_ANGOSTAS.test(c)) {
      em += 0.34;
    } else if (LETRAS_ANCHAS.test(c)) {
      em += 0.86;
    } else if (c !== c.toLowerCase()) {
      em += 0.68;
    } else {
      em += 0.58;
    }
  }
  return em * tamano;
}

export interface PosicionRotulo {
  /** x del ancla del texto (según `textAnchor`). */
  readonly x: number;
  /** y de la línea base de la primera línea; las demás bajan de a INTERLINEA_ROTULO. */
  readonly y: number;
  readonly textAnchor: 'start' | 'middle' | 'end';
  /** Las líneas del nombre (ROTULO_CORTO); debajo va una línea más con el puntaje o «Falta». */
  readonly lineas: readonly string[];
  /** Caja aproximada de todo el rótulo, con el puntaje. */
  readonly caja: Caja;
}

/**
 * Dónde va el rótulo del pétalo i: en su ángulo medio a R_ROTULO, anclado hacia afuera
 * (start a la derecha, end a la izquierda) y centrado en vertical. Si la caja pisa el anillo
 * del equipo, se aleja (arriba y abajo en vertical, a los lados en horizontal); después se
 * encierra en el viewBox.
 */
export function posicionRotulo(i: number): PosicionRotulo {
  const lineas = ROTULO_CORTO[LE8_DOMINIOS[i]];
  const angulo = anguloMedio(i);
  const ancla = punto(R_ROTULO, angulo);
  const seno = Math.sin((angulo * Math.PI) / 180);
  const coseno = Math.cos((angulo * Math.PI) / 180);
  const textAnchor = seno > 0.01 ? 'start' : seno < -0.01 ? 'end' : 'middle';

  // El puntaje más ancho es «Falta» (o «100»): con eso la caja alcanza para cualquiera.
  const ancho = Math.max(...[...lineas, TEXTO_FALTA].map((l) => anchoTexto(l, TAMANO_ROTULO)));
  const alto = lineas.length * INTERLINEA_ROTULO + TAMANO_ROTULO;
  let x0 = textAnchor === 'start' ? ancla.x : textAnchor === 'end' ? ancla.x - ancho : ancla.x - ancho / 2;
  let y0 = ancla.y - alto / 2;

  const cercano = puntoMasCercanoAlCentro({ x0, y0, x1: x0 + ancho, y1: y0 + alto });
  if (Math.hypot(cercano.x - CENTRO, cercano.y - CENTRO) < R_LIBRE_ROTULOS) {
    if (Math.abs(coseno) >= Math.abs(seno)) {
      const falta = Math.sqrt(R_LIBRE_ROTULOS ** 2 - (cercano.x - CENTRO) ** 2);
      y0 = coseno > 0 ? CENTRO - falta - alto : CENTRO + falta;
    } else {
      const falta = Math.sqrt(R_LIBRE_ROTULOS ** 2 - (cercano.y - CENTRO) ** 2);
      x0 = seno > 0 ? CENTRO + falta : CENTRO - falta - ancho;
    }
  }
  x0 = Math.min(Math.max(x0, MARGEN), LADO - MARGEN - ancho);
  y0 = Math.min(Math.max(y0, MARGEN), LADO - MARGEN - alto);

  const x = textAnchor === 'start' ? x0 : textAnchor === 'end' ? x0 + ancho : x0 + ancho / 2;
  return {
    x: redondear(x, 1),
    // Desde el borde de arriba hasta la línea base: lo que sube la letra (≈ 0,75 em).
    y: redondear(y0 + TAMANO_ROTULO * 0.75, 1),
    textAnchor,
    lineas,
    caja: { x0, y0, x1: x0 + ancho, y1: y0 + alto },
  };
}

/** Texto fijo de los nodos del equipo (el de la Segunda Opinión llega por props). */
export const TEXTO_NODO: Readonly<Record<Exclude<NodoEquipo, 'segunda-opinion'>, string>> = {
  plan: 'Plan Bienestar',
  cabecera: 'Cabecera',
};

/** Alto de la píldora con el nombre de un nodo. */
export const ALTO_PILDORA = 28;
export const TAMANO_NODO = 14;

export interface GeometriaNodo {
  /** El punto sobre el anillo del equipo. */
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  /** Conector del punto a la píldora. */
  readonly conector: { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number };
  readonly pildora: Caja;
  /** Línea base del nombre, centrado en la píldora. */
  readonly texto: { readonly x: number; readonly y: number };
  /** Debajo de la píldora: el estado (solo la Segunda Opinión). */
  readonly estado?: { readonly x: number; readonly y: number };
}

/** Ancho de la píldora para un texto (8 por carácter + 20 de aire, como el diseño). */
export function anchoPildora(texto: string): number {
  return Math.min(Math.max(Math.round(texto.length * 8 + 20), 80), LADO - 2 * MARGEN);
}

/**
 * Dónde va cada nodo del equipo: el plan arriba, la cabecera a la derecha y la Segunda
 * Opinión abajo (con su estado debajo), cada uno con su píldora afuera del anillo.
 */
export function geometriaNodo(nodo: NodoEquipo, texto: string): GeometriaNodo {
  const ancho = anchoPildora(texto);
  switch (nodo) {
    case 'plan': {
      const p = punto(R_EQUIPO, 0);
      const pildora = { x0: CENTRO - ancho / 2, y0: 26, x1: CENTRO + ancho / 2, y1: 26 + ALTO_PILDORA };
      return {
        cx: p.x,
        cy: p.y,
        r: 6,
        conector: { x1: p.x, y1: p.y - 7, x2: p.x, y2: pildora.y1 },
        pildora,
        texto: { x: CENTRO, y: pildora.y0 + 19 },
      };
    }
    case 'cabecera': {
      const p = punto(R_EQUIPO, 90);
      const x0 = Math.min(438, LADO - MARGEN - ancho);
      const pildora = { x0, y0: CENTRO - ALTO_PILDORA / 2, x1: x0 + ancho, y1: CENTRO + ALTO_PILDORA / 2 };
      return {
        cx: p.x,
        cy: p.y,
        r: 6,
        conector: { x1: p.x + 7, y1: p.y, x2: pildora.x0, y2: p.y },
        pildora,
        texto: { x: x0 + ancho / 2, y: pildora.y0 + 19 },
      };
    }
    case 'segunda-opinion': {
      const p = punto(R_EQUIPO, 180);
      const pildora = { x0: CENTRO - ancho / 2, y0: 466, x1: CENTRO + ancho / 2, y1: 466 + ALTO_PILDORA };
      return {
        cx: p.x,
        cy: p.y,
        r: 7,
        conector: { x1: p.x, y1: p.y + 8, x2: p.x, y2: pildora.y0 },
        pildora,
        texto: { x: CENTRO, y: pildora.y0 + 19 },
        estado: { x: CENTRO, y: pildora.y1 + 19 },
      };
    }
  }
}

/** Marca «Laboratorio / leído por IA», a la izquierda sobre el anillo de IA. */
export const LABORATORIO = (() => {
  const lineas = ['Laboratorio', 'leído por IA'] as const;
  const texto = { x: 88, y: 256 };
  const ancho = Math.max(...lineas.map((l) => anchoTexto(l, TAMANO_NODO)));
  return {
    /** El punto donde el laboratorio cruzó el anillo de IA. */
    punto: { cx: CENTRO - R_IA, cy: CENTRO, r: 7 },
    /** Adonde llegan las líneas desde los pétalos del laboratorio (colesterol y glucemia). */
    llegada: { x: CENTRO - R_IA + 7, y: CENTRO },
    /** Puntitos entre el punto y el texto. */
    trazo: { x1: CENTRO - R_IA - 8, x2: CENTRO - R_IA - 16, y: CENTRO },
    lineas,
    /** Línea base de la primera línea (ancla end); la segunda baja 18. */
    texto,
    caja: {
      x0: texto.x - ancho,
      y0: texto.y - TAMANO_NODO * 0.75,
      x1: texto.x,
      y1: texto.y + 18 + TAMANO_NODO * 0.25,
    } satisfies Caja,
  };
})();

/** Los hábitos que salen del laboratorio: de la punta de sus pétalos sale la línea a la marca. */
export const DOMINIOS_LABORATORIO: readonly Le8Domain[] = ['lipidos', 'glucemia'];

/** Las líneas punteadas desde la punta de los pétalos del laboratorio hasta su marca. */
export function caminoLaboratorio(dominios: readonly PuntajeDominio[]): string {
  return DOMINIOS_LABORATORIO.map((dominio) => {
    const i = LE8_DOMINIOS.indexOf(dominio);
    const desde = punto(radioPetalo(puntajeDe(dominios, dominio)) + 5, anguloMedio(i));
    return `M${xy(desde)} L${xy(LABORATORIO.llegada)}`;
  }).join(' ');
}

// ---------------------------------------------------------------------------------------

function esPuntaje(puntaje: number | undefined): puntaje is number {
  return typeof puntaje === 'number' && Number.isFinite(puntaje);
}

function recortar(puntaje: number): number {
  return Math.min(100, Math.max(0, puntaje));
}

function puntoMasCercanoAlCentro(caja: Caja): { x: number; y: number } {
  return {
    x: Math.min(Math.max(CENTRO, caja.x0), caja.x1),
    y: Math.min(Math.max(CENTRO, caja.y0), caja.y1),
  };
}

function redondear(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  // + 0 convierte -0 en 0.
  return Math.round(valor * factor) / factor + 0;
}

/** Un número para el path: un decimal, sin ceros de más. */
function n(valor: number): string {
  return String(redondear(valor, 1));
}

function xy(p: { x: number; y: number }): string {
  return `${n(p.x)} ${n(p.y)}`;
}
