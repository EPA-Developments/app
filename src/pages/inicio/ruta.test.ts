// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { LE8_DOMINIOS } from '@epa/careplan-menopausia';
import { RUTA_ENVIAR_ESTUDIOS } from '../../components/AccionesRapidas';
import { RUTA_CONSENTIMIENTO } from '../../fhir/consentimiento';
import { NOTA_COSTO_TELECONSULTA } from './caminos';
import {
  dibujoDe,
  EXPLICACION_EN_ANALISIS,
  EXPLICACION_HABITOS_OTRA_CONSULTA,
  EXPLICACION_HABITOS_SIN_REVISION,
  EXPLICACION_NO_PACIENTE,
  EXPLICACION_PDF_DEMORADO,
  EXPLICACION_PDF_EN_PROCESO,
  EXPLICACION_SIN_DATOS,
  EXPLICACION_SIN_REVISION,
  ORDEN_ESTACIONES,
  rutaDe,
  TEXTO_CONTROL,
  TEXTO_CONTROL_NEUTRO,
  tramoEntre,
} from './ruta';
import { RUTA_MI_SEGUNDA_OPINION, RUTA_MIS_TURNOS, RUTA_RESERVAR_TELECONSULTA } from './rutas';
import type {
  ClaveEstacion,
  DatosHomeE,
  EstadoEstacion,
  LaboratorioHome,
  ResultadoLe8,
  RutaHomeD,
  SegundaOpinionHome,
} from './tipos';

const HOY = '2026-10-10';
// Un nombre cualquiera: en la Home entra desde MARCA.producto.
const OPCIONES = { producto: 'Revisión Experta' };

/** LE8 con los primeros `conDato` hábitos en 70 y el resto sin dato. */
function le8(conDato: number): ResultadoLe8 {
  const dominios = LE8_DOMINIOS.map((dominio, i) => (i < conDato ? { dominio, puntaje: 70 } : { dominio }));
  return {
    dominios,
    total: conDato ? 70 : undefined,
    categoria: conDato ? 'moderada' : undefined,
    conDato,
    completo: conDato === LE8_DOMINIOS.length,
    faltantes: [],
    dominiosBajos: [],
  };
}

/** Jorge (datos ficticios), con el consentimiento firmado el 8 de agosto y nada más cargado. */
function datos(cambios: Partial<DatosHomeE> = {}): DatosHomeE {
  return {
    cargando: false,
    esPaciente: true,
    nombre: 'Jorge',
    hoy: HOY,
    le8: le8(0),
    consentimiento: 'firmado',
    fechaConsentimiento: '2026-08-08',
    ingresoPendiente: false,
    novedadesSinLeer: 0,
    ...cambios,
  };
}

function som(estado: SegundaOpinionHome['estado'], cambios: Partial<SegundaOpinionHome> = {}): SegundaOpinionHome {
  const etiqueta = { 'en-analisis': 'En análisis', completada: 'Completada', cancelada: 'Cancelada', otro: 'En pausa' }[
    estado
  ];
  return { id: 'som-1', estado, firmada: false, etiqueta, pedida: '2026-09-28', ...cambios };
}

const LAB_SIN_REVISAR: LaboratorioHome = {
  estado: 'procesado',
  fecha: '2026-10-03T12:00:00.000Z',
  valores: 14,
  informeId: 'dr1',
  revisionMedica: false,
};
const LAB_EN_PROCESO: LaboratorioHome = {
  estado: 'en-proceso',
  fecha: '2026-10-09T12:00:00.000Z',
  revisionMedica: false,
};

/** Los estados de las 8 estaciones, en orden. */
function estados(ruta: RutaHomeD): Record<ClaveEstacion, EstadoEstacion> {
  return Object.fromEntries(ruta.estaciones.map((e) => [e.clave, e.estado])) as Record<ClaveEstacion, EstadoEstacion>;
}

