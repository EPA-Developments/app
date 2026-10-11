// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { LE8_DOMINIOS } from '@epa/careplan-menopausia';
import type { PlanBienestar } from '../../fhir/bienestar';
import {
  caminoRecomendado,
  caminosDe,
  devolucionDada,
  devolucionPendiente,
  fechaHoraTurno,
  NOTA_COSTO_TELECONSULTA,
  pidioSegundaOpinion,
  puedeOfrecerTeleconsulta,
  subioDatos,
} from './caminos';
import type {
  Camino,
  ClaveCamino,
  DatosHomeE,
  LaboratorioHome,
  PreventEstimado,
  ProximoTurno,
  ResultadoLe8,
  SegundaOpinionHome,
} from './tipos';

const HOY = '2026-10-10';
// Nombres cualquiera: en la Home entran desde MARCA.producto y MARCA.dirigidoPor.
const OPCIONES = { producto: 'Revisión Experta', dirigidoPor: 'la Dra. Prueba' };

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

const LAB_SIN_REVISAR: LaboratorioHome = {
  estado: 'procesado',
  fecha: '2026-10-03T12:00:00.000Z',
  valores: 12,
  informeId: 'dr1',
  revisionMedica: false,
};
const LAB_REVISADO: LaboratorioHome = { ...LAB_SIN_REVISAR, revisionMedica: true };
const LAB_EN_PROCESO: LaboratorioHome = {
  estado: 'en-proceso',
  fecha: '2026-10-09T12:00:00.000Z',
  revisionMedica: false,
};

const PREVENT_ESTIMADO: PreventEstimado = { ascvd10: 0.052, hf10: 0.031, total30: 0.18, faltantes: [] };

// Sábado 17 de octubre a las 10:30 de Argentina (13:30 UTC).
const TURNO_TELECONSULTA: ProximoTurno = { id: 'appt-1', inicio: '2026-10-17T13:30:00.000Z', teleconsulta: true };
const TURNO_EN_EL_CENTRO: ProximoTurno = { id: 'appt-2', inicio: '2026-10-17T13:30:00.000Z', teleconsulta: false };

function plan(cambios: Partial<PlanBienestar> = {}): PlanBienestar {
  return {
    dia: 63,
    totalDias: 100,
    inicio: '2026-08-09',
    fin: '2026-11-17',
    terminado: false,
    hitos: [],
    semanasActivas: 9,
    rachaActual: 4,
    ...cambios,
  };
}

function som(estado: SegundaOpinionHome['estado'], cambios: Partial<SegundaOpinionHome> = {}): SegundaOpinionHome {
  const etiqueta = {
    'en-analisis': 'En análisis',
    completada: 'Completada',
    cancelada: 'Cancelada',
    otro: 'En pausa',
  }[estado];
  return { id: 'som-1', estado, etiqueta, pedida: '2026-10-01T13:00:00.000Z', firmada: false, ...cambios };
}

/** Una paciente que todavía no cargó nada: sin plan, sin Segunda Opinión y sin turnos. */
function datos(cambios: Partial<DatosHomeE> = {}): DatosHomeE {
  return {
    cargando: false,
    esPaciente: true,
    nombre: 'Ana',
    hoy: HOY,
    consentimiento: 'firmado',
    ingresoPendiente: false,
    novedadesSinLeer: 0,
    ...cambios,
  };
}

const PROFESIONAL: DatosHomeE = {
  cargando: false,
  esPaciente: false,
  hoy: HOY,
  consentimiento: 'firmado',
  ingresoPendiente: false,
  novedadesSinLeer: 0,
};

function camino(d: DatosHomeE, clave: ClaveCamino): Camino {
  const encontrado = caminosDe(d, OPCIONES).find((c) => c.clave === clave);
  if (!encontrado) {
    throw new Error(`Falta el camino ${clave}`);
  }
  return encontrado;
}

describe('subioDatos: un laboratorio en PDF o algún hábito con puntaje', () => {
  test('sin nada cargado, no', () => {
    expect(subioDatos(datos())).toBe(false);
    expect(subioDatos(datos({ le8: le8(0) }))).toBe(false);
  });

  test('con un solo hábito con puntaje, sí', () => {
    expect(subioDatos(datos({ le8: le8(1) }))).toBe(true);
  });

  test.each([
    ['en proceso', LAB_EN_PROCESO],
    ['leído por IA, sin revisar', LAB_SIN_REVISAR],
    ['revisado por el equipo', LAB_REVISADO],
  ])('con un laboratorio %s, sí', (_caso, laboratorio) => {
    expect(subioDatos(datos({ laboratorio }))).toBe(true);
  });
});

