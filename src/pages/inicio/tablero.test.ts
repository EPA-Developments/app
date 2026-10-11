// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import type {
  Communication,
  DiagnosticReport,
  DocumentReference,
  Observation,
  QuestionnaireResponse,
  ServiceRequest,
} from '@medplum/fhirtypes';
import { CODIGOS_CASA } from '../../fhir/datosDeSalud';
import { NOTIFICACION_SYSTEM } from '../../fhir/notificaciones';
import { SOM_INTAKE_URL } from '../../fhir/som';
import { LE8_QUESTIONNAIRES } from '../../le8';
import { MARCA } from '../../marca';
import { INTAKE_QUESTIONNAIRE_URL } from '../intake.questionnaire';
import type { CargaTablero, FuentesTablero } from './tablero';
import {
  fechaDelTablero,
  filasDeCuestionarios,
  filasDeEstudios,
  filasDeMediciones,
  filasDeNovedades,
  filasDeSegundaOpinion,
  filasTablero,
  informesALeer,
  MAX_FILAS,
  NOMBRE_MEDICION,
  nombreMediciones,
  NOTA_INFORME_EN_CAMINO,
  NOTA_INFORME_SIN_FIRMA,
  NOTA_LABORATORIO_SIN_REVISION,
  NOTA_PDF_DEMORADO,
  nuevasDesde,
  ordenarFilas,
  siguienteTablero,
} from './tablero';
import type { FilaTablero } from './tipos';

const HOY = '2026-10-10';
// Sábado 10 de octubre, 12:00 de Argentina.
const AHORA = new Date('2026-10-10T15:00:00.000Z');
const PRODUCTO = 'Segunda Opinión';

// ─── Fixtures (datos ficticios) ──────────────────────────────────────────────────────

function pdf(id: string, cambios: Partial<DocumentReference> = {}): DocumentReference {
  return {
    resourceType: 'DocumentReference',
    id,
    status: 'current',
    date: '2026-10-03T12:00:00.000Z',
    meta: { lastUpdated: '2026-10-03T12:00:00.000Z' },
    content: [{ attachment: { contentType: 'application/pdf' } }],
    ...cambios,
  };
}

/** Un PDF que el bot ya procesó (sumó su DiagnosticReport a `context.related`). */
function pdfProcesado(id: string, informeId: string, cambios: Partial<DocumentReference> = {}): DocumentReference {
  return pdf(id, {
    context: { related: [{ reference: `DiagnosticReport/${informeId}` }] },
    meta: { lastUpdated: '2026-10-03T12:06:00.000Z' },
    ...cambios,
  });
}

function informeLab(id: string, valores: number, cambios: Partial<DiagnosticReport> = {}): DiagnosticReport {
  return {
    resourceType: 'DiagnosticReport',
    id,
    status: 'final',
    code: { text: 'Laboratorio' },
    issued: '2026-10-03T12:05:00.000Z',
    meta: { lastUpdated: '2026-10-03T12:05:00.000Z' },
    result: Array.from({ length: valores }, (_, i) => ({ reference: `Observation/o${i}` })),
    ...cambios,
  };
}

function pedido(id: string, status: ServiceRequest['status'], authoredOn: string): ServiceRequest {
  return {
    resourceType: 'ServiceRequest',
    id,
    status,
    intent: 'order',
    subject: { reference: 'Patient/p1' },
    authoredOn,
    meta: { lastUpdated: authoredOn },
  };
}

function respuesta(
  id: string,
  questionnaire: string,
  cambios: Partial<QuestionnaireResponse> = {}
): QuestionnaireResponse {
  return {
    resourceType: 'QuestionnaireResponse',
    id,
    status: 'completed',
    questionnaire,
    authored: '2026-09-25T14:00:00.000Z',
    meta: { lastUpdated: '2026-09-25T14:00:00.000Z' },
    ...cambios,
  };
}

