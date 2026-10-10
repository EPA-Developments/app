// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { LE8_DOMINIOS } from '@epa/careplan-menopausia';
import { MARCA } from '../../marca';
import {
  anchoTexto,
  arco,
  caminoLaboratorio,
  caminoPetalo,
  CENTRO,
  colorPetalo,
  COLORES_PETALOS,
  COLORES_ROSA,
  dominioConMasMargen,
  geometriaNodo,
  HUECO_GRADOS,
  LABORATORIO,
  LADO,
  posicionRotulo,
  PUNTEADO_IA,
  puntajeDe,
  R_EQUIPO,
  R_GUIA,
  R_INTERNO,
  radioPetalo,
  ROTULO_CORTO,
  sectorAnular,
  SECTOR_GRADOS,
  TAMANO_NODO,
  TEXTO_NODO,
  type Caja,
} from './rosa';
import type { Le8Domain, PuntajeDominio } from './tipos';

/** Los puntajes del diseño aprobado (mockup de escritorio). */
const PUNTAJES_DISENO = [60, 62, 100, 45, 58, 60, 70, 57];

function dominiosCon(puntajes: readonly (number | undefined)[]): PuntajeDominio[] {
  return LE8_DOMINIOS.map((dominio, i) => ({ dominio, puntaje: puntajes[i] }));
}

describe('radioPetalo: 70 + 0,68 × puntaje', () => {
  test.each([
    [0, 70],
    [50, 104],
    [100, 138],
    [25, 87],
  ])('puntaje %d → radio %d', (puntaje, radio) => {
    expect(radioPetalo(puntaje)).toBeCloseTo(radio, 9);
  });

  test('la guía de 50 puntos está en 104', () => {
    expect(R_GUIA).toBeCloseTo(104, 9);
  });

  test('fuera de 0–100 se recorta', () => {
    expect(radioPetalo(-20)).toBeCloseTo(70, 9);
    expect(radioPetalo(150)).toBeCloseTo(138, 9);
  });

  test('sin puntaje (o con uno que no es un número) llega hasta la guía', () => {
    expect(radioPetalo()).toBe(R_GUIA);
    expect(radioPetalo(Number.NaN)).toBe(R_GUIA);
    expect(radioPetalo(Number.POSITIVE_INFINITY)).toBe(R_GUIA);
  });
});

interface Segmento {
  readonly comando: string;
  readonly numeros: readonly number[];
}

function segmentos(d: string): Segmento[] {
  return [...d.matchAll(/([A-Za-z])([^A-Za-z]*)/g)].map((m) => ({
    comando: m[1],
    numeros:
      m[2].trim() === ''
        ? []
        : m[2]
            .trim()
            .split(/[\s,]+/)
            .map(Number),
  }));
}

/** Todos los puntos de un path (extremos y puntos de control), sin los radios ni las banderas de los arcos. */
function puntos(d: string): { x: number; y: number }[] {
  return segmentos(d).flatMap(({ comando, numeros }) => {
    const pares = comando === 'A' ? numeros.slice(5) : numeros;
    const salida: { x: number; y: number }[] = [];
    for (let k = 0; k < pares.length; k += 2) {
      salida.push({ x: pares[k], y: pares[k + 1] });
    }
    return salida;
  });
}

/** Ángulo de un punto en grados, desde las 12 y en sentido horario (0 a 360). */
function angulo(p: { x: number; y: number }): number {
  return ((Math.atan2(p.x - CENTRO, CENTRO - p.y) * 180) / Math.PI + 360) % 360;
}