describe('devolucionPendiente: algo concreto que revisar con un médico, sin turno', () => {
  test('sin nada cargado, no hay nada que revisar', () => {
    expect(devolucionPendiente(datos())).toBe(false);
  });

  test('un laboratorio que leyó un agente de IA y ningún médico revisó', () => {
    expect(devolucionPendiente(datos({ laboratorio: LAB_SIN_REVISAR }))).toBe(true);
  });

  test('un PREVENT estimado con sus datos (sin revisión médica)', () => {
    expect(devolucionPendiente(datos({ preventEstimado: PREVENT_ESTIMADO }))).toBe(true);
  });

  test('un laboratorio todavía en proceso: aún no hay resultados que revisar', () => {
    expect(devolucionPendiente(datos({ laboratorio: LAB_EN_PROCESO }))).toBe(false);
  });

  test('un laboratorio que ya revisó el equipo médico', () => {
    expect(devolucionPendiente(datos({ laboratorio: LAB_REVISADO }))).toBe(false);
  });

  test('solo hábitos respondidos (sin laboratorio ni PREVENT): no hay resultados que revisar', () => {
    expect(devolucionPendiente(datos({ le8: le8(8) }))).toBe(false);
  });

  test.each([
    ['por videollamada', TURNO_TELECONSULTA],
    ['en el centro', TURNO_EN_EL_CENTRO],
  ])('con un turno %s, no: lo revisan en ese turno', (_caso, proximoTurno) => {
    expect(
      devolucionPendiente(datos({ laboratorio: LAB_SIN_REVISAR, preventEstimado: PREVENT_ESTIMADO, proximoTurno }))
    ).toBe(false);
  });

  test('con la Segunda Opinión en análisis, no: la devolución llega con su informe', () => {
    const d = datos({
      laboratorio: LAB_SIN_REVISAR,
      preventEstimado: PREVENT_ESTIMADO,
      segundaOpinion: som('en-analisis'),
    });
    expect(devolucionPendiente(d)).toBe(false);
  });

  test.each(['completada', 'otro'] as const)('una Segunda Opinión %s no frena la devolución', (estado) => {
    expect(devolucionPendiente(datos({ laboratorio: LAB_SIN_REVISAR, segundaOpinion: som(estado) }))).toBe(true);
  });
});

describe('caminoRecomendado: uno solo, o ninguno', () => {
  test.each([
    ['con un laboratorio', { laboratorio: LAB_SIN_REVISAR }],
    ['con hábitos respondidos', { le8: le8(3) }],
    [
      'aunque ya tenga plan y Segunda Opinión firmada',
      { le8: le8(3), plan: plan(), segundaOpinion: som('completada') },
    ],
  ] as const)('1. subió datos y no tiene turno → la teleconsulta (%s)', (_caso, cambios) => {
    expect(caminoRecomendado(datos(cambios))).toBe('teleconsulta');
  });

  test('2. no subió nada y no tiene plan → el plan', () => {
    expect(caminoRecomendado(datos())).toBe('plan');
    expect(caminoRecomendado(datos({ le8: le8(0) }))).toBe('plan');
  });

  test('2. subió datos pero ya tiene turno y no tiene plan → el plan', () => {
    expect(caminoRecomendado(datos({ laboratorio: LAB_SIN_REVISAR, proximoTurno: TURNO_TELECONSULTA }))).toBe('plan');
  });

  test('3. con plan y sin Segunda Opinión → la Segunda Opinión', () => {
    expect(caminoRecomendado(datos({ plan: plan() }))).toBe('segunda-opinion');
    const conTurno = datos({ plan: plan(), le8: le8(8), proximoTurno: TURNO_EN_EL_CENTRO });
    expect(caminoRecomendado(conTurno)).toBe('segunda-opinion');
  });

  test.each(['en-analisis', 'completada', 'otro'] as const)(
    '4. con plan y una Segunda Opinión %s (sin datos nuevos o con turno) → ninguno',
    (estado) => {
      expect(caminoRecomendado(datos({ plan: plan(), segundaOpinion: som(estado) }))).toBeUndefined();
      const conTurno = datos({
        plan: plan(),
        segundaOpinion: som(estado),
        laboratorio: LAB_SIN_REVISAR,
        proximoTurno: TURNO_TELECONSULTA,
      });
      expect(caminoRecomendado(conTurno)).toBeUndefined();
    }
  );

  test('un profesional (sin datos de paciente) → ninguno', () => {
    expect(caminoRecomendado(PROFESIONAL)).toBeUndefined();
  });
});