function detalle(ruta: RutaHomeD, clave: ClaveEstacion): string | undefined {
  return ruta.estaciones.find((e) => e.clave === clave)?.detalle;
}

/** Todo el texto que muestra la ruta. */
function textos(ruta: RutaHomeD): string {
  return [
    ruta.titulo,
    ruta.subtitulo,
    ruta.etiquetaActiva,
    ruta.explicacion,
    ruta.control.texto,
    ruta.accion?.texto,
    ...ruta.estaciones.flatMap((e) => [e.nombre, e.detalle]),
  ]
    .filter(Boolean)
    .join(' | ');
}

describe('rutaDe: las estaciones', () => {
  test('van las 8, en orden, con sus nombres', () => {
    const ruta = rutaDe(datos(), OPCIONES);
    expect(ruta.estaciones.map((e) => e.clave)).toEqual(ORDEN_ESTACIONES);
    expect(ruta.estaciones.map((e) => e.nombre)).toEqual([
      'Tu app',
      'Tu historia clínica',
      'Consentimiento',
      'Agentes de IA',
      'Equipo médico',
      'Tus resultados',
      'Novedades',
      'Vos',
    ]);
    expect(detalle(ruta, 'historia')).toBe('FHIR R4');
    expect(detalle(ruta, 'avisos')).toBe('y Mensajes');
    expect(detalle(ruta, 'ia')).toBe('ordenan y calculan');
  });

  test('con Segunda Opinión, la vuelta trae el informe y el título la nombra con el producto', () => {
    const ruta = rutaDe(datos({ segundaOpinion: som('en-analisis') }), OPCIONES);
    expect(ruta.estaciones.find((e) => e.clave === 'informe')?.nombre).toBe('Informe y PDF');
    expect(ruta.titulo).toBe('Tu Revisión Experta, ida y vuelta');
    expect(ruta.subtitulo).toBe('Pedida el 28 de septiembre');
  });

  test('sin Segunda Opinión: «Tus datos, ida y vuelta», con la fecha del laboratorio si hay PDF', () => {
    expect(rutaDe(datos(), OPCIONES)).toMatchObject({ titulo: 'Tus datos, ida y vuelta', subtitulo: undefined });
    expect(rutaDe(datos({ laboratorio: LAB_SIN_REVISAR }), OPCIONES).subtitulo).toBe('Laboratorio del 3 de octubre');
  });

  test('una Segunda Opinión cancelada no cuenta: la ruta es la de tus datos', () => {
    const ruta = rutaDe(datos({ segundaOpinion: som('cancelada'), laboratorio: LAB_SIN_REVISAR }), OPCIONES);
    expect(ruta.titulo).toBe('Tus datos, ida y vuelta');
    expect(ruta.estaciones.find((e) => e.clave === 'informe')?.nombre).toBe('Tus resultados');
  });

  test('la fecha de otro año lleva el año', () => {
    const ruta = rutaDe(datos({ fechaConsentimiento: '2025-12-03' }), OPCIONES);
    expect(detalle(ruta, 'consentimiento')).toBe('firmado el 3 de diciembre de 2025');
  });
});

