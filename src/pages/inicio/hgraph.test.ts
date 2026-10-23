// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// «Tus valores»: el modelo del hGraph de la paciente. Lo que se fija acá: que el valor y el
// estado son los del core (los mismos que ve el equipo), que los básicos están siempre, quién
// cargó cada valor, cuándo es viejo, la coma decimal y que los colores se ven en los dos temas.
// Pacientes sintéticas.
import { metricasHgraph, ultimosValoresCkm } from '@epa/careplan-menopausia';
import type { Observation } from '@medplum/fhirtypes';
import {
  AMPLIADOS,
  BASICOS,
  caminoHgraph,
  COLORES_HGRAPH,
  descripcionHgraph,
  esViejo,
  hgraphVisible,
  lecturasGanadoras,
  modeloHgraph,
  NOMBRE_PACIENTE,
  origenDeLectura,
  R_ANILLO,
  R_MINIMO,
  radioHgraph,
  ROTULO_HGRAPH,
  TEXTO_ESTADO,
  unidadVisible,
  valorVisible,
} from './hgraph';

const HOY = '2026-10-10';

function lectura(
  code: string,
  value: number,
  unit: string,
  fecha: string,
  autor = 'Patient/p1',
  id?: string
): Observation {
  return {
    resourceType: 'Observation',
    id,
    status: 'final',
    code: { coding: [{ system: 'http://loinc.org', code }] },
    effectiveDateTime: fecha,
    valueQuantity: { value, unit },
    meta: { author: { reference: autor } },
  };
}

const LECTURAS: Observation[] = [
  lectura('2085-9', 214, 'mg/dL', '2026-09-20', 'Bot/lab', 'hdl-imposible'), // otro analito: se descarta
  lectura('2085-9', 57, 'mg/dL', '2026-09-01', 'Bot/lab', 'hdl'),
  lectura('1558-6', 104, 'mg/dL', '2026-09-01', 'Bot/lab', 'glucemia'),
  lectura('59261-8', 48, 'mmol/mol', '2026-09-01', 'Practitioner/dr', 'hba1c'), // IFCC → %
  lectura('98979-8', 62, 'mL/min/1.73m2', '2026-09-01', 'Bot/lab', 'tfge'),
  lectura('8480-6', 150, 'mmHg', '2025-06-01', 'Patient/p1', 'pas-vieja'),
  lectura('33762-6', 300, 'pg/mL', '2026-09-01', 'Practitioner/dr', 'bnp'), // ampliado con dato
];

