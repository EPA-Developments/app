// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { RUTA_ENVIAR_ESTUDIOS } from '../../components/AccionesRapidas';
import { RUTA_DATOS_DE_SALUD } from '../../fhir/datosDeSalud';
import { fechaHoraTurno, puedeOfrecerTeleconsulta } from './caminos';
import { ETIQUETA_PREVENT, preventDe, procedenciaPrevent, TITULO_PREVENT } from './prevent';
import type { AccionPrevent, ModeloPrevent } from './prevent';
import { RUTA_MI_SEGUNDA_OPINION, RUTA_RESERVAR_TELECONSULTA, RUTA_SOLICITAR_SEGUNDA_OPINION } from './rutas';
import type { DatosHomeE, PreventEstimado, PreventFirmado, ProximoTurno, SegundaOpinionHome } from './tipos';

const HOY = '2026-10-10';
// Un nombre cualquiera: en la Home entra desde MARCA.producto.
const OPCIONES = { producto: 'Revisión Experta' };

/** Jorge: sin plan, sin laboratorio y sin Segunda Opinión; cada test le suma lo suyo. */
function jorge(cambios: Partial<DatosHomeE> = {}): DatosHomeE {
  return {
    cargando: false,
    esPaciente: true,
    nombre: 'Jorge',
    hoy: HOY,
    consentimiento: 'firmado',
    ingresoPendiente: false,
    novedadesSinLeer: 0,
    ...cambios,
  };
}

const DEL_INFORME: PreventFirmado = { ascvd10: 0.042, hf10: 0.031, total30: 0.187, fecha: '2026-10-05' };
const ESTIMADO: PreventEstimado = {
  ascvd10: 0.081,
  hf10: 0.052,
  total30: 0.24,
  faltantes: ['presión arterial', 'glucemia'],
};
const COMPLETADA_SIN_FIRMA: SegundaOpinionHome = {
  id: 'som-1',
  estado: 'completada',
  etiqueta: 'Completada',
  pedida: '2026-09-01',
  firmada: false,
};
const COMPLETADA_FIRMADA: SegundaOpinionHome = { ...COMPLETADA_SIN_FIRMA, firmada: true };
const EN_ANALISIS: SegundaOpinionHome = {
  id: 'som-2',
  estado: 'en-analisis',
  etiqueta: 'En análisis',
  pedida: '2026-09-28T13:00:00.000Z',
  firmada: false,
};
// Sábado 17 de octubre a las 10:30 de Argentina (13:30 UTC).
const TURNO: ProximoTurno = { id: 'appt-1', inicio: '2026-10-17T13:30:00.000Z', teleconsulta: true };

const BOTON_TELECONSULTA: AccionPrevent = {
  tipo: 'boton',
  texto: 'Reservar mi teleconsulta',
  href: RUTA_RESERVAR_TELECONSULTA,
};
const PEDIR: AccionPrevent = {
  tipo: 'link',
  texto: 'Pedir mi Revisión Experta: un informe de tu caso y tu riesgo',
  href: RUTA_SOLICITAR_SEGUNDA_OPINION,
  principal: false,
};
const VER_SEGUNDA_OPINION: AccionPrevent = {
  tipo: 'link',
  texto: 'Ver mi Revisión Experta',
  href: RUTA_MI_SEGUNDA_OPINION,
  principal: false,
};
const TRAE_EL_RIESGO: AccionPrevent = {
  tipo: 'nota',
  texto: 'Tu Revisión Experta va a traer tu riesgo en su informe.',
};
const VER_INFORME: AccionPrevent = {
  tipo: 'link',
  texto: 'Ver mi informe',
  href: RUTA_MI_SEGUNDA_OPINION,
  principal: true,
};
const REVISARLO: AccionPrevent = {
  tipo: 'link',
  texto: 'Revisarlo en una teleconsulta',
  href: RUTA_RESERVAR_TELECONSULTA,
  principal: false,
};
const TURNO_RESERVADO: AccionPrevent = {
  tipo: 'turno',
  texto: `Podés llevarlo a tu turno del ${fechaHoraTurno(TURNO.inicio)}.`,
  turno: TURNO,
};