describe('rutaDe: el control de consentimiento', () => {
  test('firmado: el texto y la fecha de la firma', () => {
    const ruta = rutaDe(datos(), OPCIONES);
    expect(ruta.control).toEqual({ estado: 'firmado', texto: TEXTO_CONTROL.firmado });
    expect(ruta.control.texto).toBe(
      'Control de consentimiento: firmado. Sin tu firma, tus datos clínicos no pasan por nuestros agentes de IA.'
    );
    expect(detalle(ruta, 'consentimiento')).toBe('firmado el 8 de agosto');
  });

  test('firmado sin fecha: «firmado», sin inventarla', () => {
    expect(detalle(rutaDe(datos({ fechaConsentimiento: undefined }), OPCIONES), 'consentimiento')).toBe('firmado');
  });

  test('falta: el control se cierra, todo lo que sigue queda por recorrer y la acción es firmarlo', () => {
    const ruta = rutaDe(datos({ consentimiento: 'falta', fechaConsentimiento: undefined }), OPCIONES);
    expect(estados(ruta)).toEqual({
      app: 'activa',
      historia: 'por-recorrer',
      consentimiento: 'cerrada',
      ia: 'por-recorrer',
      equipo: 'por-recorrer',
      informe: 'por-recorrer',
      avisos: 'por-recorrer',
      vos: 'por-recorrer',
    });
    expect(detalle(ruta, 'consentimiento')).toBe('falta tu firma');
    expect(ruta.control.texto).toBe(
      'Control de consentimiento: falta tu firma. Sin ella, tus datos clínicos no pasan por nuestros agentes de IA.'
    );
    expect(ruta.accion).toEqual({ texto: 'Firmar mi consentimiento', href: RUTA_CONSENTIMIENTO });
    expect(ruta.enCurso).toBe(false);
  });

  test('falta con datos cargados: llegaron a la historia clínica y se detienen en el control', () => {
    const ruta = rutaDe(datos({ consentimiento: 'falta', laboratorio: LAB_SIN_REVISAR }), OPCIONES);
    expect(estados(ruta)).toMatchObject({ app: 'recorrida', historia: 'recorrida', consentimiento: 'cerrada' });
    expect(estados(ruta).ia).toBe('por-recorrer');
    expect(ruta.explicacion).toContain('se detienen en el control');
  });

  test('falta gana aun con una Segunda Opinión en análisis: nada pasa por la IA sin la firma', () => {
    const ruta = rutaDe(datos({ consentimiento: 'falta', segundaOpinion: som('en-analisis') }), OPCIONES);
    expect(estados(ruta)).toMatchObject({ consentimiento: 'cerrada', ia: 'por-recorrer', equipo: 'por-recorrer' });
    expect(ruta.enCurso).toBe(false);
    expect(ruta.etiquetaActiva).toBeUndefined();
    expect(ruta.accion?.href).toBe(RUTA_CONSENTIMIENTO);
  });

  test('desactualizado: el control queda activo y la línea sigue según lo demás', () => {
    const ruta = rutaDe(datos({ consentimiento: 'desactualizado', segundaOpinion: som('en-analisis') }), OPCIONES);
    expect(estados(ruta)).toMatchObject({ consentimiento: 'activa', ia: 'activa', equipo: 'activa' });
    expect(detalle(ruta, 'consentimiento')).toBe('hay una versión nueva');
    expect(ruta.control).toEqual({
      estado: 'desactualizado',
      texto: 'Control de consentimiento: hay una versión nueva para firmar.',
    });
    expect(ruta.enCurso).toBe(true);
  });

  test('cargando: no se cierra nada mientras se consulta', () => {
    const ruta = rutaDe(datos({ consentimiento: 'cargando', laboratorio: LAB_EN_PROCESO }), OPCIONES);
    expect(Object.values(estados(ruta))).not.toContain('cerrada');
    expect(estados(ruta)).toMatchObject({ consentimiento: 'recorrida', ia: 'activa' });
    expect(detalle(ruta, 'consentimiento')).toBeUndefined();
    expect(ruta.control).toEqual({ estado: 'cargando', texto: TEXTO_CONTROL.cargando });
  });
});

