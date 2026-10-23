/**
 * Lectura de las Observations del hGraph, la haya cargado la persona o el equipo.
 *
 * Contrato de registro:
 * - Presión arterial: una sola Observation 85354-9 con componentes 8480-6
 *   (sistólica) y 8462-4 (diastólica). Se tolera también la forma vieja de dos
 *   Observations sueltas, para no perder lo cargado antes de unificarla.
 * - Lo demás: una Observation por parámetro, con su código (`parametros.ts`) y
 *   `valueQuantity`.
 *
 * Es lógica pura: quien llama trae las Observations (sin las `entered-in-error`) y
 * acá se elige el último valor de cada parámetro. Vino del dashboard
 * (`src/ckm/observations.ts`) con el mismo comportamiento; la búsqueda contra el
 * servidor se quedó allá.
 *
 * Tres guardarraíles, todos motivados por casos reales del dashboard:
 * - un orden de lectura único, para que dos pantallas no elijan lecturas distintas
 *   del mismo dato;
 * - los rangos de plausibilidad, que descartan un error de carga antes de que se
 *   pinte con el color que le toque;
 * - la HbA1c en mmol/mol, que se convierte a % en vez de leerse como una diabetes
 *   grave falsa.
 */
import type { Observation } from '@medplum/fhirtypes';
import { SYSTEM } from '../terminology/systems.js';
import { CODIGOS_LECTURA_CKM, LOINC_PARAMETRO_CKM, LOINC_SINONIMOS_CKM } from './parametros.js';
import type { ParametroHgraph } from './parametros.js';

/** Un valor leído: el número, la unidad como vino y la fecha clínica. */
export interface ValorCkm {
  value: number;
  unit?: string;
  /** Fecha clínica de la medición (ver `fechaDeLectura`). */
  date?: string;
}

/** El último valor de cada parámetro. */
export type ValoresCkm = Partial<Record<ParametroHgraph, ValorCkm>>;

/** Todas las lecturas de cada parámetro, de la más nueva a la más vieja. */
export type HistorialCkm = Partial<Record<ParametroHgraph, ValorCkm[]>>;

// Código LOINC → parámetro, con los sinónimos de cada laboratorio.
const CODIGO_A_PARAMETRO = new Map<string, ParametroHgraph>(
  (Object.entries(LOINC_PARAMETRO_CKM) as [ParametroHgraph, string][]).map(([parametro, codigo]) => [codigo, parametro]),
);
for (const [parametro, codigos] of Object.entries(LOINC_SINONIMOS_CKM) as [ParametroHgraph, readonly string[]][]) {
  for (const codigo of codigos) {
    CODIGO_A_PARAMETRO.set(codigo, parametro);
  }
}

function tieneCodigo(concepto: { coding?: { system?: string; code?: string }[] } | undefined, codigo: string): boolean {
  return Boolean(concepto?.coding?.some((c) => c.code === codigo && (!c.system || c.system === SYSTEM.loinc)));
}

/**
 * Fecha clínica de una lectura: la de la medición, o la de emisión, o la de carga, en
 * ese orden.
 */
export function fechaDeLectura(observation: Observation): string {
  return observation.effectiveDateTime ?? observation.issued ?? observation.meta?.lastUpdated ?? '';
}

/**
 * Orden canónico de lectura: de la más nueva a la más vieja y, a igual fecha, por id.
 * Todo lector del último valor recorre en este orden y se queda con la primera.
 *
 * Sin el desempate por id, cuando dos análisis del mismo informe compartían código y
 * fecha, dos pantallas de la misma ficha elegían lecturas distintas, y el hGraph
 * cambiaba de valor según el orden en que el servidor devolviera los recursos.
 */
export function compararLecturas(a: Observation, b: Observation): number {
  const porFecha = fechaDeLectura(b).localeCompare(fechaDeLectura(a));
  return porFecha !== 0 ? porFecha : (a.id ?? '').localeCompare(b.id ?? '');
}

/**
 * Rangos de plausibilidad, no clínicos: fuera de esto el valor no es un hallazgo sino
 * un error de carga.
 *
 * El caso que los motivó: un colesterol no-HDL de 214 mg/dL quedó guardado con el
 * código del HDL, y el hGraph lo mostró como «HDL-C 214 mg/dl · Saludable», en verde.
 * Un HDL de 214 mg/dL no existe.
 *
 * Son anchos a propósito: sólo descartan lo imposible, no lo grave. Un valor
 * patológico tiene que llegar entero al médico. Se revisan con el equipo médico antes
 * de ajustarlos.
 */
