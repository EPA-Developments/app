/**
 * Respuesta a 100 días del Plan Bienestar — lógica pura.
 *
 * Decisión firmada el 27/09/2026 (`docs/catalogo-pb100d/README.md`, decisiones
 * transversales; `docs/plan-bienestar-ckm-items.md`, sección 3.5):
 *
 *  - Estadíos 1 a 4: cambio porcentual de **peso o cintura** respecto del día 0, y
 *    vale la mejor categoría de las dos: ≥ 5 % respuesta, 3 a < 5 % parcial, < 3 % sin
 *    respuesta. El umbral de 3 % absorbe el error de medición de la cintura (1 a 2 cm).
 *  - Estadío 0: por puntaje LE8 (no hay meta de descenso de peso): respuesta ≥ 80 o
 *    +10 puntos sin ningún dominio < 50; parcial +5 a 9, o ≥ 80 con un dominio < 50;
 *    sin respuesta < 5 puntos o bajó.
 *  - Con GLP-1 la hiporrespuesta se mide en peso (< 5 % al día 100, Tabla 47): es la
 *    condición `sin-respuesta` del catálogo.
 *
 * Las lecturas clínicas adicionales que la firma agrega en los estadíos 2 a 4 (PA,
 * HbA1c, UACR, LDL) las evalúa el médico al día 100 con el catálogo; acá no se
 * categorizan.
 */
import type { Coding, Observation } from '@medplum/fhirtypes';
import type { Condicion, EstadioCkm } from '../model/catalogo.js';
import type { Le8Domain } from '../model/planTemplate.js';
import { LOINC } from '../terminology/loinc.js';
import { SYSTEM } from '../terminology/systems.js';
import { LE8_CORTES, type ResultadoLe8 } from '../le8/puntaje.js';

export type CategoriaRespuesta = 'respuesta' | 'parcial' | 'sin-respuesta';

export const RESPUESTA_LABEL: Record<CategoriaRespuesta, string> = {
  respuesta: 'Respuesta',
  parcial: 'Respuesta parcial',
  'sin-respuesta': 'Sin respuesta todavía',
};

/** Cortes firmados del descenso porcentual de peso o cintura. */
export const RESPUESTA_CORTES = { respuesta: 5, parcial: 3 } as const;

/** Cortes firmados de la respuesta por LE8 (estadío 0). */
export const RESPUESTA_LE8 = { alcanzado: 80, subida: 10, parcial: 5, dominioMinimo: LE8_CORTES.moderada } as const;

const ORDEN: Record<CategoriaRespuesta, number> = { respuesta: 2, parcial: 1, 'sin-respuesta': 0 };
const mejor = (a: CategoriaRespuesta, b: CategoriaRespuesta): CategoriaRespuesta => (ORDEN[a] >= ORDEN[b] ? a : b);

/** Categoría por el descenso porcentual respecto del día 0 (positivo = bajó). */
export function categoriaPorDescenso(descensoPct: number): CategoriaRespuesta {
  if (descensoPct >= RESPUESTA_CORTES.respuesta) return 'respuesta';
  if (descensoPct >= RESPUESTA_CORTES.parcial) return 'parcial';
  return 'sin-respuesta';
}

export interface ValorFechado {
  valor: number;
  fecha?: string;
}

export interface CambioMedida {
  inicial: ValorFechado;
  actual: ValorFechado;
  /** Cambio como % del basal (negativo = bajó). */
  cambioPct: number;
  /** Descenso como % del basal (positivo = bajó); es lo que se categoriza. */
  descensoPct: number;
  categoria: CategoriaRespuesta;
}

/** Cambio de una medida entre el día 0 y hoy. undefined si falta alguno o el basal es 0. */
export function cambioMedida(inicial: ValorFechado | undefined, actual: ValorFechado | undefined): CambioMedida | undefined {
  if (!inicial || !actual || !(inicial.valor > 0)) return undefined;
  const cambioPct = Math.round(((actual.valor - inicial.valor) / inicial.valor) * 1000) / 10;
  return { inicial, actual, cambioPct, descensoPct: -cambioPct, categoria: categoriaPorDescenso(-cambioPct) };
}

export interface RespuestaPesoCintura {
  peso?: CambioMedida;
  cintura?: CambioMedida;
  /** La mejor de las dos; ausente sin ninguna medida completa. */
  categoria?: CategoriaRespuesta;
  /** Cuál definió la categoría. */
  define?: 'peso' | 'cintura';
}

