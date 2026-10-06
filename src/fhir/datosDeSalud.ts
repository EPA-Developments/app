// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Paso 5 del Plan Bienestar · "Tus datos de salud": lo que la paciente mide en casa (peso,
// altura, cintura y presión) y, si no manda el PDF del laboratorio, sus valores a mano.
// Un solo Guardar: todo sale de acá como Observation, con los LOINC que leen el tablero de
// 8 hábitos (Life's Essential 8), PREVENT, el mapa CKM y los paneles de Biomarcadores.
// Lo que se calcula (IMC, colesterol no-HDL, eGFR) no se pide: se guarda calculado.
import { createReference } from '@medplum/core';
import type { Coding, Observation, Patient } from '@medplum/fhirtypes';
import type { Biomarker } from '../pages/health-record/Biomarkers.data';
import { biomarkerPanels } from '../pages/health-record/Biomarkers.data';
import { CATEGORIA_OBSERVACION_SYSTEM, LOINC, UCUM, egfrDesdeCreatinina } from './biomarkers';

export const RUTA_DATOS_DE_SALUD = '/care-plan/plan-100-dias/mis-datos';

export interface CampoSalud {
  readonly key: string;
  readonly etiqueta: string;
  /** Unidad como la lee la paciente. */
  readonly unidad: string;
  /** Unidad UCUM. */
  readonly ucum: string;
  readonly loinc: Coding;
  /** Valores posibles: fuera de esto es casi seguro un error de tipeo (p. ej. la altura en metros). */
  readonly min: number;
  readonly max: number;
  readonly ayuda?: string;
  readonly decimales?: number;
}

const loinc = (code: string, display: string): Coding => ({ system: LOINC, code, display });

export const CAMPOS_CASA: readonly CampoSalud[] = [
  {
    key: 'peso',
    etiqueta: 'Peso',
    unidad: 'kg',
    ucum: 'kg',
    loinc: loinc('29463-7', 'Body weight'),
    min: 25,
    max: 300,
    decimales: 1,
  },
  {
    key: 'altura',
    etiqueta: 'Altura',
    unidad: 'cm',
    ucum: 'cm',
    loinc: loinc('8302-2', 'Body height'),
    min: 100,
    max: 230,
  },
  {
    key: 'sistolica',
    etiqueta: 'Máxima (sistólica)',
    unidad: 'mmHg',
    ucum: 'mm[Hg]',
    loinc: loinc('8480-6', 'Systolic blood pressure'),
    min: 60,
    max: 260,
  },
  {
    key: 'diastolica',
    etiqueta: 'Mínima (diastólica)',
    unidad: 'mmHg',
    ucum: 'mm[Hg]',
    loinc: loinc('8462-4', 'Diastolic blood pressure'),
    min: 30,
    max: 160,
  },
  {
    key: 'cintura',
    etiqueta: 'Cintura',
    unidad: 'cm',
    ucum: 'cm',
    loinc: loinc('8280-0', 'Waist Circumference at umbilicus by Tape measure'),
    min: 40,
    max: 200,
    ayuda: 'A la altura del ombligo',
  },
];

export const CAMPOS_LABORATORIO: readonly CampoSalud[] = [
  {
    key: 'colesterolTotal',
    etiqueta: 'Colesterol total',
    unidad: 'mg/dL',
    ucum: 'mg/dL',
    loinc: loinc('2093-3', 'Cholesterol [Mass/volume] in Serum or Plasma'),
    min: 50,
    max: 600,
  },
  {
    key: 'hdl',
    etiqueta: 'Colesterol HDL',
    unidad: 'mg/dL',
    ucum: 'mg/dL',
    loinc: loinc('2085-9', 'Cholesterol in HDL [Mass/volume] in Serum or Plasma'),
    min: 5,
    max: 200,
  },
  {
    key: 'ldl',
    etiqueta: 'Colesterol LDL',
    unidad: 'mg/dL',
    ucum: 'mg/dL',
    loinc: loinc('13457-7', 'Cholesterol in LDL [Mass/volume] in Serum or Plasma by calculation'),
    min: 5,
    max: 500,
  },
  {
    key: 'trigliceridos',
    etiqueta: 'Triglicéridos',
    unidad: 'mg/dL',
    ucum: 'mg/dL',
    loinc: loinc('2571-8', 'Triglyceride [Mass/volume] in Serum or Plasma'),
    min: 10,
    max: 3000,
  },
  {
    key: 'glucemia',
    etiqueta: 'Glucemia en ayunas',
    unidad: 'mg/dL',
    ucum: 'mg/dL',
    loinc: loinc('1558-6', 'Fasting glucose [Mass/volume] in Serum or Plasma'),
    min: 20,
    max: 700,
  },
  {
    key: 'hba1c',
    etiqueta: 'Hemoglobina glicosilada',
    unidad: '%',
    ucum: '%',
    loinc: loinc('4548-4', 'Hemoglobin A1c/Hemoglobin.total in Blood'),
    min: 3,
    max: 20,
    decimales: 1,
  },
  {
    key: 'creatinina',
    etiqueta: 'Creatinina',
    unidad: 'mg/dL',
    ucum: 'mg/dL',
    loinc: loinc('2160-0', 'Creatinine [Mass/volume] in Serum or Plasma'),
    min: 0.1,
    max: 20,
    decimales: 2,
  },
  {
    key: 'acr',
    etiqueta: 'Albúmina/creatinina (orina)',
    unidad: 'mg/g',
    ucum: 'mg/g',
    loinc: loinc('9318-7', 'Albumin/Creatinine [Mass Ratio] in Urine'),
    min: 0,
    max: 10000,
  },
];