function medicion(
  id: string,
  code: string,
  effectiveDateTime: string,
  cambios: Partial<Observation> = {}
): Observation {
  return {
    resourceType: 'Observation',
    id,
    status: 'preliminary',
    code: { coding: [{ system: 'http://loinc.org', code }] },
    effectiveDateTime,
    meta: { lastUpdated: effectiveDateTime },
    ...cambios,
  };
}

function novedad(id: string, code: string, cambios: Partial<Communication> = {}): Communication {
  return {
    resourceType: 'Communication',
    id,
    status: 'in-progress',
    sent: '2026-10-04T13:00:00.000Z',
    category: [{ coding: [{ system: NOTIFICACION_SYSTEM, code }] }],
    ...cambios,
  };
}

function fila(id: string, cambios: Partial<FilaTablero> = {}): FilaTablero {
  return {
    id,
    sentido: 'salida',
    recurso: 'Observation',
    que: 'Peso',
    ruta: 'Tu app → Tu tablero',
    estado: 'Registrado',
    tono: 'listo',
    ...cambios,
  };
}

const ok = <T>(value: T): PromiseFulfilledResult<T> => ({ status: 'fulfilled', value });
const falla: PromiseRejectedResult = { status: 'rejected', reason: new Error('sin conexión') };

// ─── PDFs de laboratorio ─────────────────────────────────────────────────────────────

describe('filasDeEstudios: una salida por PDF y la llegada de sus valores', () => {
  test('recién mandado: salida «En proceso», sin llegada todavía', () => {
    const [salida, ...resto] = filasDeEstudios([pdf('d1')], new Map(), new Date('2026-10-03T12:30:00.000Z'));
    expect(resto).toEqual([]);
    expect(salida).toEqual({
      id: 'DocumentReference/d1',
      sentido: 'salida',
      recurso: 'DocumentReference',
      fecha: '2026-10-03T12:00:00.000Z',
      actualizada: '2026-10-03T12:00:00.000Z',
      que: 'PDF de laboratorio',
      ruta: 'Tu app → Agente de laboratorio',
      estado: 'En proceso',
      tono: 'en-curso',
      href: '/enviar-estudios',
    });
  });

  test('más de un día sin resultado: «Demorado», con la misma frase que la Home E', () => {
    const [salida] = filasDeEstudios([pdf('d1')], new Map(), AHORA);
    expect(salida).toMatchObject({ estado: 'Demorado', tono: 'demorado', nota: NOTA_PDF_DEMORADO });
    expect(NOTA_PDF_DEMORADO).toBe('Lo estamos revisando. Si no pudimos leerlo, te escribimos por Mensajes.');
  });

  test('procesado: «Procesado» y la llegada con los valores que leyó el agente, sin revisión médica', () => {
    const filas = filasDeEstudios([pdfProcesado('d1', 'dr1')], new Map([['dr1', informeLab('dr1', 14)]]), AHORA);
    expect(filas).toHaveLength(2);
    expect(filas[0]).toMatchObject({ id: 'DocumentReference/d1', estado: 'Procesado', tono: 'listo' });
    expect(filas[0]?.nota).toBeUndefined();
    expect(filas[1]).toEqual({
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
    });
    expect(NOTA_LABORATORIO_SIN_REVISION).toBe(
      'Estos valores los leyó un agente de IA de tu PDF. Todavía no los revisó un médico.'
    );
  });

  test('revisado por un médico (final y con resultsInterpreter): «listo», sin la nota', () => {
    const revisado = informeLab('dr1', 1, { resultsInterpreter: [{ reference: 'Practitioner/m1' }] });
    const [, llegada] = filasDeEstudios([pdfProcesado('d1', 'dr1')], new Map([['dr1', revisado]]), AHORA);
    expect(llegada).toMatchObject({ estado: 'Listo: 1 valor', tono: 'listo' });
    expect(llegada?.nota).toBeUndefined();
    // `preliminary` con intérprete tampoco es una revisión: el mismo criterio que laboratorioHome.
    const preliminar = { ...revisado, status: 'preliminary' as const };
    const [, sinRevision] = filasDeEstudios([pdfProcesado('d1', 'dr1')], new Map([['dr1', preliminar]]), AHORA);
    expect(sinRevision).toMatchObject({ tono: 'atencion', nota: NOTA_LABORATORIO_SIN_REVISION });
  });

  test('sin el informe (no se leyó): «Listo», con la fecha en que el bot lo sumó al PDF', () => {
    const [, llegada] = filasDeEstudios([pdfProcesado('d1', 'dr1')], new Map(), AHORA);
    expect(llegada).toMatchObject({
      id: 'DiagnosticReport/dr1',
      estado: 'Listo',
      tono: 'atencion',
      fecha: '2026-10-03T12:06:00.000Z',
    });
  });

  test('un informe sin valores no dice «0 valores»', () => {
    const [, llegada] = filasDeEstudios([pdfProcesado('d1', 'dr1')], new Map([['dr1', informeLab('dr1', 0)]]));
    expect(llegada?.estado).toBe('Listo: sin valores');
  });

  test('un PDF cargado por error no es un envío', () => {
    expect(filasDeEstudios([pdf('d1', { status: 'entered-in-error' })], new Map(), AHORA)).toEqual([]);
  });

  test('informesALeer: solo los DiagnosticReport de los 3 PDFs procesados más nuevos', () => {
    const docs = [
      pdf('d0'),
      pdfProcesado('d1', 'dr1'),
      pdfProcesado('d2', 'dr2'),
      pdfProcesado('d3', 'dr3', { status: 'entered-in-error' }),
      pdfProcesado('d4', 'dr4'),
      pdfProcesado('d5', 'dr5'),
    ];
    expect(informesALeer(docs)).toEqual(['dr1', 'dr2', 'dr4']);
  });
});