describe('rutaDe: la Segunda Opinión', () => {
  test('en análisis: IA y equipo activos JUNTOS, con su etiqueta, el pulso y sin plazos', () => {
    const ruta = rutaDe(datos({ segundaOpinion: som('en-analisis') }), OPCIONES);
    expect(estados(ruta)).toEqual({
      app: 'recorrida',
      historia: 'recorrida',
      consentimiento: 'recorrida',
      ia: 'activa',
      equipo: 'activa',
      informe: 'por-recorrer',
      avisos: 'por-recorrer',
      vos: 'por-recorrer',
    });
    expect(ruta.etiquetaActiva).toBe('En análisis · desde el 28 de septiembre');
    expect(ruta.enCurso).toBe(true);
    expect(ruta.explicacion).toBe(
      'Nuestros agentes de IA y nuestro equipo médico trabajan juntos en tu caso. Te avisamos en Novedades cuando esté listo.'
    );
    expect(ruta.explicacion).toBe(EXPLICACION_EN_ANALISIS);
    expect(ruta.accion).toEqual({ texto: 'Ver mi Revisión Experta', href: RUTA_MI_SEGUNDA_OPINION });
    expect(textos(ruta)).not.toMatch(/\d+ (días|horas|semanas)|plazo|demora/);
  });

  test('en análisis sin fecha de pedido: la etiqueta sola', () => {
    const ruta = rutaDe(datos({ segundaOpinion: som('en-analisis', { pedida: undefined }) }), OPCIONES);
    expect(ruta.etiquetaActiva).toBe('En análisis');
    expect(ruta.subtitulo).toBeUndefined();
  });

  test('completada sin firma médica: todo recorrido, Vos activa, el informe «listo» (nunca «firmado») y el equipo sin firma', () => {
    const ruta = rutaDe(datos({ segundaOpinion: som('completada') }), OPCIONES);
    expect(estados(ruta)).toEqual({
      app: 'recorrida',
      historia: 'recorrida',
      consentimiento: 'recorrida',
      ia: 'recorrida',
      equipo: 'recorrida',
      informe: 'recorrida',
      avisos: 'recorrida',
      vos: 'activa',
    });
    expect(detalle(ruta, 'informe')).toBe('listo');
    // El dibujo y la lista leída dicen lo mismo que la explicación: no hay firma médica registrada.
    expect(detalle(ruta, 'equipo')).toBe('sin firma registrada');
    expect(ruta.accion).toEqual({ texto: 'Ver mi informe', href: RUTA_MI_SEGUNDA_OPINION });
    expect(ruta.enCurso).toBe(false);
    // Lo único «firmado» es el consentimiento.
    expect(ruta.explicacion).not.toMatch(/firmad[oa]/);
    expect(ruta.explicacion).toContain('no tiene firma médica registrada');
  });

  test('completada con firma médica registrada: el informe «firmado»', () => {
    const ruta = rutaDe(datos({ segundaOpinion: som('completada', { firmada: true }) }), OPCIONES);
    expect(detalle(ruta, 'informe')).toBe('firmado');
    expect(detalle(ruta, 'equipo')).toBeUndefined();
    expect(ruta.explicacion).toBe('Tu informe volvió con firma médica.');
  });

  test('en otro estado (en pausa): no se adivina por dónde va', () => {
    const ruta = rutaDe(datos({ segundaOpinion: som('otro') }), OPCIONES);
    expect(estados(ruta)).toMatchObject({ consentimiento: 'recorrida', ia: 'por-recorrer', equipo: 'por-recorrer' });
    expect(ruta.explicacion).toBe('Estado de tu pedido: En pausa. En tu Revisión Experta ves el detalle.');
    expect(ruta.accion?.href).toBe(RUTA_MI_SEGUNDA_OPINION);
    expect(ruta.enCurso).toBe(false);
  });

  test('la Segunda Opinión manda sobre el PDF en proceso', () => {
    const ruta = rutaDe(datos({ segundaOpinion: som('en-analisis'), laboratorio: LAB_EN_PROCESO }), OPCIONES);
    expect(ruta.titulo).toBe('Tu Revisión Experta, ida y vuelta');
    expect(detalle(ruta, 'ia')).toBe('ordenan y calculan');
  });
});