/** Todos los textos del modelo (y sus hrefs), uno por línea, para buscar palabras prohibidas. */
function textosDe(modelo: ModeloPrevent): string {
  const juntar = (valor: unknown): string[] => {
    if (typeof valor === 'string') {
      return [valor];
    }
    if (valor && typeof valor === 'object') {
      return Object.values(valor).flatMap(juntar);
    }
    return [];
  };
  return juntar(modelo).join('\n');
}

describe('procedenciaPrevent: de dónde sale el riesgo', () => {
  test('sin informe ni estimación: sin datos', () => {
    expect(procedenciaPrevent(jorge())).toBe('sin-datos');
  });

  test('con la estimación de sus datos: estimado', () => {
    expect(procedenciaPrevent(jorge({ preventEstimado: ESTIMADO }))).toBe('estimado');
  });

  test('el del informe gana a la estimación; «firmado» solo con la firma médica registrada', () => {
    expect(procedenciaPrevent(jorge({ prevent: DEL_INFORME, segundaOpinion: COMPLETADA_FIRMADA }))).toBe('firmado');
    expect(
      procedenciaPrevent(jorge({ prevent: DEL_INFORME, preventEstimado: ESTIMADO, segundaOpinion: COMPLETADA_FIRMADA }))
    ).toBe('firmado');
    expect(procedenciaPrevent(jorge({ prevent: DEL_INFORME, segundaOpinion: COMPLETADA_SIN_FIRMA }))).toBe(
      'informe-ia'
    );
    expect(procedenciaPrevent(jorge({ prevent: DEL_INFORME }))).toBe('informe-ia');
  });
});

describe('preventDe: del informe firmado', () => {
  const firmado = jorge({ prevent: DEL_INFORME, segundaOpinion: COMPLETADA_FIRMADA });

  test('dice que es del informe firmado, con su fecha, y sin chip de «sin revisión»', () => {
    const modelo = preventDe(firmado, OPCIONES);
    expect(modelo.procedencia).toBe('firmado');
    expect(modelo.etiqueta).toBe(ETIQUETA_PREVENT);
    expect(modelo.titulo).toBe(TITULO_PREVENT);
    expect(modelo.chip).toBeUndefined();
    expect(modelo.destacado).toBeUndefined();
    expect(modelo.texto).toBe('Del informe firmado por tu equipo médico el 5 de octubre.');
    expect(modelo.fecha).toBe('5 de octubre');
    expect(modelo.faltantes).toEqual([]);
    expect(modelo.notaFaltantes).toBeUndefined();
    expect(modelo.recuadro).toBeUndefined();
  });

  test('los tres riesgos con porcentaje y coma; la banda (con su texto) solo en ASCVD', () => {
    expect(preventDe(firmado, OPCIONES).riesgos).toEqual([
      {
        clave: 'ascvd10',
        nombre: 'ASCVD a 10 años',
        detalle: 'Infarto o ACV',
        valor: 0.042,
        porcentaje: '4,2%',
        banda: 'bajo',
        textoBanda: 'Riesgo bajo',
      },
      {
        clave: 'hf10',
        nombre: 'IC a 10 años',
        detalle: 'Insuficiencia cardíaca',
        valor: 0.031,
        porcentaje: '3,1%',
        banda: undefined,
        textoBanda: undefined,
      },
      {
        clave: 'total30',
        nombre: 'ECV total a 30 años',
        detalle: 'Enfermedad cardiovascular total',
        valor: 0.187,
        porcentaje: '18,7%',
        banda: undefined,
        textoBanda: undefined,
      },
    ]);
  });

  test('sin fecha en el informe, la frase no inventa una', () => {
    const modelo = preventDe(jorge({ prevent: { ascvd10: 0.042 }, segundaOpinion: COMPLETADA_FIRMADA }), OPCIONES);
    expect(modelo.texto).toBe('Del informe firmado por tu equipo médico.');
    expect(modelo.fecha).toBeUndefined();
  });

  test('un riesgo que el informe no trae (o que no es un número) queda sin dato, sin banda', () => {
    const modelo = preventDe(
      jorge({ prevent: { ascvd10: Number.NaN, total30: 0.33 }, segundaOpinion: COMPLETADA_FIRMADA }),
      OPCIONES
    );
    expect(modelo.riesgos.map((r) => r.porcentaje)).toEqual([undefined, undefined, '33,0%']);
    expect(modelo.riesgos[0]).toEqual({ clave: 'ascvd10', nombre: 'ASCVD a 10 años', detalle: 'Infarto o ACV' });
  });

  test('las bandas de la AHA para ASCVD a 10 años', () => {
    const banda = (ascvd10: number): string | undefined =>
      preventDe(jorge({ prevent: { ascvd10 }, segundaOpinion: COMPLETADA_FIRMADA }), OPCIONES).riesgos[0].textoBanda;
    expect(banda(0.049)).toBe('Riesgo bajo');
    expect(banda(0.05)).toBe('Riesgo límite');
    expect(banda(0.081)).toBe('Riesgo intermedio');
    expect(banda(0.2)).toBe('Riesgo alto');
  });

  test('acciones: ver el informe y, sin turno, revisarlo en una teleconsulta', () => {
    expect(preventDe(firmado, OPCIONES).acciones).toEqual([VER_INFORME, REVISARLO]);
  });

  test('con un turno reservado no ofrece otra teleconsulta', () => {
    expect(preventDe(jorge({ ...firmado, proximoTurno: TURNO }), OPCIONES).acciones).toEqual([VER_INFORME]);
  });
});

