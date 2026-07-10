import type { Coding } from '@medplum/fhirtypes';
import { LOINC } from '../terminology/loinc.js';

/**
 * The CKM assessment parameters (AHA/Ndumele) with patient-facing reference
 * values. Drives the data-entry form and the reference display. Thresholds are
 * general-population prevention defaults; the care team individualises them.
 *
 * Source: Ndumele CE et al., AHA Presidential Advisory on CKM Health,
 * Circulation 2023; AHA "Life's Essential 8"; KDIGO for kidney categories.
 */
export type ParametroCategoria = 'antropometria' | 'presion' | 'lipidos' | 'glucemia' | 'renal';

export type ParametroDireccion = 'menor-mejor' | 'mayor-mejor' | 'rango';

export interface RangoReferencia {
  /** Patient-facing label of the band. */
  etiqueta: string;
  /** Inclusive lower bound (in the parameter unit), if any. */
  min?: number;
  /** Exclusive upper bound (in the parameter unit), if any. */
  max?: number;
  /** 'ok' green / 'limite' yellow / 'alto' red. */
  nivel: 'ok' | 'limite' | 'alto';
}

export interface ParametroCkm {
  key: string;
  categoria: ParametroCategoria;
  /** Patient-facing label (Spanish). */
  etiqueta: string;
  /** LOINC coding for the Observation to write. */
  loinc: Coding;
  /** Unit label + UCUM code. */
  unidad: string;
  ucum?: string;
  direccion: ParametroDireccion;
  /** Optional: only applies to this sex (e.g. waist, HDL). */
  sexo?: 'female' | 'male';
  /** Short "why it matters" note. */
  nota?: string;
  /** Reference bands, best-to-worst. */
  rangos: RangoReferencia[];
}

const OK = 'ok' as const;
const LIMITE = 'limite' as const;
const ALTO = 'alto' as const;

