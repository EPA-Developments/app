// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { LE8_DOMINIOS } from '@epa/careplan-menopausia';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { MARCA } from '../../marca';
import { COLORES_PETALOS } from './rosa';
import { RosaLe8 } from './RosaLe8';
import classes from './RosaLe8.module.css';
import type { AnillosRosa, PuntajeDominio, RosaLe8Props } from './tipos';

/** Los puntajes del diseño aprobado. */
const PUNTAJES = [60, 62, 100, 45, 58, 60, 70, 57];

const SIN_ANILLOS: AnillosRosa = { iaEnProceso: false, laboratorioLeido: false, equipo: [] };

function dominiosCon(puntajes: readonly (number | undefined)[]): PuntajeDominio[] {
  return LE8_DOMINIOS.map((dominio, i) => ({ dominio, puntaje: puntajes[i] }));
}

function renderRosa(cambios: Partial<RosaLe8Props> = {}): HTMLElement {
  const props: RosaLe8Props = {
    dominios: dominiosCon(PUNTAJES),
    total: 64,
    categoria: 'moderada',
    totalInicial: 58,
    anillos: SIN_ANILLOS,
    nombreSegundaOpinion: MARCA.producto,
    ...cambios,
  };
  render(
    <MantineProvider>
      <RosaLe8 {...props} />
    </MantineProvider>
  );
  return screen.getByRole('img');
}

function petalo(rosa: HTMLElement, dominio: string): Element {
  const path = rosa.querySelector(`[data-petalo="${dominio}"]`);
  if (!path) {
    throw new Error(`No está el pétalo ${dominio}`);
  }
  return path;
}

