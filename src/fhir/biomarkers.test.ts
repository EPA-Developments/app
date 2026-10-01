// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import type { Observation, ObservationDefinition } from '@medplum/fhirtypes';
import { biomarkerPanels } from '../pages/health-record/Biomarkers.data';
// El catálogo tal como lo publica el servidor: `buildSeed().observationDefinitions` de
// EPA-Developments/recepcionistas (src/config/biomarcadores.ts). Regenerarlo si cambia.
import definiciones from './__fixtures__/biomarcadores-servidor.json';
import {
  ANALITO_SYSTEM,
  codigosDe,
  edadEn,
  egfrCkdEpi2021,
  egfrDesdeCreatinina,
  esencialesFaltantes,
  fechaDesde,
  LOINC,
  observacionCargada,
  observacionesDe,
  PANEL_SYSTEM,
  parseObservationDefinition,
  parseServerBiomarker,
  rangoAplicable,
  rangoDelLaboratorio,
  requisitosEgfr,
  semaforo,
  TIPO_RANGO_SYSTEM,
  textoRango,
  textoValor,
  UCUM,
  unidadVisible,
} from './biomarkers';
import type { ServerBiomarker } from './biomarkers';

const defs = definiciones as ObservationDefinition[];
const catalogo = defs.map(parseServerBiomarker).filter((b): b is ServerBiomarker => b !== undefined);
const porSlug = (slug: string): ServerBiomarker => catalogo.find((b) => b.slug === slug) as ServerBiomarker;

function obs(codigos: string[], extra: Partial<Observation> = {}): Observation {
  return {
    resourceType: 'Observation',
    status: 'final',
    code: { coding: codigos.map((code) => ({ system: LOINC, code })) },
    subject: { reference: 'Patient/p1' },
    effectiveDateTime: '2026-09-18',
    valueQuantity: { value: 1 },
    ...extra,
  };
}

describe('Catálogo del servidor', () => {
  test('los paneles del portal son los 8 que publica el servidor', () => {
    expect(new Set(catalogo.map((b) => b.panel))).toEqual(new Set(Object.keys(biomarkerPanels)));
    for (const b of catalogo) {
      expect(b.slug).toBeTruthy();
      expect(['esencial', 'extensivo']).toContain(b.nivel);
    }
  });

  test('eGFR: los dos códigos (62238-1 para hGraph, 33914-3), la unidad legible y el corte de la guía CKM', () => {
    const egfr = porSlug('e_gfr');
    expect(egfr).toMatchObject({
      code: '62238-1',
      system: LOINC,
      panel: 'renal',
      nivel: 'esencial',
      unit: 'mL/min/{1.73_m2}',
      unitText: 'mL/min/1,73 m²',
      conventional: { low: 60 },
    });
    expect(codigosDe(egfr)).toEqual(['62238-1', '33914-3']);
    expect(unidadVisible(egfr)).toBe('mL/min/1,73 m²');
    expect(unidadVisible(porSlug('colesterol_ldl'))).toBe('mg/dL');
  });

  test('rangos por sexo, "cuenta como" y analitos sin rango de guía', () => {
    expect(porSlug('hs_tnt')).toMatchObject({
      female: { conventional: { high: 14 } },
      male: { conventional: { high: 22 } },
    });
    expect(porSlug('hs_tnt').conventional).toBeUndefined();
    expect(porSlug('bun').cuentaComo).toBe('urea_serica');
    expect(porSlug('creatinina_serica')).not.toHaveProperty('conventional');
    expect(porSlug('homa_ir')).toMatchObject({
      code: 'homa-ir',
      system: 'https://segundaopinionmedica.org/fhir/CodeSystem/biomarker',
    });
  });

  test('solo rangos convencionales: un rango funcional que haya quedado en el servidor se ignora', () => {
    const od: ObservationDefinition = {
      resourceType: 'ObservationDefinition',
      code: { coding: [{ system: LOINC, code: '2093-3' }] },
      qualifiedInterval: [
        { context: { coding: [{ system: TIPO_RANGO_SYSTEM, code: 'convencional' }] }, range: { high: { value: 200 } } },
        { context: { coding: [{ system: TIPO_RANGO_SYSTEM, code: 'funcional' }] }, range: { high: { value: 100 } } },
      ],
    };
    expect(parseObservationDefinition(od)).toEqual({ conventional: { low: undefined, high: 200 } });
  });

  test('sin el identifier ni la categoría de nivel (servidor viejo) igual se lee', () => {
    const od: ObservationDefinition = {
      resourceType: 'ObservationDefinition',
      code: { coding: [{ system: LOINC, code: '2093-3', display: 'Colesterol total' }] },
      category: [{ coding: [{ system: PANEL_SYSTEM, code: 'metabolico' }] }],
      quantitativeDetails: { unit: { coding: [{ system: UCUM, code: 'mg/dL' }], text: 'mg/dL' } },
    };
    const b = parseServerBiomarker(od);
    expect(b).toMatchObject({ code: '2093-3', title: 'Colesterol total', panel: 'metabolico', unit: 'mg/dL' });
    expect(b?.nivel).toBeUndefined();
    expect(b?.unitText).toBeUndefined();
    expect(defs.every((d) => d.identifier?.some((i) => i.system === ANALITO_SYSTEM))).toBe(true);
  });
});