export const LIMITES_PLAUSIBLES_CKM: Partial<Record<ParametroHgraph, { min: number; max: number }>> = {
  sbp: { min: 50, max: 300 },
  dbp: { min: 20, max: 200 },
  bmi: { min: 8, max: 100 },
  waist: { min: 30, max: 250 },
  glucoseFasting: { min: 20, max: 900 },
  cholesterolTotal: { min: 40, max: 900 },
  nonHdlc: { min: 10, max: 800 },
  ldlc: { min: 5, max: 700 },
  // El techo del HDL es el que atajó el caso real. Una hiperalfalipoproteinemia
  // llega a ~120 mg/dL; por encima de 150 es otro analito mal codificado.
  hdlc: { min: 5, max: 150 },
  triglycerides: { min: 10, max: 6000 },
  creatinine: { min: 0.1, max: 25 },
  egfr: { min: 1, max: 200 },
  uacr: { min: 0, max: 25000 },
  potassium: { min: 1, max: 10 },
};

/**
 * La unidad en la que están escritos los límites de arriba, que es como informan los
 * laboratorios argentinos.
 *
 * Los límites son números en una escala: aplicados a otra borran datos buenos (un LDL
 * de 3,5 mmol/L, alto, cae debajo del piso de 5). Si la unidad no es una de éstas, el
 * guardarraíl no opina y el valor pasa: dejar entrar un valor raro se arregla
 * mirándolo; borrar una medición buena, no.
 */
const UNIDAD_DE_LOS_LIMITES: Partial<Record<ParametroHgraph, RegExp>> = {
  sbp: /^mm\s*hg$/,
  dbp: /^mm\s*hg$/,
  bmi: /^kg\/m2?$/,
  waist: /^cm$/,
  glucoseFasting: /^(mg\/dl|mg%)$/,
  cholesterolTotal: /^(mg\/dl|mg%)$/,
  nonHdlc: /^(mg\/dl|mg%)$/,
  ldlc: /^(mg\/dl|mg%)$/,
  hdlc: /^(mg\/dl|mg%)$/,
  triglycerides: /^(mg\/dl|mg%)$/,
  creatinine: /^(mg\/dl|mg%)$/,
  egfr: /^ml\/min(\/1\.73\s*m2?)?$/,
  uacr: /^(mg\/g|mg\/gcr|ug\/mg)$/,
  potassium: /^(mmol\/l|meq\/l)$/,
};

function normalizarUnidad(unidad: string): string {
  return unidad.toLowerCase().replace(/²/g, '2').replace(/\s+/g, ' ').trim();
}

/**
 * true si la unidad informada permite comparar el valor con los límites. Sin unidad se
 * asume la convencional, que es como vienen la mayoría de las Observations.
 */
export function unidadComparable(parametro: ParametroHgraph, unidad: string | undefined): boolean {
  const esperada = UNIDAD_DE_LOS_LIMITES[parametro];
  if (!esperada || !unidad || !unidad.trim()) {
    return true;
  }
  return esperada.test(normalizarUnidad(unidad));
}

/**
 * true si el valor está fuera de lo fisiológicamente posible. Con una unidad que no es
 * la de los límites devuelve false: no se puede comparar y no se descarta a ciegas.
 */
export function esImplausible(parametro: ParametroHgraph, valor: number, unidad?: string): boolean {
  const limite = LIMITES_PLAUSIBLES_CKM[parametro];
  if (!limite || !unidadComparable(parametro, unidad)) {
    return false;
  }
  return !Number.isFinite(valor) || valor < limite.min || valor > limite.max;
}

/** El parámetro que identifica un código LOINC (primario o sinónimo), si es uno. */
export function parametroDeCodigo(codigo: string): ParametroHgraph | undefined {
  return CODIGO_A_PARAMETRO.get(codigo);
}

/**
 * El mismo guardarraíl, preguntado por código: para que un panel de biomarcadores lo
 * aplique sin conocer los parámetros del hGraph. Para un código que no es del hGraph
 * devuelve false: no hay rango definido y no se inventa uno.
 */
export function esImplausibleParaCodigo(codigo: string, valor: number, unidad?: string): boolean {
  const parametro = CODIGO_A_PARAMETRO.get(codigo);
  return parametro !== undefined && esImplausible(parametro, valor, unidad);
}

// HbA1c: PREVENT, LE8 y el estadío esperan NGSP (%). Algunos laboratorios la informan
// en IFCC (mmol/mol), otra escala (34 mmol/mol ≈ 5,3 %): leerla como % sería una
// diabetes grave falsa. Se convierte con la ecuación maestra NGSP; y si el valor es
// imposible como % (más de 20) sin que la unidad diga mmol/mol, se descarta.
const HBA1C_MMOL = /mmol\s*\/\s*mol/i;