describe('rutaDe: el PDF de laboratorio', () => {
  test('en proceso: hasta los agentes de IA, que leen tu PDF, con el pulso encendido', () => {
    const ruta = rutaDe(datos({ laboratorio: LAB_EN_PROCESO }), OPCIONES);
    expect(estados(ruta)).toEqual({
      app: 'recorrida',
      historia: 'recorrida',
      consentimiento: 'recorrida',
      ia: 'activa',
      equipo: 'por-recorrer',
      informe: 'por-recorrer',
      avisos: 'por-recorrer',
      vos: 'por-recorrer',
    });
    expect(detalle(ruta, 'ia')).toBe('leen tu PDF');
    expect(ruta.etiquetaActiva).toBe('En proceso · desde el 9 de octubre');
    expect(ruta.enCurso).toBe(true);
    expect(ruta.explicacion).toBe(EXPLICACION_PDF_EN_PROCESO);
    expect(ruta.accion).toEqual({ texto: 'Ver mis estudios enviados', href: RUTA_ENVIAR_ESTUDIOS });
  });

  test('demorado: «Demorado», sin pulso, y la misma frase que la Home E', () => {
    const ruta = rutaDe(datos({ laboratorio: { ...LAB_EN_PROCESO, estado: 'demorado' } }), OPCIONES);
    expect(estados(ruta).ia).toBe('activa');
    expect(detalle(ruta, 'ia')).toBe('demorado');
    expect(ruta.etiquetaActiva).toBe('Demorado');
    expect(ruta.enCurso).toBe(false);
    expect(ruta.explicacion).toBe(EXPLICACION_PDF_DEMORADO);
    expect(ruta.explicacion).toContain('Si no pudimos leerlo, te escribimos por Mensajes.');
  });

  test('procesado sin revisión médica: volvió sin pasar por el equipo, que queda por recorrer', () => {
    const ruta = rutaDe(datos({ laboratorio: LAB_SIN_REVISAR }), OPCIONES);
    expect(estados(ruta)).toEqual({
      app: 'recorrida',
      historia: 'recorrida',
      consentimiento: 'recorrida',
      ia: 'recorrida',
      equipo: 'por-recorrer',
      informe: 'recorrida',
      avisos: 'recorrida',
      vos: 'activa',
    });
    expect(detalle(ruta, 'equipo')).toBe('en una teleconsulta');
    expect(detalle(ruta, 'informe')).toBe('leídos por IA');
    expect(ruta.explicacion).toBe(
      'Un agente de IA leyó tus datos y te los devolvió. Falta una estación: revisarlos con un profesional de nuestro equipo.'
    );
    expect(ruta.explicacion).toBe(EXPLICACION_SIN_REVISION);
    // La reserva avisa qué tiene costo, junto a la acción.
    expect(ruta.accion).toEqual({
      texto: 'Reservar mi teleconsulta',
      href: RUTA_RESERVAR_TELECONSULTA,
      nota: NOTA_COSTO_TELECONSULTA,
    });
    expect(ruta.enCurso).toBe(false);
  });

  test('con un turno reservado: el equipo sigue por recorrer, «en tu turno del …»', () => {
    const ruta = rutaDe(
      datos({
        laboratorio: LAB_SIN_REVISAR,
        proximoTurno: { id: 'appt-1', inicio: '2026-10-17T13:30:00.000Z', teleconsulta: true },
      }),
      OPCIONES
    );
    expect(estados(ruta).equipo).toBe('por-recorrer');
    expect(detalle(ruta, 'equipo')).toBe('en tu turno del 17 de octubre');
    expect(ruta.explicacion).toContain('en tu turno del 17 de octubre');
    expect(ruta.accion).toEqual({ texto: 'Ver mi teleconsulta', href: '/teleconsulta/appt-1' });
  });

  test('con un turno en el centro: la acción lleva a los turnos', () => {
    const ruta = rutaDe(
      datos({
        laboratorio: LAB_SIN_REVISAR,
        proximoTurno: { id: 'appt-2', inicio: '2026-10-17T13:30:00.000Z', teleconsulta: false },
      }),
      OPCIONES
    );
    expect(ruta.accion).toEqual({ texto: 'Ver mis turnos', href: RUTA_MIS_TURNOS });
  });

  test('con una consulta después del laboratorio: el equipo recorrido y la acción es ver los resultados', () => {
    const ruta = rutaDe(
      datos({ laboratorio: LAB_SIN_REVISAR, ultimaConsulta: { inicio: '2026-10-05T14:00:00.000Z' } }),
      OPCIONES
    );
    expect(estados(ruta).equipo).toBe('recorrida');
    expect(detalle(ruta, 'equipo')).toBe('en tu consulta del 5 de octubre');
    expect(ruta.accion).toEqual({ texto: 'Ver mis resultados', href: '/health-record/lab-results/dr1' });
    expect(ruta.explicacion).not.toContain('Falta una estación');
  });

  test('con revisión médica registrada: pasó por el equipo', () => {
    const ruta = rutaDe(datos({ laboratorio: { ...LAB_SIN_REVISAR, revisionMedica: true } }), OPCIONES);
    expect(estados(ruta)).toMatchObject({ ia: 'recorrida', equipo: 'recorrida', informe: 'recorrida', vos: 'activa' });
    expect(detalle(ruta, 'informe')).toBe('con revisión médica');
    expect(ruta.accion?.texto).toBe('Ver mis resultados');
  });

  test('solo hábitos: el mismo recorrido, sin decir que un agente de IA leyó lo que nadie leyó', () => {
    const ruta = rutaDe(datos({ le8: le8(3) }), OPCIONES);
    expect(estados(ruta)).toMatchObject({
      ia: 'recorrida',
      equipo: 'por-recorrer',
      informe: 'recorrida',
      vos: 'activa',
    });
    expect(detalle(ruta, 'informe')).toBe('calculados');
    expect(ruta.explicacion).toBe(EXPLICACION_HABITOS_SIN_REVISION);
    expect(ruta.explicacion).not.toContain('agente');
    expect(ruta.accion?.href).toBe(RUTA_RESERVAR_TELECONSULTA);
  });

  test('solo hábitos y una consulta: no se afirma que esa consulta los revisó (no hay fecha de los datos)', () => {
    // Jorge tuvo una consulta el 10 de marzo y en octubre respondió sus cuestionarios.
    const ruta = rutaDe(datos({ le8: le8(4), ultimaConsulta: { inicio: '2026-03-10T14:00:00.000Z' } }), OPCIONES);
    expect(estados(ruta)).toMatchObject({ ia: 'recorrida', equipo: 'por-recorrer', informe: 'recorrida' });
    expect(detalle(ruta, 'equipo')).toBe('en una teleconsulta');
    expect(ruta.explicacion).toBe(EXPLICACION_HABITOS_OTRA_CONSULTA);
    expect(ruta.explicacion).not.toMatch(/después|consulta del/i);
    expect(ruta.estaciones.map((e) => e.detalle ?? '').join(' ')).not.toContain('en tu consulta');
    expect(ruta.accion).toEqual({
      texto: 'Reservar otra teleconsulta',
      href: RUTA_RESERVAR_TELECONSULTA,
      nota: NOTA_COSTO_TELECONSULTA,
    });
  });

  test('un PDF leído sin fecha y una consulta: tampoco se dice «después»', () => {
    const ruta = rutaDe(
      datos({
        laboratorio: { ...LAB_SIN_REVISAR, fecha: undefined },
        ultimaConsulta: { inicio: '2026-10-05T14:00:00.000Z' },
      }),
      OPCIONES
    );
    expect(estados(ruta).equipo).toBe('por-recorrer');
    expect(ruta.explicacion).not.toMatch(/después/i);
  });
});

