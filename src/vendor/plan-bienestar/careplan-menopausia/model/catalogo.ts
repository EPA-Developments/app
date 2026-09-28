import type { Coding } from '@medplum/fhirtypes';
import type { GoalCategoryKey, GoalPriorityKey, Le8Domain, TargetSpec } from './planTemplate.js';

/**
 * Modelo del catálogo firmado del Plan Bienestar 100 Días por estadío CKM.
 *
 * Cada ítem reproduce una fila de los catálogos firmados el 27/09/2026 por los
 * Dres. Barbagelata y D'Alessandro (`docs/catalogo-pb100d/`). Los ocho atributos
 * de la ficha son los de la sección 2 del diseño (`docs/plan-bienestar-ckm-items.md`):
 * código, tipo, dominio, estadíos, condición que lo activa, momento, audiencia y
 * responsable, más la fuente con su clase y nivel de evidencia.
 *
 * Reglas fijas del catálogo, que este modelo hace cumplir por tipo:
 *  - lo farmacológico es siempre `alerta` con audiencia `profesional`: el sistema
 *    no prescribe, el médico decide;
 *  - el estadío lo confirma el médico; la selección (`catalogo/seleccion.ts`) parte
 *    del estadío validado y de las condiciones registradas, nunca adivina;
 *  - LE8 es el tablero de la persona: los ítems de audiencia `persona` llevan el
 *    dominio que mueven.
 */

/** Estadío CKM validado por el médico (4 cubre 4a y 4b; 4b se expresa con la condición `falla-renal`). */
export type EstadioCkm = '0' | '1' | '2' | '3' | '4';

export const ESTADIOS_CKM: readonly EstadioCkm[] = Object.freeze(['0', '1', '2', '3', '4']);

/** Etiquetas de estadío que ve la persona (firmadas en el estadío 1). */
export const ETIQUETA_ESTADIO: Record<EstadioCkm, string> = {
  '0': 'Salud cardiometabólica preservada',
  '1': 'Exceso de adiposidad o prediabetes',
  '2': 'Factores de riesgo metabólicos o renales',
  '3': 'Señales tempranas en corazón o riñón',
  '4': 'Enfermedad cardiovascular establecida',
};

export type TipoItem = 'educacion' | 'conducta' | 'monitoreo' | 'evaluacion' | 'alerta' | 'derivacion';

export const TIPO_ITEM_LABEL: Record<TipoItem, string> = {
  educacion: 'Educación',
  conducta: 'Conducta',
  monitoreo: 'Monitoreo',
  evaluacion: 'Evaluación',
  alerta: 'Alerta al médico',
  derivacion: 'Derivación',
};

/** Dominio LE8 que mueve el ítem, o agregado CKM+ del diseño. */
export type DominioCatalogo =
  | Le8Domain
  | 'estres'
  | 'social'
  | 'renal'
  | 'hepatico'
  | 'apnea'
  | 'coordinacion'
  | 'embarazo'
  | 'menopausia'
  | 'adherencia'
  | 'seguridad'
  | 'educacion'
  | 'riesgo'
  | 'potenciadores'
  | 'prevencion'
  | 'bienestar'
  | 'medicacion'
  | 'cardiaco'
  | 'aterosclerosis'
  | 'arritmia';

export type Momento =
  | 'dia-0'
  | 'dia-30'
  | 'dia-60'
  | 'dia-100'
  | 'continuo'
  | 'evento'
  | 'semanal'
  | 'mensual';

export const MOMENTO_LABEL: Record<Momento, string> = {
  'dia-0': 'Día 0',
  'dia-30': 'Día 30',
  'dia-60': 'Día 60',
  'dia-100': 'Día 100',
  continuo: 'Continuo',
  evento: 'Evento',
  semanal: 'Semanal',
  mensual: 'Mensual',
};

export type Audiencia = 'persona' | 'profesional';

export type Responsable =
  | 'persona'
  | 'cardiologia'
  | 'nutricion'
  | 'kinesiologia'
  | 'endocrinologia'
  | 'nefrologia'
  | 'neurologia'
  | 'neumonologia'
  | 'hepatologia'
  | 'psicologia'
  | 'trabajo-social'
  | 'enfermeria'
  | 'educador'
  | 'coordinacion'
  | 'obstetricia'
  | 'electrofisiologia'
  | 'farmacia'
  | 'cirugia-vascular'
  | 'rehabilitacion'
  | 'imagen'
  | 'oftalmologia'
  | 'equipo'
  | 'firmantes';

export const RESPONSABLE_LABEL: Record<Responsable, string> = {
  persona: 'La persona',
  cardiologia: 'Cardiología',
  nutricion: 'Nutrición',
  kinesiologia: 'Kinesiología',
  endocrinologia: 'Endocrinología',
  nefrologia: 'Nefrología',
  neurologia: 'Neurología',
  neumonologia: 'Neumonología',
  hepatologia: 'Hepatología',
  psicologia: 'Psicología',
  'trabajo-social': 'Trabajo social',
  enfermeria: 'Enfermería',
  educador: 'Educador en diabetes',
  coordinacion: 'Coordinación CKM',
  obstetricia: 'Obstetricia',
  electrofisiologia: 'Electrofisiología',
  farmacia: 'Farmacia clínica',
  'cirugia-vascular': 'Cirugía vascular',
  rehabilitacion: 'Rehabilitación cardiovascular',
  imagen: 'Cardiología de imagen',
  oftalmologia: 'Oftalmología y podología',
  equipo: 'Equipo',
  firmantes: 'Firmantes',
};

