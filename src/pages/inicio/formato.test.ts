// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import {
  aInstante,
  conSigno,
  diaArgentinaDe,
  fechaAbreviada,
  fechaConDia,
  fechaCorta,
  mayuscula,
  MESES_ABREVIADOS,
  minuscula,
  minusculaNatural,
  plural,
  porcentaje,
} from './formato';

const HOY = '2026-10-10'; // un sábado

describe('aInstante: una fecha FHIR como instante', () => {
  test('una fecha sin hora es un día de Argentina: va al mediodía de allá', () => {
    expect(aInstante('2026-10-03')?.toISOString()).toBe('2026-10-03T15:00:00.000Z');
  });

  test('un instante con hora se respeta tal cual', () => {
    expect(aInstante('2026-10-03T01:30:00.000Z')?.toISOString()).toBe('2026-10-03T01:30:00.000Z');
  });

  test('lo que no es una fecha da undefined', () => {
    expect(aInstante('ayer')).toBeUndefined();
    expect(aInstante('')).toBeUndefined();
  });
});

describe('fechaCorta: «3 de octubre», en hora de Argentina', () => {
  test('del año de hoy, sin el año', () => {
    expect(fechaCorta('2026-10-03', HOY)).toBe('3 de octubre');
    expect(fechaCorta('2026-09-28T13:00:00.000Z', HOY)).toBe('28 de septiembre');
  });

  test('de otro año, con el año', () => {
    expect(fechaCorta('2025-12-03', HOY)).toBe('3 de diciembre de 2025');
  });

  test('un instante de la noche argentina cae en su día de allá, no en el de UTC', () => {
    // 01:30 UTC del 4 de octubre son las 22:30 del 3 en Argentina.
    expect(fechaCorta('2026-10-04T01:30:00.000Z', HOY)).toBe('3 de octubre');
    // Y el año también se mira en Argentina: la noche del 31 de diciembre sigue siendo 2025.
    expect(fechaCorta('2026-01-01T02:00:00.000Z', '2026-01-05')).toBe('31 de diciembre de 2025');
  });

  test('sin fecha, o con una que no se entiende, no inventa nada', () => {
    expect(fechaCorta(undefined, HOY)).toBeUndefined();
    expect(fechaCorta('', HOY)).toBeUndefined();
    expect(fechaCorta('no-es-fecha', HOY)).toBeUndefined();
  });
});

describe('fechaConDia: «sábado 10 de octubre»', () => {
  test('con el día de la semana y sin la coma de Intl', () => {
    expect(fechaConDia(HOY)).toBe('sábado 10 de octubre');
    expect(fechaConDia('2026-10-12')).toBe('lunes 12 de octubre');
  });

  test('una fecha que no se entiende da un texto vacío', () => {
    expect(fechaConDia('no-es-fecha')).toBe('');
  });
});

describe('diaArgentinaDe: el día del calendario de Argentina', () => {
  test('una fecha sola es ese día; un instante, el día de allá', () => {
    expect(diaArgentinaDe('2026-10-03')).toBe('2026-10-03');
    // 01:30 UTC del 4 de octubre son las 22:30 del 3 en Argentina.
    expect(diaArgentinaDe('2026-10-04T01:30:00.000Z')).toBe('2026-10-03');
  });

  test('sin fecha o con una que no se entiende, undefined', () => {
    expect(diaArgentinaDe(undefined)).toBeUndefined();
    expect(diaArgentinaDe('no-es-fecha')).toBeUndefined();
  });
});

describe('fechaAbreviada: «sáb 10 oct», con abreviaturas fijas', () => {
  test('el día de la semana, el día y el mes, sin puntos', () => {
    expect(fechaAbreviada(HOY)).toBe('sáb 10 oct');
    expect(fechaAbreviada('2026-10-12')).toBe('lun 12 oct');
    expect(fechaAbreviada('2026-11-04')).toBe('mié 4 nov');
  });

  test('septiembre es «sep» siempre (Intl dice «sep» o «sept» según la versión de ICU)', () => {
    expect(fechaAbreviada('2026-09-28')).toBe('lun 28 sep');
    expect(MESES_ABREVIADOS).toHaveLength(12);
    expect(MESES_ABREVIADOS[8]).toBe('sep');
  });

  test('un instante de la noche argentina cae en su día de allá', () => {
    expect(fechaAbreviada('2026-10-11T01:30:00.000Z')).toBe('sáb 10 oct');
  });

  test('una fecha que no se entiende da un texto vacío', () => {
    expect(fechaAbreviada('no-es-fecha')).toBe('');
  });
});

describe('porcentaje: una probabilidad 0-1 con un decimal y coma', () => {
  test('como lo lee la persona', () => {
    expect(porcentaje(0.042)).toBe('4,2%');
    expect(porcentaje(0.187)).toBe('18,7%');
    expect(porcentaje(0)).toBe('0,0%');
    expect(porcentaje(0.0815)).toMatch(/^8,[12]%$/);
  });
});

describe('conSigno: la diferencia con su signo', () => {
  test('más, menos (el signo tipográfico) o cero', () => {
    expect(conSigno(6)).toBe('+6');
    expect(conSigno(-3)).toBe('−3');
    expect(conSigno(0)).toBe('0');
  });
});

describe('plural: el número con la palabra que corresponde', () => {
  test('uno en singular; cero y varios en plural', () => {
    expect(plural(1, 'semana', 'semanas')).toBe('1 semana');
    expect(plural(4, 'semana', 'semanas')).toBe('4 semanas');
    expect(plural(0, 'valor', 'valores')).toBe('0 valores');
  });
});

describe('mayuscula y minuscula: solo la primera letra', () => {
  test('cambian la primera letra y dejan el resto como está', () => {
    expect(mayuscula('moderada')).toBe('Moderada');
    expect(mayuscula('ñandú en el campo')).toBe('Ñandú en el campo');
    expect(minuscula('Factores de riesgo activos')).toBe('factores de riesgo activos');
    expect(minuscula('Calidad del Sueño')).toBe('calidad del Sueño');
  });

  test('un texto vacío sigue vacío', () => {
    expect(mayuscula('')).toBe('');
    expect(minuscula('')).toBe('');
  });
});

describe('minusculaNatural: la primera letra en minúscula, salvo en una sigla', () => {
  test('solo la primera letra, y las siglas quedan', () => {
    expect(minusculaNatural('Calidad del sueño')).toBe('calidad del sueño');
    expect(minusculaNatural('Actividad física')).toBe('actividad física');
    expect(minusculaNatural('Peso (IMC)')).toBe('peso (IMC)');
    expect(minusculaNatural('LE8')).toBe('LE8');
    expect(minusculaNatural('')).toBe('');
  });
});
