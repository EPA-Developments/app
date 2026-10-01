// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Paneles de Biomarcadores (Historia Clínica): el laboratorio de rutina de la salud
 * cardiovascular de la mujer en la menopausia, en 7 grupos más "Menopausia".
 *
 * Los ANALITOS de cada panel (códigos LOINC, unidad UCUM, nivel esencial/extensivo y
 * rangos de guía) los publica el servidor como `ObservationDefinition`
 * (EPA-Developments/recepcionistas, `src/config/biomarcadores.ts`) y los trae
 * `src/fhir/biomarkers.ts`. Acá solo viven los paneles: el mismo `id` que el código de
 * `CodeSystem/panel-biomarcador` del servidor, con su título y descripción para la
 * paciente.
 *
 * Salud CONVENCIONAL: los rangos son los de las guías (AHA/ACC, NCEP, ADA, CKM 2026);
 * si la guía no fija uno, vale el del laboratorio de cada informe.
 */

export interface BiomarkerRange {
  readonly low?: number;
  readonly high?: number;
}

/** Rango específico de un sexo (sobrescribe el rango por defecto). */
export interface SexRanges {
  readonly conventional?: BiomarkerRange;
}

/** Esencial: el laboratorio de rutina de base. Extensivo: según la clínica y el estadío. */
export type NivelLaboratorio = 'esencial' | 'extensivo';

/** Un código del analito (el principal y sus equivalentes, p. ej. eGFR 62238-1 y 33914-3). */
export interface BiomarkerCoding {
  readonly system?: string;
  readonly code: string;
}

export interface Biomarker {
  /** Código principal del analito (LOINC, o local de Segunda Opinión Médica). */
  readonly code: string;
  /** Sistema del código principal. Omitido = LOINC (`http://loinc.org`). */
  readonly system?: string;
  /** Todos los códigos del analito; omitido = solo el principal. */
  readonly codings?: readonly BiomarkerCoding[];
  /** Nombre visible en español. */
  readonly title: string;
  /** Unidad UCUM. */
  readonly unit: string;
  /** Unidad como la lee la paciente (mEq/L, mL/min/1,73 m²…), si difiere de la UCUM. */
  readonly unitText?: string;
  /** Descripción breve para el paciente. */
  readonly description: string;
  /** Clave del analito (`e_gfr`, `creatinina_serica`…), la misma en el servidor y el pedido. */
  readonly slug?: string;
  readonly nivel?: NivelLaboratorio;
  /** Para los esenciales: este analito cubre a otro (p. ej. BUN cubre `urea_serica`). */
  readonly cuentaComo?: string;
  /** Rango de la guía (por defecto / unisex). */
  readonly conventional?: BiomarkerRange;
  /** Rangos para pacientes masculinos (sobrescriben el de arriba). */
  readonly male?: SexRanges;
  /** Rangos para pacientes femeninos (sobrescriben el de arriba). */
  readonly female?: SexRanges;
}

export interface BiomarkerPanelType {
  /** Slug usado en la ruta /health-record/biomarkers/:panelId (= código del panel en el servidor). */
  readonly id: string;
  /** Título visible (menú y página). */
  readonly title: string;
  /** Descripción del panel para el paciente. */
  readonly description: string;
}

/** Los paneles, en el orden del menú (los esenciales primero). */
export const biomarkerPanels: Record<string, BiomarkerPanelType> = {
  metabolico: {
    id: 'metabolico',
    title: 'Perfil básico y riesgo cardiovascular',
    description: 'Lípidos y glucosa: la base del riesgo cardiovascular y de la estadificación cardio-reno-metabólica.',
  },
  renal: {
    id: 'renal',
    title: 'Función renal y síndrome cardiorrenal',
    description:
      'Creatinina, filtrado glomerular y albuminuria: cómo está el riñón dentro del síndrome cardio-reno-metabólico.',
  },
  electrolitos: {
    id: 'electrolitos',
    title: 'Electrolitos y conducción eléctrica',
    description: 'Potasio, sodio, magnesio, calcio y cloro: claves con diuréticos, IECA/ARA-II y en las arritmias.',
  },
  cardiaco: {
    id: 'cardiaco',
    title: 'Biomarcadores cardíacos',
    description:
      'Troponinas de alta sensibilidad y péptidos natriuréticos: daño del músculo cardíaco e insuficiencia cardíaca.',
  },
  inflamatorios: {
    id: 'inflamatorios',
    title: 'Inflamación y riesgo residual',
    description: 'Inflamación, lipoproteína(a) y apolipoproteínas: el riesgo que queda más allá del colesterol LDL.',
  },
  hematologia: {
    id: 'hematologia',
    title: 'Hematología, coagulación y trombosis',
    description: 'Anemia, hierro, plaquetas y coagulación.',
  },
  endocrinologia: {
    id: 'endocrinologia',
    title: 'Eje endocrino y metabólico secundario',
    description: 'Tiroides, cortisol, vitamina D e hígado (hígado graso metabólico).',
  },
  menopausia: {
    id: 'menopausia',
    title: 'Menopausia',
    description:
      'Las hormonas de la transición menopáusica y la resistencia a la insulina, que cambian el riesgo cardiovascular de la mujer.',
  },
};

/** Sexo del paciente para resolver rangos. Solo 'male' / 'female' ajustan rangos. */
export type PatientSex = 'male' | 'female' | undefined;

/** ¿El biomarcador define rangos específicos por sexo? */
export function isSexSpecific(bm: Biomarker): boolean {
  return Boolean(bm.male || bm.female);
}

/**
 * Resuelve el rango de guía aplicable a un paciente. Si hay rango específico para su
 * sexo, lo usa; si no, cae al rango por defecto (unisex). Para sexo desconocido usa
 * siempre el por defecto.
 */
export function resolveBiomarkerRanges(bm: Biomarker, sex: PatientSex): { conventional?: BiomarkerRange } {
  const override = sex ? bm[sex] : undefined;
  return { conventional: override?.conventional ?? bm.conventional };
}
