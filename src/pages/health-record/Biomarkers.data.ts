// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Catálogo de paneles de biomarcadores de Segunda Opinión Médica.
 *
 * Cada panel se expone como una sección de menú dentro de "Biomarcadores"
 * (Historia Clínica) y permite al paciente cargar y visualizar sus resultados
 * de laboratorio. Cada biomarcador se persiste como un recurso FHIR
 * `Observation` (category=laboratory) en el servidor Medplum.
 *
 * FUENTES (validado contra los documentos de Segunda Opinión Médica en junio 2026):
 *  - Rangos FUNCIONALES / óptimos: tabla institucional de biomarcadores (v1)
 *    (referencia clínica institucional).
 *  - Rangos CONVENCIONALES: rango de laboratorio (lab Stamboulian), según
 *    decisión del equipo (es lo que el paciente ve en su estudio).
 *  - El manual de protocolos institucional NO contiene datos de laboratorio
 *    (es catálogo de servicios y precios), por lo que no aplica acá.
 *
 * ⚠️ LOINC: ninguna fuente de Segunda Opinión Médica especifica códigos LOINC. Los códigos
 * `http://loinc.org` de abajo provienen del estándar internacional y son
 * PROVISIONALES: deben validarse contra el mapeo real del laboratorio. Los
 * marcadores sin LOINC estándar (HOMA-IR, ratios, edad biológica, etc.) usan
 * el sistema de códigos local de Segunda Opinión Médica (`SOM_BIOMARKER_SYSTEM`).
 *
 * Las unidades son las informadas por la fuente; su normalización a UCUM
 * estricto es una mejora pendiente.
 */

/** Sistema de códigos local de Segunda Opinión Médica para analitos sin LOINC estándar. */
export const SOM_BIOMARKER_SYSTEM = 'https://segundaopinionmedica.org/fhir/CodeSystem/biomarker';

export interface BiomarkerRange {
  readonly low?: number;
  readonly high?: number;
}

/** Rangos específicos por sexo (sobrescriben los rangos por defecto). */
export interface SexRanges {
  readonly conventional?: BiomarkerRange;
  readonly functional?: BiomarkerRange;
}

export interface Biomarker {
  /** Código del analito (LOINC por defecto, o local de Segunda Opinión Médica). */
  readonly code: string;
  /** Sistema de códigos. Omitido = LOINC (`http://loinc.org`). */
  readonly system?: string;
  /** Nombre visible en español. */
  readonly title: string;
  /** Unidad de medida. */
  readonly unit: string;
  /** Descripción breve para el paciente. */
  readonly description: string;
  /** Rango de referencia convencional del laboratorio (por defecto / unisex). */
  readonly conventional?: BiomarkerRange;
  /** Rango funcional / óptimo (Tabla institucional Segunda Opinión Médica, por defecto / unisex). */
  readonly functional?: BiomarkerRange;
  /** Rangos para pacientes masculinos (sobrescriben los de arriba). */
  readonly male?: SexRanges;
  /** Rangos para pacientes femeninos (sobrescriben los de arriba). */
  readonly female?: SexRanges;
}

export interface BiomarkerPanelType {
  /** Slug usado en la ruta /health-record/biomarkers/:panelId */
  readonly id: string;
  /** Título visible (menú y página). */
  readonly title: string;
  /** Descripción del panel para el paciente. */
  readonly description: string;
  readonly biomarkers: Biomarker[];
}

