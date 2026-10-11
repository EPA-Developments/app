// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { JSX } from 'react';
import { MemoryRouter } from 'react-router';
import { MARCA } from '../../marca';
import { simularPantalla } from '../../testing/pantalla';
import { NOTA_INFORME_EN_CAMINO, NOTA_LABORATORIO_SIN_REVISION } from './tablero';
import {
  FILAS_CELULAR,
  FILAS_ESCRITORIO,
  MAX_PALETAS_MS,
  PALETA_MS,
  pasoPaletas,
  TableroSalidasLlegadas,
  TEXTO_INCOMPLETO,
  VUELTAS_PALETA,
} from './TableroSalidasLlegadas';
import type { FilaTablero, TableroHomeD } from './tipos';

const HOY = '2026-10-10';
const ID_TITULO = 't-tablero';

/** El recorrido de Jorge (datos ficticios), de la más nueva a la más vieja. */
const FILAS: readonly FilaTablero[] = [
  {
    id: 'Communication/c1',
    sentido: 'llegada',
    recurso: 'Communication',
    fecha: '2026-10-09T13:00:00.000Z',
    que: 'Mensaje nuevo',
    ruta: 'Llegada → Novedades',
    estado: 'Sin leer',
    tono: 'atencion',
    href: '/Communication/h1',
  },
  {
    id: 'DiagnosticReport/dr1',
    sentido: 'llegada',
    recurso: 'DiagnosticReport',
    fecha: '2026-10-03T12:05:00.000Z',
    actualizada: '2026-10-03T12:05:00.000Z',
    que: 'Resultados de laboratorio',
    ruta: 'Llegada → Biomarcadores',
    estado: 'Listo: 14 valores',
    tono: 'atencion',
    nota: NOTA_LABORATORIO_SIN_REVISION,
    href: '/health-record/lab-results/dr1',
  },
  {
    id: 'DocumentReference/d1',
    sentido: 'salida',
    recurso: 'DocumentReference',
    fecha: '2026-10-03T12:00:00.000Z',
    que: 'PDF de laboratorio',
    ruta: 'Tu app → Agente de laboratorio',
    estado: 'Procesado',
    tono: 'listo',
    href: '/enviar-estudios',
  },
  {
    id: 'Observation/o1',
    sentido: 'salida',
    recurso: 'Observation',
    fecha: '2026-10-02T22:00:00.000Z',
    que: 'Presión y peso',
    ruta: 'Tu app → Tu tablero',
    estado: 'Registrado',
    tono: 'listo',
    href: '/health-record/vitals',
  },
  {
    id: 'ServiceRequest/s1',
    sentido: 'salida',
    recurso: 'ServiceRequest',
    fecha: '2026-09-28T13:00:00.000Z',
    que: `Pedido de ${MARCA.producto}`,
    ruta: 'Tu app → Agentes de IA y equipo médico',
    estado: 'En análisis',
    tono: 'en-curso',
    href: '/mi-segunda-opinion',
  },
  {
    id: 'QuestionnaireResponse/q1',
    sentido: 'salida',
    recurso: 'QuestionnaireResponse',
    fecha: '2026-09-25T14:00:00.000Z',
    que: 'Cuestionario de calidad del sueño',
    ruta: 'Tu app → Tus 8 hábitos',
    estado: 'Sumado a tu LE8',
    tono: 'listo',
    href: '/health-record/questionnaire-responses/q1',
  },
  {
    id: 'Communication/c0',
    sentido: 'llegada',
    recurso: 'Communication',
    fecha: '2025-12-30T15:00:00.000Z',
    que: 'Aviso',
    ruta: 'Llegada → Novedades',
    estado: 'Leída',
    tono: 'neutro',
  },
  {
    id: 'ServiceRequest/s1#llegada',
    sentido: 'llegada',
    recurso: 'ServiceRequest',
    que: `Informe de ${MARCA.producto}`,
    ruta: `Llegada → Mi ${MARCA.producto}`,
    estado: 'En camino',
    tono: 'en-curso',
    nota: NOTA_INFORME_EN_CAMINO,
    href: '/mi-segunda-opinion',
  },
];

function tablero(cambios: Partial<TableroHomeD> = {}): TableroHomeD {
  return {
    cargando: false,
    filas: FILAS,
    nuevas: new Set(['DiagnosticReport/dr1']),
    incompleto: false,
    ...cambios,
  };
}

