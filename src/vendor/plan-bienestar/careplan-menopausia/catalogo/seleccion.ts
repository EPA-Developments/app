import type { CkmInput, CkmPreventInput, CkmResult, CkmStage } from '../ckm/types.js';
import { CKM_LIMITES } from '../ckm/staging.js';
import type { PerfilBaseline } from '../biblioteca/acciones-nivel1.js';
import {
  CONDICIONES,
  type Aplicabilidad,
  type Audiencia,
  type Condicion,
  type EstadioCkm,
  type EvaluacionCatalogo,
  type ItemCatalogo,
  type MetaCatalogo,
  type Momento,
  type TipoItem,
} from '../model/catalogo.js';
import { CATALOGO_PB100D } from '../content/ckm/index.js';

/**
 * Selección de ítems del catálogo firmado para una persona concreta.
 *
 * El perfil es el estadío CKM **validado por el médico** más las condiciones
 * registradas (códigos del catálogo). Nada se adivina: lo que el sistema puede
 * derivar de los datos (`condicionesDesdeCkm`) se propone; lo demás lo registra
 * el equipo. Un ítem aplica cuando su estadío incluye el de la persona, todas sus
 * `condiciones` están presentes, al menos una de `algunaDe` (si las hay) está
 * presente y ninguna de `excluye` lo está.
 */
export interface PerfilCatalogo {
  estadio: EstadioCkm;
  condiciones: Iterable<Condicion>;
}

function conjunto(perfil: PerfilCatalogo): ReadonlySet<Condicion> {
  return perfil.condiciones instanceof Set ? perfil.condiciones : new Set(perfil.condiciones);
}

/** ¿Aplica este elemento del catálogo al perfil? */
export function aplica(elemento: Aplicabilidad, perfil: PerfilCatalogo): boolean {
  if (!elemento.estadios.includes(perfil.estadio)) return false;
  const presentes = conjunto(perfil);
  if ((elemento.condiciones ?? []).some((c) => !presentes.has(c))) return false;
  if (elemento.algunaDe && elemento.algunaDe.length > 0 && !elemento.algunaDe.some((c) => presentes.has(c))) {
    return false;
  }
  if ((elemento.excluye ?? []).some((c) => presentes.has(c))) return false;
  return true;
}

export interface FiltroItems {
  audiencia?: Audiencia;
  tipos?: readonly TipoItem[];
  /** Sólo ítems activos en este momento del plan. */
  momento?: Momento;
}

/** Ítems (educación, conducta, monitoreo, alertas, derivaciones) que aplican al perfil. */
export function itemsAplicables(
  perfil: PerfilCatalogo,
  filtro: FiltroItems = {},
  items: readonly ItemCatalogo[] = CATALOGO_PB100D.items,
): ItemCatalogo[] {
  return items.filter(
    (item) =>
      aplica(item, perfil) &&
      (filtro.audiencia === undefined || item.audiencia === filtro.audiencia) &&
      (filtro.tipos === undefined || filtro.tipos.includes(item.tipo)) &&
      (filtro.momento === undefined || item.momentos.includes(filtro.momento)),
  );
}

/** Metas que aplican al perfil. */
export function metasAplicables(
  perfil: PerfilCatalogo,
  metas: readonly MetaCatalogo[] = CATALOGO_PB100D.metas,
): MetaCatalogo[] {
  return metas.filter((meta) => aplica(meta, perfil));
}

/** Evaluaciones (qué se mide y cuándo) que aplican al perfil. */
export function evaluacionesAplicables(
  perfil: PerfilCatalogo,
  evaluaciones: readonly EvaluacionCatalogo[] = CATALOGO_PB100D.evaluaciones,
): EvaluacionCatalogo[] {
  return evaluaciones.filter((evaluacion) => aplica(evaluacion, perfil));
}

/** Estadío del catálogo (`'0'`..`'4'`) desde el estadío numérico de la estadificación. */
export function estadioCatalogo(stage: CkmStage): EstadioCkm {
  return String(stage) as EstadioCkm;
}