describe('preventDe: del informe preparado con IA (sin firma médica registrada)', () => {
  const informeIa = jorge({ prevent: DEL_INFORME, segundaOpinion: COMPLETADA_SIN_FIRMA });

  test('lo rotula como preparado con IA, con el nombre del servicio, y nunca dice «firmado»', () => {
    const modelo = preventDe(informeIa, OPCIONES);
    expect(modelo.procedencia).toBe('informe-ia');
    expect(modelo.chip).toBe('Del informe de tu Revisión Experta · preparado con IA');
    expect(modelo.texto).toBe(
      'Lo calculamos con la fórmula PREVENT de la AHA para tu informe del 5 de octubre. ' +
        'Es orientativo: no es un diagnóstico.'
    );
    expect(modelo.fecha).toBe('5 de octubre');
    expect(modelo.riesgos.map((r) => r.porcentaje)).toEqual(['4,2%', '3,1%', '18,7%']);
    expect(textosDe(modelo)).not.toMatch(/firmad/i);
  });

  test('un informe de otro año lleva el año en la fecha', () => {
    const modelo = preventDe(jorge({ ...informeIa, prevent: { ...DEL_INFORME, fecha: '2025-12-05' } }), OPCIONES);
    expect(modelo.texto).toContain('para tu informe del 5 de diciembre de 2025.');
  });

  test('acciones: las mismas que el firmado (ver el informe; revisarlo si se puede ofrecer)', () => {
    expect(preventDe(informeIa, OPCIONES).acciones).toEqual([VER_INFORME, REVISARLO]);
    expect(preventDe(jorge({ ...informeIa, proximoTurno: TURNO }), OPCIONES).acciones).toEqual([VER_INFORME]);
  });
});