function Vista({ datos }: { readonly datos: TableroHomeD }): JSX.Element {
  return (
    <MemoryRouter>
      <MantineProvider>
        <section aria-labelledby={ID_TITULO}>
          <h2 id={ID_TITULO}>Salidas y llegadas de tus datos</h2>
          <TableroSalidasLlegadas tablero={datos} idTitulo={ID_TITULO} hoy={HOY} />
        </section>
      </MantineProvider>
    </MemoryRouter>
  );
}

async function mostrar(datos: TableroHomeD): Promise<{ readonly rerender: (d: TableroHomeD) => Promise<void> }> {
  let resultado: ReturnType<typeof render> | undefined;
  await act(async () => {
    resultado = render(<Vista datos={datos} />);
  });
  return {
    rerender: async (d) => {
      await act(async () => {
        resultado?.rerender(<Vista datos={d} />);
      });
    },
  };
}

/**
 * El nombre accesible sin los espacios que agrega jsdom entre spans: sin CSS no sabe que son
 * inline (en el navegador, «laboratorio.» va pegado).
 */
function normalizar(nombre: string): string {
  return nombre
    .replace(/\s+([.,:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function linkLlamado(nombre: string): HTMLElement {
  return screen.getByRole('link', { name: (n) => normalizar(n) === nombre });
}

function lista(): HTMLElement {
  return screen.getByRole('list', { name: 'Salidas y llegadas de tus datos' });
}

function filasVisibles(): HTMLElement[] {
  return within(lista()).getAllByRole('listitem');
}

async function elegirPestania(nombre: 'Todo' | 'Salidas' | 'Llegadas'): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('radio', { name: nombre }));
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TableroSalidasLlegadas: las filas', () => {
  test('en escritorio se ven 6 y «Ver todo (8)» despliega el resto en el lugar, con el foco en la primera nueva', async () => {
    simularPantalla(true);
    await mostrar(tablero());
    expect(FILAS_ESCRITORIO).toBe(6);
    expect(filasVisibles()).toHaveLength(6);
    const verTodo = screen.getByRole('button', { name: 'Ver todo (8)' });
    await act(async () => {
      fireEvent.click(verTodo);
    });
    expect(filasVisibles()).toHaveLength(8);
    expect(screen.queryByRole('button', { name: /Ver todo/ })).not.toBeInTheDocument();
    // La séptima (la novedad sin destino) no es un link: el foco va a su ítem.
    expect(document.activeElement).toBe(filasVisibles()[6]);
  });

  test('en el celular se ven 4', async () => {
    simularPantalla(false);
    await mostrar(tablero());
    expect(FILAS_CELULAR).toBe(4);
    expect(filasVisibles()).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Ver todo (8)' })).toBeInTheDocument();
  });

  test('cada fila es un link a su detalle, con todo dicho para lectores de pantalla', async () => {
    simularPantalla(true);
    await mostrar(tablero());
    const pdf = linkLlamado(
      'Salida. 3 de octubre. PDF de laboratorio. Tu app hacia Agente de laboratorio. Estado: Procesado'
    );
    expect(pdf).toHaveAttribute('href', '/enviar-estudios');
    // La fecha y la flecha que se ven son decorativas para el lector (va el texto completo).
    expect(within(pdf).getByText('03 OCT')).toHaveAttribute('aria-hidden', 'true');
    expect(within(pdf).getByText('→')).toHaveAttribute('aria-hidden', 'true');
    expect(within(pdf).getByText('Procesado')).toHaveAttribute('data-tono', 'listo');
    expect(screen.getByRole('link', { name: /Presión y peso/ })).toHaveAttribute('href', '/health-record/vitals');
    expect(screen.getByRole('link', { name: /^Salida\. 28 de septiembre\. Pedido de/ })).toHaveAttribute(
      'href',
      '/mi-segunda-opinion'
    );
  });

  test('la nota honesta va a la vista, y lo que no llegó dice «—» sin fecha', async () => {
    simularPantalla(true);
    await mostrar(tablero());
    expect(screen.getByText(NOTA_LABORATORIO_SIN_REVISION)).toBeInTheDocument();
    await elegirPestania('Llegadas');
    const informe = linkLlamado(
      `Llegada. Sin fecha todavía. Informe de ${MARCA.producto}. Llegada hacia Mi ${MARCA.producto}. Te avisamos en Novedades cuando esté listo. Estado: En camino`
    );
    expect(informe).toHaveAttribute('href', '/mi-segunda-opinion');
    expect(within(informe).getByText('—')).toBeInTheDocument();
  });

  test('una fila sin destino real no es un link; el año se ve solo si no es el de hoy', async () => {
    simularPantalla(false);
    await mostrar(tablero());
    await elegirPestania('Llegadas');
    const aviso = within(lista()).getByText('Aviso');
    expect(aviso.closest('a')).toBeNull();
    const item = aviso.closest('li') as HTMLElement;
    expect(within(item).getByText('2025')).toBeInTheDocument();
    expect(within(item).getByText('30 de diciembre de 2025.')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /Mensaje nuevo/ })).queryByText('2026')).not.toBeInTheDocument();
  });
});