/** Respuesta por peso o cintura: vale la mejor categoría de las dos. */
export function respuestaPesoCintura(medidas: { peso?: CambioMedida; cintura?: CambioMedida }): RespuestaPesoCintura {
  const { peso, cintura } = medidas;
  const out: RespuestaPesoCintura = { ...(peso ? { peso } : {}), ...(cintura ? { cintura } : {}) };
  if (peso && cintura) {
    out.categoria = mejor(peso.categoria, cintura.categoria);
    out.define = out.categoria === peso.categoria ? 'peso' : 'cintura';
  } else if (peso) {
    out.categoria = peso.categoria;
    out.define = 'peso';
  } else if (cintura) {
    out.categoria = cintura.categoria;
    out.define = 'cintura';
  }
  return out;
}

export interface RespuestaLe8 {
  inicial?: number;
  actual?: number;
  /** Puntos ganados (negativo = bajó). */
  cambio?: number;
  dominiosBajos: Le8Domain[];
  categoria?: CategoriaRespuesta;
  /** Por qué quedó en esa categoría, o qué falta. */
  motivo: string;
}

/** Respuesta a 100 días por LE8 (estadío 0), con la regla firmada. */
export function respuestaLe8(inicial: ResultadoLe8 | undefined, actual: ResultadoLe8 | undefined): RespuestaLe8 {
  const bajos = actual?.dominiosBajos ?? [];
  const base: RespuestaLe8 = { inicial: inicial?.total, actual: actual?.total, dominiosBajos: bajos, motivo: '' };
  if (actual?.total === undefined) {
    return { ...base, motivo: 'Todavía no hay puntaje LE8: faltan datos o cuestionarios.' };
  }
  const alcanzado = actual.total >= RESPUESTA_LE8.alcanzado;
  if (inicial?.total === undefined) {
    if (alcanzado && bajos.length === 0) return { ...base, categoria: 'respuesta', motivo: `LE8 ${actual.total}, ≥ ${RESPUESTA_LE8.alcanzado} sin dominios bajos.` };
    if (alcanzado) return { ...base, categoria: 'parcial', motivo: `LE8 ${actual.total}, pero con ${bajos.length} dominio(s) por debajo de ${RESPUESTA_LE8.dominioMinimo}.` };
    return { ...base, motivo: 'Sin puntaje LE8 del día 0 para medir la subida.' };
  }
  const cambio = actual.total - inicial.total;
  const subio = cambio >= RESPUESTA_LE8.subida;
  if ((alcanzado || subio) && bajos.length === 0) {
    return { ...base, cambio, categoria: 'respuesta', motivo: alcanzado ? `LE8 ${actual.total} (≥ ${RESPUESTA_LE8.alcanzado}).` : `Subió ${cambio} puntos.` };
  }
  if (alcanzado || subio) {
    return { ...base, cambio, categoria: 'parcial', motivo: `Meta alcanzada pero con ${bajos.length} dominio(s) por debajo de ${RESPUESTA_LE8.dominioMinimo}.` };
  }
  if (cambio >= RESPUESTA_LE8.parcial) {
    return { ...base, cambio, categoria: 'parcial', motivo: `Subió ${cambio} puntos (la meta es +${RESPUESTA_LE8.subida} o ≥ ${RESPUESTA_LE8.alcanzado}).` };
  }
  return { ...base, cambio, categoria: 'sin-respuesta', motivo: cambio < 0 ? `Bajó ${-cambio} puntos: revisar barreras.` : `Subió ${cambio} puntos (menos de ${RESPUESTA_LE8.parcial}).` };
}

export interface RespuestaA100Dias {
  estadio: EstadioCkm;
  /** Cómo se mide en este estadío. */
  criterio: 'le8' | 'peso-o-cintura';
  categoria?: CategoriaRespuesta;
  pesoCintura?: RespuestaPesoCintura;
  le8?: RespuestaLe8;
  /** Texto corto para la persona. */
  etiqueta: string;
}