describe('caminoPetalo', () => {
  const casos = LE8_DOMINIOS.flatMap((_, i) => [0, 5, 37, 50, 100, undefined].map((p) => [i, p] as const));

  test.each(casos)('pétalo %d con puntaje %s: path válido, dentro del viewBox y de su sector', (i, puntaje) => {
    const d = caminoPetalo(i, puntaje);
    const segs = segmentos(d);
    // M, línea por el borde, esquina, arco externo, esquina, línea por el otro borde, arco interno, Z.
    expect(segs.map((s) => s.comando).join('')).toBe('MLQAQLAZ');
    expect(segs.map((s) => s.numeros.length)).toEqual([2, 2, 4, 7, 4, 2, 7, 0]);
    expect(segs.flatMap((s) => s.numeros).every(Number.isFinite)).toBe(true);

    const radio = radioPetalo(puntaje);
    const [, , , externo, , , interno] = segs;
    expect(externo.numeros.slice(0, 5)).toEqual([Number(radio.toFixed(1)), Number(radio.toFixed(1)), 0, 0, 1]);
    expect(interno.numeros.slice(0, 5)).toEqual([R_INTERNO, R_INTERNO, 0, 0, 0]);
    // Cierra donde empezó.
    expect(interno.numeros.slice(5)).toEqual(segs[0].numeros);

    const desde = i * SECTOR_GRADOS + HUECO_GRADOS;
    const hasta = (i + 1) * SECTOR_GRADOS - HUECO_GRADOS;
    for (const p of puntos(d)) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(LADO);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(LADO);
      const r = Math.hypot(p.x - CENTRO, p.y - CENTRO);
      expect(r).toBeGreaterThanOrEqual(R_INTERNO - 0.1);
      expect(r).toBeLessThanOrEqual(radio + 0.1);
      expect(angulo(p)).toBeGreaterThanOrEqual(desde - 0.2);
      expect(angulo(p)).toBeLessThanOrEqual(hasta + 0.2);
    }
  });

  test('sin puntaje dibuja el contorno hasta la guía de 50', () => {
    LE8_DOMINIOS.forEach((_, i) => expect(caminoPetalo(i)).toBe(caminoPetalo(i, 50)));
  });

  test('reproduce los pétalos del diseño aprobado', () => {
    expect(caminoPetalo(0, 60)).toBe(
      'M266.1 190.3 L268.8 159.6 Q269.7 149.6 279.6 150.9 A110.8 110.8 0 0 1 323.3 169 Q331.2 175.1 324.8 182.8 L305 206.4 A70 70 0 0 0 266.1 190.3 Z'
    );
    expect(caminoPetalo(2, 100)).toBe(
      'M329.7 266.1 L387.5 271.2 Q397.5 272 396.2 281.9 A138 138 0 0 1 371.9 340.8 Q365.7 348.7 358.1 342.3 L313.6 305 A70 70 0 0 0 329.7 266.1 Z'
    );
    expect(caminoPetalo(3, 45)).toBe(
      'M305 313.6 L318.2 329.4 Q324.7 337.1 316.7 343.1 A100.6 100.6 0 0 1 278.7 358.9 Q268.8 360.2 267.9 350.3 L266.1 329.7 A70 70 0 0 0 305 313.6 Z'
    );
  });
});

describe('anillos y laboratorio', () => {
  test('el punteado del anillo de IA tiene 120 puntos', () => {
    expect(PUNTEADO_IA).toBe('0 7.854');
  });

  test('el tramo encendido de la Segunda Opinión es el del diseño', () => {
    expect(arco(150, 165, 195)).toBe('M298.8 404.9 A150 150 0 0 1 221.2 404.9');
    expect(arco(164, 165, 195)).toBe('M302.4 418.4 A164 164 0 0 1 217.6 418.4');
    expect(sectorAnular(142, 172, 165, 195)).toBe(
      'M304.5 426.1 A172 172 0 0 1 215.5 426.1 L223.2 397.2 A142 142 0 0 0 296.8 397.2 Z'
    );
  });

  test('las líneas del laboratorio salen de la punta del colesterol y de la glucemia', () => {
    expect(caminoLaboratorio(dominiosCon(PUNTAJES_DISENO))).toBe('M153 304.3 L117 260 M146.7 213.1 L117 260');
    // Sin esos datos, salen de la guía.
    const sinLaboratorio = caminoLaboratorio(dominiosCon([60, 62, 100, 45, 58]));
    const [colesterol, glucemia] = puntos(sinLaboratorio).filter((_, k) => k % 2 === 0);
    expect(Math.hypot(colesterol.x - CENTRO, colesterol.y - CENTRO)).toBeCloseTo(R_GUIA + 5, 0);
    expect(Math.hypot(glucemia.x - CENTRO, glucemia.y - CENTRO)).toBeCloseTo(R_GUIA + 5, 0);
  });
});

function dentroDelViewBox(caja: Caja): boolean {
  return caja.x0 >= 0 && caja.y0 >= 0 && caja.x1 <= LADO && caja.y1 <= LADO;
}

function seTocan(a: Caja, b: Caja): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** Distancia del centro de la rosa al punto más cercano de la caja. */
function distanciaAlCentro(caja: Caja): number {
  const x = Math.min(Math.max(CENTRO, caja.x0), caja.x1);
  const y = Math.min(Math.max(CENTRO, caja.y0), caja.y1);
  return Math.hypot(x - CENTRO, y - CENTRO);
}