/** Condiciones de riesgo PREVENT según los umbrales de la Tabla 8. */
export function condicionesDesdePrevent(prevent: CkmPreventInput): Condicion[] {
  const out: Condicion[] = [];
  const { ascvd10, ascvd30, cvd10, hf10 } = prevent;
  if (ascvd10 !== undefined) {
    if (ascvd10 >= 5) out.push('prevent-ascvd-5');
    if (ascvd10 >= 3 && ascvd10 < 5) out.push('prevent-ascvd-3-5');
    if (ascvd10 >= 3 && ascvd10 < 10) out.push('prevent-ascvd-3-10');
  }
  if (ascvd30 !== undefined && ascvd30 >= 10) out.push('prevent-ascvd-30-10');
  if (cvd10 !== undefined) {
    if (cvd10 >= 7.5) out.push('prevent-cvd-7-5');
    if (cvd10 >= CKM_LIMITES.preventCvdAlto) out.push('prevent-alto');
  }
  if (hf10 !== undefined && hf10 >= 5) out.push('prevent-hf-5');
  return out;
}

/** Bandas de edad que condicionan ítems (30 a 59 PREVENT a 30 años; ≥ 40 y ≥ 50 estatina y cardioprotector; 65 a 79 fragilidad). */
export function condicionesDesdeEdad(edad: number): Condicion[] {
  const out: Condicion[] = [];
  if (edad >= 30 && edad <= 59) out.push('edad-30-59');
  if (edad >= 40 && edad <= 79) out.push('edad-40-79');
  if (edad >= 50 && edad <= 79) out.push('edad-50-79');
  if (edad >= 65 && edad <= 79) out.push('edad-65-79');
  return out;
}

const POR_CRITERIO: Readonly<Record<string, readonly Condicion[]>> = {
  imc: ['exceso-adiposidad'],
  cintura: ['exceso-adiposidad'],
  prediabetes: ['prediabetes'],
  diabetes: ['dm2'],
  hipertension: ['hta'],
  trigliceridos: ['tg-altos'],
  'sindrome-metabolico': ['sindrome-metabolico'],
  'enfermedad-renal': ['erc'],
  'rinon-muy-alto-riesgo': ['erc', 'erc-muy-alto-riesgo'],
  'falla-renal': ['erc', 'erc-muy-alto-riesgo', 'falla-renal'],
  'cvd-subclinica': ['aterosclerosis-subclinica'],
  'pre-insuficiencia-cardiaca': ['pre-ic'],
  'riesgo-predicho-alto': ['prevent-alto'],
  'cvd-clinica': ['ecv'],
  coronaria: ['coronaria'],
  acv: ['acv'],
  'insuficiencia-cardiaca': ['ic'],
  eap: ['eap'],
  'fibrilacion-auricular': ['fa'],
};

/** Criterios del estadío 2 que cuentan como "factores cardiometabólicos" para FIB-4 y apnea. */
const FACTORES_ESTADIO_2 = new Set(['diabetes', 'hipertension', 'trigliceridos', 'enfermedad-renal', 'sindrome-metabolico']);

const MEDICACION = new Set<Condicion>([
  'toma-glp1',
  'toma-sglt2i',
  'toma-rasi-mra',
  'toma-estatina',
  'toma-antitrombotico',
  'toma-antihipertensivo',
  'farmaco-obesidad',
]);

const ORDEN = new Map<Condicion, number>(CONDICIONES.map((c, i) => [c, i]));

/**
 * Condiciones que se derivan de la estadificación y de los datos medidos, más
 * las que registra el equipo (`extras`: medicación, menopausia, embarazo,
 * cuestionarios, potenciadores, hallazgos que no salen de un número).
 * Devuelve la lista sin duplicados, en el orden del catálogo.
 */