describe('preventDe: estimado con sus datos (sin revisión médica)', () => {
  test('lo rotula como estimación sin revisión médica y dice qué falta para afinarlo', () => {
    const modelo = preventDe(jorge({ preventEstimado: ESTIMADO }), OPCIONES);
    expect(modelo.procedencia).toBe('estimado');
    expect(modelo.chip).toBe('Estimado con tus datos · sin revisión médica');
    expect(modelo.texto).toBe('Lo calculamos con la fórmula PREVENT de la AHA. Es orientativo: no es un diagnóstico.');
    expect(modelo.fecha).toBeUndefined();
    expect(modelo.riesgos[0]).toMatchObject({
      porcentaje: '8,1%',
      banda: 'intermedio',
      textoBanda: 'Riesgo intermedio',
    });
    expect(modelo.faltantes).toEqual(['presión arterial', 'glucemia']);
    expect(modelo.notaFaltantes).toBe('Para afinarlo nos falta: presión arterial, glucemia.');
    expect(textosDe(modelo)).not.toMatch(/firmad/i);
  });

  test('sin faltantes, no hay nota', () => {
    const modelo = preventDe(jorge({ preventEstimado: { ...ESTIMADO, faltantes: [] } }), OPCIONES);
    expect(modelo.faltantes).toEqual([]);
    expect(modelo.notaFaltantes).toBeUndefined();
  });

  test('es un cálculo automático: el recuadro dice que se revisa con un médico', () => {
    expect(preventDe(jorge({ preventEstimado: ESTIMADO }), OPCIONES).recuadro).toEqual({
      titulo: 'Es un cálculo automático',
      texto: 'Para saber qué significa para vos y qué hacer, revisalo con un médico.',
    });
  });

  test('sin Segunda Opinión ni turno: reservar la teleconsulta (botón) y pedir la Segunda Opinión', () => {
    expect(preventDe(jorge({ preventEstimado: ESTIMADO }), OPCIONES).acciones).toEqual([BOTON_TELECONSULTA, PEDIR]);
  });

  test('con un turno reservado: llevarlo a ese turno, sin botón para reservar otro', () => {
    const modelo = preventDe(jorge({ preventEstimado: ESTIMADO, proximoTurno: TURNO }), OPCIONES);
    expect(modelo.acciones).toEqual([TURNO_RESERVADO, PEDIR]);
    expect(TURNO_RESERVADO.texto).toContain('17 de octubre');
    expect(modelo.acciones.some((a) => a.tipo === 'boton')).toBe(false);
  });

  test('con la Segunda Opinión en análisis: no empuja la teleconsulta; su informe va a traer el riesgo', () => {
    const datos = jorge({ preventEstimado: ESTIMADO, segundaOpinion: EN_ANALISIS });
    expect(puedeOfrecerTeleconsulta(datos)).toBe(false);
    expect(preventDe(datos, OPCIONES).acciones).toEqual([TRAE_EL_RIESGO, VER_SEGUNDA_OPINION]);
  });

  test('con la Segunda Opinión en análisis y un turno: el turno y lo que va a traer su informe', () => {
    const datos = jorge({ preventEstimado: ESTIMADO, segundaOpinion: EN_ANALISIS, proximoTurno: TURNO });
    expect(preventDe(datos, OPCIONES).acciones).toEqual([TURNO_RESERVADO, TRAE_EL_RIESGO, VER_SEGUNDA_OPINION]);
  });

  test('con la Segunda Opinión ya pedida (no en análisis): la teleconsulta y ver la que pidió', () => {
    for (const segundaOpinion of [
      COMPLETADA_SIN_FIRMA,
      { ...COMPLETADA_SIN_FIRMA, estado: 'otro', etiqueta: 'En pausa' } as const,
    ]) {
      expect(preventDe(jorge({ preventEstimado: ESTIMADO, segundaOpinion }), OPCIONES).acciones).toEqual([
        BOTON_TELECONSULTA,
        VER_SEGUNDA_OPINION,
      ]);
    }
  });

  test('una Segunda Opinión cancelada no cuenta: se ofrece pedirla otra vez', () => {
    const segundaOpinion: SegundaOpinionHome = { ...COMPLETADA_SIN_FIRMA, estado: 'cancelada', etiqueta: 'Cancelada' };
    expect(preventDe(jorge({ preventEstimado: ESTIMADO, segundaOpinion }), OPCIONES).acciones).toEqual([
      BOTON_TELECONSULTA,
      PEDIR,
    ]);
  });

  test('si ya tuvo una consulta después de sus datos, la deja a mano sin empujar (un link, no el botón)', () => {
    const datos = jorge({
      preventEstimado: ESTIMADO,
      laboratorio: { estado: 'procesado', fecha: '2026-10-03', valores: 12, informeId: 'dr1', revisionMedica: false },
      ultimaConsulta: { inicio: '2026-10-05T13:00:00.000Z' },
    });
    expect(puedeOfrecerTeleconsulta(datos)).toBe(false);
    expect(preventDe(datos, OPCIONES).acciones).toEqual([
      { tipo: 'link', texto: 'Reservar otra teleconsulta', href: RUTA_RESERVAR_TELECONSULTA, principal: false },
      PEDIR,
    ]);
  });
});