describe('rutaDe: sin datos y sin paciente', () => {
  test('sin datos: la ruta empieza en tu app', () => {
    const ruta = rutaDe(datos(), OPCIONES);
    expect(estados(ruta)).toEqual({
      app: 'activa',
      historia: 'por-recorrer',
      consentimiento: 'por-recorrer',
      ia: 'por-recorrer',
      equipo: 'por-recorrer',
      informe: 'por-recorrer',
      avisos: 'por-recorrer',
      vos: 'por-recorrer',
    });
    expect(detalle(ruta, 'app')).toBe('tu ruta empieza acá');
    expect(ruta.explicacion).toBe('Cuando mandes tu laboratorio o tus datos, vas a ver acá su recorrido.');
    expect(ruta.explicacion).toBe(EXPLICACION_SIN_DATOS);
    expect(ruta.accion).toEqual({ texto: 'Enviar mi laboratorio en PDF', href: RUTA_ENVIAR_ESTUDIOS });
    expect(ruta.enCurso).toBe(false);
  });

  test('un perfil que no es Patient: todo por recorrer, sin acción ni pedido de firma', () => {
    const ruta = rutaDe(datos({ esPaciente: false, nombre: undefined, laboratorio: LAB_SIN_REVISAR }), OPCIONES);
    expect(new Set(Object.values(estados(ruta)))).toEqual(new Set(['por-recorrer']));
    expect(ruta.accion).toBeUndefined();
    expect(ruta.enCurso).toBe(false);
    expect(ruta.explicacion).toBe(EXPLICACION_NO_PACIENTE);
    expect(ruta.control.texto).toBe(TEXTO_CONTROL_NEUTRO);
    expect(textos(ruta)).not.toMatch(/tu firma|firmá/i);
  });
});