export const biomarkerPanels: Record<string, BiomarkerPanelType> = {
  endocrinologia: {
    id: 'endocrinologia',
    title: 'Endocrinología / Hormonal',
    description:
      'Marcadores del eje tiroideo, suprarrenal y hormonas sexuales. Permiten evaluar el equilibrio hormonal, la energía y la composición corporal.',
    biomarkers: [
      {
        code: '3016-3',
        title: 'TSH (Tirotrofina)',
        unit: 'mIU/L',
        description: 'Hormona que regula la función de la tiroides.',
        conventional: { low: 0.27, high: 4.2 },
        functional: { low: 0.5, high: 2.0 },
      },
      {
        code: '3024-7',
        title: 'T4 Libre',
        unit: 'ng/dL',
        description: 'Hormona tiroidea libre disponible para los tejidos.',
        conventional: { low: 0.93, high: 1.7 },
      },
      {
        code: '3051-0',
        title: 'T3 Libre',
        unit: 'pg/mL',
        description: 'Forma activa de la hormona tiroidea.',
        conventional: { low: 2.0, high: 4.4 },
        functional: { low: 3.5, high: 4.5 },
      },
      {
        code: '30187-9',
        system: SOM_BIOMARKER_SYSTEM,
        title: 'T3 Reversa (rT3)',
        unit: 'ng/dL',
        description: 'Forma inactiva de la T3; se eleva en estrés y enfermedad.',
        conventional: { high: 25 },
        functional: { high: 15 },
      },
      {
        code: '2143-6',
        title: 'Cortisol (matinal)',
        unit: 'ug/dL',
        description: 'Hormona del estrés; se mide preferentemente por la mañana.',
        conventional: { low: 6, high: 23 },
        functional: { low: 10, high: 18 },
      },
      {
        code: '2484-4',
        title: 'Insulina (ayunas)',
        unit: 'uIU/mL',
        description: 'Hormona que regula la glucemia; clave en resistencia a la insulina.',
        conventional: { low: 2.6, high: 24.9 },
        functional: { high: 5 },
      },
      {
        code: '2986-8',
        title: 'Testosterona total',
        unit: 'ng/mL',
        description: 'Principal hormona androgénica. Los rangos difieren por sexo (en mujeres es mucho menor).',
        male: { conventional: { low: 1.93, high: 7.4 } },
        female: { conventional: { low: 0.15, high: 0.7 } },
      },
      {
        code: '2991-8',
        title: 'Testosterona libre',
        unit: 'pg/mL',
        description: 'Fracción de testosterona biológicamente activa. Los rangos difieren por sexo.',
        male: { conventional: { low: 38, high: 190 } },
        female: { conventional: { low: 8, high: 27 } },
      },
      {
        code: '2191-5',
        title: 'DHEA-S',
        unit: 'ug/dL',
        description: 'Precursor hormonal suprarrenal asociado a vitalidad y longevidad.',
        conventional: { low: 50, high: 450 },
        functional: { low: 350, high: 500 },
      },
      {
        code: '13967-5',
        title: 'SHBG',
        unit: 'nmol/L',
        description: 'Proteína transportadora de hormonas sexuales.',
        conventional: { low: 18.3, high: 54.1 },
        functional: { low: 20, high: 40 },
      },
      {
        code: '2243-4',
        title: 'Estradiol (E2)',
        unit: 'pg/mL',
        description:
          'Principal estrógeno. En mujeres premenopáusicas varía con la fase del ciclo: folicular 20–150, ovulatoria 150–750, lútea 30–450; posmenopausia < 20–30 pg/mL.',
        male: { conventional: { low: 25, high: 43.2 }, functional: { low: 20, high: 35 } },
        female: { conventional: { low: 30, high: 400 } },
      },
      {
        code: '50398-7',
        title: 'IGF-1 (Somatomedina C)',
        unit: 'ng/mL',
        description: 'Mediador de la hormona de crecimiento; varía con la edad.',
        conventional: { low: 100, high: 300 },
        functional: { low: 150, high: 250 },
      },
    ],
  },
  inflamatorios: {
    id: 'inflamatorios',
    title: 'Biomarcadores Inflamatorios',
    description:
      'Marcadores de inflamación sistémica de bajo grado, asociados al riesgo cardiovascular, metabólico y de envejecimiento.',
    biomarkers: [
      {
        code: '30522-7',
        title: 'PCR ultrasensible (hs-CRP)',
        unit: 'mg/L',
        description: 'Proteína C reactiva de alta sensibilidad; marcador de inflamación.',
        conventional: { high: 5.0 },
        functional: { high: 0.5 },
      },
      {
        code: '13965-9',
        title: 'Homocisteína',
        unit: 'umol/L',
        description: 'Aminoácido asociado a riesgo cardiovascular y metilación.',
        conventional: { high: 15 },
        functional: { high: 7 },
      },
      {
        code: '2276-4',
        title: 'Ferritina',
        unit: 'ng/mL',
        description: 'Reserva de hierro; también es un reactante de fase aguda.',
        conventional: { low: 30, high: 400 },
        functional: { low: 50, high: 100 },
        male: { conventional: { low: 12, high: 300 } },
        female: { conventional: { low: 12, high: 150 } },
      },
      {
        code: '3255-7',
        title: 'Fibrinógeno',
        unit: 'mg/dL',
        description: 'Proteína de la coagulación que se eleva con la inflamación.',
        conventional: { low: 220, high: 496 },
      },
      {
        code: '30341-2',
        title: 'Eritrosedimentación (VSG)',
        unit: 'mm/h',
        description: 'Velocidad de sedimentación globular; marcador inespecífico de inflamación.',
        conventional: { high: 20 },
        functional: { high: 10 },
        male: { conventional: { high: 20 } },
        female: { conventional: { high: 30 } },
      },
      {
        code: '26881-3',
        title: 'Interleuquina-6 (IL-6)',
        unit: 'pg/mL',
        description: 'Citoquina proinflamatoria.',
        conventional: { high: 5.9 },
        functional: { high: 2 },
      },
      {
        code: '2324-2',
        title: 'GGT (Gamma-glutamil transferasa)',
        unit: 'U/L',
        description: 'Enzima hepática; marcador de estrés oxidativo y salud metabólica.',
        conventional: { low: 8, high: 61 },
        functional: { high: 20 },
      },
      {
        code: 'aa-epa-ratio',
        system: SOM_BIOMARKER_SYSTEM,
        title: 'Ratio AA/EPA',
        unit: 'ratio',
        description: 'Relación ácido araquidónico / EPA; índice del balance inflamatorio de la dieta.',
        functional: { low: 1.5, high: 3.0 },
      },
    ],
  },
  metabolico: {
    id: 'metabolico',
    title: 'Metabólico',
    description:
      'Marcadores de glucemia, resistencia a la insulina y perfil lipídico para evaluar la salud metabólica y el riesgo cardiovascular.',
    biomarkers: [
      {
        code: '1558-6',
        title: 'Glucemia en ayunas',
        unit: 'mg/dL',
        description: 'Nivel de glucosa en sangre en ayunas.',
        conventional: { low: 70, high: 99 },
        functional: { low: 75, high: 85 },
      },
      {
        code: '4548-4',
        title: 'Hemoglobina glicosilada (HbA1c)',
        unit: '%',
        description: 'Promedio de glucemia de los últimos 2-3 meses.',
        conventional: { high: 5.7 },
        functional: { high: 5.2 },
      },
      {
        code: 'homa-ir',
        system: SOM_BIOMARKER_SYSTEM,
        title: 'Índice HOMA-IR',
        unit: 'índice',
        description: 'Estima la resistencia a la insulina a partir de glucemia e insulina en ayunas.',
        conventional: { high: 2.5 },
        functional: { high: 1.5 },
      },
      {
        code: '2093-3',
        title: 'Colesterol total',
        unit: 'mg/dL',
        description: 'Colesterol total en sangre.',
        conventional: { high: 200 },
        functional: { high: 100 },
      },
      {
        code: '2085-9',
        title: 'Colesterol HDL',
        unit: 'mg/dL',
        description: 'Colesterol "bueno"; valores altos son protectores.',
        conventional: { low: 40 },
        functional: { low: 60 },
        male: { conventional: { low: 40 } },
        female: { conventional: { low: 50 } },
      },
      {
        code: '13457-7',
        title: 'Colesterol LDL',
        unit: 'mg/dL',
        description: 'Colesterol "malo"; valores bajos reducen el riesgo cardiovascular.',
        conventional: { high: 100 },
        functional: { high: 70 },
      },
      {
        code: '1884-6',
        title: 'ApoB (Apolipoproteína B)',
        unit: 'mg/dL',
        description: 'Cuenta de partículas aterogénicas; predictor de riesgo cardiovascular.',
        conventional: { low: 66, high: 144 },
        functional: { high: 90 },
      },
      {
        code: '10835-7',
        title: 'Lipoproteína(a) — Lp(a)',
        unit: 'nmol/L',
        description: 'Factor de riesgo cardiovascular de origen genético.',
        conventional: { high: 75 },
        functional: { high: 50 },
      },
      {
        code: 'ldl-p',
        system: SOM_BIOMARKER_SYSTEM,
        title: 'LDL Partículas (LDL-P)',
        unit: 'nmol/L',
        description: 'Número de partículas LDL; complementa al colesterol LDL.',
        conventional: { high: 1300 },
        functional: { high: 1000 },
      },
      {
        code: '2571-8',
        title: 'Triglicéridos',
        unit: 'mg/dL',
        description: 'Grasas en sangre asociadas a la dieta y al metabolismo.',
        conventional: { high: 150 },
        functional: { high: 80 },
      },
      {
        code: '3084-1',
        title: 'Ácido úrico',
        unit: 'mg/dL',
        description: 'Producto del metabolismo de las purinas; alto se asocia a inflamación.',
        conventional: { low: 3.4, high: 7.0 },
        functional: { low: 3.5, high: 5.5 },
      },
    ],
  },
  longevidad: {
    id: 'longevidad',
    title: 'Longevidad / Micronutrientes',
    description:
      'Vitaminas, minerales y marcadores de envejecimiento clave para la energía, la inmunidad y la longevidad.',
    biomarkers: [
      {
        code: '1989-3',
        title: 'Vitamina D (25-OH)',
        unit: 'ng/mL',
        description: 'Vitamina D; importante para hueso, inmunidad y estado de ánimo.',
        conventional: { low: 30, high: 100 },
        functional: { low: 60, high: 80 },
      },
      {
        code: '2132-9',
        title: 'Vitamina B12',
        unit: 'pg/mL',
        description: 'Vitamina B12; esencial para el sistema nervioso y la sangre.',
        conventional: { low: 197, high: 771 },
        functional: { low: 600, high: 900 },
      },
      {
        code: '2285-5',
        title: 'Folato (eritrocitario)',
        unit: 'ng/mL',
        description: 'Folato intracelular; refleja el estado de folato a mediano plazo.',
        conventional: { low: 212, high: 534 },
      },
      {
        code: '2601-3',
        title: 'Magnesio (sérico)',
        unit: 'mg/dL',
        description: 'Mineral involucrado en cientos de reacciones enzimáticas.',
        conventional: { low: 1.6, high: 2.6 },
      },
      {
        code: '5763-8',
        title: 'Zinc',
        unit: 'ug/dL',
        description: 'Mineral esencial para la inmunidad y la reparación de tejidos.',
        conventional: { low: 60, high: 130 },
        functional: { low: 90, high: 110 },
      },
      {
        code: 'omega3-index',
        system: SOM_BIOMARKER_SYSTEM,
        title: 'Índice Omega-3 (EPA+DHA)',
        unit: '%',
        description: 'Porcentaje de omega-3 en la membrana de los glóbulos rojos.',
        functional: { low: 8 },
      },
      {
        code: 'yodo-urinario',
        system: SOM_BIOMARKER_SYSTEM,
        title: 'Yodo urinario',
        unit: 'ug/g creat',
        description: 'Estado de yodo, esencial para la función tiroidea.',
        conventional: { low: 100, high: 300 },
        functional: { low: 150, high: 300 },
      },
      {
        code: 'dunedin-pace',
        system: SOM_BIOMARKER_SYSTEM,
        title: 'DunedinPACE (ritmo de envejecimiento)',
        unit: 'ritmo/año',
        description: 'Ritmo de envejecimiento biológico por metilación del ADN (1.0 = promedio).',
        conventional: { high: 1.0 },
        functional: { high: 0.8 },
      },
      {
        code: 'edad-biologica',
        system: SOM_BIOMARKER_SYSTEM,
        title: 'Edad biológica (metilación ADN)',
        unit: 'años',
        description: 'Edad biológica estimada por relojes epigenéticos; ideal ≤ edad cronológica.',
      },
      {
        code: 'telomeros',
        system: SOM_BIOMARKER_SYSTEM,
        title: 'Longitud telomérica',
        unit: 'kb',
        description: 'Largo de los telómeros; marcador de envejecimiento celular.',
      },
      {
        code: 'nad',
        system: SOM_BIOMARKER_SYSTEM,
        title: 'NAD+ intracelular',
        unit: 'uM',
        description: 'Coenzima clave en la producción de energía celular; tiende a bajar con la edad.',
      },
    ],
  },
};

/** Sexo del paciente para resolver rangos. Solo 'male' / 'female' ajustan rangos. */
export type PatientSex = 'male' | 'female' | undefined;

/** ¿El biomarcador define rangos específicos por sexo? */
export function isSexSpecific(bm: Biomarker): boolean {
  return Boolean(bm.male || bm.female);
}

/**
 * Resuelve los rangos aplicables a un paciente. Si hay rango específico para su
 * sexo, lo usa; si no, cae al rango por defecto (unisex). Para sexo desconocido
 * usa siempre el por defecto.
 */
export function resolveBiomarkerRanges(
  bm: Biomarker,
  sex: PatientSex
): { conventional?: BiomarkerRange; functional?: BiomarkerRange } {
  const override = sex ? bm[sex] : undefined;
  return {
    conventional: override?.conventional ?? bm.conventional,
    functional: override?.functional ?? bm.functional,
  };
}