describe('posicionRotulo', () => {
  const rotulos = LE8_DOMINIOS.map((dominio, i) => ({ dominio, ...posicionRotulo(i) }));
  const nodos = [
    geometriaNodo('plan', TEXTO_NODO.plan),
    geometriaNodo('cabecera', TEXTO_NODO.cabecera),
    geometriaNodo('segunda-opinion', MARCA.producto),
  ];
  const estadoSegundaOpinion = ((): Caja => {
    const { x, y } = nodos[2].estado ?? { x: 0, y: 0 };
    const ancho = anchoTexto('en análisis', TAMANO_NODO);
    return { x0: x - ancho / 2, y0: y - TAMANO_NODO * 0.75, x1: x + ancho / 2, y1: y + TAMANO_NODO * 0.25 };
  })();

  test('los nombres son los cortos, en el orden de los pétalos', () => {
    expect(rotulos.map((r) => r.lineas.join(' '))).toEqual([
      'Alimentación',
      'Actividad física',
      'Nicotina',
      'Sueño',
      'Peso (IMC)',
      'Colesterol',
      'Glucemia',
      'Presión',
    ]);
    rotulos.forEach((r) => expect(r.lineas).toBe(ROTULO_CORTO[r.dominio]));
  });

  test('a la derecha anclan al principio y a la izquierda al final', () => {
    expect(rotulos.map((r) => r.textAnchor)).toEqual(['start', 'start', 'start', 'start', 'end', 'end', 'end', 'end']);
  });

  test.each(LE8_DOMINIOS.map((d, i) => [d, i] as const))('el rótulo de %s queda en su lado del pétalo', (_, i) => {
    const { caja } = rotulos[i];
    const medio = (caja.x0 + caja.x1) / 2;
    expect(Math.sign(medio - CENTRO)).toBe(i < 4 ? 1 : -1);
    expect(Math.sign((caja.y0 + caja.y1) / 2 - CENTRO)).toBe(i === 0 || i === 1 || i === 6 || i === 7 ? -1 : 1);
  });

  test('ningún rótulo se sale del viewBox 520 × 520', () => {
    for (const r of rotulos) {
      expect(dentroDelViewBox(r.caja), r.dominio).toBe(true);
      // La línea base de la primera línea cae dentro de su caja.
      expect(r.y).toBeGreaterThan(r.caja.y0);
      expect(r.y).toBeLessThan(r.caja.y1);
    }
  });

  test('ningún rótulo pisa el anillo del equipo', () => {
    for (const r of rotulos) {
      expect(distanciaAlCentro(r.caja), r.dominio).toBeGreaterThanOrEqual(R_EQUIPO + 4);
    }
  });

  test('los rótulos no se pisan entre sí, ni con los nodos del equipo ni con la marca del laboratorio', () => {
    const otros: [string, Caja][] = [
      ...nodos.map((n, k): [string, Caja] => [`nodo ${k}`, n.pildora]),
      ['estado de la Segunda Opinión', estadoSegundaOpinion],
      ['laboratorio', LABORATORIO.caja],
    ];
    rotulos.forEach((a, i) => {
      rotulos.slice(i + 1).forEach((b) => expect(seTocan(a.caja, b.caja), `${a.dominio} y ${b.dominio}`).toBe(false));
      otros.forEach(([nombre, caja]) => expect(seTocan(a.caja, caja), `${a.dominio} y ${nombre}`).toBe(false));
    });
  });

  test('los nodos y la marca del laboratorio también entran en el viewBox', () => {
    nodos.forEach((n) => expect(dentroDelViewBox(n.pildora)).toBe(true));
    expect(dentroDelViewBox(estadoSegundaOpinion)).toBe(true);
    expect(dentroDelViewBox(LABORATORIO.caja)).toBe(true);
    // Aunque el nombre del servicio sea larguísimo, la píldora no se sale.
    expect(dentroDelViewBox(geometriaNodo('segunda-opinion', 'x'.repeat(200)).pildora)).toBe(true);
  });

  test('cada nodo está sobre el anillo del equipo', () => {
    for (const n of nodos) {
      expect(Math.hypot(n.cx - CENTRO, n.cy - CENTRO)).toBeCloseTo(R_EQUIPO, 9);
    }
  });
});