describe('TableroSalidasLlegadas: lo nuevo (paletas)', () => {
  test('solo las filas nuevas tienen paletas y el chip «Nuevo»; el texto completo se lee aparte', async () => {
    simularPantalla(true);
    await mostrar(tablero());
    const nueva = linkLlamado(
      `Llegada. 3 de octubre. Resultados de laboratorio. Llegada hacia Biomarcadores. ${NOTA_LABORATORIO_SIN_REVISION} Estado: Listo: 14 valores. Nuevo`
    );
    const paletas = nueva.querySelectorAll('[data-paletas]');
    expect(paletas).toHaveLength(2); // la fecha y el estado
    for (const p of paletas) {
      expect(p.closest('[aria-hidden="true"]')).not.toBeNull();
    }
    // Una paleta por carácter (los espacios también): «03 OCT» y «Listo: 14 valores».
    const letras = [...paletas].map((p) => [...p.querySelectorAll(':scope > span > span')].map((l) => l.textContent).join(''));
    expect(letras).toEqual(['03 OCT', 'Listo: 14 valores']);
    expect(within(nueva).getByText('Nuevo')).toBeInTheDocument();
    // Las demás, sin paletas ni chip.
    const vieja = screen.getByRole('link', { name: /PDF de laboratorio/ });
    expect(vieja.querySelector('[data-paletas]')).toBeNull();
    expect(within(vieja).queryByText('Nuevo')).not.toBeInTheDocument();
    expect(screen.getAllByText('Nuevo')).toHaveLength(1);
  });

  test('las paletas giran escalonadas y la fila entera termina en 900ms como mucho', async () => {
    simularPantalla(true);
    await mostrar(tablero());
    const nueva = screen.getByRole('link', { name: /Resultados de laboratorio/ });
    const retrasos = [...nueva.querySelectorAll<HTMLElement>('[data-paletas] > span > span')].map((l) =>
      Number.parseInt(l.style.animationDelay, 10)
    );
    expect(retrasos[0]).toBe(0);
    expect(retrasos).toEqual([...retrasos].sort((a, b) => a - b));
    const ultimo = retrasos[retrasos.length - 1] as number;
    expect(ultimo + PALETA_MS * VUELTAS_PALETA).toBeLessThanOrEqual(MAX_PALETAS_MS);
  });

  test('pasoPaletas: nunca pasa de 900ms por fila', () => {
    for (const n of [1, 2, 6, 23, 40, 80]) {
      expect((n - 1) * pasoPaletas(n) + PALETA_MS * VUELTAS_PALETA).toBeLessThanOrEqual(MAX_PALETAS_MS);
    }
    expect(pasoPaletas(1)).toBe(0);
    expect(pasoPaletas(6)).toBe(28);
  });

  test('lo que llega en tiempo real se anuncia («Llegó: …»); la primera carga, no', async () => {
    simularPantalla(true);
    const pantalla = await mostrar(tablero({ nuevas: new Set() }));
    const region = document.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(region).toBeInTheDocument();
    expect(region).toHaveTextContent('');
    const llego: FilaTablero = {
      id: 'Communication/c2',
      sentido: 'llegada',
      recurso: 'Communication',
      fecha: '2026-10-10T14:00:00.000Z',
      que: 'Turno confirmado',
      ruta: 'Llegada → Novedades',
      estado: 'Sin leer',
      tono: 'atencion',
      href: '/membership',
    };
    await pantalla.rerender(tablero({ filas: [llego, ...FILAS], nuevas: new Set([llego.id]) }));
    expect(region).toHaveTextContent('Llegó: Turno confirmado.');
    expect(within(screen.getByRole('link', { name: /Turno confirmado/ })).getByText('Nuevo')).toBeInTheDocument();
  });
});