describe('Resultados de un analito', () => {
  test('una Observation con cualquiera de los códigos del analito es suya (la del Plan Bienestar con 33914-3 también)', () => {
    const egfr = porSlug('e_gfr');
    const delBot = obs(['62238-1', '33914-3', '98979-8']);
    const delPlan = obs(['33914-3']);
    const otra = obs(['2160-0']);
    expect(observacionesDe(egfr, [delBot, delPlan, otra])).toEqual([delBot, delPlan]);
  });

  test('el rango: el de la guía si hay; si no, el del laboratorio de ese informe', () => {
    const conRango = obs(['2160-0'], {
      referenceRange: [{ low: { value: 0.5 }, high: { value: 1.1 }, text: '0,5 - 1,1' }],
    });
    expect(rangoAplicable(porSlug('creatinina_serica'), 'female', conRango)).toEqual({
      rango: { low: 0.5, high: 1.1, text: '0,5 - 1,1' },
      fuente: 'laboratorio',
    });
    expect(rangoAplicable(porSlug('creatinina_serica'), 'female', obs(['2160-0']))).toBeUndefined();
    expect(rangoAplicable(porSlug('e_gfr'), 'female', conRango)).toEqual({ rango: { low: 60 }, fuente: 'guia' });
    expect(rangoAplicable(porSlug('colesterol_hdl'), 'female')?.rango).toEqual({ low: 50, high: undefined });
    // Troponina: sin sexo no hay rango de guía.
    expect(rangoAplicable(porSlug('hs_tnt'), undefined)).toBeUndefined();
    expect(rangoAplicable(porSlug('hs_tnt'), 'female')?.rango).toEqual({ low: undefined, high: 14 });
  });

  test('el rango que cargó el portal (con tipo) no es el del laboratorio', () => {
    const cargada = obs(['2160-0'], {
      referenceRange: [{ high: { value: 1 }, type: { coding: [{ system: TIPO_RANGO_SYSTEM, code: 'convencional' }] } }],
    });
    expect(rangoDelLaboratorio(cargada)).toBeUndefined();
    expect(rangoDelLaboratorio(obs(['2160-0'], { referenceRange: [{ text: 'Negativo' }] }))).toEqual({
      text: 'Negativo',
    });
  });

  test('semáforo: verde dentro, rojo fuera, gris sin valor o sin rango', () => {
    expect(semaforo(90, { low: 60 })).toBe('green');
    expect(semaforo(45, { low: 60 })).toBe('red');
    expect(semaforo(1.3, { low: 0.5, high: 1.1 })).toBe('red');
    expect(semaforo(undefined, { low: 60 })).toBe('gray');
    expect(semaforo(5, undefined)).toBe('gray');
    expect(semaforo(5, {})).toBe('gray');
  });

  test('el valor con su comparador y la unidad legible; el texto si no es un número', () => {
    expect(textoValor(obs(['62238-1'], { valueQuantity: { comparator: '>', value: 90 } }), 'mL/min/1,73 m²')).toBe(
      '> 90 mL/min/1,73 m²'
    );
    expect(textoValor(obs(['13457-7'], { valueQuantity: { value: 131 } }), 'mg/dL')).toBe('131 mg/dL');
    expect(textoValor(obs(['x'], { valueQuantity: undefined, valueString: 'No reactivo' }), 'mg/dL')).toBe(
      'No reactivo'
    );
    expect(textoValor(undefined, 'mg/dL')).toBeUndefined();
    expect(textoRango({ low: 0.5, high: 1.1 })).toBe('0,5 – 1,1');
    expect(textoRango({ low: 60 })).toBe('≥ 60');
    expect(textoRango({ text: 'Negativo' })).toBe('Negativo');
    expect(textoRango(undefined)).toBe('—');
  });
});