describe('RosaLe8', () => {
  test('es una imagen de 520 × 520 con los 8 puntajes y el total en el aria-label', () => {
    const rosa = renderRosa();
    expect(rosa.tagName.toLowerCase()).toBe('svg');
    expect(rosa).toHaveAttribute('viewBox', '0 0 520 520');
    expect(rosa).toHaveAttribute('width', '100%');
    const etiqueta = rosa.getAttribute('aria-label') ?? '';
    for (const habito of [
      'Alimentación 60',
      'Actividad física 62',
      'Nicotina 100',
      'Sueño 45',
      'Peso (IMC) 58',
      'Colesterol 60',
      'Glucemia 70',
      'Presión arterial 57',
    ]) {
      expect(etiqueta).toContain(habito);
    }
    expect(etiqueta).toContain('En el centro, tu total: 64, banda moderada; el día 0 era 58.');
    expect(etiqueta).toContain('el anillo punteado de nuestros agentes de IA');
    expect(etiqueta).toContain('el anillo sólido de tu equipo médico');
  });

  test('dibuja los 8 pétalos con su rótulo y el total en el núcleo', () => {
    const rosa = renderRosa();
    expect(rosa.querySelectorAll('[data-petalo]')).toHaveLength(8);
    expect(screen.getByText('Alimentación')).toBeInTheDocument();
    expect(screen.getByText('Actividad')).toBeInTheDocument();
    expect(screen.getByText('física')).toBeInTheDocument();
    expect(screen.getByText('64')).toBeInTheDocument();
    expect(screen.getByText('moderada')).toBeInTheDocument();
    expect(screen.getByText('día 0: 58')).toBeInTheDocument();
    expect(rosa.querySelector('[data-rotulo="nicotina"]')).toHaveTextContent('Nicotina100');
    expect(screen.queryByText('Falta')).not.toBeInTheDocument();
  });

  test('un pétalo sin dato dibuja el contorno discontinuo y el rótulo «Falta»', () => {
    const rosa = renderRosa({ dominios: dominiosCon([60, 62, 100, undefined, 58, 60, 70, 57]) });
    expect(rosa.querySelector('[data-rotulo="sueno"]')).toHaveTextContent('SueñoFalta');
    expect(screen.getAllByText('Falta')).toHaveLength(1);
    const sueno = petalo(rosa, 'sueno');
    expect(sueno).toHaveAttribute('fill', 'none');
    expect(sueno).toHaveAttribute('stroke', '#99c8ff');
    expect(sueno).toHaveAttribute('stroke-dasharray');
    expect(petalo(rosa, 'dieta')).not.toHaveAttribute('stroke-dasharray');
    expect(rosa.getAttribute('aria-label')).toContain('Sueño sin dato todavía');
  });

  test('sin ningún dato, el núcleo muestra una raya y el aria-label lo dice', () => {
    const rosa = renderRosa({
      dominios: dominiosCon([]),
      total: undefined,
      categoria: undefined,
      totalInicial: undefined,
    });
    expect(screen.getAllByText('Falta')).toHaveLength(8);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText(/día 0/)).not.toBeInTheDocument();
    expect(rosa.getAttribute('aria-label')).toContain('En el centro va tu total, que todavía no tiene datos.');
  });

  test('sin día 0 no se muestra ni se nombra', () => {
    const rosa = renderRosa({ totalInicial: undefined });
    expect(screen.queryByText(/día 0/)).not.toBeInTheDocument();
    expect(rosa.getAttribute('aria-label')).toContain('tu total: 64, banda moderada.');
  });

  test('los nodos del equipo aparecen solo si están en anillos.equipo', () => {
    const rosa = renderRosa({ anillos: { ...SIN_ANILLOS, equipo: ['plan'] } });
    expect(rosa.querySelectorAll('[data-nodo]')).toHaveLength(1);
    expect(screen.getByText('Plan Bienestar')).toBeInTheDocument();
    expect(screen.queryByText('Cabecera')).not.toBeInTheDocument();
    expect(screen.queryByText(MARCA.producto)).not.toBeInTheDocument();
    expect(rosa.getAttribute('aria-label')).toContain('el anillo sólido de tu equipo médico: Plan Bienestar.');
  });

  test('sin equipo no hay nodos', () => {
    const rosa = renderRosa();
    expect(rosa.querySelectorAll('[data-nodo]')).toHaveLength(0);
    expect(rosa.getAttribute('aria-label')).toContain('y el anillo sólido de tu equipo médico.');
  });

  test('con la Segunda Opinión en análisis: su nodo, su estado y el tramo encendido', () => {
    const rosa = renderRosa({
      anillos: {
        iaEnProceso: true,
        laboratorioLeido: true,
        segundaOpinion: 'en-analisis',
        equipo: ['plan', 'cabecera', 'segunda-opinion'],
      },
    });
    expect(rosa.querySelectorAll('[data-nodo]')).toHaveLength(3);
    expect(screen.getByText('Cabecera')).toBeInTheDocument();
    expect(screen.getByText(MARCA.producto)).toBeInTheDocument();
    expect(screen.getByText('en análisis')).toBeInTheDocument();
    expect(rosa.querySelector('[data-tramo="segunda-opinion"]')).toBeInTheDocument();
    expect(rosa.getAttribute('aria-label')).toContain(
      'Alrededor, el anillo punteado de nuestros agentes de IA, que leyó tu laboratorio y está trabajando con ' +
        'tus datos, y el anillo sólido de tu equipo médico: Cabecera, Plan Bienestar y ' +
        `${MARCA.producto}, que está en análisis.`
    );
  });

  test('con la Segunda Opinión firmada: «firmada» y sin tramo encendido', () => {
    const rosa = renderRosa({
      anillos: { ...SIN_ANILLOS, segundaOpinion: 'completada', equipo: ['segunda-opinion'] },
    });
    expect(screen.getByText('firmada')).toBeInTheDocument();
    expect(screen.queryByText('en análisis')).not.toBeInTheDocument();
    expect(rosa.querySelector('[data-tramo]')).not.toBeInTheDocument();
    expect(rosa.getAttribute('aria-label')).toContain(`${MARCA.producto}, ya firmada.`);
  });

  test('la marca del laboratorio aparece solo si la IA lo leyó', () => {
    renderRosa();
    expect(screen.queryByText('Laboratorio')).not.toBeInTheDocument();
  });

  test('con el laboratorio leído, la marca «Laboratorio / leído por IA»', () => {
    const rosa = renderRosa({ anillos: { ...SIN_ANILLOS, laboratorioLeido: true } });
    expect(rosa.querySelector('[data-marca="laboratorio"]')).toHaveTextContent('Laboratorioleído por IA');
  });

  test('el anillo de IA gira solo con iaEnProceso', () => {
    const quieta = renderRosa();
    const ia = quieta.querySelector('[data-anillo="ia"]');
    expect(ia).toHaveAttribute('stroke-dasharray', '0 7.854');
    expect(ia).not.toHaveClass(classes.gira);
    // Los pétalos crecen igual.
    expect(quieta.querySelectorAll(`.${classes.brota}`)).toHaveLength(8);
  });

  test('con iaEnProceso, el anillo de IA lleva la clase de giro', () => {
    const rosa = renderRosa({ anillos: { ...SIN_ANILLOS, iaEnProceso: true } });
    expect(rosa.querySelector('[data-anillo="ia"]')).toHaveClass(classes.gira);
    expect(rosa.querySelector('[data-anillo="equipo"]')).not.toHaveClass(classes.gira);
  });

  test('por defecto los pétalos van en tinta', () => {
    const rosa = renderRosa();
    for (const d of LE8_DOMINIOS) {
      expect(petalo(rosa, d)).toHaveAttribute('fill', COLORES_PETALOS.tinta);
    }
  });

  test('modoColor «dominio» pinta cada hábito con su color', () => {
    const rosa = renderRosa({ modoColor: 'dominio' });
    for (const d of LE8_DOMINIOS) {
      expect(petalo(rosa, d)).toHaveAttribute('fill', COLORES_PETALOS.porDominio[d]);
    }
  });

  test('modoColor «banda» pinta según la banda de cada puntaje', () => {
    const rosa = renderRosa({ modoColor: 'banda' });
    expect(petalo(rosa, 'nicotina')).toHaveAttribute('fill', COLORES_PETALOS.porBanda.alta);
    expect(petalo(rosa, 'dieta')).toHaveAttribute('fill', COLORES_PETALOS.porBanda.moderada);
    expect(petalo(rosa, 'sueno')).toHaveAttribute('fill', COLORES_PETALOS.porBanda.baja);
  });
});