function normalizarHba1c(valor: number, unidad: string | undefined): { value: number; unit?: string } | undefined {
  if (unidad && HBA1C_MMOL.test(unidad)) {
    return { value: Math.round((0.09148 * valor + 2.152) * 10) / 10, unit: '%' };
  }
  if (valor > 20) {
    return undefined;
  }
  return { value: valor, unit: unidad };
}

function asignar(
  resultado: ValoresCkm,
  parametro: ParametroHgraph,
  valor: number,
  unidad: string | undefined,
  fecha?: string,
): void {
  if (parametro === 'hba1c') {
    const normalizada = normalizarHba1c(valor, unidad);
    if (normalizada) {
      resultado[parametro] = { ...normalizada, date: fecha };
    }
    return;
  }
  // Un valor imposible no entra: ni al gráfico, ni al estadío, ni a PREVENT.
  if (esImplausible(parametro, valor, unidad)) {
    return;
  }
  resultado[parametro] = { value: valor, unit: unidad, date: fecha };
}

/**
 * Los valores del hGraph que trae una Observation, en cualquiera de las dos formas
 * (panel de presión con componentes o una Observation por parámetro). La HbA1c sale
 * en %.
 */
export function valoresDeObservation(observation: Observation): ValoresCkm {
  const resultado: ValoresCkm = {};
  const fecha = fechaDeLectura(observation) || undefined;

  for (const componente of observation.component ?? []) {
    for (const [codigo, parametro] of CODIGO_A_PARAMETRO) {
      if (tieneCodigo(componente.code, codigo) && componente.valueQuantity?.value !== undefined) {
        asignar(resultado, parametro, componente.valueQuantity.value, componente.valueQuantity.unit, fecha);
      }
    }
  }

  if (observation.valueQuantity?.value !== undefined) {
    for (const [codigo, parametro] of CODIGO_A_PARAMETRO) {
      if (tieneCodigo(observation.code, codigo)) {
        asignar(resultado, parametro, observation.valueQuantity.value, observation.valueQuantity.unit, fecha);
      }
    }
  }

  return resultado;
}

/**
 * Una presión con la sistólica menor o igual a la diastólica es imposible: casi
 * siempre es una carga con los campos cruzados (87/160).
 */
export function presionImplausible(valores: ValoresCkm): boolean {
  return valores.sbp !== undefined && valores.dbp !== undefined && valores.sbp.value <= valores.dbp.value;
}

/**
 * Los valores de una Observation que entran al cálculo: los de `valoresDeObservation`,
 * sin la presión si la lectura es imposible.
 */
export function valoresUtilizables(observation: Observation): ValoresCkm {
  const valores = valoresDeObservation(observation);
  if (presionImplausible(valores)) {
    delete valores.sbp;
    delete valores.dbp;
  }
  return valores;
}

/**
 * El último valor de cada parámetro. Recorre en el orden canónico
 * (`compararLecturas`) y gana la primera lectura utilizable: una presión imposible no
 * pisa la válida anterior.
 */
export function ultimosValoresCkm(observations: readonly Observation[]): ValoresCkm {
  const ordenadas = [...observations].sort(compararLecturas);
  const resultado: ValoresCkm = {};
  for (const observation of ordenadas) {
    for (const [parametro, valor] of Object.entries(valoresUtilizables(observation)) as [ParametroHgraph, ValorCkm][]) {
      if (resultado[parametro] === undefined) {
        resultado[parametro] = valor;
      }
    }
  }
  return resultado;
}

/** Todas las lecturas utilizables de cada parámetro, de la más nueva a la más vieja. */
export function historialCkm(observations: readonly Observation[]): HistorialCkm {
  const ordenadas = [...observations].sort(compararLecturas);
  const resultado: HistorialCkm = {};
  for (const observation of ordenadas) {
    for (const [parametro, valor] of Object.entries(valoresUtilizables(observation)) as [ParametroHgraph, ValorCkm][]) {
      (resultado[parametro] ??= []).push(valor);
    }
  }
  return resultado;
}

const CODIGOS_CKM = new Set(CODIGOS_LECTURA_CKM);

/**
 * ¿Es una Observation del hGraph, por su código, aunque no traiga un valor legible? Un
 * recálculo tiene que correr también cuando una edición le saca el valor a una lectura
 * (pasa a «Mayor a 90», por ejemplo).
 */
export function esObservationCkm(observation: Observation): boolean {
  const conceptos = [observation.code, ...(observation.component ?? []).map((c) => c.code)];
  return conceptos.some((concepto) =>
    (concepto?.coding ?? []).some(
      (c) => c.code !== undefined && CODIGOS_CKM.has(c.code) && (!c.system || c.system === SYSTEM.loinc),
    ),
  );
}