export function condicionesDesdeCkm(
  result: CkmResult,
  input: CkmInput = {},
  extras: Iterable<Condicion> = [],
): Condicion[] {
  const out = new Set<Condicion>();
  const agregar = (...condiciones: readonly Condicion[]): void => {
    for (const c of condiciones) out.add(c);
  };

  for (const criterio of result.criterios) {
    agregar(...(POR_CRITERIO[criterio.key] ?? []));
  }
  if (result.criterios.filter((c) => FACTORES_ESTADIO_2.has(c.key)).length >= 2) {
    agregar('dos-o-mas-factores');
  }

  const { bmi, hba1cPercent, systolicMmHg, diastolicMmHg, triglyceridesMgDl, acrMgG, egfr, cacAgatston, itb } = input;
  if (bmi !== undefined) {
    if (bmi >= 30) agregar('imc-30');
    if (bmi >= 27) agregar('imc-27');
    if (bmi >= 23 && bmi < 25) agregar('imc-23-25');
  }
  if (hba1cPercent !== undefined && hba1cPercent > 10) agregar('hba1c-10');
  if ((systolicMmHg !== undefined && systolicMmHg >= 180) || (diastolicMmHg !== undefined && diastolicMmHg >= 110)) {
    agregar('pa-180-110');
  }
  if (
    !out.has('hta') &&
    systolicMmHg !== undefined &&
    systolicMmHg >= 120 &&
    systolicMmHg < CKM_LIMITES.sistolicaHipertension &&
    (diastolicMmHg === undefined || diastolicMmHg < CKM_LIMITES.diastolicaHipertension)
  ) {
    agregar('pa-elevada');
  }
  if (triglyceridesMgDl !== undefined && triglyceridesMgDl >= 500) agregar('tg-500');
  if (acrMgG !== undefined) {
    if (acrMgG >= 30) agregar('uacr-30');
    if (acrMgG >= 100) agregar('uacr-100');
    if (acrMgG >= 200) agregar('uacr-200');
  }
  if (egfr !== undefined) {
    if (egfr < CKM_LIMITES.egfrG3b) agregar('egfr-45');
    if (egfr < CKM_LIMITES.egfrSevero) agregar('egfr-30');
  }
  if (cacAgatston !== undefined) {
    if (cacAgatston === 0) agregar('cac-0');
    if (cacAgatston >= CKM_LIMITES.cacSubclinico) agregar('cac-100');
    if (cacAgatston >= 1000) agregar('cac-1000');
  }
  if (itb !== undefined && itb <= CKM_LIMITES.itbBajo) agregar('itb-bajo');
  if (input.ancestriaAsiatica) agregar('ancestria-asiatica');
  if (input.conditions?.dialysis) agregar('dialisis', 'falla-renal');
  if (input.conditions?.antihypertensiveTreatment) agregar('toma-antihipertensivo', 'hta');
  if (input.prevent) agregar(...condicionesDesdePrevent(input.prevent));
  if (input.edad !== undefined) agregar(...condicionesDesdeEdad(input.edad));

  for (const extra of extras) out.add(extra);
  if ([...out].some((c) => MEDICACION.has(c))) agregar('medicacion');

  return [...out].sort((a, b) => (ORDEN.get(a) ?? 0) - (ORDEN.get(b) ?? 0));
}

/**
 * Perfil de la biblioteca de acciones (Anexo C y C bis) desde el perfil del
 * catálogo más lo que dijo el cuestionario baseline. Con esto, `accionesDisponibles`
 * activa las acciones por estadío y condición, y las de menopausia sólo con la
 * condición `menopausia` registrada.
 */
export function perfilBibliotecaDesdeCatalogo(perfil: PerfilCatalogo, baseline: PerfilBaseline = {}): PerfilBaseline {
  const condiciones = [...perfil.condiciones];
  return {
    ...baseline,
    estadio: perfil.estadio,
    condiciones,
    // La medicación registrada por el equipo le gana a lo que respondió la persona.
    conGlp1: condiciones.includes('toma-glp1') || baseline.conGlp1 === true,
  };
}

/**
 * Perfil completo (estadío + condiciones) desde una estadificación. Devuelve
 * `undefined` cuando no hay estadío: sin estadío no hay catálogo que aplicar.
 */
export function perfilDesdeCkm(
  result: CkmResult,
  input: CkmInput = {},
  extras: Iterable<Condicion> = [],
): PerfilCatalogo | undefined {
  if (result.stage === undefined) return undefined;
  return { estadio: estadioCatalogo(result.stage), condiciones: condicionesDesdeCkm(result, input, extras) };
}