describe('TableroSalidasLlegadas: pestañas y estados', () => {
  test('las pestañas son un radiogroup: Salidas y Llegadas filtran', async () => {
    simularPantalla(false);
    await mostrar(tablero());
    expect(screen.getByRole('radiogroup', { name: 'Mostrar en el tablero' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Todo' })).toBeChecked();
    await elegirPestania('Salidas');
    expect(screen.getByRole('radio', { name: 'Salidas' })).toBeChecked();
    expect(filasVisibles().map((li) => li.textContent)).toEqual([
      expect.stringContaining('PDF de laboratorio'),
      expect.stringContaining('Presión y peso'),
      expect.stringContaining('Pedido de'),
      expect.stringContaining('Cuestionario de calidad del sueño'),
    ]);
    expect(screen.queryByRole('button', { name: /Ver todo/ })).not.toBeInTheDocument();
    await elegirPestania('Llegadas');
    expect(filasVisibles()).toHaveLength(4);
    expect(filasVisibles().every((li) => li.textContent?.startsWith('Llegada.'))).toBe(true);
  });

  test('una pestaña sin filas lo dice: sin llegadas', async () => {
    await mostrar(tablero({ filas: FILAS.filter((f) => f.sentido === 'salida'), nuevas: new Set() }));
    await elegirPestania('Llegadas');
    expect(screen.getByText('No hay llegadas todavía.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Salidas y llegadas de tus datos' })).not.toBeInTheDocument();
  });

  test('una pestaña sin filas lo dice: sin salidas', async () => {
    await mostrar(tablero({ filas: FILAS.filter((f) => f.sentido === 'llegada'), nuevas: new Set() }));
    await elegirPestania('Salidas');
    expect(screen.getByText('No hay salidas todavía.')).toBeInTheDocument();
  });

  test('sin nada mandado: por dónde empezar, sin pestañas', async () => {
    await mostrar(tablero({ filas: [], nuevas: new Set() }));
    expect(screen.getByText('Todavía no mandaste nada. Tu ruta empieza en tu celular.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Enviar mi laboratorio en PDF' })).toHaveAttribute(
      'href',
      '/enviar-estudios'
    );
    expect(screen.getByRole('link', { name: 'Cargar mis datos de salud' })).toHaveAttribute(
      'href',
      '/care-plan/plan-100-dias/mis-datos'
    );
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  test('si algo falló y no hay filas, no afirma que no mandó nada', async () => {
    await mostrar(tablero({ filas: [], nuevas: new Set(), incompleto: true }));
    expect(screen.getByText(TEXTO_INCOMPLETO)).toBeInTheDocument();
    expect(TEXTO_INCOMPLETO).toBe('No pudimos traer todo tu recorrido. Probá de nuevo en un rato.');
    expect(screen.queryByText(/Todavía no mandaste nada/)).not.toBeInTheDocument();
  });

  test('incompleto con filas: las muestra y avisa', async () => {
    await mostrar(tablero({ incompleto: true }));
    expect(filasVisibles()).toHaveLength(4);
    expect(screen.getByText(TEXTO_INCOMPLETO)).toBeInTheDocument();
  });

  test('cargando: 4 filas esqueleto, ocupado y dicho para lectores', async () => {
    const { rerender } = await mostrar(tablero({ cargando: true, filas: [], nuevas: new Set() }));
    expect(document.querySelectorAll('[data-esqueleto]')).toHaveLength(4);
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.getByText('Cargando tus salidas y llegadas.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await rerender(tablero());
    expect(document.querySelectorAll('[data-esqueleto]')).toHaveLength(0);
    // Terminar de cargar no es «llegó»: no se anuncia nada.
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('');
  });

  test('el pie de la demora va cuando hay PDFs', async () => {
    await mostrar(tablero());
    expect(screen.getByText(/Si un PDF de laboratorio se demora, el tablero lo marca como/)).toHaveTextContent(
      'Si un PDF de laboratorio se demora, el tablero lo marca como Demorado; si no pudimos leerlo, te escribimos por Mensajes.'
    );
  });

  test('sin PDFs no hay pie de la demora (de la Segunda Opinión no se afirma)', async () => {
    await mostrar(tablero({ filas: FILAS.filter((f) => f.recurso !== 'DocumentReference') }));
    expect(screen.queryByText(/se demora/)).not.toBeInTheDocument();
  });

  test('textos neutros y sin placeholders', async () => {
    simularPantalla(true);
    await mostrar(tablero());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ver todo (8)' }));
    });
    const texto = document.body.textContent ?? '';
    expect(texto).not.toMatch(/\[/);
    expect(texto).not.toMatch(/bienvenida|inscripta|\blista\b|\bsola\b|la paciente/i);
    expect(texto).not.toMatch(/vuelo|pasajer|embarque|despegue/i);
  });
});