// ─── Segunda Opinión ─────────────────────────────────────────────────────────────────

describe('filasDeSegundaOpinion: los pedidos y la llegada del informe', () => {
  test('en análisis: la salida con ESTADO_SOM y el informe «En camino», sin fecha ni plazo', () => {
    const filas = filasDeSegundaOpinion([pedido('s1', 'active', '2026-09-28T13:00:00.000Z')], undefined, PRODUCTO);
    expect(filas).toEqual([
      {
        id: 'ServiceRequest/s1',
        sentido: 'salida',
        recurso: 'ServiceRequest',
        fecha: '2026-09-28T13:00:00.000Z',
        actualizada: '2026-09-28T13:00:00.000Z',
        que: `Pedido de ${PRODUCTO}`,
        ruta: 'Tu app → Agentes de IA y equipo médico',
        estado: 'En análisis',
        tono: 'en-curso',
        href: '/mi-segunda-opinion',
      },
      {
        id: 'ServiceRequest/s1#llegada',
        sentido: 'llegada',
        recurso: 'ServiceRequest',
        que: `Informe de ${PRODUCTO}`,
        ruta: `Llegada → Mi ${PRODUCTO}`,
        estado: 'En camino',
        tono: 'en-curso',
        nota: NOTA_INFORME_EN_CAMINO,
        href: '/mi-segunda-opinion',
      },
    ]);
    expect(NOTA_INFORME_EN_CAMINO).toBe('Te avisamos en Novedades cuando esté listo.');
  });

  test('completada sin firma médica registrada: «Listo» (nunca «Firmado») y preparado con IA', () => {
    const informe: DiagnosticReport = {
      resourceType: 'DiagnosticReport',
      id: 'inf1',
      status: 'final',
      code: { text: 'Informe' },
      issued: '2026-10-05T10:00:00.000Z',
      meta: { lastUpdated: '2026-10-05T10:01:00.000Z' },
    };
    const filas = filasDeSegundaOpinion([pedido('s1', 'completed', '2026-09-28T13:00:00.000Z')], informe, PRODUCTO);
    expect(filas[0]).toMatchObject({ estado: 'Completada', tono: 'listo' });
    expect(filas[1]).toMatchObject({
      id: 'DiagnosticReport/inf1',
      recurso: 'DiagnosticReport',
      fecha: '2026-10-05T10:00:00.000Z',
      actualizada: '2026-10-05T10:01:00.000Z',
      estado: 'Listo',
      tono: 'atencion',
      nota: NOTA_INFORME_SIN_FIRMA,
    });
  });

  test('completada con la firma de un médico (final + resultsInterpreter Practitioner): «Firmado»', () => {
    const firmado: DiagnosticReport = {
      resourceType: 'DiagnosticReport',
      id: 'inf1',
      status: 'final',
      code: { text: 'Informe' },
      issued: '2026-10-05T10:00:00.000Z',
      resultsInterpreter: [{ reference: 'Practitioner/m1' }],
    };
    const [, llegada] = filasDeSegundaOpinion(
      [pedido('s1', 'completed', '2026-09-28T13:00:00.000Z')],
      firmado,
      PRODUCTO
    );
    expect(llegada).toMatchObject({ estado: 'Firmado', tono: 'listo' });
    expect(llegada?.nota).toBeUndefined();
    // Un Organization como intérprete no es una firma médica.
    const deOrganizacion = { ...firmado, resultsInterpreter: [{ reference: 'Organization/o1' }] };
    const [, sinFirma] = filasDeSegundaOpinion(
      [pedido('s1', 'completed', '2026-09-28T13:00:00.000Z')],
      deOrganizacion,
      PRODUCTO
    );
    expect(sinFirma?.estado).toBe('Listo');
  });

  test('completada sin poder leer el informe: «Listo», con la fecha de la orden', () => {
    const sr = {
      ...pedido('s1', 'completed', '2026-09-28T13:00:00.000Z'),
      meta: { lastUpdated: '2026-10-05T09:00:00Z' },
    };
    const [, llegada] = filasDeSegundaOpinion([sr], undefined, PRODUCTO);
    expect(llegada).toMatchObject({
      id: 'ServiceRequest/s1#llegada',
      estado: 'Listo',
      fecha: '2026-10-05T09:00:00Z',
    });
  });

  test('cancelada, en pausa o borrador: solo la salida, en tono neutro', () => {
    for (const [status, etiqueta] of [
      ['revoked', 'Cancelada'],
      ['on-hold', 'En pausa'],
      ['draft', 'Borrador'],
    ] as const) {
      const filas = filasDeSegundaOpinion([pedido('s1', status, '2026-09-28T13:00:00.000Z')], undefined, PRODUCTO);
      expect(filas).toEqual([expect.objectContaining({ estado: etiqueta, tono: 'neutro' })]);
    }
  });

  test('solo los 5 pedidos más nuevos; la llegada es la del más nuevo', () => {
    const pedidos = [
      pedido('s6', 'active', '2026-10-06T13:00:00.000Z'),
      ...[5, 4, 3, 2, 1].map((n) => pedido(`s${n}`, 'completed', `2026-09-0${n}T13:00:00.000Z`)),
    ];
    const filas = filasDeSegundaOpinion(pedidos, undefined, PRODUCTO);
    expect(filas.filter((f) => f.sentido === 'salida').map((f) => f.id)).toEqual([
      'ServiceRequest/s6',
      'ServiceRequest/s5',
      'ServiceRequest/s4',
      'ServiceRequest/s3',
      'ServiceRequest/s2',
    ]);
    expect(filas.filter((f) => f.sentido === 'llegada')).toEqual([
      expect.objectContaining({ id: 'ServiceRequest/s6#llegada', estado: 'En camino' }),
    ]);
  });

  test('el nombre del servicio sale de la marca', () => {
    const [salida] = filasDeSegundaOpinion([pedido('s1', 'active', '2026-09-28')], undefined, 'Revisión Experta');
    expect(salida?.que).toBe('Pedido de Revisión Experta');
  });
});