/**
 * Condiciones que activan ítems. Son códigos registrados por el equipo o
 * derivados del estadío (`condicionesDesdeCkm`); la persona nunca los edita.
 */
export const CONDICIONES = [
  // Adiposidad y glucemia
  'exceso-adiposidad',
  'imc-23-25',
  'imc-27',
  'imc-30',
  'prediabetes',
  'dm2',
  'hba1c-10',
  'riesgo-hipoglucemia',
  'automonitoreo-glucemia',
  'dos-o-mas-factores',
  // Presión
  'pa-elevada',
  'hta',
  'hta-resistente',
  'pa-180-110',
  'toma-antihipertensivo',
  // Lípidos
  'tg-altos',
  'tg-500',
  'sindrome-metabolico',
  'ldl-fuera-de-meta',
  'dislipidemia-aislada',
  // Riñón
  'erc',
  'erc-muy-alto-riesgo',
  'falla-renal',
  'uacr-30',
  'uacr-100',
  'uacr-200',
  'egfr-30',
  'egfr-45',
  'hiperpotasemia',
  'dialisis',
  // Riesgo y sustratos
  'prevent-ascvd-3-5',
  'prevent-ascvd-5',
  'prevent-ascvd-3-10',
  'prevent-ascvd-30-10',
  'prevent-cvd-7-5',
  'prevent-hf-5',
  'prevent-alto',
  'aterosclerosis-subclinica',
  'cac-100',
  'cac-1000',
  'cac-percentil-75',
  'cac-0',
  'itb-bajo',
  'pre-ic',
  'sin-ecocardiograma',
  'biomarcadores-en-ascenso',
  'hipertension-pulmonar',
  // Enfermedad establecida
  'ecv',
  'coronaria',
  'acv',
  'eap',
  'ic',
  'hfref',
  'hfmref',
  'hfpef',
  'fa',
  'evento-reciente',
  'sintomas-nuevos',
  'congestion',
  'sangrado-mayor',
  'candidato-trasplante',
  // Medicación
  'medicacion',
  'toma-glp1',
  'toma-sglt2i',
  'toma-rasi-mra',
  'toma-estatina',
  'toma-antitrombotico',
  'inicia-rasi-mra',
  'inicia-sglt2i',
  'inicia-hipolipemiante',
  'farmaco-obesidad',
  'polifarmacia',
  'deficit-hierro',
  'sin-respuesta',
  'procedimiento',
  'fib4-alto',
  // Contexto de la persona
  'menopausia',
  'planifica-embarazo',
  'embarazo',
  'dmg-previa',
  'apo-reciente',
  'fuma',
  'phq-gad-positivo',
  'ahc-necesidades',
  'potenciadores',
  'ancestria-asiatica',
  'apnea-sospecha',
  'edad-30-59',
  'edad-40-79',
  'edad-50-79',
  'edad-65-79',
  'fragilidad',
  'alcohol',
] as const;

export type Condicion = (typeof CONDICIONES)[number];

/** Lo que comparten metas, ítems y evaluaciones: a quién aplican. */
export interface Aplicabilidad {
  /** Estadíos en que el ítem está activo (la herencia entre estadíos se escribe explícita). */
  estadios: readonly EstadioCkm[];
  /** Todas deben cumplirse. Vacío = todas las personas del estadío. */
  condiciones?: readonly Condicion[];
  /** Al menos una debe cumplirse (además de `condiciones`). */
  algunaDe?: readonly Condicion[];
  /** Ninguna debe cumplirse ("sin DM2", "sin sustrato", "CAC menor a 1000"). */
  excluye?: readonly Condicion[];
}

export interface ItemCatalogo extends Aplicabilidad {
  /** `E<estadío>-<dominio>-<n>`, tal como figura en el catálogo firmado. */
  codigo: string;
  tipo: TipoItem;
  dominio: DominioCatalogo;
  momentos: readonly Momento[];
  audiencia: Audiencia;
  responsable: Responsable;
  /** Persona: título de la tarjeta. Alerta: cuándo se dispara. Derivación: especialidad. */
  titulo: string;
  /** Persona: texto que ve. Alerta: qué dice. Derivación: cuándo. */
  texto: string;
  /** Racional clínico, para el equipo. */
  racional?: string;
  /** Sección, tabla o figura de la guía (o guía complementaria). */
  fuente: string;
  /** Clase de recomendación (1, 2a, 2b, 3) cuando la guía la da. */
  cor?: string;
  /** Nivel de evidencia (A, B-R, B-NR, C-LD) cuando la guía lo da. */
  loe?: string;
}

export interface MetaCatalogo extends Aplicabilidad {
  codigo: string;
  /** Nombre corto de la meta. */
  nombre: string;
  /** Valor firmado, en palabras. */
  valor: string;
  category: GoalCategoryKey;
  le8?: Le8Domain;
  measure?: Coding;
  target?: TargetSpec;
  priority?: GoalPriorityKey;
  fuente: string;
}

export interface EvaluacionCatalogo extends Aplicabilidad {
  codigo: string;
  label: string;
  code?: Coding;
  unit?: string;
  momentos: readonly Momento[];
  /** Cadencia después del plan, en palabras. */
  despues?: string;
  fuente: string;
}

/** El catálogo de un estadío, tal como se firmó. */
export interface CatalogoEstadio {
  estadio: EstadioCkm;
  metas: readonly MetaCatalogo[];
  items: readonly ItemCatalogo[];
  evaluaciones: readonly EvaluacionCatalogo[];
}