describe('rutaDe: textos', () => {
  const casos: [string, DatosHomeE][] = [
    ['sin datos', datos()],
    ['sin firma', datos({ consentimiento: 'falta' })],
    ['consentimiento nuevo', datos({ consentimiento: 'desactualizado' })],
    ['en análisis', datos({ segundaOpinion: som('en-analisis') })],
    ['completada', datos({ segundaOpinion: som('completada') })],
    ['firmada', datos({ segundaOpinion: som('completada', { firmada: true }) })],
    ['en pausa', datos({ segundaOpinion: som('otro') })],
    ['PDF en proceso', datos({ laboratorio: LAB_EN_PROCESO })],
    ['PDF demorado', datos({ laboratorio: { ...LAB_EN_PROCESO, estado: 'demorado' } })],
    ['PDF leído', datos({ laboratorio: LAB_SIN_REVISAR })],
    ['hábitos', datos({ le8: le8(4) })],
    ['no paciente', datos({ esPaciente: false })],
  ];

  test.each(casos)('%s: neutros, sin placeholders, sin plazos ni metáforas de viaje', (_caso, d) => {
    const texto = textos(rutaDe(d, OPCIONES));
    expect(texto).not.toMatch(/bienvenida|inscripta|\blista\b|\bsola\b|la paciente/i);
    expect(texto).not.toContain('[');
    expect(texto).not.toMatch(/vuelo|pasajer|embarque|despegue/i);
    expect(texto).not.toMatch(/tu equipo médico/i);
  });

  test.each(casos.filter(([caso]) => caso !== 'firmada'))(
    '%s: nada dice «firmado» salvo el consentimiento',
    (_caso, d) => {
      const ruta = rutaDe(d, OPCIONES);
      const sinConsentimiento = ruta.estaciones.filter((e) => e.clave !== 'consentimiento');
      expect(sinConsentimiento.map((e) => e.detalle ?? '').join(' ')).not.toMatch(/firmad/);
      expect(ruta.explicacion).not.toMatch(/firmad/);
    }
  );
});