describe('el modelo', () => {
  const modelo = modeloHgraph(LECTURAS, { sexo: 'female', hoy: HOY });
  const punto = (id: string) => modelo.puntos.find((p) => p.id === id);

  test('los valores y los estados son los del core, los mismos que ve el equipo', () => {
    const delCore = metricasHgraph(ultimosValoresCkm(LECTURAS), 'female');
    for (const m of delCore) {
      expect(punto(m.id)?.dato?.estado, m.id).toBe(m.status);
      expect(punto(m.id)?.dato?.score, m.id).toBe(m.score);
    }
    expect(delCore.length).toBe(modelo.conDato);
  });

  test('lecturasGanadoras elige exactamente lo mismo que ultimosValoresCkm', () => {
    const ganadoras = lecturasGanadoras(LECTURAS);
    const delCore = ultimosValoresCkm(LECTURAS);
    expect(Object.keys(ganadoras).sort()).toEqual(Object.keys(delCore).sort());
    for (const [id, lecturaGanadora] of Object.entries(ganadoras)) {
      expect(lecturaGanadora?.valor, id).toEqual(delCore[id as keyof typeof delCore]);
    }
    expect(ganadoras.hdlc?.observation.id).toBe('hdl');
  });

  test('los básicos están siempre (con «Falta»), y los ampliados sólo con dato', () => {
    expect(modelo.puntos.slice(0, BASICOS.length).map((p) => p.id)).toEqual(BASICOS);
    expect(modelo.puntos.map((p) => p.id)).toContain('ntProBNP');
    expect(modelo.puntos.map((p) => p.id)).not.toContain('cac');
    expect(punto('ldlc')?.dato).toBeUndefined();
    expect(modelo.faltan).toBe(BASICOS.length - 5);
    expect(modelo.conDato).toBe(6);
  });

  test('nombre y rótulo para la paciente, y el estado en sus palabras', () => {
    expect(punto('glucoseFasting')).toMatchObject({ nombre: 'Azúcar en ayunas', rotulo: 'Glucemia' });
    expect(punto('glucoseFasting')?.dato?.textoEstado).toBe('Para mirar');
    expect(punto('hdlc')?.dato?.textoEstado).toBe('En rango');
    for (const id of [...BASICOS, ...AMPLIADOS]) {
      expect(NOMBRE_PACIENTE[id], id).toBeTruthy();
      expect(ROTULO_HGRAPH[id], id).toBeTruthy();
    }
    expect(TEXTO_ESTADO.high).toBe('Para hablar con tu médico');
  });

  test('coma decimal, la HbA1c en %, la unidad como vino', () => {
    expect(punto('hba1c')?.dato).toMatchObject({ valor: '6,5', unidad: '%' });
    expect(punto('egfr')?.dato).toMatchObject({ valor: '62', unidad: 'mL/min/1,73m2' });
    expect(valorVisible(1250)).toBe('1.250');
    expect(valorVisible(5.75)).toBe('5,75');
    expect(unidadVisible('mL/min/1.73m²')).toBe('mL/min/1,73m²');
  });

  test('quién lo cargó', () => {
    expect(punto('sbp')?.dato?.origen).toBe('vos');
    expect(punto('glucoseFasting')?.dato?.origen).toBe('laboratorio');
    expect(punto('hba1c')?.dato?.origen).toBe('equipo');
    expect(origenDeLectura({ resourceType: 'Observation', status: 'final', code: {} })).toBe('laboratorio');
    expect(
      origenDeLectura({
        resourceType: 'Observation',
        status: 'final',
        code: {},
        meta: { author: { reference: 'PractitionerRole/x' } },
      })
    ).toBe('equipo');
  });

  test('un valor de hace más de un año se marca, el del año no', () => {
    expect(punto('sbp')?.dato?.viejo).toBe(true);
    expect(punto('glucoseFasting')?.dato?.viejo).toBe(false);
    expect(esViejo('2025-10-10', HOY)).toBe(false);
    expect(esViejo('2025-10-09', HOY)).toBe(true);
    expect(esViejo(undefined, HOY)).toBe(false);
  });

  test('la descripción del gráfico cuenta los estados y lo que falta', () => {
    expect(descripcionHgraph(modelo)).toMatch(
      /^Tus valores: \d+ en rango, \d+ para mirar(, \d+ para hablar con tu médico)?\. Faltan 8\.$/
    );
    expect(descripcionHgraph(modeloHgraph([], { hoy: HOY }))).toBe('Tus valores: todavía no hay datos.');
  });
});

describe('la geometría', () => {
  test('el puntaje va de R_MINIMO (0) al anillo (1), recortado', () => {
    expect(radioHgraph(0)).toBe(R_MINIMO);
    expect(radioHgraph(1)).toBe(R_ANILLO);
    expect(radioHgraph(2)).toBe(R_ANILLO);
    expect(radioHgraph(-1)).toBe(R_MINIMO);
  });

  test('el contorno une sólo los puntos con dato, y necesita tres', () => {
    const modelo = modeloHgraph(LECTURAS, { hoy: HOY });
    expect(caminoHgraph(modelo.puntos).match(/[ML]/g)).toHaveLength(modelo.conDato);
    const dos = modeloHgraph(LECTURAS.slice(1, 3), { hoy: HOY });
    expect(caminoHgraph(dos.puntos)).toBe('');
  });
});

describe('los colores', () => {
  function luminancia(hex: string): number {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contraste(a: string, b: string): number {
    const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  }

  test.each(['claro', 'oscuro'] as const)('tema %s: cada estado ≥ 3:1 contra el fondo, y el texto ≥ 4,5:1', (tema) => {
    const c = COLORES_HGRAPH[tema];
    for (const color of Object.values(c.estado)) {
      expect(contraste(color, c.fondo), color).toBeGreaterThanOrEqual(3);
    }
    expect(contraste(c.texto, c.fondo)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(c.secundario, c.fondo)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(c.enlace, c.fondo)).toBeGreaterThanOrEqual(4.5);
  });

  test('sin rojo puro para el alto', () => {
    for (const tema of ['claro', 'oscuro'] as const) {
      const [r, g] = [1, 3].map((i) => Number.parseInt(COLORES_HGRAPH[tema].estado.high.slice(i, i + 2), 16));
      // Naranja: el verde lleva al menos un tercio del rojo.
      expect(g / r, tema).toBeGreaterThan(0.33);
    }
  });
});

test('no se publica todavía: sólo con ?hgraph=si', () => {
  expect(hgraphVisible(null)).toBe(false);
  expect(hgraphVisible('no')).toBe(false);
  expect(hgraphVisible('si')).toBe(true);
});