/** Luminancia relativa (WCAG 2). */
function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((k) => {
    const c = Number.parseInt(hex.slice(k, k + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

/** Matiz (HSL, en grados) y croma (0–1) de un color. */
function matizYCroma(hex: string): { matiz: number; croma: number } {
  const [r, g, b] = [1, 3, 5].map((k) => Number.parseInt(hex.slice(k, k + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const croma = max - Math.min(r, g, b);
  let matiz = 0;
  if (croma > 0) {
    if (max === r) {
      matiz = ((g - b) / croma + 6) % 6;
    } else if (max === g) {
      matiz = (b - r) / croma + 2;
    } else {
      matiz = (r - g) / croma + 4;
    }
  }
  return { matiz: matiz * 60, croma };
}

describe('colores de los pétalos', () => {
  const porDominio = LE8_DOMINIOS.map((d) => COLORES_PETALOS.porDominio[d]);

  test('por defecto, todos en tinta (el diseño aprobado)', () => {
    expect(COLORES_PETALOS.modo).toBe('tinta');
    expect(COLORES_PETALOS.tinta).toBe('#66abff');
    for (const d of LE8_DOMINIOS) {
      expect(colorPetalo(d, 37)).toBe('#66abff');
      expect(colorPetalo(d, 37, 'tinta')).toBe('#66abff');
    }
  });

  test('por dominio, cada hábito con su color', () => {
    for (const d of LE8_DOMINIOS) {
      expect(colorPetalo(d, 37, 'dominio')).toBe(COLORES_PETALOS.porDominio[d]);
    }
  });

  test.each([
    [100, 'alta'],
    [80, 'alta'],
    [79, 'moderada'],
    [50, 'moderada'],
    [49, 'baja'],
    [0, 'baja'],
    [130, 'alta'],
    [-5, 'baja'],
  ] as const)('por banda: puntaje %d → %s', (puntaje, banda) => {
    expect(colorPetalo('sueno', puntaje, 'banda')).toBe(COLORES_PETALOS.porBanda[banda]);
  });

  test('las bandas son las del escenario', () => {
    expect(COLORES_PETALOS.porBanda).toEqual({ alta: '#5ad1bf', moderada: '#ffd27a', baja: '#ffa59a' });
    expect(COLORES_PETALOS.borde).toBe('#e6f3ff');
  });

  test.each(['tinta', 'dominio', 'banda'] as const)('sin puntaje no hay relleno (modo %s)', (modo) => {
    expect(colorPetalo('imc', undefined, modo)).toBe('none');
    expect(colorPetalo('imc', Number.NaN, modo)).toBe('none');
  });

  test('los 8 colores por dominio son distintos y dan ≥ 3:1 contra el escenario', () => {
    expect(new Set(porDominio).size).toBe(8);
    for (const color of porDominio) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
      expect(contraste(color, COLORES_ROSA.escenario), color).toBeGreaterThanOrEqual(3);
    }
    // La tinta y las bandas, también.
    for (const color of [COLORES_PETALOS.tinta, ...Object.values(COLORES_PETALOS.porBanda)]) {
      expect(contraste(color, COLORES_ROSA.escenario), color).toBeGreaterThanOrEqual(3);
    }
  });

  test('son armónicos: misma luminosidad, matices repartidos y ningún tono puro', () => {
    const luminancias = porDominio.map(luminancia);
    expect(Math.max(...luminancias) / Math.min(...luminancias)).toBeLessThan(1.15);

    const tonos = porDominio.map(matizYCroma);
    // Sin rojo ni verde puros (ni ningún tono saturado): todos son pasteles.
    tonos.forEach(({ croma }, k) => expect(croma, porDominio[k]).toBeLessThanOrEqual(0.5));
    // Repartidos en la rueda: ni dos matices pegados ni un hueco de más de un cuarto de vuelta.
    const matices = tonos.map((t) => t.matiz).sort((a, b) => a - b);
    const huecos = matices.map((m, k) => (matices[(k + 1) % matices.length] - m + 360) % 360);
    expect(Math.min(...huecos)).toBeGreaterThanOrEqual(20);
    expect(Math.max(...huecos)).toBeLessThanOrEqual(90);
  });
});

describe('dominioConMasMargen: el de menor puntaje con dato', () => {
  const de = (pares: [Le8Domain, number | undefined][]): PuntajeDominio[] =>
    pares.map(([dominio, puntaje]) => ({ dominio, puntaje }));

  test('con los puntajes del diseño, el sueño', () => {
    expect(dominioConMasMargen(dominiosCon(PUNTAJES_DISENO))).toBe('sueno');
  });

  test('ignora los que no tienen dato', () => {
    expect(
      dominioConMasMargen(
        de([
          ['dieta', undefined],
          ['nicotina', 80],
          ['sueno', Number.NaN],
          ['imc', 90],
        ])
      )
    ).toBe('nicotina');
  });

  test('un 0 es un dato (y es el de más margen)', () => {
    expect(
      dominioConMasMargen(
        de([
          ['nicotina', 0],
          ['sueno', 10],
        ])
      )
    ).toBe('nicotina');
  });

  test('en un empate, el primero', () => {
    expect(
      dominioConMasMargen(
        de([
          ['dieta', 70],
          ['sueno', 40],
          ['imc', 40],
        ])
      )
    ).toBe('sueno');
  });

  test('sin ningún dato, ninguno', () => {
    expect(dominioConMasMargen(dominiosCon([]))).toBeUndefined();
    expect(dominioConMasMargen([])).toBeUndefined();
  });

  test('puntajeDe devuelve solo números de verdad', () => {
    const dominios = de([
      ['dieta', 60],
      ['sueno', Number.NaN],
    ]);
    expect(puntajeDe(dominios, 'dieta')).toBe(60);
    expect(puntajeDe(dominios, 'sueno')).toBeUndefined();
    expect(puntajeDe(dominios, 'imc')).toBeUndefined();
  });
});