describe('caminosDe: los tres caminos, en orden', () => {
  test('1 el plan, 2 la Segunda Opinión, 3 la teleconsulta', () => {
    const caminos = caminosDe(datos(), OPCIONES);
    expect(caminos.map((c) => [c.numero, c.clave, c.titulo])).toEqual([
      [1, 'plan', 'Plan Bienestar · 100 días'],
      [2, 'segunda-opinion', 'Tu Revisión Experta'],
      [3, 'teleconsulta', 'Teleconsulta por videollamada'],
    ]);
  });

  test.each([
    ['sin nada cargado', datos(), 'plan'],
    ['con datos sin turno', datos({ laboratorio: LAB_SIN_REVISAR, plan: plan() }), 'teleconsulta'],
    ['con plan, sin Segunda Opinión', datos({ plan: plan() }), 'segunda-opinion'],
    ['con plan y Segunda Opinión', datos({ plan: plan(), segundaOpinion: som('en-analisis') }), undefined],
    ['un profesional', PROFESIONAL, undefined],
  ] as const)('a lo sumo uno va como recomendado: %s → %s', (_caso, d, clave) => {
    const recomendados = caminosDe(d, OPCIONES).filter((c) => c.recomendado);
    expect(recomendados.map((c) => c.clave)).toEqual(clave ? [clave] : []);
  });

  test('el nombre del servicio y quién dirige el equipo entran por parámetro', () => {
    const segunda = camino(datos(), 'segunda-opinion');
    expect(segunda.titulo).toBe('Tu Revisión Experta');
    expect(segunda.cta).toBe('Pedir mi Revisión Experta');
    expect(segunda.descripcion).toContain('Nuestro equipo médico, dirigido por la Dra. Prueba, analiza tu caso');
    expect(segunda.descripcion).toContain('un informe con tu riesgo cardiovascular');
    // No promete una firma que el backend no registra (ver tipos.ts: completada ≠ firmada).
    expect(segunda.descripcion).not.toMatch(/firmad/);
  });

  describe('1. Plan Bienestar · 100 días', () => {
    test('sin plan: invita a empezarlo', () => {
      const c = camino(datos(), 'plan');
      expect(c).toMatchObject({ cta: 'Empezar mi Plan Bienestar', href: '/care-plan/plan-100-dias' });
      expect(c.estado).toBeUndefined();
      expect(c.descripcion).toContain('Un programa guiado de 100 días');
    });

    test('en curso: el día en que va', () => {
      expect(camino(datos({ plan: plan() }), 'plan')).toMatchObject({
        estado: 'Día 63 de 100',
        cta: 'Seguir mi plan',
        href: '/care-plan/plan-100-dias',
      });
    });

    test('terminado: lo completó', () => {
      expect(camino(datos({ plan: plan({ dia: 101, terminado: true }) }), 'plan')).toMatchObject({
        estado: '¡Completaste los 100 días!',
        cta: 'Seguir mi plan',
        href: '/care-plan/plan-100-dias',
      });
    });
  });

  describe('2. La Segunda Opinión', () => {
    test('sin pedir: pedirla', () => {
      const c = camino(datos(), 'segunda-opinion');
      expect(c).toMatchObject({ cta: 'Pedir mi Revisión Experta', href: '/solicitar-som' });
      expect(c.estado).toBeUndefined();
    });

    test('en análisis: desde cuándo, y verla', () => {
      expect(camino(datos({ segundaOpinion: som('en-analisis') }), 'segunda-opinion')).toMatchObject({
        estado: 'En análisis desde el 1 de octubre',
        cta: 'Ver mi Revisión Experta',
        href: '/mi-segunda-opinion',
      });
    });

    test('en análisis: la fecha del pedido es la de Argentina', () => {
      // 01:00 UTC del 2 de octubre = 22:00 del 1 de octubre en Argentina.
      const tarde = som('en-analisis', { pedida: '2026-10-02T01:00:00.000Z' });
      expect(camino(datos({ segundaOpinion: tarde }), 'segunda-opinion').estado).toBe(
        'En análisis desde el 1 de octubre'
      );
      // Una fecha sin hora se toma tal cual.
      const sinHora = som('en-analisis', { pedida: '2026-09-01' });
      expect(camino(datos({ segundaOpinion: sinHora }), 'segunda-opinion').estado).toBe(
        'En análisis desde el 1 de septiembre'
      );
    });

    test('en análisis sin fecha de pedido (o ilegible): solo la etiqueta', () => {
      for (const pedida of [undefined, 'no-es-fecha']) {
        const c = camino(datos({ segundaOpinion: som('en-analisis', { pedida }) }), 'segunda-opinion');
        expect(c.estado).toBe('En análisis');
      }
    });

    test('completada sin firma médica registrada: el informe está listo (no «firmado»), y verlo', () => {
      expect(camino(datos({ segundaOpinion: som('completada') }), 'segunda-opinion')).toMatchObject({
        estado: 'Tu informe está listo',
        cta: 'Ver mi informe',
        href: '/mi-segunda-opinion',
      });
    });

    test('completada con la firma médica registrada: el informe está firmado', () => {
      const c = camino(datos({ segundaOpinion: som('completada', { firmada: true }) }), 'segunda-opinion');
      expect(c.estado).toBe('Tu informe está firmado');
    });

    test('cancelada: como si no la hubiera pedido, se ofrece pedirla otra vez', () => {
      expect(camino(datos({ segundaOpinion: som('cancelada') }), 'segunda-opinion')).toMatchObject({
        cta: 'Pedir mi Revisión Experta',
        href: '/solicitar-som',
      });
      expect(camino(datos({ segundaOpinion: som('cancelada') }), 'segunda-opinion').estado).toBeUndefined();
    });

    test('en otro estado: su etiqueta, y verla', () => {
      expect(camino(datos({ segundaOpinion: som('otro') }), 'segunda-opinion')).toMatchObject({
        estado: 'En pausa',
        cta: 'Ver mi Revisión Experta',
        href: '/mi-segunda-opinion',
      });
    });
  });

  describe('3. La teleconsulta', () => {
    test('sin turno: reservarla por videollamada', () => {
      const c = camino(datos(), 'teleconsulta');
      expect(c).toMatchObject({ cta: 'Reservar mi teleconsulta', href: '/get-care?modalidad=teleconsulta' });
      expect(c.estado).toBeUndefined();
      expect(c.descripcion).toMatch(/^Por videollamada, desde donde estés/);
    });

    test('si ya subió datos, le dice que los revisamos juntos', () => {
      const c = camino(datos({ laboratorio: LAB_SIN_REVISAR }), 'teleconsulta');
      expect(c.descripcion).toMatch(/^Ya tenemos tus datos\. Revisémoslos juntos por videollamada/);
      expect(c).toMatchObject({ cta: 'Reservar mi teleconsulta', recomendado: true });
    });

    test('con una teleconsulta reservada: cuándo es, y entrar a verla', () => {
      const c = camino(datos({ le8: le8(8), proximoTurno: TURNO_TELECONSULTA }), 'teleconsulta');
      expect(c).toMatchObject({
        estado: `Tu turno: ${fechaHoraTurno(TURNO_TELECONSULTA.inicio)}`,
        cta: 'Ver mi teleconsulta',
        href: '/teleconsulta/appt-1',
        recomendado: false,
      });
      expect(c.estado).toContain('17 de octubre');
    });

    test('con un turno en el centro: cuándo es, y ver los turnos', () => {
      const c = camino(datos({ le8: le8(8), proximoTurno: TURNO_EN_EL_CENTRO }), 'teleconsulta');
      expect(c).toMatchObject({
        estado: `Tu turno: ${fechaHoraTurno(TURNO_EN_EL_CENTRO.inicio)}`,
        cta: 'Ver mis turnos',
        href: '/membership',
        recomendado: false,
      });
    });
  });
});

