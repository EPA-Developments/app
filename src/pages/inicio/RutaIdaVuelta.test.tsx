// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { LE8_DOMINIOS } from '@epa/careplan-menopausia';
import { MantineProvider } from '@mantine/core';
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { JSX, ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { RUTA_CONSENTIMIENTO } from '../../components/AvisoConsentimiento';
import { simularPantalla } from '../../testing/pantalla';
import { rutaDe } from './ruta';
import { RUTA_MI_SEGUNDA_OPINION } from './rutas';
import {
  CLAVE_RUTA_TRAZADA,
  DESDE_HORIZONTAL,
  PULSO_POR_TRAMO_MS,
  RutaIdaVuelta,
  rutaYaTrazada,
  textoEstacion,
  TRAZO_MS,
} from './RutaIdaVuelta';
import type { RutaIdaVueltaProps } from './RutaIdaVuelta';
import type { DatosHomeE, LaboratorioHome, ResultadoLe8, RutaHomeD, SegundaOpinionHome } from './tipos';

const HOY = '2026-10-10';
// Un nombre cualquiera: en la Home entra desde MARCA.producto.
const OPCIONES = { producto: 'Revisión Experta' };

function le8Vacio(): ResultadoLe8 {
  return {
    dominios: LE8_DOMINIOS.map((dominio) => ({ dominio })),
    conDato: 0,
    completo: false,
    faltantes: [],
    dominiosBajos: [],
  };
}

/** Laura (datos ficticios), con el consentimiento firmado el 8 de agosto. */
function datos(cambios: Partial<DatosHomeE> = {}): DatosHomeE {
  return {
    cargando: false,
    esPaciente: true,
    nombre: 'Laura',
    hoy: HOY,
    le8: le8Vacio(),
    consentimiento: 'firmado',
    fechaConsentimiento: '2026-08-08',
    ingresoPendiente: false,
    novedadesSinLeer: 0,
    ...cambios,
  };
}

const EN_ANALISIS: SegundaOpinionHome = {
  id: 'som-1',
  estado: 'en-analisis',
  firmada: false,
  etiqueta: 'En análisis',
  pedida: '2026-09-28',
};
const LAB_LEIDO: LaboratorioHome = {
  estado: 'procesado',
  fecha: '2026-10-03T12:00:00.000Z',
  valores: 14,
  informeId: 'dr1',
  revisionMedica: false,
};

function ruta(cambios: Partial<DatosHomeE> = {}): RutaHomeD {
  return rutaDe(datos(cambios), OPCIONES);
}

function Envoltorio({ children }: { readonly children: ReactNode }): JSX.Element {
  return (
    <MantineProvider>
      <MemoryRouter>{children}</MemoryRouter>
    </MantineProvider>
  );
}

function dibujar(props: RutaIdaVueltaProps): ReturnType<typeof render> {
  return render(<RutaIdaVuelta {...props} />, { wrapper: Envoltorio });
}

/** El dibujo decorativo (lo que no leen los lectores de pantalla). */
function dibujo(): HTMLElement {
  const elemento = document.querySelector<HTMLElement>('[data-orientacion]');
  if (!elemento) {
    throw new Error('No se dibujó la ruta');
  }
  return elemento;
}

beforeEach(() => {
  window.sessionStorage.clear();
  simularPantalla(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RutaIdaVuelta', () => {
  test('la tarjeta se nombra con su título (h2) y lleva el subtítulo', () => {
    dibujar({ ruta: ruta({ segundaOpinion: EN_ANALISIS }) });
    const titulo = screen.getByRole('heading', { level: 2, name: 'Tu Revisión Experta, ida y vuelta' });
    expect(screen.getByRole('region', { name: 'Tu Revisión Experta, ida y vuelta' })).toContainElement(titulo);
    expect(screen.getByText('Pedida el 28 de septiembre')).toBeInTheDocument();
  });

  test('el título puede ir como h3', () => {
    dibujar({ ruta: ruta(), nivelTitulo: 3 });
    expect(screen.getByRole('heading', { level: 3, name: 'Tus datos, ida y vuelta' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });

  test('para lectores de pantalla: una lista ordenada con cada estación y su estado', () => {
    const r = ruta({ segundaOpinion: EN_ANALISIS });
    dibujar({ ruta: r });
    const lista = screen.getByRole('list', { name: 'Estaciones de la ruta, de ida y de vuelta' });
    expect(lista.tagName).toBe('OL');
    expect(
      within(lista)
        .getAllByRole('listitem')
        .map((li) => li.textContent)
    ).toEqual([
      'Tu app: recorrida',
      'Tu historia clínica, FHIR R4: recorrida',
      'Consentimiento, firmado el 8 de agosto: recorrida',
      'Agentes de IA, ordenan y calculan: activa ahora',
      'Equipo médico: activa ahora',
      'Informe y PDF: por recorrer',
      'Novedades, y Mensajes: por recorrer',
      'Vos: por recorrer',
    ]);
    expect(r.estaciones.map(textoEstacion)[0]).toBe('Tu app: recorrida');
  });

  test('el dibujo es decorativo (aria-hidden) y sus rótulos son HTML, no <text> de SVG', () => {
    dibujar({ ruta: ruta({ segundaOpinion: EN_ANALISIS }) });
    const u = dibujo();
    expect(u).toHaveAttribute('aria-hidden', 'true');
    expect(u.querySelector('text')).toBeNull();
    expect(within(u).getByText('Agentes de IA').tagName).toBe('SPAN');
    // Las 8 estaciones, cada una con su rótulo y su pieza de vía.
    expect(u.querySelectorAll('[data-clave]')).toHaveLength(16);
  });

  test('debajo, en texto: el tramo activo, la explicación, el control y la acción como link', () => {
    dibujar({ ruta: ruta({ segundaOpinion: EN_ANALISIS }) });
    expect(screen.getByText('En análisis')).toBeInTheDocument();
    expect(screen.getByText(/desde el 28 de septiembre/)).toBeInTheDocument();
    expect(screen.getByText(/trabajan juntos en tu caso/)).toBeInTheDocument();
    const fuerte = screen.getByText('Control de consentimiento: firmado.');
    expect(fuerte.tagName).toBe('STRONG');
    expect(fuerte.parentElement).toHaveTextContent(
      'Control de consentimiento: firmado. Sin tu firma, tus datos clínicos no pasan por nuestros agentes de IA.'
    );
    expect(screen.getByRole('link', { name: 'Ver mi Revisión Experta' })).toHaveAttribute(
      'href',
      RUTA_MI_SEGUNDA_OPINION
    );
    expect(screen.getByText('Recorrido')).toBeInTheDocument();
    expect(screen.getByText('Por recorrer')).toBeInTheDocument();
  });

  test('sin firma: el candado cierra la ruta, la línea se corta y la acción lleva a firmar', () => {
    dibujar({ ruta: ruta({ consentimiento: 'falta', laboratorio: LAB_LEIDO }) });
    const u = dibujo();
    expect(u.querySelector('[data-estado="cerrada"]')).not.toBeNull();
    // Nada se dibuja entre el candado y los agentes de IA.
    const viaIa = u.querySelector('[data-tramo="ida"][data-clave="ia"] svg');
    expect(viaIa?.querySelectorAll('line')).toHaveLength(1);
    expect(screen.getByText('Control de consentimiento: falta tu firma.').tagName).toBe('STRONG');
    expect(screen.getByRole('link', { name: 'Firmar mi consentimiento' })).toHaveAttribute('href', RUTA_CONSENTIMIENTO);
  });

  test('un perfil que no es Patient: sin acción', () => {
    dibujar({ ruta: ruta({ esPaciente: false }) });
    expect(screen.queryByRole('link')).toBeNull();
  });

  test('en el celular la U es vertical; desde 48em (tablet y escritorio), horizontal', () => {
    expect(DESDE_HORIZONTAL).toBe('(min-width: 48em)');
    const { unmount } = dibujar({ ruta: ruta() });
    expect(dibujo()).toHaveAttribute('data-orientacion', 'vertical');
    expect(dibujo().querySelector('line')).toHaveAttribute('x1', '50%');
    unmount();
    simularPantalla(true);
    dibujar({ ruta: ruta() });
    expect(dibujo()).toHaveAttribute('data-orientacion', 'horizontal');
    expect(dibujo().querySelector('line')).toHaveAttribute('y1', '50%');
  });

  test('la cápsula une a los agentes de IA y al equipo médico cuando trabajan juntos', () => {
    dibujar({ ruta: ruta({ segundaOpinion: EN_ANALISIS }) });
    const capsulas = [...dibujo().querySelectorAll('[data-extremo]')].map((c) => c.getAttribute('data-extremo'));
    expect(capsulas).toEqual(['inicio', 'fin']);
  });

  test('sin nada en curso no hay cápsula ni pulso', () => {
    dibujar({ ruta: ruta({ laboratorio: LAB_LEIDO }) });
    expect(dibujo().querySelector('[data-extremo]')).toBeNull();
    expect(dibujo().querySelector('[data-recorrido]')).toBeNull();
  });

  test('el pulso recorre la línea solo con algo en curso, una media línea después de la otra', () => {
    dibujar({ ruta: ruta({ segundaOpinion: EN_ANALISIS }) });
    const pulsos = [...dibujo().querySelectorAll<HTMLElement>('[data-recorrido]')];
    expect(pulsos).toHaveLength(8);
    expect(pulsos.map((p) => p.style.animationDelay)).toEqual(
      Array.from({ length: 8 }, (_, k) => `${k * PULSO_POR_TRAMO_MS}ms`)
    );
    // Toda la cadena entra en el ciclo de 6s.
    expect(pulsos.length * PULSO_POR_TRAMO_MS).toBeLessThanOrEqual(6000);
    expect(pulsos[0]).toHaveAttribute('data-recorrido', '50-100');
  });

  test('la primera vez en la sesión se traza lo recorrido (900ms en total) y queda anotado', () => {
    expect(rutaYaTrazada()).toBe(false);
    dibujar({ ruta: ruta({ segundaOpinion: EN_ANALISIS }) });
    const trazos = [...dibujo().querySelectorAll<SVGLineElement>('line')].filter((l) => l.style.animationDelay);
    expect(trazos).toHaveLength(8);
    const paso = Math.round(TRAZO_MS / 8);
    expect(trazos.map((l) => l.style.animationDuration)).toEqual(Array(8).fill(`${paso}ms`));
    expect(trazos.at(-1)?.style.animationDelay).toBe(`${7 * paso}ms`);
    expect(window.sessionStorage.getItem(CLAVE_RUTA_TRAZADA)).toBe('1');
    expect(rutaYaTrazada()).toBe(true);
  });

  test('si ya se trazó en esta sesión, aparece quieta', () => {
    window.sessionStorage.setItem(CLAVE_RUTA_TRAZADA, '1');
    dibujar({ ruta: ruta({ segundaOpinion: EN_ANALISIS }) });
    const trazos = [...dibujo().querySelectorAll<SVGLineElement>('line')].filter((l) => l.style.animationDelay);
    expect(trazos).toHaveLength(0);
  });

  test('sin sessionStorage (bloqueado) no se rompe: se dibuja igual', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(rutaYaTrazada()).toBe(false);
    dibujar({ ruta: ruta({ segundaOpinion: EN_ANALISIS }) });
    expect(screen.getByRole('heading', { name: 'Tu Revisión Experta, ida y vuelta' })).toBeInTheDocument();
  });

  test('sin placeholders ni textos marcados por género', () => {
    dibujar({ ruta: ruta({ segundaOpinion: EN_ANALISIS }) });
    const texto = document.body.textContent ?? '';
    expect(texto).not.toContain('[');
    expect(texto).not.toMatch(/bienvenida|inscripta|\blista\b|\bsola\b|la paciente/i);
    expect(texto).not.toMatch(/vuelo|pasajer|embarque|despegue/i);
  });
});

describe('RutaIdaVuelta.module.css', () => {
  const css = readFileSync(join(process.cwd(), 'src/pages/inicio/RutaIdaVuelta.module.css'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    ''
  );

  test('solo tokens var(--d-…) de la Home D: ningún color suelto', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect((css.match(/var\(--[\w-]+/g) ?? []).filter((v) => !v.startsWith('var(--d-'))).toEqual([]);
  });

  test('con prefers-reduced-motion no hay trazo ni pulso', () => {
    const quieto = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(quieto).toMatch(/\.trazando[^{]*\{\s*animation: none !important/);
    expect(quieto).toMatch(/\.pulso\s*\{\s*display: none/);
  });

  test('la U horizontal entra en escritorio y la vertical en el celular', () => {
    expect(css).toMatch(
      /\.dibujo\[data-orientacion='horizontal'\]\s*\{\s*grid-template-columns: repeat\(15, minmax\(0, 1fr\)\)/
    );
    expect(css).toMatch(
      /\.dibujo\[data-orientacion='vertical'\]\s*\{\s*grid-template-columns:\s*\[ida-rotulo\] minmax\(0, 1fr\)/
    );
  });
});
