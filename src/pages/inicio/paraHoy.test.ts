// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { LE8_DOMINIOS } from '@epa/careplan-menopausia';
import { RUTA_ENVIAR_ESTUDIOS } from '../../components/AccionesRapidas';
import type { HitoBienestar, PlanBienestar } from '../../fhir/bienestar';
import { DIAS_INFORME_RECIENTE, paraHoy } from './paraHoy';
import type { DatosHomeE, Le8Domain, ResultadoLe8, SegundaOpinionHome } from './tipos';

const HOY = '2026-10-10';
// Un nombre cualquiera: el del servicio entra por parámetro (en la Home, MARCA.producto).
const OPCIONES = { producto: 'Revisión Experta' };

/** LE8 con los 8 hábitos en 70, salvo los que faltan (en el orden que se pida). */
function le8(faltan: readonly Le8Domain[] = [], orden: readonly Le8Domain[] = LE8_DOMINIOS): ResultadoLe8 {
  const dominios = orden.map((dominio) => (faltan.includes(dominio) ? { dominio } : { dominio, puntaje: 70 }));
  const conDato = dominios.length - faltan.length;
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

function hito(id: string, cumplido: boolean): HitoBienestar {
  return { id, label: `Hito ${id}`, descripcion: `Para qué sirve ${id}.`, href: `/ruta/${id}`, cumplido };
}

function plan(hitos: HitoBienestar[]): PlanBienestar {
  return {
    dia: 12,
    totalDias: 100,
    inicio: '2026-09-29',
    fin: '2027-01-07',
    terminado: false,
    hitos,
    semanasActivas: 2,
    rachaActual: 2,
  };
}

function som(estado: SegundaOpinionHome['estado'], actualizada?: string): SegundaOpinionHome {
  return { id: 'som-1', estado, etiqueta: 'Etiqueta', pedida: '2026-09-01', actualizada };
}

/** Una paciente al día: todo firmado y respondido, con los 8 pétalos completos. */
function alDia(cambios: Partial<DatosHomeE> = {}): DatosHomeE {
  return {
    cargando: false,
    esPaciente: true,
    nombre: 'Ana',
    hoy: HOY,
    le8: le8(),
    consentimiento: 'firmado',
    ingresoPendiente: false,
    novedadesSinLeer: 0,
    ...cambios,
  };
}

describe('paraHoy: una sola acción, elegida por una regla fija', () => {
  test('1. sin consentimiento firmado, lo primero es firmarlo', () => {
    expect(paraHoy(alDia({ consentimiento: 'falta' }), OPCIONES)).toEqual({
      clave: 'consentimiento',
      titulo: 'Firmá tu consentimiento informado',
      detalle: 'Es el primer paso: sin tu firma, tus datos clínicos no pasan por nuestros agentes de IA.',
      cta: 'Leer y firmar',
      href: '/health-record/consent',
    });
  });

  test('2. con una versión vieja del consentimiento, firmar la nueva', () => {
    expect(paraHoy(alDia({ consentimiento: 'desactualizado' }), OPCIONES)).toEqual({
      clave: 'consentimiento-actualizado',
      titulo: 'Actualizamos el consentimiento informado',
      detalle: 'Leelo y firmá la versión nueva.',
      cta: 'Revisar y firmar',
      href: '/health-record/consent',
    });
  });

  test('3. sin el cuestionario de ingreso, completarlo', () => {
    expect(paraHoy(alDia({ ingresoPendiente: true }), OPCIONES)).toEqual({
      clave: 'ingreso',
      titulo: 'Completá tu cuestionario de ingreso',
      detalle: 'Con tus antecedentes, tu equipo médico te conoce mejor.',
      cta: 'Completar ahora',
      href: '/health-record/ingreso',
    });
  });

  test('4. con el informe recién firmado, verlo (con el nombre del servicio que llega por parámetro)', () => {
    expect(paraHoy(alDia({ segundaOpinion: som('completada', '2026-10-08T15:00:00.000Z') }), OPCIONES)).toEqual({
      clave: 'informe',
      titulo: 'Tu informe de Revisión Experta está listo',
      detalle: 'Lo firmó tu equipo médico.',
      cta: 'Ver mi informe',
      href: '/mi-segunda-opinion',
    });
  });

  test('5. con un hito del plan pendiente, el primero que falta', () => {
    const datos = alDia({ plan: plan([hito('consentimiento', true), hito('vitales', false), hito('le8', false)]) });
    expect(paraHoy(datos, OPCIONES)).toEqual({
      clave: 'hito-vitales',
      titulo: 'Hito vitales',
      detalle: 'Para qué sirve vitales.',
      cta: 'Hacerlo ahora',
      href: '/ruta/vitales',
    });
  });

  test('6. con un pétalo sin dato, completarlo', () => {
    expect(paraHoy(alDia({ le8: le8(['sueno']) }), OPCIONES)).toEqual({
      clave: 'le8-sueno',
      titulo: 'Respondé tu cuestionario de sueño',
      detalle: 'Tu pétalo de sueño se completa con tu dato.',
      cta: 'Responder ahora',
      href: '/health-record/cuestionarios/le8-sleep-psqi-v1',
    });
  });

  test('7. con todo al día, ver los 8 hábitos', () => {
    expect(paraHoy(alDia(), OPCIONES)).toEqual({
      clave: 'al-dia',
      titulo: 'Hoy estás al día',
      detalle: 'Tu equipo tiene lo que necesita por ahora.',
      cta: 'Ver mis 8 hábitos',
      href: '/care-plan/plan-100-dias/tablero',
    });
  });
});

describe('paraHoy: el orden de prioridad', () => {
  const todoPendiente: Partial<DatosHomeE> = {
    ingresoPendiente: true,
    segundaOpinion: som('completada', '2026-10-09T12:00:00.000Z'),
    plan: plan([hito('biomarcadores', false)]),
    le8: le8(['dieta']),
  };

  test('sin consentimiento gana aunque haya ingreso, informe, hitos y pétalos pendientes', () => {
    expect(paraHoy(alDia({ ...todoPendiente, consentimiento: 'falta' }), OPCIONES).clave).toBe('consentimiento');
  });

  test('el consentimiento desactualizado va antes que el ingreso', () => {
    expect(paraHoy(alDia({ ...todoPendiente, consentimiento: 'desactualizado' }), OPCIONES).clave).toBe(
      'consentimiento-actualizado'
    );
  });

  test('el ingreso va antes que el informe', () => {
    expect(paraHoy(alDia(todoPendiente), OPCIONES).clave).toBe('ingreso');
  });

  test('el informe va antes que los hitos', () => {
    expect(paraHoy(alDia({ ...todoPendiente, ingresoPendiente: false }), OPCIONES).clave).toBe('informe');
  });

  test('los hitos van antes que los pétalos', () => {
    const { segundaOpinion: _som, ...sinInforme } = todoPendiente;
    expect(paraHoy(alDia({ ...sinInforme, ingresoPendiente: false }), OPCIONES).clave).toBe('hito-biomarcadores');
  });

  test('con el plan entero cumplido, siguen los pétalos', () => {
    const datos = alDia({ plan: plan([hito('consentimiento', true), hito('le8', true)]), le8: le8(['imc']) });
    expect(paraHoy(datos, OPCIONES).clave).toBe('le8-imc');
  });

  test('mientras el consentimiento carga (o no se pudo saber), no pide firmar', () => {
    expect(paraHoy(alDia({ consentimiento: 'cargando' }), OPCIONES).clave).toBe('al-dia');
  });

  test('un profesional (sin datos de paciente) queda al día', () => {
    const profesional: DatosHomeE = {
      cargando: false,
      esPaciente: false,
      hoy: HOY,
      consentimiento: 'firmado',
      ingresoPendiente: false,
      novedadesSinLeer: 0,
    };
    expect(paraHoy(profesional, OPCIONES).clave).toBe('al-dia');
  });
});

describe('paraHoy: el informe es reciente hasta 14 días después de completado', () => {
  test('la ventana es de 14 días', () => {
    expect(DIAS_INFORME_RECIENTE).toBe(14);
  });

  test.each([
    ['hoy', '2026-10-10T12:00:00.000Z', 'informe'],
    ['hace 14 días', '2026-09-26T12:00:00.000Z', 'informe'],
    ['hace 15 días', '2026-09-25T12:00:00.000Z', 'al-dia'],
    ['hace 14 días a las 23 de Argentina (ya es el 27 en UTC)', '2026-09-27T02:00:00.000Z', 'informe'],
    ['hace 15 días a las 23 de Argentina (ya es el 26 en UTC)', '2026-09-26T02:00:00.000Z', 'al-dia'],
    ['una fecha sin hora, hace 14 días', '2026-09-26', 'informe'],
    ['una fecha futura (reloj corrido)', '2026-10-11T12:00:00.000Z', 'informe'],
    ['una fecha ilegible', 'no-es-fecha', 'al-dia'],
  ] as const)('completada %s → %s', (_caso, actualizada, clave) => {
    expect(paraHoy(alDia({ segundaOpinion: som('completada', actualizada) }), OPCIONES).clave).toBe(clave);
  });

  test('completada sin fecha de actualización → no se sabe si es reciente', () => {
    expect(paraHoy(alDia({ segundaOpinion: som('completada') }), OPCIONES).clave).toBe('al-dia');
  });

  test.each(['en-analisis', 'otro'] as const)('%s, aunque sea de hoy → no hay informe para ver', (estado) => {
    expect(paraHoy(alDia({ segundaOpinion: som(estado, '2026-10-10T12:00:00.000Z') }), OPCIONES).clave).toBe('al-dia');
  });
});

describe('paraHoy: cómo se completa cada pétalo', () => {
  test.each([
    [
      'dieta',
      'Respondé tu cuestionario de alimentación',
      '/health-record/cuestionarios/le8-diet-mepa-v1',
      'alimentación',
    ],
    [
      'actividad-fisica',
      'Respondé tu cuestionario de actividad física',
      '/health-record/cuestionarios/le8-activity-evs-v1',
      'actividad física',
    ],
    ['nicotina', 'Respondé tu cuestionario de nicotina', '/health-record/cuestionarios/le8-tobacco-v1', 'nicotina'],
    ['sueno', 'Respondé tu cuestionario de sueño', '/health-record/cuestionarios/le8-sleep-psqi-v1', 'sueño'],
    ['imc', 'Registrá tu peso', '/care-plan/plan-100-dias/mis-datos', 'peso'],
    ['lipidos', 'Enviá tu laboratorio en PDF', RUTA_ENVIAR_ESTUDIOS, 'colesterol'],
    ['glucemia', 'Enviá tu laboratorio en PDF', RUTA_ENVIAR_ESTUDIOS, 'glucemia'],
    ['presion-arterial', 'Registrá tu presión', '/care-plan/plan-100-dias/mis-datos', 'presión arterial'],
  ] as const)('sin %s → «%s»', (dominio, titulo, href, habito) => {
    const accion = paraHoy(alDia({ le8: le8([dominio]) }), OPCIONES);
    expect(accion).toMatchObject({ clave: `le8-${dominio}`, titulo, href });
    expect(accion.detalle).toBe(`Tu pétalo de ${habito} se completa con tu dato.`);
  });

  test('con varios faltantes, el primero en el orden de la rosa (LE8_DOMINIOS)', () => {
    expect(paraHoy(alDia({ le8: le8(['imc', 'sueno', 'presion-arterial']) }), OPCIONES).clave).toBe('le8-sueno');
  });

  test('el orden es el de LE8_DOMINIOS aunque los dominios lleguen en otro orden', () => {
    const alReves = [...LE8_DOMINIOS].reverse();
    expect(paraHoy(alDia({ le8: le8(['presion-arterial', 'dieta'], alReves) }), OPCIONES).clave).toBe('le8-dieta');
  });

  test('una paciente sin ningún dato empieza por la alimentación', () => {
    expect(paraHoy(alDia({ le8: le8(LE8_DOMINIOS) }), OPCIONES).clave).toBe('le8-dieta');
  });

  test('un hábito que ni figura en el puntaje cuenta como sin dato', () => {
    const sinGlucemia = le8([], LE8_DOMINIOS.filter((d) => d !== 'glucemia'));
    expect(paraHoy(alDia({ le8: sinGlucemia }), OPCIONES).clave).toBe('le8-glucemia');
  });

  test('sin puntaje LE8 (todavía cargando) no propone pétalos', () => {
    expect(paraHoy(alDia({ le8: undefined }), OPCIONES).clave).toBe('al-dia');
  });
});