// ─── Cuestionarios ───────────────────────────────────────────────────────────────────

describe('filasDeCuestionarios', () => {
  test('los de los 8 hábitos: «Cuestionario de {hábito}», sumados a su LE8', () => {
    const [suenio, alimentacion] = LE8_QUESTIONNAIRES;
    const filas = filasDeCuestionarios([
      respuesta('q1', suenio.url),
      respuesta('q2', `${alimentacion.url}|1.0`, { status: 'amended' }),
    ]);
    expect(filas).toEqual([
      {
        id: 'QuestionnaireResponse/q1',
        sentido: 'salida',
        recurso: 'QuestionnaireResponse',
        fecha: '2026-09-25T14:00:00.000Z',
        actualizada: '2026-09-25T14:00:00.000Z',
        que: 'Cuestionario de calidad del sueño',
        ruta: 'Tu app → Tus 8 hábitos',
        estado: 'Sumado a tu LE8',
        tono: 'listo',
        href: '/health-record/questionnaire-responses/q1',
      },
      expect.objectContaining({ que: 'Cuestionario de alimentación', estado: 'Sumado a tu LE8' }),
    ]);
  });

  test('el de ingreso: guardado en su historia clínica', () => {
    expect(filasDeCuestionarios([respuesta('q1', INTAKE_QUESTIONNAIRE_URL)])).toEqual([
      expect.objectContaining({
        que: 'Cuestionario de ingreso',
        ruta: 'Tu app → Tu historia clínica',
        estado: 'Guardado',
        tono: 'listo',
      }),
    ]);
  });

  test('no van: el de la Segunda Opinión (el pedido ya es su fila), los desconocidos ni los sin terminar', () => {
    const [suenio] = LE8_QUESTIONNAIRES;
    expect(
      filasDeCuestionarios([
        respuesta('q1', SOM_INTAKE_URL),
        respuesta('q2', 'https://example.org/Questionnaire/otro'),
        respuesta('q3', suenio.url, { status: 'in-progress' }),
      ])
    ).toEqual([]);
  });
});