describe('preventDe: sin datos para calcularlo', () => {
  test('dice qué falta y lleva a mandar el laboratorio o cargar sus datos', () => {
    const modelo = preventDe(jorge({ preventFaltantes: ['colesterol total y HDL', 'edad'] }), OPCIONES);
    expect(modelo.procedencia).toBe('sin-datos');
    expect(modelo.chip).toBeUndefined();
    expect(modelo.destacado).toBe('Todavía no podemos estimar tu riesgo.');
    expect(modelo.texto).toBe('Para calcularlo nos falta: colesterol total y HDL, edad.');
    expect(modelo.riesgos).toEqual([]);
    expect(modelo.faltantes).toEqual(['colesterol total y HDL', 'edad']);
    expect(modelo.notaFaltantes).toBeUndefined();
    expect(modelo.recuadro).toBeUndefined();
    expect(modelo.acciones).toEqual([
      { tipo: 'boton', texto: 'Enviar mi laboratorio en PDF', href: RUTA_ENVIAR_ESTUDIOS },
      { tipo: 'link', texto: 'Cargar mis datos de salud', href: RUTA_DATOS_DE_SALUD, principal: false },
    ]);
  });

  test('sin la lista de faltantes, una frase general', () => {
    for (const preventFaltantes of [undefined, []]) {
      const modelo = preventDe(jorge({ preventFaltantes }), OPCIONES);
      expect(modelo.texto).toBe('Nos faltan algunos datos de tu laboratorio.');
      expect(modelo.faltantes).toEqual([]);
    }
  });

  test('con la Segunda Opinión en análisis, primero avisa que su informe va a traer el riesgo', () => {
    const acciones = preventDe(jorge({ segundaOpinion: EN_ANALISIS }), OPCIONES).acciones;
    expect(acciones[0]).toEqual(TRAE_EL_RIESGO);
    expect(acciones.map((a) => a.texto)).toEqual([
      TRAE_EL_RIESGO.texto,
      'Enviar mi laboratorio en PDF',
      'Cargar mis datos de salud',
    ]);
  });
});

describe('preventDe: reglas para todas las procedencias', () => {
  const CASOS: readonly DatosHomeE[] = [
    jorge(),
    jorge({ preventFaltantes: ['edad'], segundaOpinion: EN_ANALISIS }),
    jorge({ preventEstimado: ESTIMADO }),
    jorge({ preventEstimado: ESTIMADO, proximoTurno: TURNO, segundaOpinion: EN_ANALISIS }),
    jorge({ preventEstimado: ESTIMADO, segundaOpinion: COMPLETADA_SIN_FIRMA }),
    jorge({ prevent: DEL_INFORME, segundaOpinion: COMPLETADA_SIN_FIRMA }),
    jorge({ prevent: DEL_INFORME, segundaOpinion: COMPLETADA_FIRMADA, proximoTurno: TURNO }),
  ];

  test('a lo sumo un botón primario, y todo link lleva a una ruta real del portal', () => {
    for (const datos of CASOS) {
      const { acciones } = preventDe(datos, OPCIONES);
      expect(acciones.filter((a) => a.tipo === 'boton').length).toBeLessThanOrEqual(1);
      for (const accion of acciones) {
        if (accion.tipo === 'boton' || accion.tipo === 'link') {
          expect(accion.href).toMatch(/^\//);
        }
      }
    }
  });

  test('el nombre del servicio sale de las opciones, sin placeholders ni plazos', () => {
    for (const datos of CASOS) {
      const textos = textosDe(preventDe(datos, { producto: 'Otro Servicio' }));
      expect(textos).not.toContain('Revisión Experta');
      expect(textos).not.toContain('[');
      expect(textos).not.toMatch(/\b(horas|días hábiles|plazo)\b/i);
    }
  });

  test('«firmado» solo cuando el informe tiene la firma médica registrada', () => {
    for (const datos of CASOS) {
      const modelo = preventDe(datos, OPCIONES);
      if (modelo.procedencia !== 'firmado') {
        expect(textosDe(modelo)).not.toMatch(/firmad/i);
      }
    }
  });
});
