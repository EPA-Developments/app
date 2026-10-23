/**
 * El puntaje del hGraph: cada valor pasa a un puntaje de 0 a 1 y a un estado.
 *
 * Cada parámetro tiene dos puntas: el valor óptimo (puntaje 1) y un valor grave
 * (puntaje 0); entre las dos, el puntaje baja en línea recta. Dentro del óptimo es
 * «saludable»; de 0,4 a menos de 1, «moderado»; debajo de 0,4, «alto».
 *
 * Los umbrales son heurísticas basadas en la guía CKM 2026 (AHA/ACC/ADA/ASN) y en
 * definiciones usuales de práctica clínica: los revisa el equipo médico. El único ya
 * definido por la dirección médica es la cintura de la mujer (80 cm, 10/09/2026).
 *
 * Vino del dashboard (`src/ckm/scoring.ts`) sin cambiar un número, para que el portal
 * de la persona y el dashboard del equipo calculen igual. El estadío CKM no sale de
 * acá: es el de `evaluateCkmStage` (`ckm/staging.ts`), con sus propios cortes.
 */
import type { ValoresCkm } from './lectura.js';
import type { ParametroHgraph } from './parametros.js';

/** Estado de un valor en el hGraph. Las claves son contrato de datos (extensión `hGraphData`). */
export type EstadoMetricaHgraph = 'healthy' | 'moderate' | 'high';

/** Un punto del hGraph, listo para dibujar. */
export interface MetricaHgraph {
  id: ParametroHgraph;
  /** Nombre técnico, el que ve el equipo. */
  label: string;
  /** Último valor medido. */
  value: number;
  /** Unidad como vino, o la del parámetro si no vino ninguna. */
  unit: string;
  /** Puntaje de 0 (peor) a 1 (óptimo), redondeado a dos decimales para dibujar. */
  score: number;
  /** Sale del puntaje sin redondear (ver `estadoDePuntaje`). */
  status: EstadoMetricaHgraph;
}

export interface DefinicionMetricaHgraph {
  label: string;
  defaultUnit: string;
  /** Valor con puntaje 1 (óptimo) y valor con puntaje 0 (grave). */
  goodAt: number;
  badAt: number;
  /** La cola baja, en los parámetros que se salen por los dos lados (el potasio). */
  lowBadAt?: number;
  lowGoodAt?: number;
  /**
   * Umbrales propios de la mujer, sólo donde el sexo cambia el corte clínico de verdad.
   * Los parámetros que no lo llevan usan los de arriba para todo el mundo.
   */
  femenino?: { goodAt: number; badAt: number };
}

/** Puntaje desde el que un valor es «moderado» (y debajo del cual es «alto»). */
export const PUNTAJE_MODERADO = 0.4;

export const METRICAS_HGRAPH: Partial<Record<ParametroHgraph, DefinicionMetricaHgraph>> = {
  sbp: { label: 'PA sistólica', defaultUnit: 'mmHg', goodAt: 120, badAt: 180 },
  dbp: { label: 'PA diastólica', defaultUnit: 'mmHg', goodAt: 80, badAt: 110 },
  bmi: { label: 'IMC', defaultUnit: 'kg/m²', goodAt: 25, badAt: 40 },
  // El par del IDF: 94 cm en el varón, 80 en la mujer (el 80 lo definió el Director
  // Médico el 10/09/2026). Antes había un umbral para todo el mundo, el del varón, y a
  // una mujer se la medía con una vara 14 cm más indulgente. La punta grave se corre lo
  // mismo (−14 cm): cambia dónde empieza la rampa, no cuán rápido cae.
  waist: { label: 'Cintura', defaultUnit: 'cm', goodAt: 94, badAt: 125, femenino: { goodAt: 80, badAt: 111 } },
  glucoseFasting: { label: 'Glucemia ayunas', defaultUnit: 'mg/dL', goodAt: 100, badAt: 200 },
  hba1c: { label: 'HbA1c', defaultUnit: '%', goodAt: 5.7, badAt: 10 },
  cholesterolTotal: { label: 'Colesterol total', defaultUnit: 'mg/dL', goodAt: 200, badAt: 300 },
  nonHdlc: { label: 'Colesterol no-HDL', defaultUnit: 'mg/dL', goodAt: 130, badAt: 220 },
  ldlc: { label: 'LDL-C', defaultUnit: 'mg/dL', goodAt: 100, badAt: 190 },
  hdlc: { label: 'HDL-C', defaultUnit: 'mg/dL', goodAt: 50, badAt: 25 },
  triglycerides: { label: 'Triglicéridos', defaultUnit: 'mg/dL', goodAt: 150, badAt: 500 },
  creatinine: { label: 'Creatinina', defaultUnit: 'mg/dL', goodAt: 1.2, badAt: 3 },
  egfr: { label: 'TFGe', defaultUnit: 'mL/min/1.73m²', goodAt: 90, badAt: 15 },
  uacr: { label: 'UACR', defaultUnit: 'mg/g', goodAt: 30, badAt: 300 },
  potassium: { label: 'Potasio', defaultUnit: 'mmol/L', goodAt: 5.0, badAt: 6.5, lowGoodAt: 3.5, lowBadAt: 2.5 },
  ntProBNP: { label: 'NT-proBNP', defaultUnit: 'pg/mL', goodAt: 125, badAt: 2000 },
  hsCtnI: { label: 'Troponina I us', defaultUnit: 'ng/L', goodAt: 26, badAt: 100 },
  cac: { label: 'Score de calcio', defaultUnit: 'Agatston', goodAt: 0, badAt: 400 },
};

