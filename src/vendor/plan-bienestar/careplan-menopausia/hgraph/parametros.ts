/**
 * Los parámetros del hGraph CKM y sus códigos LOINC.
 *
 * El hGraph es el mapa de valores de la persona (presión, peso, glucemia, lípidos,
 * riñón, corazón) que ve el equipo en el dashboard y la persona en el portal. Los dos
 * lo calculan con este módulo, para que con los mismos datos no muestren cosas
 * distintas. Nació en el dashboard (`src/ckm/constants.ts`) y se mudó acá sin cambiar
 * un código.
 *
 * Las claves (`sbp`, `egfr`, …) son contrato de datos: el bot `ckm-recalculate` las
 * escribe como `id` de cada métrica en la extensión `hGraphData` del Patient. No se
 * renombran.
 *
 * La lectura acepta el código primario y sus sinónimos; la escritura usa siempre el
 * primario.
 */

/** Código LOINC primario de cada parámetro del hGraph. */
export const LOINC_PARAMETRO_CKM = {
  // Presión arterial
  sbp: '8480-6',
  dbp: '8462-4',
  // Antropometría
  bmi: '39156-5',
  waist: '56086-2',
  // Metabólico
  glucoseFasting: '1558-6',
  hba1c: '4548-4',
  // Lípidos
  cholesterolTotal: '2093-3',
  ldlc: '13457-7',
  hdlc: '2085-9',
  nonHdlc: '43396-1',
  triglycerides: '2571-8',
  // Renal
  creatinine: '38483-4',
  egfr: '62238-1',
  uacr: '9318-7',
  potassium: '6298-4',
  // Cardíaco
  ntProBNP: '33762-6',
  // Troponina I cardíaca de alta sensibilidad (ultra sensible)
  hsCtnI: '89579-7',
  cac: '41970-0',
} as const;

/** Clave de un parámetro del hGraph (ej. `'sbp'`, `'egfr'`). */
export type ParametroHgraph = keyof typeof LOINC_PARAMETRO_CKM;

/**
 * Códigos LOINC alternativos que distintos laboratorios usan para el mismo parámetro:
 * - TFGe: CKD-EPI 2021 (98979-8 creatinina, 98980-6 creatinina y cistatina C) además
 *   del CKD-EPI 2009 primario (62238-1). Sin esto, PREVENT no ve la TFGe.
 * - LDL: medido o genérico (2089-1) además del calculado (13457-7).
 * - Creatinina: 2160-0 es el LOINC de suero más frecuente.
 * - HbA1c: IFCC en mmol/mol (59261-8) además de NGSP en % (4548-4). El lector la
 *   convierte a % (`lectura.ts`), porque son escalas distintas.
 * - Cintura: 8280-0 (a la altura del ombligo, con cinta) es la del Plan Bienestar
 *   (`LOINC.waistCircumference`) y la que guarda la persona en «Mis datos» del portal; el
 *   primario (56086-2) es el que carga el equipo en el dashboard. Sin esto, la cintura que
 *   carga la persona no llegaba al hGraph (23/10/2026).
 */
export const LOINC_SINONIMOS_CKM: Partial<Record<ParametroHgraph, readonly string[]>> = {
  waist: ['8280-0'],
  egfr: ['98979-8', '98980-6'],
  ldlc: ['2089-1'],
  creatinine: ['2160-0'],
  hba1c: ['59261-8'],
};

/**
 * Panel de presión arterial: una sola Observation 85354-9 con los componentes 8480-6
 * (sistólica) y 8462-4 (diastólica). Es la forma canónica, la cargue la persona o el
 * equipo; el lector acepta también la forma vieja de dos Observations sueltas.
 */
export const LOINC_PANEL_PA = '85354-9';

/** Todos los códigos que hay que buscar para leer el hGraph: primarios, sinónimos y el panel de PA. */
export const CODIGOS_LECTURA_CKM: readonly string[] = [
  ...Object.values(LOINC_PARAMETRO_CKM),
  ...Object.values(LOINC_SINONIMOS_CKM).flatMap((codigos) => codigos ?? []),
  LOINC_PANEL_PA,
];