describe('Esenciales del laboratorio de rutina', () => {
  test('17 esenciales: perfil básico, renal y electrolitos (los alternativos cuentan en el principal)', () => {
    const { requeridos, faltan } = esencialesFaltantes(catalogo, []);
    expect(requeridos).toHaveLength(17);
    expect(faltan).toHaveLength(17);
    expect(requeridos.map((b) => b.slug)).not.toContain('bun');
    expect(requeridos.map((b) => b.slug)).toContain('e_gfr');
  });

  test('cuentan los resultados de cualquier código del analito o de su alternativo; no los anulados ni los vacíos', () => {
    const { faltan } = esencialesFaltantes(catalogo, [
      obs(['33914-3']), // eGFR del Plan Bienestar
      obs(['3094-0']), // BUN: cubre la urea
      obs(['18262-6']), // LDL directo: cubre el LDL
      obs(['2093-3'], { status: 'entered-in-error' }),
      obs(['2085-9'], { valueQuantity: undefined }),
    ]);
    const slugs = faltan.map((b) => b.slug);
    expect(slugs).not.toContain('e_gfr');
    expect(slugs).not.toContain('urea_serica');
    expect(slugs).not.toContain('colesterol_ldl');
    expect(slugs).toContain('colesterol_total');
    expect(slugs).toContain('colesterol_hdl');
    expect(faltan).toHaveLength(14);
  });

  test('la ventana de 12 meses', () => {
    expect(fechaDesde(12, new Date('2026-10-01T15:00:00Z'))).toBe('2025-10-01');
    expect(fechaDesde(1, new Date('2026-03-15T00:00:00Z'))).toBe('2026-02-15');
  });
});

describe('Valor cargado a mano', () => {
  test('lleva todos los códigos del analito, la categoría laboratorio + panel, UCUM y el rango de la guía', () => {
    const o = observacionCargada(
      porSlug('e_gfr'),
      biomarkerPanels.renal,
      72,
      '2026-09-30',
      { reference: 'Patient/p1' },
      'female'
    );
    expect(o).toMatchObject({
      resourceType: 'Observation',
      status: 'preliminary',
      subject: { reference: 'Patient/p1' },
      effectiveDateTime: '2026-09-30',
      valueQuantity: { value: 72, unit: 'mL/min/1,73 m²', system: UCUM, code: 'mL/min/{1.73_m2}' },
      referenceRange: [{ low: { value: 60 }, type: { coding: [{ system: TIPO_RANGO_SYSTEM, code: 'convencional' }] } }],
    });
    expect(o.code?.coding?.map((c) => `${c.system}|${c.code}`)).toEqual([`${LOINC}|62238-1`, `${LOINC}|33914-3`]);
    expect(o.category?.flatMap((c) => c.coding?.map((x) => x.code))).toEqual(['laboratory', 'renal']);
  });

  test('sin rango de guía no inventa uno', () => {
    const o = observacionCargada(
      porSlug('tsh'),
      biomarkerPanels.endocrinologia,
      2.1,
      '2026-09-30',
      { reference: 'Patient/p1' },
      'female'
    );
    expect(o.referenceRange).toBeUndefined();
    expect(o.valueQuantity).toEqual({ value: 2.1, unit: 'mUI/L', system: UCUM, code: 'm[IU]/L' });
  });
});