function acotar01(valor: number): number {
  return Math.min(1, Math.max(0, valor));
}

/**
 * Los umbrales que le corresponden a esta persona. Sin sexo conocido se usan los de
 * base, a propósito: inventar un sexo para elegir un umbral es peor que medir con el
 * de base y que se vea.
 */
export function umbralesDe(parametro: ParametroHgraph, sexo?: string): DefinicionMetricaHgraph | undefined {
  const definicion = METRICAS_HGRAPH[parametro];
  if (!definicion) {
    return undefined;
  }
  return sexo === 'female' && definicion.femenino ? { ...definicion, ...definicion.femenino } : definicion;
}

/** Puntaje de 0 a 1: 1 dentro del óptimo, 0 en el valor grave, en línea recta entre los dos. */
export function puntajeMetrica(parametro: ParametroHgraph, valor: number, sexo?: string): number {
  const definicion = umbralesDe(parametro, sexo);
  if (!definicion) {
    return 0.5;
  }
  // Cola baja (hipopotasemia): debajo del rango bueno el puntaje cae.
  if (definicion.lowGoodAt !== undefined && definicion.lowBadAt !== undefined && valor < definicion.lowGoodAt) {
    return acotar01((valor - definicion.lowBadAt) / (definicion.lowGoodAt - definicion.lowBadAt));
  }
  // goodAt > badAt significa «más bajo es peor» (TFGe, HDL).
  return acotar01(1 - (valor - definicion.goodAt) / (definicion.badAt - definicion.goodAt));
}

/**
 * El estado de un valor.
 *
 * «Saludable» sólo dentro del óptimo (puntaje 1), no en el 25 % superior de la rampa.
 * Con el corte anterior en 0,75 el verde llegaba mucho más lejos que el óptimo, porque
 * `badAt` es un valor grave y no el borde del rango: una glucemia de 103 y unos
 * triglicéridos de 168 se dibujaban verdes mientras el panel de biomarcadores los
 * marcaba altos con el mismo número.
 *
 * Recibe el puntaje sin redondear: con el redondeo del dibujo, una glucemia de 100,4
 * daría 1,00 y volvería a ser verde estando afuera.
 */
export function estadoDePuntaje(puntaje: number): EstadoMetricaHgraph {
  if (puntaje >= 1) {
    return 'healthy';
  }
  return puntaje >= PUNTAJE_MODERADO ? 'moderate' : 'high';
}

/**
 * Límites de valor crítico: riesgo inmediato que amerita avisar al profesional aunque
 * el estadío no cambie. Crítico si el valor es mayor o igual a `max`, o menor a `min`.
 * Se revisan con el equipo médico.
 */
export const LIMITES_CRITICOS_CKM: Partial<Record<ParametroHgraph, { min?: number; max?: number }>> = {
  sbp: { max: 180 },
  dbp: { max: 110 },
  potassium: { min: 2.8, max: 6.0 },
  egfr: { min: 30 },
  glucoseFasting: { min: 60, max: 300 },
  hsCtnI: { max: 100 },
  ntProBNP: { max: 2000 },
};

export interface ValorCriticoCkm {
  param: ParametroHgraph;
  value: number;
  unit?: string;
  /** Para el equipo («Valor crítico: PA sistólica 185 mmHg»). */
  message: string;
}

/** Los valores críticos entre los que se pasan. */
export function valoresCriticos(valores: ValoresCkm): ValorCriticoCkm[] {
  const resultado: ValorCriticoCkm[] = [];
  for (const [parametro, limites] of Object.entries(LIMITES_CRITICOS_CKM) as [
    ParametroHgraph,
    { min?: number; max?: number },
  ][]) {
    const observado = valores[parametro];
    if (!observado) {
      continue;
    }
    const critico =
      (limites.max !== undefined && observado.value >= limites.max) ||
      (limites.min !== undefined && observado.value < limites.min);
    if (critico) {
      const label = METRICAS_HGRAPH[parametro]?.label ?? parametro;
      const unidad = observado.unit ?? METRICAS_HGRAPH[parametro]?.defaultUnit ?? '';
      resultado.push({
        param: parametro,
        value: observado.value,
        unit: observado.unit,
        message: `Valor crítico: ${label} ${observado.value} ${unidad}`.trim(),
      });
    }
  }
  return resultado;
}

/**
 * Los puntos del hGraph a partir del último valor de cada parámetro. Un parámetro sin
 * valor no da punto: qué mostrar por lo que falta lo decide cada pantalla.
 *
 * El sexo entra porque algún umbral depende de él (hoy, la cintura).
 */
export function metricasHgraph(valores: ValoresCkm, sexo?: string): MetricaHgraph[] {
  const metricas: MetricaHgraph[] = [];
  for (const [parametro, definicion] of Object.entries(METRICAS_HGRAPH) as [ParametroHgraph, DefinicionMetricaHgraph][]) {
    const observado = valores[parametro];
    if (!observado) {
      continue;
    }
    const exacto = puntajeMetrica(parametro, observado.value, sexo);
    metricas.push({
      id: parametro,
      label: definicion.label,
      value: observado.value,
      unit: observado.unit ?? definicion.defaultUnit,
      score: Math.round(exacto * 100) / 100,
      status: estadoDePuntaje(exacto),
    });
  }
  return metricas;
}