// ─── Mediciones ──────────────────────────────────────────────────────────────────────

describe('filasDeMediciones: una salida por día de Argentina', () => {
  test('presión y peso del mismo día van juntas (el IMC sale del peso: no se nombra)', () => {
    const filas = filasDeMediciones([
      medicion('o1', '85354-9', '2026-10-03T22:00:00.000Z'),
      medicion('o2', '29463-7', '2026-10-03T22:00:00.000Z'),
      medicion('o3', '39156-5', '2026-10-03T22:00:01.000Z'),
    ]);
    expect(filas).toEqual([
      {
        id: 'Observation/o3',
        sentido: 'salida',
        recurso: 'Observation',
        fecha: '2026-10-03T22:00:01.000Z',
        actualizada: '2026-10-03T22:00:01.000Z',
        que: 'Presión y peso',
        ruta: 'Tu app → Tu tablero',
        estado: 'Registrado',
        tono: 'listo',
        href: '/health-record/vitals',
      },
    ]);
  });

  test('agrupa por el día de Argentina, no el de UTC', () => {
    // 01:30 UTC del 4 es 22:30 del 3 en Argentina: mismo día que la medición de la tarde.
    const filas = filasDeMediciones([
      medicion('o1', '8280-0', '2026-10-04T01:30:00.000Z'),
      medicion('o2', '29463-7', '2026-10-03T18:00:00.000Z'),
      medicion('o3', '85354-9', '2026-10-04T12:00:00.000Z'),
    ]);
    expect(filas.map((f) => [f.id, f.que])).toEqual([
      ['Observation/o1', 'Peso y cintura'],
      ['Observation/o3', 'Presión'],
    ]);
  });

  test('no van las cargadas por error ni las que registró un profesional', () => {
    expect(
      filasDeMediciones([
        medicion('o1', '29463-7', '2026-10-03T18:00:00.000Z', { status: 'entered-in-error' }),
        medicion('o2', '29463-7', '2026-10-03T18:00:00.000Z', { performer: [{ reference: 'Practitioner/m1' }] }),
        medicion('o3', '29463-7', '2026-10-03T18:00:00.000Z', { effectiveDateTime: undefined }),
      ])
    ).toEqual([]);
    const propia = medicion('o4', '29463-7', '2026-10-03T18:00:00.000Z', {
      performer: [{ reference: 'Patient/p1' }],
    });
    expect(filasDeMediciones([propia])).toHaveLength(1);
  });

  test('nombreMediciones: en orden, con comas e «y»', () => {
    expect(nombreMediciones(new Set(['29463-7']))).toBe('Peso');
    expect(nombreMediciones(new Set(['8280-0', '29463-7', '85354-9']))).toBe('Presión, peso y cintura');
    expect(nombreMediciones(new Set(['8302-2', '29463-7', '39156-5']))).toBe('Peso y altura');
    expect(nombreMediciones(new Set(['39156-5']))).toBe('IMC');
    expect(nombreMediciones(new Set())).toBe('Mediciones');
  });

  test('cada código que se busca (CODIGOS_CASA) tiene su nombre', () => {
    expect(CODIGOS_CASA.filter((c) => !(c in NOMBRE_MEDICION))).toEqual([]);
  });
});