/** Respuesta a 100 días según el estadío: LE8 en el 0, peso o cintura del 1 al 4. */
export function respuestaA100Dias(d: { estadio: EstadioCkm; pesoCintura?: RespuestaPesoCintura; le8?: RespuestaLe8 }): RespuestaA100Dias {
  if (d.estadio === '0') {
    const categoria = d.le8?.categoria;
    return {
      estadio: d.estadio,
      criterio: 'le8',
      categoria,
      ...(d.le8 ? { le8: d.le8 } : {}),
      ...(d.pesoCintura ? { pesoCintura: d.pesoCintura } : {}),
      etiqueta: categoria ? `${RESPUESTA_LABEL[categoria]} por puntaje LE8` : 'Se mide por tu puntaje LE8',
    };
  }
  const categoria = d.pesoCintura?.categoria;
  const define = d.pesoCintura?.define;
  return {
    estadio: d.estadio,
    criterio: 'peso-o-cintura',
    categoria,
    ...(d.pesoCintura ? { pesoCintura: d.pesoCintura } : {}),
    ...(d.le8 ? { le8: d.le8 } : {}),
    etiqueta: categoria && define ? `${RESPUESTA_LABEL[categoria]} por ${define}` : 'Se mide por peso o cintura (vale la mejor)',
  };
}

/** Condiciones del catálogo que salen de la respuesta: `sin-respuesta` cuando el peso bajó menos de 5 % (Tabla 47). */
export function condicionesDeRespuesta(r: RespuestaPesoCintura | undefined): Condicion[] {
  return r?.peso && r.peso.descensoPct < RESPUESTA_CORTES.respuesta ? ['sin-respuesta'] : [];
}

// ───────────────────────── desde FHIR ─────────────────────────

export interface SerieMedida {
  inicial?: ValorFechado;
  actual?: ValorFechado;
}

const def = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
const fechaObs = (o: Observation): string => o.effectiveDateTime ?? o.effectivePeriod?.start ?? o.issued ?? '';
const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Valor del día 0 y valor actual de una medida (LOINC) alrededor del inicio del plan.
 * El basal es la primera medición de los `toleranciaDias` (por defecto 14) que siguen
 * al inicio; si no hay, la última de los `toleranciaDias` previos; si tampoco, la
 * primera que haya después del inicio (quien empieza a registrarse tarde también tiene
 * un punto de partida). El actual es la última medición, y sólo cuenta si es posterior
 * al basal.
 */
export function serieDesdeFhir(
  observations: Observation[],
  loinc: Coding,
  inicio: string,
  opciones: { toleranciaDias?: number } = {},
): SerieMedida {
  const tolerancia = (opciones.toleranciaDias ?? 14) * DIA_MS;
  const inicioMs = Date.parse(inicio);
  const valores = observations
    .filter(
      (o) =>
        o.status !== 'entered-in-error' &&
        o.status !== 'cancelled' &&
        (o.code?.coding ?? []).some((c) => c.system === SYSTEM.loinc && c.code === loinc.code) &&
        def(o.valueQuantity?.value) &&
        fechaObs(o) !== '',
    )
    .map((o) => ({ valor: o.valueQuantity!.value!, fecha: fechaObs(o), ms: Date.parse(fechaObs(o)) }))
    .filter((v) => Number.isFinite(v.ms))
    .sort((a, b) => a.ms - b.ms);
  if (valores.length === 0 || !Number.isFinite(inicioMs)) return {};

  const enVentana = valores.find((v) => v.ms >= inicioMs && v.ms - inicioMs <= tolerancia);
  const previa = [...valores].reverse().find((v) => v.ms < inicioMs && inicioMs - v.ms <= tolerancia);
  const posterior = valores.find((v) => v.ms >= inicioMs);
  const basal = enVentana ?? previa ?? posterior;
  if (!basal) return {};
  const ultima = valores[valores.length - 1]!;
  const out: SerieMedida = { inicial: { valor: basal.valor, fecha: basal.fecha } };
  if (ultima.ms > basal.ms) out.actual = { valor: ultima.valor, fecha: ultima.fecha };
  return out;
}

/** Respuesta por peso o cintura desde las Observations del plan (LOINC 29463-7 y 8280-0). */
export function respuestaPesoCinturaDesdeFhir(observations: Observation[], inicio: string): RespuestaPesoCintura {
  const peso = serieDesdeFhir(observations, LOINC.bodyWeight, inicio);
  const cintura = serieDesdeFhir(observations, LOINC.waistCircumference, inicio);
  return respuestaPesoCintura({
    peso: cambioMedida(peso.inicial, peso.actual),
    cintura: cambioMedida(cintura.inicial, cintura.actual),
  });
}