describe('eGFR: edad, sexo biológico y creatinina en sangre', () => {
  const ana = { gender: 'female', birthDate: '1976-03-10' };
  const creatinina = (valor: number, extra: Partial<Observation> = {}): Observation =>
    obs(['2160-0'], { id: 'crea1', valueQuantity: { value: valor, unit: 'mg/dL', code: 'mg/dL' }, ...extra });

  test('CKD-EPI 2021 (la misma ecuación que el bot): valores de referencia', () => {
    expect(egfrCkdEpi2021(0.8, 50, 'female')).toBeCloseTo(89.7, 1);
    expect(egfrCkdEpi2021(1.0, 50, 'female')).toBeCloseTo(68.6, 1);
    expect(egfrCkdEpi2021(1.0, 60, 'male')).toBeCloseTo(86.2, 1);
    expect(edadEn('1976-03-10', '2026-09-18')).toBe(50);
    expect(edadEn('1976-09-19', '2026-09-18')).toBe(49);
  });

  test('los tres datos completos', () => {
    expect(requisitosEgfr(ana, [creatinina(0.8)])).toEqual([
      { dato: 'edad', titulo: 'Tu edad', ok: true, detalle: '50 años' },
      { dato: 'sexo', titulo: 'Tu sexo biológico', ok: true, detalle: 'Femenino' },
      { dato: 'creatinina', titulo: 'Tu valor de creatinina en sangre', ok: true, detalle: '0,8 mg/dL del 18/09/2026' },
    ]);
  });

  test('qué falta: fecha de nacimiento, sexo femenino o masculino, una creatinina con número', () => {
    const sinNada = requisitosEgfr({ gender: 'other' }, [], '2026-10-01');
    expect(sinNada.map((r) => [r.dato, r.ok, r.detalle])).toEqual([
      ['edad', false, 'Falta tu fecha de nacimiento en tu perfil.'],
      ['sexo', false, 'El cálculo usa el sexo biológico (femenino o masculino) de tu perfil.'],
      ['creatinina', false, 'Falta: cargala o envianos tu laboratorio en PDF.'],
    ]);
    expect(requisitosEgfr({ gender: 'female', birthDate: '2012-01-01' }, [], '2026-10-01')[0]).toMatchObject({
      ok: false,
      detalle: 'El cálculo es para mayores de 18 años.',
    });
    // Ni una anulada ni un "< 0,5" sirven; en µmol/L se convierte.
    const noSirven = [
      creatinina(0.8, { status: 'entered-in-error' }),
      creatinina(0.5, { valueQuantity: { comparator: '<', value: 0.5 } }),
    ];
    expect(requisitosEgfr(ana, noSirven)[2]?.ok).toBe(false);
    expect(
      requisitosEgfr(ana, [creatinina(70.72, { valueQuantity: { value: 70.72, unit: 'µmol/L' } })])[2]?.detalle
    ).toBe('0,8 mg/dL del 18/09/2026');
  });

  test('con una creatinina cargada a mano se calcula el eGFR (preliminar, con los tres códigos)', () => {
    const calculada = egfrDesdeCreatinina(creatinina(0.8), ana, porSlug('e_gfr'), biomarkerPanels.renal);
    expect(calculada).toMatchObject({
      status: 'preliminary',
      effectiveDateTime: '2026-09-18',
      valueQuantity: { value: 90, unit: 'mL/min/1,73 m²', system: UCUM, code: 'mL/min/{1.73_m2}' },
      method: { text: expect.stringMatching(/CKD-EPI 2021/) },
      derivedFrom: [{ reference: 'Observation/crea1' }],
    });
    expect(calculada?.code?.coding?.map((c) => c.code)).toEqual(['62238-1', '33914-3', '98979-8']);
    expect(
      egfrDesdeCreatinina(
        creatinina(0.8),
        { gender: 'other', birthDate: '1976-03-10' },
        porSlug('e_gfr'),
        biomarkerPanels.renal
      )
    ).toBeUndefined();
    expect(
      egfrDesdeCreatinina(creatinina(0.8), { gender: 'female' }, porSlug('e_gfr'), biomarkerPanels.renal)
    ).toBeUndefined();
  });
});