// ─── Novedades ───────────────────────────────────────────────────────────────────────

describe('filasDeNovedades: cada novedad es una llegada', () => {
  test('sin leer (atención) o leída (neutro), con el destino de la campanita', () => {
    const filas = filasDeNovedades(
      [
        novedad('c1', 'reserva-confirmada', { about: [{ reference: 'Appointment/a1' }] }),
        novedad('c2', 'mensaje-nuevo', { status: 'completed', about: [{ reference: 'Communication/h1' }] }),
      ],
      new Set()
    );
    expect(filas).toEqual([
      {
        id: 'Communication/c1',
        sentido: 'llegada',
        recurso: 'Communication',
        fecha: '2026-10-04T13:00:00.000Z',
        que: 'Turno confirmado',
        ruta: 'Llegada → Novedades',
        estado: 'Sin leer',
        tono: 'atencion',
        href: '/membership',
      },
      expect.objectContaining({ que: 'Mensaje nuevo', estado: 'Leída', tono: 'neutro', href: '/Communication/h1' }),
    ]);
    // Leerla cambia meta.lastUpdated: eso no la vuelve «nueva» (no lleva `actualizada`).
    expect(filas[0]?.actualizada).toBeUndefined();
  });

  test('sin destino, la fila no es un link', () => {
    const [aviso] = filasDeNovedades([novedad('c1', 'general')], new Set());
    expect(aviso?.que).toBe('Aviso');
    expect(aviso && 'href' in aviso).toBe(false);
  });

  test('«resultados listos» de un informe que ya es fila no se repite; si no lo es, va', () => {
    const resultados = novedad('c1', 'resultados-listos', { about: [{ reference: 'DiagnosticReport/dr1' }] });
    expect(filasDeNovedades([resultados], new Set(['DiagnosticReport/dr1']))).toEqual([]);
    expect(filasDeNovedades([resultados], new Set(['DiagnosticReport/otro']))).toHaveLength(1);
  });
});

// ─── El tablero entero ───────────────────────────────────────────────────────────────