describe('el dibujo', () => {
  test('tramoEntre: sólido entre estaciones alcanzadas, punteado hacia lo que falta, cortado después del candado', () => {
    expect(tramoEntre('recorrida', 'recorrida')).toBe('recorrido');
    expect(tramoEntre('recorrida', 'activa')).toBe('recorrido');
    expect(tramoEntre('activa', 'activa')).toBe('recorrido');
    expect(tramoEntre('activa', 'por-recorrer')).toBe('por-recorrer');
    expect(tramoEntre('por-recorrer', 'recorrida')).toBe('por-recorrer');
    expect(tramoEntre('recorrida', 'cerrada')).toBe('recorrido');
    expect(tramoEntre('cerrada', 'por-recorrer')).toBe('cortado');
  });

  test('en análisis: la cápsula une IA y equipo, y el pulso va de tu app hasta el equipo', () => {
    const dibujo = dibujoDe(rutaDe(datos({ segundaOpinion: som('en-analisis') }), OPCIONES));
    expect(dibujo.tramos.ia.capsula).toBe('inicio');
    expect(dibujo.tramos.equipo.capsula).toBe('fin');
    expect(dibujo.tramos.app.entrada).toBeUndefined();
    expect(dibujo.tramos.vos.salida).toBeUndefined();
    // app→historia→consentimiento→ia→equipo: 4 tramos, 8 medias líneas, todas recorridas.
    expect(dibujo.trazos).toBe(8);
    expect(dibujo.pulsos).toBe(8);
    expect(dibujo.tramos.app.salida).toEqual({ estado: 'recorrido', orden: 0, pulso: 0 });
    expect(dibujo.tramos.equipo.entrada).toEqual({ estado: 'recorrido', orden: 7, pulso: 7 });
    expect(dibujo.tramos.equipo.salida).toEqual({ estado: 'por-recorrer' });
    expect(dibujo.giro).toEqual({ estado: 'por-recorrer' });
  });

  test('sin nada en curso no hay pulso; completada, todo se traza (también el giro)', () => {
    const dibujo = dibujoDe(rutaDe(datos({ segundaOpinion: som('completada') }), OPCIONES));
    expect(dibujo.pulsos).toBe(0);
    expect(dibujo.tramos.ia.capsula).toBeUndefined();
    // 7 tramos (14 medias líneas) y el giro.
    expect(dibujo.trazos).toBe(15);
    expect(dibujo.giro).toEqual({ estado: 'recorrido', orden: 9 });
  });

  test('sin firma: la línea se corta después del candado', () => {
    const dibujo = dibujoDe(rutaDe(datos({ consentimiento: 'falta', laboratorio: LAB_SIN_REVISAR }), OPCIONES));
    expect(dibujo.tramos.consentimiento.entrada?.estado).toBe('recorrido');
    expect(dibujo.tramos.consentimiento.salida?.estado).toBe('cortado');
    expect(dibujo.tramos.ia.entrada?.estado).toBe('cortado');
    expect(dibujo.tramos.ia.salida?.estado).toBe('por-recorrer');
  });

  test('PDF leído sin revisión: punteado alrededor del equipo y la vuelta sólida', () => {
    const dibujo = dibujoDe(rutaDe(datos({ laboratorio: LAB_SIN_REVISAR }), OPCIONES));
    expect(dibujo.tramos.ia.entrada?.estado).toBe('recorrido');
    expect(dibujo.tramos.ia.salida?.estado).toBe('por-recorrer');
    expect(dibujo.giro.estado).toBe('por-recorrer');
    expect(dibujo.tramos.informe.salida?.estado).toBe('recorrido');
    expect(dibujo.tramos.vos.entrada?.estado).toBe('recorrido');
  });

  test('sin datos: nada recorrido, nada que trazar', () => {
    const dibujo = dibujoDe(rutaDe(datos(), OPCIONES));
    expect(dibujo.trazos).toBe(0);
    expect(dibujo.pulsos).toBe(0);
  });
});