describe('fechaHoraTurno: día y hora en Argentina, con reloj de 24 horas como el resto del portal', () => {
  test('a la mañana', () => {
    expect(fechaHoraTurno('2026-10-17T13:30:00.000Z')).toMatch(/^sábado,? 17 de octubre,? 10:30$/);
  });

  test('a la noche: en UTC ya es domingo, en Argentina sigue siendo sábado', () => {
    expect(fechaHoraTurno('2026-10-18T02:00:00.000Z')).toMatch(/^sábado,? 17 de octubre,? 23:00$/);
  });

  test('una fecha ilegible no muestra nada', () => {
    expect(fechaHoraTurno('no-es-fecha')).toBe('');
  });
});

describe('la devolución: una vez revisados los datos, no se le vuelve a pedir que reserve', () => {
  // El laboratorio y el PREVENT estimado llegan juntos: el estimado sale de esos mismos valores.
  const CON_DATOS = { laboratorio: LAB_SIN_REVISAR, preventEstimado: PREVENT_ESTIMADO };

  test('sin consulta posterior a su laboratorio: la devolución está pendiente', () => {
    expect(devolucionPendiente(datos(CON_DATOS))).toBe(true);
    // Una consulta de antes de mandar el laboratorio no cuenta.
    expect(devolucionDada(datos({ ...CON_DATOS, ultimaConsulta: { inicio: '2026-09-20T13:00:00.000Z' } }))).toBe(false);
  });

  test('con una consulta después de su laboratorio: la devolución ya se dio', () => {
    const d = datos({ ...CON_DATOS, plan: plan(), ultimaConsulta: { inicio: '2026-10-05T13:00:00.000Z' } });
    expect(devolucionDada(d)).toBe(true);
    expect(devolucionPendiente(d)).toBe(false);
    expect(puedeOfrecerTeleconsulta(d)).toBe(false);
    // Ya no se la recomienda: se vuelve a lo que le falta (la Segunda Opinión, con plan).
    expect(caminoRecomendado(d)).toBe('segunda-opinion');
    const tele = camino(d, 'teleconsulta');
    expect(tele.estado).toBe('Tu última consulta: 5 de octubre');
    expect(tele.cta).toBe('Reservar otra teleconsulta');
  });

  test('con la Segunda Opinión en análisis: la devolución llega con su informe, no se empuja la teleconsulta', () => {
    const d = datos({ ...CON_DATOS, plan: plan(), segundaOpinion: som('en-analisis') });
    expect(puedeOfrecerTeleconsulta(d)).toBe(false);
    expect(devolucionPendiente(d)).toBe(false);
    expect(caminoRecomendado(d)).toBeUndefined();
    expect(camino(d, 'teleconsulta').recomendado).toBe(false);
  });

  test('un PDF que el bot no pudo leer (demorado) no cuenta como datos subidos', () => {
    const demorado: LaboratorioHome = { estado: 'demorado', fecha: LAB_SIN_REVISAR.fecha, revisionMedica: false };
    expect(subioDatos(datos({ laboratorio: demorado }))).toBe(false);
    expect(caminoRecomendado(datos({ laboratorio: demorado }))).toBe('plan');
  });

  test('una Segunda Opinión cancelada no cuenta como pedida; una en pausa, sí', () => {
    expect(pidioSegundaOpinion(datos({ segundaOpinion: som('cancelada') }))).toBe(false);
    expect(pidioSegundaOpinion(datos({ segundaOpinion: som('otro') }))).toBe(true);
    expect(caminoRecomendado(datos({ plan: plan(), segundaOpinion: som('cancelada') }))).toBe('segunda-opinion');
  });

  test('la teleconsulta dice qué tiene costo (salvo con un turno ya reservado)', () => {
    expect(camino(datos(), 'teleconsulta').nota).toBe(NOTA_COSTO_TELECONSULTA);
    expect(camino(datos({ proximoTurno: TURNO_TELECONSULTA }), 'teleconsulta').nota).toBeUndefined();
    // No promete «tu equipo médico»: la reserva abre el catálogo de profesionales.
    expect(camino(datos(CON_DATOS), 'teleconsulta').descripcion).toContain('un profesional de nuestro equipo');
  });
});