const LOINC_PANEL_PRESION = loinc('85354-9', 'Blood pressure panel with all children optional');
const LOINC_IMC = loinc('39156-5', 'Body mass index (BMI) [Ratio]');
const LOINC_NO_HDL = loinc('43396-1', 'Cholesterol non HDL [Mass/volume] in Serum or Plasma');

/** El eGFR tal como lo publica el catálogo del servidor (62238-1 para hGraph, 33914-3 para el plan). */
export const EGFR_CATALOGO: Biomarker = {
  code: '62238-1',
  codings: [
    { system: LOINC, code: '62238-1' },
    { system: LOINC, code: '33914-3' },
  ],
  title: 'Filtrado glomerular estimado (eGFR)',
  unit: 'mL/min/{1.73_m2}',
  unitText: 'mL/min/1,73 m²',
  description: '',
};

/** Lo que tipeó la paciente: `key` del campo → valor (vacío = no lo cargó). */
export type ValoresSalud = Record<string, number | string | undefined>;

const numero = (v: number | string | undefined): number | undefined => {
  if (v === undefined || v === '') {
    return undefined;
  }
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

/** Índice de masa corporal (kg/m²) con un decimal. */
export function calcularImc(pesoKg: number, alturaCm: number): number {
  const metros = alturaCm / 100;
  return Math.round((pesoKg / (metros * metros)) * 10) / 10;
}

/** Los errores por campo (vacío = todo bien). */
export function validarDatosSalud(
  valores: ValoresSalud,
  opciones: { manual: boolean; fechaLaboratorio?: string; hoy?: string }
): Record<string, string> {
  const errores: Record<string, string> = {};
  const campos = [...CAMPOS_CASA, ...(opciones.manual ? CAMPOS_LABORATORIO : [])];
  for (const c of campos) {
    const crudo = valores[c.key];
    if (crudo === undefined || crudo === '') {
      continue;
    }
    const n = numero(crudo);
    if (n === undefined) {
      errores[c.key] = 'Ingresá un número.';
    } else if (n < c.min || n > c.max) {
      errores[c.key] =
        c.key === 'altura' && n > 0 && n < 3
          ? 'La altura va en centímetros (p. ej. 162).'
          : `Revisá el valor: entre ${c.min} y ${c.max} ${c.unidad}.`;
    }
  }
  const sis = numero(valores.sistolica);
  const dia = numero(valores.diastolica);
  if ((sis === undefined) !== (dia === undefined)) {
    errores[sis === undefined ? 'sistolica' : 'diastolica'] = 'Cargá las dos: la máxima y la mínima.';
  } else if (sis !== undefined && dia !== undefined && dia >= sis && !errores.sistolica && !errores.diastolica) {
    errores.diastolica = 'La mínima tiene que ser menor que la máxima.';
  }
  if (opciones.manual && CAMPOS_LABORATORIO.some((c) => numero(valores[c.key]) !== undefined)) {
    const hoy = opciones.hoy ?? new Date().toISOString().slice(0, 10);
    if (!opciones.fechaLaboratorio) {
      errores.fechaLaboratorio = 'Ingresá la fecha del laboratorio.';
    } else if (opciones.fechaLaboratorio > hoy) {
      errores.fechaLaboratorio = 'La fecha no puede ser posterior a hoy.';
    }
  }
  return errores;
}

/** ¿Hay algo para guardar? */
export function hayDatos(valores: ValoresSalud, manual: boolean): boolean {
  return [...CAMPOS_CASA, ...(manual ? CAMPOS_LABORATORIO : [])].some((c) => numero(valores[c.key]) !== undefined);
}

function categoria(code: 'vital-signs' | 'laboratory'): Observation['category'] {
  return [
    {
      coding: [
        { system: CATEGORIA_OBSERVACION_SYSTEM, code, display: code === 'vital-signs' ? 'Vital Signs' : 'Laboratory' },
      ],
    },
  ];
}

function cantidad(valor: number, c: Pick<CampoSalud, 'unidad' | 'ucum'>): Observation['valueQuantity'] {
  return { value: valor, unit: c.unidad, system: UCUM, code: c.ucum };
}

/**
 * Las Observation de lo que se mide en casa: peso, altura, cintura, la presión como panel
 * (85354-9 con sistólica y diastólica, igual que Signos Vitales) y el IMC calculado (con la
 * altura recién cargada o la última que había).
 */
export function observacionesDeCasa(
  valores: ValoresSalud,
  paciente: Patient,
  ahora: string,
  alturaAnteriorCm?: number
): Observation[] {
  const subject = createReference(paciente);
  const base = (code: Coding, extra: Partial<Observation>): Observation => ({
    resourceType: 'Observation',
    status: 'preliminary',
    category: categoria('vital-signs'),
    code: { coding: [code], text: code.display },
    subject,
    effectiveDateTime: ahora,
    ...extra,
  });
  const out: Observation[] = [];
  for (const c of CAMPOS_CASA.filter((x) => x.key === 'peso' || x.key === 'altura' || x.key === 'cintura')) {
    const v = numero(valores[c.key]);
    if (v !== undefined) {
      out.push(base(c.loinc, { code: { coding: [c.loinc], text: c.etiqueta }, valueQuantity: cantidad(v, c) }));
    }
  }
  const sis = numero(valores.sistolica);
  const dia = numero(valores.diastolica);
  if (sis !== undefined && dia !== undefined) {
    const [cs, cd] = [
      CAMPOS_CASA.find((c) => c.key === 'sistolica')!,
      CAMPOS_CASA.find((c) => c.key === 'diastolica')!,
    ];
    out.push(
      base(LOINC_PANEL_PRESION, {
        code: { coding: [LOINC_PANEL_PRESION], text: 'Presión arterial' },
        component: [
          { code: { coding: [cs.loinc], text: 'Sistólica' }, valueQuantity: cantidad(sis, cs) },
          { code: { coding: [cd.loinc], text: 'Diastólica' }, valueQuantity: cantidad(dia, cd) },
        ],
      })
    );
  }
  const peso = numero(valores.peso);
  const altura = numero(valores.altura) ?? alturaAnteriorCm;
  if (peso !== undefined && altura !== undefined && altura > 0) {
    out.push(
      base(LOINC_IMC, {
        code: { coding: [LOINC_IMC], text: 'Índice de masa corporal' },
        valueQuantity: { value: calcularImc(peso, altura), unit: 'kg/m²', system: UCUM, code: 'kg/m2' },
        method: { text: 'Calculado con tu peso y tu altura' },
      })
    );
  }
  return out;
}

/**
 * Los valores del laboratorio cargados a mano (con la fecha del estudio) y el colesterol
 * no-HDL calculado si están el total y el HDL. El eGFR va aparte: necesita el id de la
 * creatinina ya guardada (ver `egfrDeLaCreatinina`).
 */
export function observacionesDeLaboratorio(valores: ValoresSalud, paciente: Patient, fecha: string): Observation[] {
  const subject = createReference(paciente);
  const out: Observation[] = [];
  for (const c of CAMPOS_LABORATORIO) {
    const v = numero(valores[c.key]);
    if (v !== undefined) {
      out.push({
        resourceType: 'Observation',
        status: 'preliminary',
        category: categoria('laboratory'),
        code: { coding: [c.loinc], text: c.etiqueta },
        subject,
        effectiveDateTime: fecha,
        valueQuantity: cantidad(v, c),
      });
    }
  }
  const total = numero(valores.colesterolTotal);
  const hdl = numero(valores.hdl);
  if (total !== undefined && hdl !== undefined && total > hdl) {
    out.push({
      resourceType: 'Observation',
      status: 'preliminary',
      category: categoria('laboratory'),
      code: { coding: [LOINC_NO_HDL], text: 'Colesterol no-HDL' },
      subject,
      effectiveDateTime: fecha,
      valueQuantity: { value: total - hdl, unit: 'mg/dL', system: UCUM, code: 'mg/dL' },
      method: { text: 'Calculado: colesterol total menos HDL' },
    });
  }
  return out;
}

/** El eGFR (CKD-EPI 2021) de la creatinina recién guardada, si la paciente tiene edad y sexo. */
export function egfrDeLaCreatinina(creatinina: Observation, paciente: Patient): Observation | undefined {
  return egfrDesdeCreatinina(creatinina, paciente, EGFR_CATALOGO, biomarkerPanels.renal);
}

/** Último valor (por fecha) de un LOINC, directo o como componente del panel de presión. */
export function ultimoValor(observaciones: Observation[], code: string): { valor: number; fecha?: string } | undefined {
  let mejor: { valor: number; fecha?: string } | undefined;
  for (const o of observaciones) {
    if (o.status === 'entered-in-error' || o.status === 'cancelled') {
      continue;
    }
    const directo = o.code?.coding?.some((c) => c.code === code) ? o.valueQuantity?.value : undefined;
    const componente = o.component?.find((c) => c.code?.coding?.some((x) => x.code === code))?.valueQuantity?.value;
    const valor = directo ?? componente;
    const fecha = o.effectiveDateTime;
    if (valor !== undefined && (!mejor || (fecha ?? '') > (mejor.fecha ?? ''))) {
      mejor = { valor, fecha };
    }
  }
  return mejor;
}

/** Los códigos para traer los últimos valores de lo que se mide en casa. */
export const CODIGOS_CASA = ['29463-7', '8302-2', '8280-0', '85354-9', '39156-5'];
