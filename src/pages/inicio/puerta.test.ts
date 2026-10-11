// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { LE8_DOMINIOS } from '@epa/careplan-menopausia';
import type { HitoBienestar, PlanBienestar } from '../../fhir/bienestar';
import { paraHoy } from './paraHoy';
import { ABAJO_VES, BAJADA_AL_DIA, BAJADA_NO_PACIENTE, OVERLINE_PUERTA, puertaDe, TITULO_NO_PACIENTE } from './puerta';
import type { DatosHomeE, Le8Domain, ParaHoy, ResultadoLe8, SegundaOpinionHome } from './tipos';

const HOY = '2026-10-10';
// Un nombre cualquiera: en la Home entra desde MARCA.producto.
const OPCIONES = { producto: 'Revisión Experta' };

/** LE8 con los 8 hábitos en 70, salvo los que faltan. */
function le8(faltan: readonly Le8Domain[] = []): ResultadoLe8 {
  const dominios = LE8_DOMINIOS.map((dominio) => (faltan.includes(dominio) ? { dominio } : { dominio, puntaje: 70 }));
  const conDato = dominios.length - faltan.length;
  return {
    dominios,
    total: 70,
    categoria: 'moderada',
    conDato,
    completo: conDato === LE8_DOMINIOS.length,
    faltantes: [],
    dominiosBajos: [],
  };
}

function hito(id: string, cumplido: boolean): HitoBienestar {
  return {
    id,
    label: 'Reservá tu consulta',
    descripcion: 'Con tu equipo armás tus metas.',
    href: `/ruta/${id}`,
    cumplido,
  };
}

function plan(hitos: HitoBienestar[]): PlanBienestar {
  return {
    dia: 63,
    totalDias: 100,
    inicio: '2026-08-09',
    fin: '2026-11-17',
    terminado: false,
    hitos,
    semanasActivas: 9,
    rachaActual: 4,
  };
}

const SOM_COMPLETADA: SegundaOpinionHome = {
  id: 'som-1',
  estado: 'completada',
  firmada: false,
  etiqueta: 'Completada',
  pedida: '2026-09-28',
  actualizada: '2026-10-08T12:00:00.000Z',
};

/** Jorge (datos ficticios), al día: los 8 hábitos con dato, sin plan ni pendientes. */
function datos(cambios: Partial<DatosHomeE> = {}): DatosHomeE {
  return {
    cargando: false,
    esPaciente: true,
    nombre: 'Jorge',
    hoy: HOY,
    le8: le8(),
    consentimiento: 'firmado',
    ingresoPendiente: false,
    novedadesSinLeer: 0,
    ...cambios,
  };
}

/** La puerta con el paso que elige la regla fija (paraHoy), como en la Home. */
function puerta(d: DatosHomeE): ReturnType<typeof puertaDe> {
  return puertaDe(d, paraHoy(d, OPCIONES));
}