export const PARAMETROS_CKM: ParametroCkm[] = [
  {
    key: 'peso',
    categoria: 'antropometria',
    etiqueta: 'Peso',
    loinc: LOINC.bodyWeight,
    unidad: 'kg',
    ucum: 'kg',
    direccion: 'rango',
    rangos: [],
  },
  {
    key: 'altura',
    categoria: 'antropometria',
    etiqueta: 'Altura',
    loinc: LOINC.bodyHeight,
    unidad: 'cm',
    ucum: 'cm',
    direccion: 'rango',
    rangos: [],
  },
  {
    key: 'imc',
    categoria: 'antropometria',
    etiqueta: 'Indice de masa corporal',
    loinc: LOINC.bmi,
    unidad: 'kg/m²',
    ucum: 'kg/m2',
    direccion: 'menor-mejor',
    nota: 'El exceso de adiposidad es el punto de partida del sindrome CKM.',
    rangos: [
      { etiqueta: 'Saludable', min: 18.5, max: 25, nivel: OK },
      { etiqueta: 'Sobrepeso', min: 25, max: 30, nivel: LIMITE },
      { etiqueta: 'Obesidad', min: 30, nivel: ALTO },
    ],
  },
  {
    key: 'cintura-mujer',
    categoria: 'antropometria',
    etiqueta: 'Circunferencia de cintura',
    loinc: LOINC.waistCircumference,
    unidad: 'cm',
    ucum: 'cm',
    direccion: 'menor-mejor',
    sexo: 'female',
    nota: 'La grasa abdominal es un motor clave del riesgo cardiometabolico.',
    rangos: [
      { etiqueta: 'Saludable', max: 88, nivel: OK },
      { etiqueta: 'Aumentada', min: 88, nivel: ALTO },
    ],
  },
  {
    key: 'cintura-hombre',
    categoria: 'antropometria',
    etiqueta: 'Circunferencia de cintura',
    loinc: LOINC.waistCircumference,
    unidad: 'cm',
    ucum: 'cm',
    direccion: 'menor-mejor',
    sexo: 'male',
    rangos: [
      { etiqueta: 'Saludable', max: 102, nivel: OK },
      { etiqueta: 'Aumentada', min: 102, nivel: ALTO },
    ],
  },
  {
    key: 'sistolica',
    categoria: 'presion',
    etiqueta: 'Presion arterial sistolica',
    loinc: LOINC.systolicBloodPressure,
    unidad: 'mmHg',
    ucum: 'mm[Hg]',
    direccion: 'menor-mejor',
    nota: 'Objetivo optimo por debajo de 120/80 mmHg.',
    rangos: [
      { etiqueta: 'Optima', max: 120, nivel: OK },
      { etiqueta: 'Elevada', min: 120, max: 130, nivel: LIMITE },
      { etiqueta: 'Hipertension', min: 130, nivel: ALTO },
    ],
  },
  {
    key: 'diastolica',
    categoria: 'presion',
    etiqueta: 'Presion arterial diastolica',
    loinc: LOINC.diastolicBloodPressure,
    unidad: 'mmHg',
    ucum: 'mm[Hg]',
    direccion: 'menor-mejor',
    rangos: [
      { etiqueta: 'Optima', max: 80, nivel: OK },
      { etiqueta: 'Elevada', min: 80, max: 90, nivel: LIMITE },
      { etiqueta: 'Hipertension', min: 90, nivel: ALTO },
    ],
  },
  {
    key: 'colesterol-total',
    categoria: 'lipidos',
    etiqueta: 'Colesterol total',
    loinc: LOINC.totalCholesterol,
    unidad: 'mg/dL',
    ucum: 'mg/dL',
    direccion: 'menor-mejor',
    nota: 'Necesario (junto al HDL) para estimar tu riesgo cardiovascular.',
    rangos: [
      { etiqueta: 'Deseable', max: 200, nivel: OK },
      { etiqueta: 'Limite', min: 200, max: 240, nivel: LIMITE },
      { etiqueta: 'Alto', min: 240, nivel: ALTO },
    ],
  },
  {
    key: 'hdl',
    categoria: 'lipidos',
    etiqueta: 'Colesterol HDL ("bueno")',
    loinc: LOINC.hdlCholesterol,
    unidad: 'mg/dL',
    ucum: 'mg/dL',
    direccion: 'mayor-mejor',
    sexo: 'female',
    nota: 'Un HDL mas alto protege. En mujeres el objetivo es 50 mg/dL o mas.',
    rangos: [
      { etiqueta: 'Protector', min: 50, nivel: OK },
      { etiqueta: 'Bajo', max: 50, nivel: ALTO },
    ],
  },
  {
    key: 'ldl',
    categoria: 'lipidos',
    etiqueta: 'Colesterol LDL ("malo")',
    loinc: LOINC.ldlCholesterol,
    unidad: 'mg/dL',
    ucum: 'mg/dL',
    direccion: 'menor-mejor',
    rangos: [
      { etiqueta: 'Optimo', max: 100, nivel: OK },
      { etiqueta: 'Limite', min: 100, max: 160, nivel: LIMITE },
      { etiqueta: 'Alto', min: 160, nivel: ALTO },
    ],
  },
  {
    key: 'no-hdl',
    categoria: 'lipidos',
    etiqueta: 'Colesterol no-HDL',
    loinc: LOINC.nonHdlCholesterol,
    unidad: 'mg/dL',
    ucum: 'mg/dL',
    direccion: 'menor-mejor',
    rangos: [
      { etiqueta: 'Objetivo', max: 130, nivel: OK },
      { etiqueta: 'Elevado', min: 130, nivel: ALTO },
    ],
  },
  {
    key: 'trigliceridos',
    categoria: 'lipidos',
    etiqueta: 'Trigliceridos',
    loinc: LOINC.triglycerides,
    unidad: 'mg/dL',
    ucum: 'mg/dL',
    direccion: 'menor-mejor',
    rangos: [
      { etiqueta: 'Normal', max: 150, nivel: OK },
      { etiqueta: 'Limite', min: 135, max: 150, nivel: LIMITE },
      { etiqueta: 'Alto', min: 150, nivel: ALTO },
    ],
  },
  {
    key: 'glucemia-ayunas',
    categoria: 'glucemia',
    etiqueta: 'Glucemia en ayunas',
    loinc: LOINC.fastingGlucose,
    unidad: 'mg/dL',
    ucum: 'mg/dL',
    direccion: 'menor-mejor',
    rangos: [
      { etiqueta: 'Normal', max: 100, nivel: OK },
      { etiqueta: 'Prediabetes', min: 100, max: 126, nivel: LIMITE },
      { etiqueta: 'Diabetes', min: 126, nivel: ALTO },
    ],
  },
  {
    key: 'hba1c',
    categoria: 'glucemia',
    etiqueta: 'Hemoglobina glicosilada (HbA1c)',
    loinc: LOINC.hba1c,
    unidad: '%',
    ucum: '%',
    direccion: 'menor-mejor',
    rangos: [
      { etiqueta: 'Normal', max: 5.7, nivel: OK },
      { etiqueta: 'Prediabetes', min: 5.7, max: 6.5, nivel: LIMITE },
      { etiqueta: 'Diabetes', min: 6.5, nivel: ALTO },
    ],
  },
  {
    key: 'acr',
    categoria: 'renal',
    etiqueta: 'Relacion albumina/creatinina (orina)',
    loinc: LOINC.urineAlbuminCreatinineRatio,
    unidad: 'mg/g',
    ucum: 'mg/g',
    direccion: 'menor-mejor',
    nota: 'Marcador temprano de dano renal y componente del sindrome CKM.',
    rangos: [
      { etiqueta: 'Normal', max: 30, nivel: OK },
      { etiqueta: 'Moderada (A2)', min: 30, max: 300, nivel: LIMITE },
      { etiqueta: 'Severa (A3)', min: 300, nivel: ALTO },
    ],
  },
  {
    key: 'egfr',
    categoria: 'renal',
    etiqueta: 'Filtrado glomerular (eGFR)',
    loinc: LOINC.egfr,
    unidad: 'mL/min/1.73m²',
    ucum: 'mL/min/{1.73_m2}',
    direccion: 'mayor-mejor',
    nota: 'Mide la funcion de filtrado del rinon.',
    rangos: [
      { etiqueta: 'Normal', min: 90, nivel: OK },
      { etiqueta: 'Levemente reducido', min: 60, max: 90, nivel: LIMITE },
      { etiqueta: 'Reducido', max: 60, nivel: ALTO },
    ],
  },
];

/** Parameters relevant to a given sex (drops the other sex's waist/HDL rows). */
export function parametrosParaSexo(sexo: 'female' | 'male' | undefined): ParametroCkm[] {
  return PARAMETROS_CKM.filter((p) => !p.sexo || p.sexo === sexo);
}

/** Classifies a value into its reference band. Undefined if no bands defined. */
export function clasificar(parametro: ParametroCkm, valor: number): RangoReferencia | undefined {
  for (const rango of parametro.rangos) {
    const cumpleMin = rango.min === undefined || valor >= rango.min;
    const cumpleMax = rango.max === undefined || valor < rango.max;
    if (cumpleMin && cumpleMax) return rango;
  }
  return undefined;
}
