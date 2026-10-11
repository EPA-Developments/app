// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { categoriaLe8, LE8_DOMINIOS } from '@epa/careplan-menopausia';
import { MantineProvider } from '@mantine/core';
import type { Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { JSX } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { RUTA_ENVIAR_ESTUDIOS } from '../../components/AccionesRapidas';
import { indexarDefinicionesFhir } from '../../fhir/__fixtures__/glp1';
import type { PlanBienestar } from '../../fhir/bienestar';
import { RUTA_DATOS_DE_SALUD } from '../../fhir/datosDeSalud';
import { hoyArgentina } from '../../fhir/glp1';
import { MARCA } from '../../marca';
import { HomePage } from '../HomePage';
import { NOTA_COSTO_TELECONSULTA } from './caminos';
import { CLAVE_TEMA_HOME_D, conDireccionDe, HomeEstiloD, temaDe, URL_FUENTES_HOME_D, VistaHomeD } from './HomeEstiloD';
import type { VistaHomeDProps } from './HomeEstiloD';
import { paraHoy } from './paraHoy';
import { preventDe } from './prevent';
import { puertaDe } from './puerta';
import { rutaDe } from './ruta';
import { TEXTO_VACIO, TEXTO_VACIO_CON_DATOS } from './TableroSalidasLlegadas';
import {
  RUTA_MI_SEGUNDA_OPINION,
  RUTA_PLAN_BIENESTAR,
  RUTA_RESERVAR_TELECONSULTA,
  RUTA_SOLICITAR_SEGUNDA_OPINION,
  RUTA_TABLERO_LE8,
} from './rutas';
import type { DatosHomeE, ResultadoLe8, TableroHomeD } from './tipos';

const HOY = '2026-10-10'; // un sábado
const ESPERA = { timeout: 10000 };
const PRODUCTO = { producto: MARCA.producto };

const PUNTAJES_HOY = [60, 62, 100, 45, 58, 60, 70, 57];
const PUNTAJES_DIA0 = [48, 50, 100, 42, 55, 56, 66, 47];

function le8(puntajes: readonly (number | undefined)[], total?: number): ResultadoLe8 {
  const dominios = LE8_DOMINIOS.map((dominio, i) => ({ dominio, puntaje: puntajes[i] }));
  const conDato = dominios.filter((d) => d.puntaje !== undefined).length;
  return {
    dominios,
    total,
    categoria: total === undefined ? undefined : categoriaLe8(total),
    conDato,
    completo: conDato === LE8_DOMINIOS.length,
    faltantes: [],
    dominiosBajos: [],
  };
}

const PLAN: PlanBienestar = {
  dia: 63,
  totalDias: 100,
  inicio: '2026-08-09',
  fin: '2026-11-17',
  terminado: false,
  hitos: [
    { id: 'consentimiento', label: 'Firmá el consentimiento', descripcion: 'Hecho.', href: '/c', cumplido: true },
    { id: 'biomarcadores', label: 'Cargá tus biomarcadores', descripcion: 'Hecho.', href: '/b', cumplido: true },
    { id: 'signos', label: 'Registrá tus signos vitales', descripcion: 'Hecho.', href: '/s', cumplido: true },
    { id: 'habitos', label: 'Respondé tus cuestionarios', descripcion: 'Hecho.', href: '/h', cumplido: true },
    {
      id: 'turno',
      label: 'Reservá tu consulta',
      descripcion: 'Con tu equipo revisás cómo vas.',
      href: '/get-care',
      cumplido: false,
    },
  ],
  semanasActivas: 9,
  rachaActual: 4,
};

/** Jorge (ficticio): día 63 del plan, LE8 64 (día 0: 58), CKM 2, laboratorio leído y Segunda Opinión en análisis. */
function jorge(cambios: Partial<DatosHomeE> = {}): DatosHomeE {
  return {
    cargando: false,
    esPaciente: true,
    nombre: 'Jorge',
    hoy: HOY,
    le8: le8(PUNTAJES_HOY, 64),
    le8Inicial: le8(PUNTAJES_DIA0, 58),
    plan: PLAN,
    ckm: { estadio: 2, origen: 'plan' },
    laboratorio: {
      estado: 'procesado',
      fecha: '2026-10-03',
      valores: 14,
      informeId: 'informe-lab-1',
      revisionMedica: false,
    },
    segundaOpinion: {
      id: 'som-1',
      estado: 'en-analisis',
      etiqueta: 'En análisis',
      pedida: '2026-09-28T13:00:00.000Z',
      actualizada: '2026-10-01T13:00:00.000Z',
      firmada: false,
    },
    equipo: { equipoPlan: [], segundaOpinion: [] },
    consentimiento: 'firmado',
    fechaConsentimiento: '2026-08-08T15:00:00.000Z',
    ingresoPendiente: false,
    novedadesSinLeer: 2,
    ...cambios,
  };
}

/** Un perfil que no es Patient (lo que arma useDatosHomeE para un profesional). */
const NO_PACIENTE: DatosHomeE = {
  cargando: false,
  esPaciente: false,
  hoy: HOY,
  consentimiento: 'firmado',
  ingresoPendiente: false,
  novedadesSinLeer: 0,
};

const TABLERO_VACIO: TableroHomeD = { cargando: false, filas: [], nuevas: new Set(), incompleto: false };

const TABLERO_CON_FILAS: TableroHomeD = {
  cargando: false,
  filas: [
    {
      id: 'DocumentReference/pdf-1',
      sentido: 'salida',
      recurso: 'DocumentReference',
      fecha: '2026-10-03T12:00:00.000Z',
      que: 'PDF de laboratorio',
      ruta: 'Tu app → Agente de laboratorio',
      estado: 'Procesado',
      tono: 'listo',
      href: RUTA_ENVIAR_ESTUDIOS,
    },
  ],
  nuevas: new Set(),
  incompleto: false,
};

function Envoltorio({
  children,
  ruta = '/',
  medplum = new MockClient(),
}: {
  readonly children: JSX.Element;
  readonly ruta?: string;
  readonly medplum?: MockClient;
}): JSX.Element {
  return (
    <MemoryRouter initialEntries={[ruta]}>
      <MedplumProvider medplum={medplum}>
        <MantineProvider>{children}</MantineProvider>
      </MedplumProvider>
    </MemoryRouter>
  );
}

async function mostrar(datos: DatosHomeE, props: Partial<Omit<VistaHomeDProps, 'datos'>> = {}): Promise<void> {
  await act(async () => {
    render(
      <Envoltorio>
        <VistaHomeD datos={datos} tablero={TABLERO_CON_FILAS} tema="oscuro" {...props} />
      </Envoltorio>
    );
  });
}

function seccion(nombre: string | RegExp): HTMLElement {
  return screen.getByRole('region', { name: nombre });
}

function puerta(): HTMLElement {
  return screen.getByRole('heading', { level: 1 }).closest('section') as HTMLElement;
}

function hrefDe(nombre: string | RegExp, dentro: HTMLElement = document.body): string | null {
  return within(dentro).getByRole('link', { name: nombre }).getAttribute('href');
}

function raiz(): HTMLElement {
  return document.querySelector('[data-tema]') as HTMLElement;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('VistaHomeD: el orden de la página', () => {
  test('puerta (H1 y ruta), tablero, tres caminos, instrumentos, servicios y el cierre', async () => {
    const datos = jorge();
    await mostrar(datos);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const h2 = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(h2).toEqual([
      rutaDe(datos, PRODUCTO).titulo,
      'Salidas y llegadas de tus datos',
      'Tres caminos para cuidar tu corazón',
      'Tus tres instrumentos',
      'Tus servicios',
    ]);
    // El cierre va al final, después de los servicios.
    const servicios = seccion('Tus servicios');
    const cierre = seccion('Quién te acompaña');
    expect(servicios.compareDocumentPosition(cierre) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // El tablero con su bajada (no «lo que te devuelve tu equipo»: muchas llegadas son de IA).
    const tablero = seccion('Salidas y llegadas de tus datos');
    expect(within(tablero).getByText('Salidas: lo que mandaste. Llegadas: lo que vuelve a vos.')).toBeInTheDocument();
    expect(within(tablero).getByText('PDF de laboratorio')).toBeInTheDocument();
    expect(tablero).toHaveAttribute('id', 'salidas-y-llegadas');
    expect(hrefDe('Ver salidas y llegadas', puerta())).toBe('#salidas-y-llegadas');
  });

  test('la ruta de ida y vuelta va en la puerta, con los datos de rutaDe', async () => {
    const datos = jorge();
    await mostrar(datos);
    const ruta = rutaDe(datos, PRODUCTO);
    expect(within(puerta()).getByRole('heading', { level: 2, name: ruta.titulo })).toBeInTheDocument();
    expect(within(puerta()).getByText(ruta.explicacion)).toBeInTheDocument();
  });

  test('el overline del tablero dice hoy abreviado (formato.ts) y, para leer, la fecha entera', async () => {
    await mostrar(jorge());
    const tablero = seccion('Salidas y llegadas de tus datos');
    expect(within(tablero).getByText('Hoy · sáb 10 oct')).toHaveAttribute('aria-hidden', 'true');
    expect(within(tablero).getByText('Hoy es sábado 10 de octubre')).toBeInTheDocument();
  });
});

describe('VistaHomeD: la puerta para cada próximo paso', () => {
  const HABITOS_COMPLETOS = le8(PUNTAJES_HOY, 64);
  const casos: readonly { readonly clave: string; readonly datos: DatosHomeE; readonly titulo: string }[] = [
    {
      clave: 'consentimiento',
      datos: jorge({ consentimiento: 'falta' }),
      titulo: 'Jorge, tu ruta empieza con tu firma.',
    },
    {
      clave: 'consentimiento-actualizado',
      datos: jorge({ consentimiento: 'desactualizado' }),
      titulo: 'Jorge, actualizamos tu consentimiento.',
    },
    { clave: 'ingreso', datos: jorge({ ingresoPendiente: true }), titulo: 'Jorge, contanos tus antecedentes.' },
    {
      clave: 'informe',
      datos: jorge({
        segundaOpinion: {
          id: 'som-1',
          estado: 'completada',
          etiqueta: 'Completada',
          pedida: '2026-09-28T13:00:00.000Z',
          actualizada: '2026-10-08T13:00:00.000Z',
          firmada: false,
        },
      }),
      titulo: 'Jorge, llegó tu informe.',
    },
    {
      clave: 'teleconsulta',
      datos: jorge({ segundaOpinion: undefined }),
      titulo: 'Jorge, tus datos ya llegaron. Revisémoslos juntos.',
    },
    { clave: 'hito-turno', datos: jorge(), titulo: 'Jorge, hoy te queda un paso.' },
    {
      clave: 'le8-dieta',
      datos: jorge({ plan: undefined, le8: le8([undefined, ...PUNTAJES_HOY.slice(1)], 64) }),
      titulo: 'Jorge, hoy te queda un paso.',
    },
    { clave: 'al-dia', datos: jorge({ plan: undefined, le8: HABITOS_COMPLETOS }), titulo: 'Jorge, hoy estás al día.' },
    {
      clave: 'al-dia',
      datos: jorge({ nombre: undefined, plan: undefined, le8: HABITOS_COMPLETOS }),
      titulo: 'Hoy estás al día.',
    },
  ];

  test.each(casos)('$clave → «$titulo»', async ({ clave, datos, titulo }) => {
    const paso = paraHoy(datos, PRODUCTO);
    expect(paso.clave).toBe(clave);
    await mostrar(datos);

    const region = puerta();
    expect(within(region).getByRole('heading', { level: 1, name: titulo })).toBeInTheDocument();
    expect(within(region).getByText('Tu próximo paso')).toBeInTheDocument();
    expect(within(region).getByText(puertaDe(datos, paso).bajada)).toBeInTheDocument();
    // El botón principal (el primer link con ese nombre: la ruta puede repetir la acción más abajo).
    const boton = within(region).getAllByRole('link', { name: paso.cta })[0];
    expect(boton).toHaveAttribute('href', paso.href);
  });

  test('el botón que reserva la teleconsulta dice ahí mismo qué tiene costo (y solo ese)', async () => {
    await mostrar(jorge({ segundaOpinion: undefined }));
    const region = puerta();
    const [boton] = within(region).getAllByRole('link', { name: 'Reservar mi teleconsulta' });
    expect(boton).toHaveAccessibleDescription(NOTA_COSTO_TELECONSULTA);
    // La nota va justo después del botón (antes del ancla al tablero).
    const nota = document.getElementById(boton.getAttribute('aria-describedby') ?? '');
    expect(nota).toHaveTextContent(NOTA_COSTO_TELECONSULTA);
    expect(boton.nextElementSibling).toBe(nota);
  });

  test('con otro próximo paso, el botón no lleva la nota del costo', async () => {
    await mostrar(jorge());
    const [boton] = within(puerta()).getAllByRole('link', { name: 'Hacerlo ahora' });
    expect(boton).not.toHaveAttribute('aria-describedby');
  });

  test('la bajada de un hábito sin dato no habla de pétalos', async () => {
    await mostrar(jorge({ plan: undefined, le8: le8([undefined, ...PUNTAJES_HOY.slice(1)], 64) }));
    expect(puerta()).not.toHaveTextContent(/pétalo/i);
  });
});

describe('VistaHomeD: la tira de pase', () => {
  test('con plan: programa, día con su barrita, racha y próximo hito', async () => {
    await mostrar(jorge());
    const region = puerta();
    for (const texto of ['Programa', 'Plan Bienestar', '100 días', 'Día', '63/100', 'faltan 37', 'Racha']) {
      expect(within(region).getByText(texto)).toBeInTheDocument();
    }
    expect(within(region).getByText('63 de 100')).toBeInTheDocument(); // para lectores de pantalla
    expect(within(region).getByText('4 semanas')).toBeInTheDocument();
    expect(within(region).getByText('Próximo hito')).toBeInTheDocument();
    expect(within(region).getByText('Reservá tu consulta')).toBeInTheDocument();
    expect(within(region).getByText('4 de 5 hitos')).toBeInTheDocument();
  });

  test('sin hitos pendientes, «Hitos: completos»; con el plan terminado, «Completaste los 100 días»', async () => {
    const hitos = PLAN.hitos.map((h) => ({ ...h, cumplido: true }));
    await mostrar(jorge({ plan: { ...PLAN, dia: 101, terminado: true, hitos } }));
    const region = puerta();
    expect(within(region).getByText('Hitos')).toBeInTheDocument();
    expect(within(region).getByText('Completos')).toBeInTheDocument();
    expect(within(region).getByText('5 de 5 hitos')).toBeInTheDocument();
    expect(within(region).getByText('Completaste los 100 días')).toBeInTheDocument();
    expect(within(region).getByText('100/100')).toBeInTheDocument();
    expect(within(region).queryByText('Próximo hito')).not.toBeInTheDocument();
  });

  test('sin racha, las semanas activas', async () => {
    await mostrar(jorge({ plan: { ...PLAN, rachaActual: 0 } }));
    expect(within(puerta()).getByText('Semanas activas')).toBeInTheDocument();
    expect(within(puerta()).getByText('9')).toBeInTheDocument();
  });

  test('sin plan: «todavía no empezaste» y el link para empezarlo', async () => {
    await mostrar(jorge({ plan: undefined }));
    const region = puerta();
    expect(within(region).getByText('Plan Bienestar · 100 días — todavía no empezaste')).toBeInTheDocument();
    expect(hrefDe('Empezar mi Plan Bienestar', region)).toBe(RUTA_PLAN_BIENESTAR);
    expect(within(region).queryByText('Programa')).not.toBeInTheDocument();
  });
});

describe('VistaHomeD: los tres caminos', () => {
  test('en orden, con su número, y uno solo recomendado con el botón lleno', async () => {
    // Subió datos, sin Segunda Opinión ni turno: la teleconsulta va como recomendada.
    await mostrar(jorge({ segundaOpinion: undefined }));
    const region = seccion('Tres caminos para cuidar tu corazón');
    expect(within(region).getByText('Elegí por dónde seguir')).toBeInTheDocument();
    expect(within(region).getByText('En los tres te acompañamos y te damos una devolución.')).toBeInTheDocument();

    const tarjetas = within(region).getAllByRole('article');
    expect(tarjetas.map((t) => within(t).getByRole('heading', { level: 3 }).textContent)).toEqual([
      'Plan Bienestar · 100 días',
      `Tu ${MARCA.producto}`,
      'Teleconsulta por videollamada',
    ]);
    expect(within(region).getAllByText('Recomendado para vos')).toHaveLength(1);
    const [plan, som, tele] = tarjetas;
    expect(within(tele).getByText('Recomendado para vos')).toBeInTheDocument();
    expect(tele).toHaveTextContent('Camino 3');
    expect(within(tele).getByRole('link', { name: 'Reservar mi teleconsulta' })).toHaveAttribute(
      'data-variante',
      'primario'
    );
    expect(within(tele).getByRole('link', { name: 'Reservar mi teleconsulta' })).toHaveAttribute(
      'href',
      RUTA_RESERVAR_TELECONSULTA
    );
    expect(within(tele).getByText(NOTA_COSTO_TELECONSULTA)).toBeInTheDocument();
    expect(tele).toHaveTextContent('un profesional de nuestro equipo');
    expect(within(plan).getByRole('link', { name: 'Seguir mi plan' })).toHaveAttribute('data-variante', 'contorno');
    expect(within(som).getByRole('link', { name: `Pedir mi ${MARCA.producto}` })).toHaveAttribute(
      'href',
      RUTA_SOLICITAR_SEGUNDA_OPINION
    );
    expect(within(plan).getByText('Día 63 de 100')).toBeInTheDocument();
  });

  test('sin datos ni plan: se recomienda empezar el plan', async () => {
    await mostrar(
      jorge({
        plan: undefined,
        le8: undefined,
        le8Inicial: undefined,
        laboratorio: undefined,
        segundaOpinion: undefined,
      })
    );
    const [plan] = within(seccion('Tres caminos para cuidar tu corazón')).getAllByRole('article');
    expect(within(plan).getByText('Recomendado para vos')).toBeInTheDocument();
    expect(within(plan).getByRole('link', { name: 'Empezar mi Plan Bienestar' })).toHaveAttribute(
      'data-variante',
      'primario'
    );
  });
});

describe('VistaHomeD: los tres instrumentos', () => {
  test('LE8: el puntaje, la banda en texto, el día 0, el hábito más bajo y su link', async () => {
    await mostrar(jorge());
    const le8Tarjeta = screen.getByRole('article', { name: 'Life’s Essential 8' });
    expect(within(le8Tarjeta).getByText('64')).toBeInTheDocument();
    expect(within(le8Tarjeta).getByText('de 100')).toBeInTheDocument();
    expect(within(le8Tarjeta).getByText('Moderada')).toBeInTheDocument();
    expect(within(le8Tarjeta).getByText('· día 0: 58')).toBeInTheDocument();
    expect(within(le8Tarjeta).getByText('+6', { exact: false })).toBeInTheDocument();
    expect(within(le8Tarjeta).getByText('Tu hábito más bajo')).toBeInTheDocument();
    expect(le8Tarjeta).toHaveTextContent('Sueño · 45');
    expect(hrefDe('Ver mis 8 hábitos', le8Tarjeta)).toBe(RUTA_TABLERO_LE8);
  });

  test('LE8 incompleto dice con cuántos hábitos se calculó', async () => {
    await mostrar(jorge({ le8: le8([60, 62, undefined, undefined, 58, 60, undefined, 57], 59) }));
    const le8Tarjeta = screen.getByRole('article', { name: 'Life’s Essential 8' });
    expect(within(le8Tarjeta).getByText('Con 5 de 8 hábitos')).toBeInTheDocument();
  });

  test('CKM: el estadio, «estimado con tus datos» si es estimado, la escala y su link', async () => {
    await mostrar(jorge({ ckm: { estadio: 2, origen: 'estimado' } }));
    const ckm = screen.getByRole('article', { name: 'Salud CKM' });
    expect(within(ckm).getByText('Estadio 2')).toBeInTheDocument();
    expect(within(ckm).getByText('Estadio 2, en una escala de 0 a 4.')).toBeInTheDocument();
    expect(ckm).toHaveTextContent('Factores de riesgo activos (estimado con tus datos)');
    expect(
      within(ckm).getByText('La escala de la AHA va de 0, zona saludable, a 4, cuidado activo.')
    ).toBeInTheDocument();
    expect(hrefDe('Entender mi estadio CKM', ckm)).toBe('/ckm');
  });

  test('CKM sin datos', async () => {
    await mostrar(jorge({ ckm: undefined }));
    const ckm = screen.getByRole('article', { name: 'Salud CKM' });
    expect(within(ckm).getByText('Faltan datos para ubicar tu estadio.')).toBeInTheDocument();
  });

  /** Todas las acciones del modelo (prevent.ts) están en la tarjeta, con su href. */
  function tieneLasAccionesDelModelo(datos: DatosHomeE, tarjeta: HTMLElement): void {
    const modelo = preventDe(datos, PRODUCTO);
    for (const accion of modelo.acciones) {
      if (accion.tipo === 'boton' || accion.tipo === 'link') {
        expect(hrefDe(accion.texto, tarjeta)).toBe(accion.href);
      } else {
        expect(within(tarjeta).getByText(accion.texto)).toBeInTheDocument();
      }
    }
  }

  function tarjetaPrevent(): HTMLElement {
    return screen.getByRole('article', { name: 'PREVENT · AHA 2023' });
  }

  test('PREVENT firmado: solo con la firma médica registrada', async () => {
    const datos = jorge({
      segundaOpinion: {
        id: 'som-1',
        estado: 'completada',
        etiqueta: 'Completada',
        pedida: '2026-08-20',
        actualizada: '2026-08-30T12:00:00.000Z',
        firmada: true,
      },
      prevent: { ascvd10: 0.082, hf10: 0.031, total30: 0.187, fecha: '2026-08-30' },
    });
    await mostrar(datos);
    const tarjeta = tarjetaPrevent();
    expect(within(tarjeta).getByText('Firmado')).toBeInTheDocument();
    expect(within(tarjeta).getByText('Del informe firmado por tu equipo médico el 30 de agosto.')).toBeInTheDocument();
    expect(within(tarjeta).getAllByText('8,2%').length).toBeGreaterThan(0);
    expect(within(tarjeta).getByText('3,1%')).toBeInTheDocument();
    expect(within(tarjeta).getByText('18,7%')).toBeInTheDocument();
    expect(within(tarjeta).getByText('Riesgo intermedio')).toBeInTheDocument();
    expect(hrefDe('Ver mi informe', tarjeta)).toBe(RUTA_MI_SEGUNDA_OPINION);
    tieneLasAccionesDelModelo(datos, tarjeta);
  });

  test('PREVENT del informe sin firma: «preparado con IA» y nunca «firmado»', async () => {
    const datos = jorge({
      segundaOpinion: {
        id: 'som-1',
        estado: 'completada',
        etiqueta: 'Completada',
        pedida: '2026-08-20',
        actualizada: '2026-08-30T12:00:00.000Z',
        firmada: false,
      },
      prevent: { ascvd10: 0.082, hf10: 0.031, total30: 0.187, fecha: '2026-08-30' },
    });
    await mostrar(datos);
    const tarjeta = tarjetaPrevent();
    expect(within(tarjeta).getByText('Preparado con IA')).toBeInTheDocument();
    expect(within(tarjeta).getByText(`Del informe de tu ${MARCA.producto} · preparado con IA`)).toBeInTheDocument();
    expect(tarjeta).not.toHaveTextContent(/firmad/i);
    tieneLasAccionesDelModelo(datos, tarjeta);
  });

  test('PREVENT estimado: «Es un cálculo automático», la teleconsulta y pedir la Segunda Opinión', async () => {
    const datos = jorge({
      segundaOpinion: undefined,
      preventEstimado: { ascvd10: 0.081, hf10: 0.052, total30: 0.24, faltantes: ['tu presión arterial'] },
    });
    await mostrar(datos);
    const tarjeta = tarjetaPrevent();
    expect(within(tarjeta).getByText('Estimado')).toBeInTheDocument();
    expect(within(tarjeta).getByText('Estimado con tus datos · sin revisión médica')).toBeInTheDocument();
    expect(within(tarjeta).getByText('Es un cálculo automático')).toBeInTheDocument();
    expect(within(tarjeta).getByText('Para afinarlo nos falta: tu presión arterial.')).toBeInTheDocument();
    const reservar = within(tarjeta).getByRole('link', { name: 'Reservar mi teleconsulta' });
    expect(reservar).toHaveAttribute('href', RUTA_RESERVAR_TELECONSULTA);
    expect(reservar).toHaveAttribute('data-variante', 'primario');
    expect(hrefDe(`Pedir mi ${MARCA.producto}: un informe de tu caso y tu riesgo`, tarjeta)).toBe(
      RUTA_SOLICITAR_SEGUNDA_OPINION
    );
    // Qué tiene costo, justo debajo del botón de la teleconsulta.
    expect(reservar.nextElementSibling).toHaveTextContent(NOTA_COSTO_TELECONSULTA);
    expect(tarjeta).not.toHaveTextContent(/firmad/i);
    tieneLasAccionesDelModelo(datos, tarjeta);
  });

  test('PREVENT del informe: «Revisarlo en una teleconsulta» también avisa qué tiene costo', async () => {
    const datos = jorge({
      segundaOpinion: {
        id: 'som-1',
        estado: 'completada',
        etiqueta: 'Completada',
        pedida: '2026-08-20',
        actualizada: '2026-08-30T12:00:00.000Z',
        firmada: false,
      },
      prevent: { ascvd10: 0.082, hf10: 0.031, total30: 0.187 },
    });
    await mostrar(datos);
    const revisar = within(tarjetaPrevent()).getByRole('link', { name: 'Revisarlo en una teleconsulta' });
    expect(revisar.nextElementSibling).toHaveTextContent(NOTA_COSTO_TELECONSULTA);
  });

  test('PREVENT estimado con turno: se revisa en el turno y no ofrece reservar otro', async () => {
    const datos = jorge({
      segundaOpinion: undefined,
      preventEstimado: { ascvd10: 0.081, hf10: 0.052, total30: 0.24, faltantes: [] },
      proximoTurno: { id: 'turno-1', inicio: '2026-10-17T13:30:00.000Z', teleconsulta: true },
    });
    await mostrar(datos);
    const tarjeta = tarjetaPrevent();
    expect(within(tarjeta).getByText(/^Podés llevarlo a tu turno del/)).toBeInTheDocument();
    expect(within(tarjeta).queryByRole('link', { name: /teleconsulta/ })).not.toBeInTheDocument();
    tieneLasAccionesDelModelo(datos, tarjeta);
  });

  test('PREVENT estimado con la Segunda Opinión en análisis: no empuja la teleconsulta', async () => {
    const datos = jorge({ preventEstimado: { ascvd10: 0.081, hf10: 0.052, total30: 0.24, faltantes: [] } });
    await mostrar(datos);
    const tarjeta = tarjetaPrevent();
    expect(within(tarjeta).queryByRole('link', { name: /teleconsulta/ })).not.toBeInTheDocument();
    expect(within(tarjeta).getByText(`Tu ${MARCA.producto} va a traer tu riesgo en su informe.`)).toBeInTheDocument();
    tieneLasAccionesDelModelo(datos, tarjeta);
  });

  test('PREVENT sin datos: qué falta y cómo mandarlo', async () => {
    const datos = jorge({ segundaOpinion: undefined, preventFaltantes: ['colesterol total', 'HDL'] });
    await mostrar(datos);
    const tarjeta = tarjetaPrevent();
    expect(within(tarjeta).getByText('Sin datos')).toBeInTheDocument();
    expect(within(tarjeta).getByText('Todavía no podemos estimar tu riesgo.')).toBeInTheDocument();
    expect(
      within(tarjeta).getByText('Para calcularlo nos falta: colesterol total, HDL.', { exact: false })
    ).toBeInTheDocument();
    expect(hrefDe('Enviar mi laboratorio en PDF', tarjeta)).toBe(RUTA_ENVIAR_ESTUDIOS);
    expect(hrefDe('Cargar mis datos de salud', tarjeta)).toBe(RUTA_DATOS_DE_SALUD);
    tieneLasAccionesDelModelo(datos, tarjeta);
  });
});

describe('VistaHomeD: el tablero vacío', () => {
  test('sin nada mandado: «Todavía no mandaste nada»', async () => {
    await mostrar(jorge({ laboratorio: undefined, segundaOpinion: undefined, le8: le8(Array(8).fill(undefined)) }), {
      tablero: TABLERO_VACIO,
    });
    expect(within(seccion('Salidas y llegadas de tus datos')).getByText(TEXTO_VACIO)).toBeInTheDocument();
  });

  test('con datos que el tablero no muestra como envíos: no se le dice que no mandó nada', async () => {
    await mostrar(jorge({ laboratorio: undefined, segundaOpinion: undefined }), { tablero: TABLERO_VACIO });
    const tablero = seccion('Salidas y llegadas de tus datos');
    expect(within(tablero).getByText(TEXTO_VACIO_CON_DATOS)).toBeInTheDocument();
    expect(within(tablero).queryByText(TEXTO_VACIO)).not.toBeInTheDocument();
  });
});

describe('VistaHomeD: servicios y cierre', () => {
  test('los 4 servicios y «También en tu portal», con sus hrefs', async () => {
    await mostrar(jorge());
    const region = seccion('Tus servicios');
    expect(hrefDe(/^Reservar turno/, region)).toBe('/get-care');
    expect(hrefDe(/^Teleconsulta/, region)).toBe(RUTA_RESERVAR_TELECONSULTA);
    expect(hrefDe(/^Mensajes/, region)).toBe('/Communication');
    expect(hrefDe(/^Enviar estudios en PDF/, region)).toBe(RUTA_ENVIAR_ESTUDIOS);
    expect(within(region).getByRole('link', { name: /^Teleconsulta/ })).toHaveTextContent(
      'con un profesional de nuestro equipo'
    );
    expect(within(region).getByText(NOTA_COSTO_TELECONSULTA)).toBeInTheDocument();
    // El hito pendiente del plan se cumple reservando: se marca en su servicio.
    expect(within(region).getByRole('link', { name: /^Reservar turno/ })).toHaveTextContent('Tu hito pendiente');

    const tambien = within(region).getByRole('navigation', { name: 'También en tu portal' });
    expect(hrefDe('Historia clínica', tambien)).toBe('/health-record');
    expect(hrefDe('Biomarcadores', tambien)).toBe('/health-record/biomarkers');
    expect(hrefDe('Mis 8 hábitos', tambien)).toBe(RUTA_TABLERO_LE8);
    expect(hrefDe('Cuestionarios de hábitos', tambien)).toBe('/health-record/cuestionarios');
    expect(hrefDe('Salud CKM', tambien)).toBe('/ckm');
    expect(hrefDe(`Mi ${MARCA.producto}`, tambien)).toBe(RUTA_MI_SEGUNDA_OPINION);
    expect(hrefDe('Mi equipo', tambien)).toBe('/account/equipo');
    expect(hrefDe('Membresía', tambien)).toBe('/membership');
    expect(hrefDe('Consentimiento informado · firmado el 8 de agosto', tambien)).toBe('/health-record/consent');
  });

  test('sin Segunda Opinión, «Pedir mi …»; sin firma, el consentimiento lo dice', async () => {
    await mostrar(jorge({ segundaOpinion: undefined, consentimiento: 'falta', fechaConsentimiento: undefined }));
    const tambien = screen.getByRole('navigation', { name: 'También en tu portal' });
    expect(hrefDe(`Pedir mi ${MARCA.producto}`, tambien)).toBe(RUTA_SOLICITAR_SEGUNDA_OPINION);
    expect(hrefDe('Consentimiento informado · falta tu firma', tambien)).toBe('/health-record/consent');
    expect(seccion('Quién te acompaña')).not.toHaveTextContent('Lo firmaste');
  });

  test('el cierre: dirección médica, IA que asiste, consentimiento, FHIR R4 y el aviso', async () => {
    await mostrar(jorge());
    const cierre = seccion('Quién te acompaña');
    expect(cierre).toHaveTextContent(
      `Equipo médico con dirección ${conDireccionDe(MARCA.dirigidoPor)}. Nuestros agentes de IA asisten al equipo; no reemplazan la consulta médica.`
    );
    expect(cierre).toHaveTextContent(
      'Sin tu consentimiento firmado, tus datos clínicos no pasan por nuestros agentes de IA. Lo firmaste el 8 de agosto.'
    );
    expect(cierre).toHaveTextContent('Tus datos viajan en FHIR R4');
    expect(cierre).toHaveTextContent('Esta página resume tus datos; no reemplaza la consulta médica.');
  });

  test('conDireccionDe contrae «de el» y respeta «la»', () => {
    expect(conDireccionDe('el Dr. Juan Pérez')).toBe('del Dr. Juan Pérez');
    expect(conDireccionDe('la Dra. Ana Gómez')).toBe('de la Dra. Ana Gómez');
    expect(conDireccionDe('Centro Cardiológico')).toBe('de Centro Cardiológico');
  });
});

describe('VistaHomeD: honestidad y público neutro', () => {
  const variantes: readonly [string, DatosHomeE][] = [
    ['en análisis con plan', jorge()],
    [
      'vendiendo la teleconsulta',
      jorge({ segundaOpinion: undefined, preventEstimado: { ascvd10: 0.05, faltantes: [] } }),
    ],
    [
      'sin nada',
      jorge({
        nombre: undefined,
        plan: undefined,
        le8: undefined,
        le8Inicial: undefined,
        ckm: undefined,
        laboratorio: undefined,
        segundaOpinion: undefined,
        consentimiento: 'falta',
        ingresoPendiente: true,
      }),
    ],
    ['perfil que no es Patient', NO_PACIENTE],
  ];

  test.each(variantes)('%s: sin placeholders, sin femeninos ni juegos de viaje', async (_, datos) => {
    await mostrar(datos);
    const texto = document.body.textContent ?? '';
    expect(texto).not.toContain('[');
    expect(texto).not.toMatch(/\b(bienvenida|inscripta|lista|sola)\b/i);
    expect(texto).not.toMatch(/la paciente/i);
    expect(texto).not.toMatch(/vuelo|pasajer|embarque|despegue/i);
    expect(texto).not.toMatch(/tu equipo médico (te )?(revisa|devuelve|devolvió)/i);
  });

  test('la teleconsulta es con un profesional de nuestro equipo', async () => {
    await mostrar(jorge({ segundaOpinion: undefined }));
    expect(seccion('Tres caminos para cuidar tu corazón')).toHaveTextContent('un profesional de nuestro equipo');
    expect(seccion('Tus servicios')).toHaveTextContent('un profesional de nuestro equipo');
  });
});

describe('VistaHomeD: mientras carga y con un perfil que no es Patient', () => {
  test('mientras carga: huesos, sin recomendaciones ni «sin datos», y la página ocupada', async () => {
    await mostrar(jorge({ cargando: true }), { tablero: { ...TABLERO_VACIO, cargando: true } });
    expect(raiz()).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('heading', { level: 1, name: 'Inicio' })).toBeInTheDocument();
    expect(screen.queryByText('Recomendado para vos')).not.toBeInTheDocument();
    expect(screen.queryByText('Todavía no podemos estimar tu riesgo.')).not.toBeInTheDocument();
    expect(screen.queryByText('Sin datos')).not.toBeInTheDocument();
    expect(within(seccion('Tres caminos para cuidar tu corazón')).queryAllByRole('article')).toHaveLength(0);
    expect(within(seccion('Tus tres instrumentos')).queryAllByRole('article')).toHaveLength(0);
    expect(screen.getByText('Cargando tus salidas y llegadas.')).toBeInTheDocument();
  });

  test('un perfil que no es Patient ve una Home mínima y neutra', async () => {
    await mostrar(NO_PACIENTE, { tablero: TABLERO_VACIO });
    expect(screen.getByRole('heading', { level: 1, name: 'Inicio' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Salidas y llegadas de tus datos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tres caminos para cuidar tu corazón' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tus tres instrumentos' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Tus servicios' })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/Firmá|Lo firmaste|Pedir mi|todavía no empezaste/);
    expect(seccion('Quién te acompaña')).toBeInTheDocument();
  });
});

describe('VistaHomeD: el tema', () => {
  test('el tema se elige entre dos opciones a la vista: Oscuro y Claro', async () => {
    const alCambiarTema = vi.fn();
    await mostrar(jorge(), { alCambiarTema });
    expect(raiz()).toHaveAttribute('data-tema', 'oscuro');
    const grupo = screen.getByRole('radiogroup', { name: 'Tema de la página' });
    expect(within(grupo).getByRole('radio', { name: 'Oscuro' })).toBeChecked();
    expect(within(grupo).getByRole('radio', { name: 'Claro' })).not.toBeChecked();
    fireEvent.click(within(grupo).getByRole('radio', { name: 'Claro' }));
    expect(alCambiarTema).toHaveBeenCalledWith('claro');
  });

  test('en claro, la opción marcada es Claro y se vuelve al oscuro', async () => {
    const alCambiarTema = vi.fn();
    await mostrar(jorge(), { tema: 'claro', alCambiarTema });
    expect(raiz()).toHaveAttribute('data-tema', 'claro');
    expect(screen.getByRole('radio', { name: 'Claro' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Oscuro' }));
    expect(alCambiarTema).toHaveBeenCalledWith('oscuro');
  });

  test('sin alCambiarTema (el visor de capturas), no hay selector', async () => {
    await mostrar(jorge());
    expect(screen.queryByRole('radiogroup', { name: 'Tema de la página' })).not.toBeInTheDocument();
  });

  test('temaDe acepta claro y oscuro; cualquier otro valor no fuerza nada', () => {
    expect(temaDe('claro')).toBe('claro');
    expect(temaDe(' OSCURO ')).toBe('oscuro');
    expect(temaDe('sepia')).toBeUndefined();
    expect(temaDe(null)).toBeUndefined();
  });
});

describe('HomeEstiloD: el tema elegido, guardado y forzado', () => {
  async function montar(ruta = '/'): Promise<void> {
    await act(async () => {
      render(
        <Envoltorio ruta={ruta}>
          <HomeEstiloD />
        </Envoltorio>
      );
    });
  }

  test('arranca en oscuro; elegir Claro lo cambia y lo guarda en este dispositivo', async () => {
    await montar();
    expect(raiz()).toHaveAttribute('data-tema', 'oscuro');
    await act(async () => fireEvent.click(screen.getByRole('radio', { name: 'Claro' })));
    expect(raiz()).toHaveAttribute('data-tema', 'claro');
    expect(screen.getByRole('radio', { name: 'Claro' })).toBeChecked();
    expect(window.localStorage.getItem(CLAVE_TEMA_HOME_D)).toBe('claro');
  });

  test('vuelve con el tema guardado', async () => {
    window.localStorage.setItem(CLAVE_TEMA_HOME_D, 'claro');
    await montar();
    expect(raiz()).toHaveAttribute('data-tema', 'claro');
  });

  test('si el almacenamiento falla, el selector igual cambia el tema', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    await montar();
    expect(raiz()).toHaveAttribute('data-tema', 'oscuro');
    await act(async () => fireEvent.click(screen.getByRole('radio', { name: 'Claro' })));
    expect(raiz()).toHaveAttribute('data-tema', 'claro');
  });

  test('?tema=claro lo fuerza sin guardarlo', async () => {
    await montar('/?tema=claro');
    expect(raiz()).toHaveAttribute('data-tema', 'claro');
    expect(window.localStorage.getItem(CLAVE_TEMA_HOME_D)).toBeNull();
  });

  test('?tema=oscuro gana sobre lo guardado', async () => {
    window.localStorage.setItem(CLAVE_TEMA_HOME_D, 'claro');
    await montar('/?tema=oscuro');
    expect(raiz()).toHaveAttribute('data-tema', 'oscuro');
    expect(window.localStorage.getItem(CLAVE_TEMA_HOME_D)).toBe('claro');
  });

  test('las fuentes se agregan a <head> una sola vez', async () => {
    await act(async () => {
      render(
        <Envoltorio>
          <>
            <HomeEstiloD />
            <HomeEstiloD />
          </>
        </Envoltorio>
      );
    });
    const fuentes = document.head.querySelectorAll('link#fuentes-home-d');
    expect(fuentes).toHaveLength(1);
    expect(fuentes[0]).toHaveAttribute('href', URL_FUENTES_HOME_D);
  });
});

// ─── Integración: el Inicio elige la Home según la persona ───────────────────────────

/** Una fecha de nacimiento con `edad` años cumplidos hoy (en Argentina), lejos del cumpleaños. */
function nacimientoCon(edad: number): string {
  const [anio, mes, dia] = hoyArgentina().split('-').map(Number);
  return new Date(Date.UTC(anio - edad, mes - 1, dia - 30)).toISOString().slice(0, 10);
}

async function conPaciente(gender: Patient['gender'] | undefined, edad: number): Promise<MockClient> {
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Ana'], family: 'García' }],
    ...(gender ? { gender } : {}),
    birthDate: nacimientoCon(edad),
  });
  medplum.setProfile(patient);
  return medplum;
}

async function enElInicio(medplum: MockClient, ruta = '/'): Promise<void> {
  await act(async () => {
    render(
      <Envoltorio ruta={ruta} medplum={medplum}>
        <Routes>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </Envoltorio>
    );
  });
}

async function veLaD(): Promise<void> {
  expect(
    await screen.findByRole('heading', { level: 2, name: 'Salidas y llegadas de tus datos' }, ESPERA)
  ).toBeInTheDocument();
  expect(screen.queryByRole('heading', { level: 1, name: /estás en el centro/ })).not.toBeInTheDocument();
}

describe('HomePage: la Home D para todos los que no ven la E', () => {
  beforeAll(() => {
    indexarDefinicionesFhir();
  });

  test('un hombre ve la D, con sus datos reales y las fuentes de la D', async () => {
    await enElInicio(await conPaciente('male', 55));
    await veLaD();
    // Cuando termina de cargar, la puerta le pide el consentimiento (todavía no lo firmó).
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ana, tu ruta empieza con tu firma.' }, ESPERA)
    ).toBeInTheDocument();
    expect(document.head.querySelectorAll('link#fuentes-home-d')).toHaveLength(1);
  });

  test('una mujer de 56 años ve la D', async () => {
    await enElInicio(await conPaciente('female', 56));
    await veLaD();
  });

  test('sin sexo cargado, la D', async () => {
    await enElInicio(await conPaciente(undefined, 50));
    await veLaD();
  });

  test('una mujer de 50 años ve la E', async () => {
    await enElInicio(await conPaciente('female', 50));
    expect(await screen.findByRole('heading', { level: 1, name: 'Ana, estás en el centro.' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Salidas y llegadas de tus datos' })).not.toBeInTheDocument();
  });

  test('?estilo=e fuerza la E y ?estilo=d fuerza la D', async () => {
    await enElInicio(await conPaciente('male', 60), '/?estilo=e');
    expect(await screen.findByRole('heading', { level: 1, name: 'Ana, estás en el centro.' })).toBeInTheDocument();
  });

  test('?estilo=d con una mujer de 50 años muestra la D', async () => {
    await enElInicio(await conPaciente('female', 50), '/?estilo=d');
    await veLaD();
  });
});