describe('puertaDe', () => {
  test('el overline y el paso son los de paraHoy, tal cual (su cta y su href son el botón)', () => {
    const d = datos({ consentimiento: 'falta' });
    const paso = paraHoy(d, OPCIONES);
    const resultado = puertaDe(d, paso);
    expect(resultado.overline).toBe(OVERLINE_PUERTA);
    expect(resultado.overline).toBe('Tu próximo paso');
    expect(resultado.paso).toBe(paso);
  });

  test('consentimiento: la ruta empieza con la firma, y la bajada va sola', () => {
    const resultado = puerta(datos({ consentimiento: 'falta' }));
    expect(resultado.titulo).toBe('Jorge, tu ruta empieza con tu firma.');
    expect(resultado.bajada).toBe(
      'Es el primer paso: sin tu firma, tus datos clínicos no pasan por nuestros agentes de IA.'
    );
    expect(resultado.bajada).not.toContain(ABAJO_VES);
  });

  test('consentimiento actualizado', () => {
    const resultado = puerta(datos({ consentimiento: 'desactualizado' }));
    expect(resultado.titulo).toBe('Jorge, actualizamos tu consentimiento.');
    expect(resultado.bajada).toBe('Leelo y firmá la versión nueva.');
  });

  test('ingreso: contanos tus antecedentes, y abajo el tablero', () => {
    const resultado = puerta(datos({ ingresoPendiente: true }));
    expect(resultado.titulo).toBe('Jorge, contanos tus antecedentes.');
    expect(resultado.paso.cta).toBe('Completar ahora');
    expect(resultado.bajada).toBe(
      'Con tus antecedentes, tu equipo médico te conoce mejor. Abajo ves lo que mandaste y lo que vuelve a vos.'
    );
  });

  test('informe: llegó tu informe (sin decir firmado si no hay firma médica)', () => {
    const resultado = puerta(datos({ segundaOpinion: SOM_COMPLETADA }));
    expect(resultado.titulo).toBe('Jorge, llegó tu informe.');
    expect(resultado.bajada).not.toMatch(/firm/);
    expect(resultado.bajada.endsWith(ABAJO_VES)).toBe(true);
  });

  test('teleconsulta: tus datos ya llegaron, revisémoslos juntos', () => {
    const resultado = puerta(
      datos({
        laboratorio: { estado: 'procesado', fecha: '2026-10-03', valores: 14, informeId: 'dr1', revisionMedica: false },
      })
    );
    expect(resultado.paso.clave).toBe('teleconsulta');
    expect(resultado.titulo).toBe('Jorge, tus datos ya llegaron. Revisémoslos juntos.');
    expect(resultado.bajada).toContain('un profesional de nuestro equipo');
    expect(resultado.bajada.endsWith(ABAJO_VES)).toBe(true);
  });

  test('hito del plan: hoy te queda un paso, y la bajada es el hito con su para qué', () => {
    const resultado = puerta(datos({ plan: plan([hito('h1', true), hito('consulta', false)]) }));
    expect(resultado.paso.clave).toBe('hito-consulta');
    expect(resultado.titulo).toBe('Jorge, hoy te queda un paso.');
    expect(resultado.bajada).toBe('Reservá tu consulta. Con tu equipo armás tus metas.');
  });

  test('hábito sin dato: sin pétalos (D no tiene rosa), con el nombre del hábito en minúscula', () => {
    const resultado = puerta(datos({ le8: le8(['sueno']) }));
    expect(resultado.paso.clave).toBe('le8-sueno');
    expect(resultado.titulo).toBe('Jorge, hoy te queda un paso.');
    expect(resultado.bajada).toBe(
      'Respondé tu cuestionario de sueño: con ese dato, tu hábito de sueño entra en tu puntaje de 8 hábitos.'
    );
    expect(resultado.bajada).not.toMatch(/pétalo/);
  });

  test.each<[Le8Domain, string]>([
    ['presion-arterial', 'presión arterial'],
    ['imc', 'peso (IMC)'],
    ['actividad-fisica', 'actividad física'],
  ])('hábito %s: «tu hábito de %s»', (dominio, habito) => {
    expect(puerta(datos({ le8: le8([dominio]) })).bajada).toContain(`tu hábito de ${habito} entra`);
  });

  test('un le8-* desconocido no rompe: la bajada no inventa el hábito', () => {
    const paso: ParaHoy = { clave: 'le8-otro', titulo: 'Cargá tu dato', detalle: '', cta: 'Cargar', href: '/x' };
    expect(puertaDe(datos(), paso).bajada).toBe('Cargá tu dato: con ese dato, completás tu puntaje de 8 hábitos.');
  });

  test('al día: todo en marcha, y abajo cada salida y cada llegada', () => {
    const resultado = puerta(datos());
    expect(resultado.paso.clave).toBe('al-dia');
    expect(resultado.titulo).toBe('Jorge, hoy estás al día.');
    expect(resultado.bajada).toBe(BAJADA_AL_DIA);
    expect(resultado.bajada).toBe('Todo lo que mandaste está en marcha. Abajo ves cada salida y cada llegada.');
  });

  test('sin nombre: sin el vocativo y con mayúscula', () => {
    expect(puerta(datos({ nombre: undefined, consentimiento: 'falta' })).titulo).toBe('Tu ruta empieza con tu firma.');
    expect(puerta(datos({ nombre: '  ' })).titulo).toBe('Hoy estás al día.');
    expect(puerta(datos({ nombre: undefined, ingresoPendiente: true })).titulo).toBe('Contanos tus antecedentes.');
  });

  test('una clave nueva de paraHoy: «hoy te queda un paso» y el detalle del paso', () => {
    const paso: ParaHoy = { clave: 'otra-regla', titulo: 'Algo', detalle: 'Hacelo hoy.', cta: 'Ir', href: '/x' };
    const resultado = puertaDe(datos(), paso);
    expect(resultado.titulo).toBe('Jorge, hoy te queda un paso.');
    expect(resultado.bajada).toBe(`Hacelo hoy. ${ABAJO_VES}`);
  });

  test('un perfil que no es Patient: «Inicio», bajada neutra y el paso igual', () => {
    const d = datos({ esPaciente: false, nombre: undefined });
    const paso = paraHoy(d, OPCIONES);
    const resultado = puertaDe(d, paso);
    expect(resultado.titulo).toBe(TITULO_NO_PACIENTE);
    expect(resultado.titulo).toBe('Inicio');
    expect(resultado.bajada).toBe(BAJADA_NO_PACIENTE);
    expect(resultado.paso).toBe(paso);
  });

  test.each<[string, Partial<DatosHomeE>]>([
    ['consentimiento', { consentimiento: 'falta' }],
    ['actualizado', { consentimiento: 'desactualizado' }],
    ['ingreso', { ingresoPendiente: true }],
    ['informe', { segundaOpinion: SOM_COMPLETADA }],
    ['hito', { plan: plan([hito('consulta', false)]) }],
    ['hábito', { le8: le8(['glucemia']) }],
    ['al día', {}],
    ['sin nombre', { nombre: undefined }],
  ])('%s: textos neutros, sin placeholders ni metáforas de viaje', (_caso, cambios) => {
    const { titulo, bajada } = puerta(datos(cambios));
    const texto = `${titulo} ${bajada}`;
    expect(texto).not.toMatch(/bienvenida|inscripta|\blista\b|\bsola\b|la paciente/i);
    expect(texto).not.toContain('[');
    expect(texto).not.toMatch(/vuelo|pasajer|embarque|despegue/i);
  });
});