describe('filasTablero y ordenarFilas', () => {
  function fuentes(cambios: Partial<FuentesTablero> = {}): FuentesTablero {
    return {
      estudios: ok({
        documentos: [pdfProcesado('d1', 'dr1')],
        informes: new Map([['dr1', informeLab('dr1', 14)]]),
      }),
      segundaOpinion: ok({ pedidos: [pedido('s1', 'active', '2026-09-28T13:00:00.000Z')] }),
      cuestionarios: ok([respuesta('q1', LE8_QUESTIONNAIRES[0].url)]),
      mediciones: ok([medicion('o1', '85354-9', '2026-10-03T22:00:00.000Z')]),
      novedades: ok([
        novedad('c1', 'resultados-listos', { about: [{ reference: 'DiagnosticReport/dr1' }] }),
        novedad('c2', 'pago-recibido', { sent: '2026-10-08T12:00:00.000Z' }),
      ]),
      ...cambios,
    };
  }

  test('de la más nueva a la más vieja; lo que todavía no llegó, al final', () => {
    const { filas, incompleto } = filasTablero(fuentes(), { producto: PRODUCTO, ahora: AHORA });
    expect(incompleto).toBe(false);
    expect(filas.map((f) => `${f.id} · ${f.estado}`)).toEqual([
      'Communication/c2 · Sin leer',
      'Observation/o1 · Registrado',
      'DiagnosticReport/dr1 · Listo: 14 valores',
      'DocumentReference/d1 · Procesado',
      'ServiceRequest/s1 · En análisis',
      'QuestionnaireResponse/q1 · Sumado a tu LE8',
      'ServiceRequest/s1#llegada · En camino',
    ]);
  });

  test('si una consulta falla, el resto se muestra y el tablero queda incompleto', () => {
    const { filas, incompleto } = filasTablero(fuentes({ segundaOpinion: falla, mediciones: falla }), {
      producto: PRODUCTO,
      ahora: AHORA,
    });
    expect(incompleto).toBe(true);
    expect(filas.map((f) => f.recurso)).toEqual([
      'Communication',
      'DiagnosticReport',
      'DocumentReference',
      'QuestionnaireResponse',
    ]);
  });

  test('como mucho MAX_FILAS (las más nuevas)', () => {
    const muchas = Array.from({ length: 30 }, (_, i) =>
      medicion(`o${i}`, '29463-7', new Date(Date.UTC(2026, 8, 1 + i, 15)).toISOString())
    );
    const { filas } = filasTablero(fuentes({ mediciones: ok(muchas) }), { producto: PRODUCTO, ahora: AHORA });
    expect(MAX_FILAS).toBe(20);
    expect(filas).toHaveLength(MAX_FILAS);
    expect(filas.some((f) => f.id === 'Observation/o29')).toBe(true);
    expect(filas.some((f) => f.id === 'Observation/o0')).toBe(false);
  });

  test('con la misma fecha, primero la llegada; después, por id', () => {
    const misma = '2026-10-03T12:00:00.000Z';
    const orden = ordenarFilas([
      fila('b', { fecha: misma }),
      fila('a', { fecha: misma }),
      fila('c', { fecha: misma, sentido: 'llegada' }),
      fila('sin-fecha'),
      fila('fecha-sola', { fecha: '2026-10-03' }),
    ]).map((f) => f.id);
    // Una fecha sin hora es el mediodía de Argentina (15:00 UTC): después de las 12:00 UTC.
    expect(orden).toEqual(['fecha-sola', 'c', 'a', 'b', 'sin-fecha']);
  });
});

describe('nuevasDesde y siguienteTablero: lo que cambió desde la última visita', () => {
  const filas = [
    fila('vieja', { fecha: '2026-10-01T12:00:00.000Z' }),
    fila('editada', { fecha: '2026-10-01T12:00:00.000Z', actualizada: '2026-10-09T12:00:00.000Z' }),
    fila('reciente', { fecha: '2026-10-09T13:00:00.000Z' }),
    fila('sin-fecha'),
  ];

  test('en la primera visita (sin dato guardado), ninguna', () => {
    expect(nuevasDesde(filas, undefined).size).toBe(0);
    expect(nuevasDesde(filas, 'cualquier cosa').size).toBe(0);
  });

  test('las que se actualizaron (o, sin `actualizada`, se fecharon) después de la visita', () => {
    expect([...nuevasDesde(filas, '2026-10-05T00:00:00.000Z')]).toEqual(['editada', 'reciente']);
    expect(nuevasDesde(filas, '2026-10-10T00:00:00.000Z').size).toBe(0);
  });

  test('en una recarga, las nuevas siguen y lo que no estaba entra como nuevo', () => {
    const primera = siguienteTablero(undefined, { filas, incompleto: false }, '2026-10-05T00:00:00.000Z');
    expect([...primera.nuevas]).toEqual(['editada', 'reciente']);
    const llego = fila('llego', { sentido: 'llegada', recurso: 'Communication', fecha: '2026-10-02T00:00:00.000Z' });
    const carga: CargaTablero = { filas: [llego, ...filas], incompleto: false };
    const segunda = siguienteTablero(primera, carga, '2026-10-05T00:00:00.000Z');
    expect(segunda.filas).toBe(carga.filas);
    expect([...segunda.nuevas].sort()).toEqual(['editada', 'llego', 'reciente']);
  });

  test('si la carga anterior estaba incompleta, lo que faltaba no cuenta como llegado', () => {
    const primera = siguienteTablero(undefined, { filas: filas.slice(0, 1), incompleto: true }, undefined);
    const segunda = siguienteTablero(primera, { filas, incompleto: false }, undefined);
    expect(segunda.nuevas.size).toBe(0);
    expect(segunda.incompleto).toBe(false);
  });
});

describe('fechaDelTablero: en hora de Argentina', () => {
  test('«03 OCT» en pantalla y «3 de octubre» para leer', () => {
    expect(fechaDelTablero('2026-10-03T12:00:00.000Z', HOY)).toEqual({ corta: '03 OCT', larga: '3 de octubre' });
    expect(fechaDelTablero('2026-09-28T13:00:00.000Z', HOY)).toEqual({ corta: '28 SEP', larga: '28 de septiembre' });
  });

  test('a la noche de Argentina sigue siendo el mismo día (no el de UTC)', () => {
    expect(fechaDelTablero('2026-10-04T01:30:00.000Z', HOY).corta).toBe('03 OCT');
  });

  test('una fecha sin hora es ese día de Argentina', () => {
    expect(fechaDelTablero('2026-10-03', HOY).corta).toBe('03 OCT');
  });

  test('con el año solo si no es el de hoy', () => {
    expect(fechaDelTablero('2025-12-30T15:00:00.000Z', HOY)).toEqual({
      corta: '30 DIC',
      anio: '2025',
      larga: '30 de diciembre de 2025',
    });
  });

  test('sin fecha (lo que todavía no llegó): «—»', () => {
    expect(fechaDelTablero(undefined, HOY)).toEqual({ corta: '—', larga: 'Sin fecha todavía' });
    expect(fechaDelTablero('no es una fecha', HOY).corta).toBe('—');
  });
});

describe('textos del tablero', () => {
  const todas = (): FilaTablero[] => [
    ...filasDeEstudios([pdf('d0'), pdfProcesado('d1', 'dr1')], new Map(), AHORA),
    ...filasDeSegundaOpinion(
      [pedido('s2', 'completed', '2026-09-28'), pedido('s1', 'active', '2026-09-01')],
      undefined,
      MARCA.producto
    ),
    ...filasDeSegundaOpinion([pedido('s1', 'active', '2026-09-01')], undefined, MARCA.producto),
    ...filasDeCuestionarios(LE8_QUESTIONNAIRES.map((q, i) => respuesta(`q${i}`, q.url))),
    ...filasDeCuestionarios([respuesta('qi', INTAKE_QUESTIONNAIRE_URL)]),
    ...filasDeMediciones(CODIGOS_CASA.map((c, i) => medicion(`o${i}`, c, '2026-10-03T22:00:00.000Z'))),
    ...filasDeNovedades([novedad('c1', 'resultados-listos'), novedad('c2', 'general')], new Set()),
  ];

  test('neutros, sin placeholders, sin metáforas de viaje ni promesas de plazo', () => {
    const textos = todas()
      .flatMap((f) => [f.que, f.ruta, f.estado, f.nota ?? ''])
      .join('\n');
    expect(textos).not.toMatch(/\[/);
    expect(textos).not.toMatch(/bienvenida|inscripta|\blista\b|\bsola\b|la paciente/i);
    expect(textos).not.toMatch(/vuelo|pasajer|embarque|despegue/i);
    expect(textos).not.toMatch(/\d+\s*(hora|día|semana)s?\b|plazo|en breve|pronto/i);
    // «Firmado» solo con la firma médica registrada (ninguna de estas la tiene).
    expect(textos).not.toMatch(/firmad/i);
  });
});
