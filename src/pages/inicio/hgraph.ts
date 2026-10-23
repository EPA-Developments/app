// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// El hGraph de la paciente («Tus valores»): el mismo mapa de valores que ve su equipo en el
// dashboard, contado en sus palabras. Modelo y geometría, puros y testeados; HGraphPaciente.tsx
// sólo dibuja lo que se calcula acá.
//
// - **El cálculo no es del portal.** Qué lectura gana, el puntaje de 0 a 1 y el estado de cada
//   valor salen del core del Plan Bienestar (`ultimosValoresCkm`, `metricasHgraph`), el mismo
//   que usa el dashboard: con los mismos datos, la paciente y su médico ven lo mismo. Acá sólo
//   se ponen los nombres, los textos, el origen y la fecha de cada valor.
// - **Validado por la dirección médica** (Dr. Barbagelata, 23.10.2026): los nombres, las palabras
//   de los estados, «sin rojo» (naranja oscuro para «Para hablar con tu médico») y un solo juego
//   de cortes, las bandas de guía de «Mis datos», que aplica el core. Con eso se publicó
//   (`HGRAPH_PUBLICADO`).
// - **Sólo los 13 básicos**, siempre: un valor sin dato queda en su eje con «Falta», para que
//   sepa qué traer. Los ampliados (UACR, potasio, NT-proBNP, troponina, calcio) los ve el
//   equipo en la ficha, no la paciente.
// - **El origen va con el código de la rosa**: anillo punteado para lo que nadie del equipo
//   cargó (lo cargó ella, o lo leyó la IA de su PDF), anillo sólido para lo que cargó el equipo.
// - Un valor de hace más de un año (el laboratorio de rutina es anual) se muestra, pero se dice.
import { compararLecturas, metricasHgraph, PUNTAJE_MODERADO, valoresUtilizables } from '@epa/careplan-menopausia';
import type { EstadoMetricaHgraph, ParametroHgraph, ValorCkm, ValoresCkm } from '@epa/careplan-menopausia';
import type { Observation } from '@medplum/fhirtypes';
import { MESES_LABORATORIO_RUTINA } from '../../fhir/biomarkers';
import { diaArgentinaDe } from './formato';

/**
 * ¿Se muestra el hGraph en las Homes? Sí, desde la validación médica del 23.10.2026. Con
 * `false` se apaga para todas, y vuelve a verse sólo con `?hgraph=si` en la URL de la Home.
 */
export const HGRAPH_PUBLICADO = true;

/** El hGraph se ve si está publicado o si la URL lo pide (`?hgraph=si`). */
export function hgraphVisible(parametro: string | null | undefined): boolean {
  return HGRAPH_PUBLICADO || parametro === 'si';
}

/**
 * Los que suele traer un laboratorio de rutina, más lo que se mide en casa: los únicos que ve
 * la paciente, siempre (dirección médica, 23.10.2026).
 */
export const BASICOS = [
  'sbp',
  'dbp',
  'bmi',
  'waist',
  'glucoseFasting',
  'hba1c',
  'cholesterolTotal',
  'nonHdlc',
  'ldlc',
  'hdlc',
  'triglycerides',
  'creatinine',
  'egfr',
] as const satisfies readonly ParametroHgraph[];

/** Un parámetro de los que ve la paciente. */
export type ParametroBasico = (typeof BASICOS)[number];

/** Cómo se lo nombramos a la paciente (validado por la dirección médica, 23.10.2026). */
export const NOMBRE_PACIENTE: Readonly<Record<ParametroBasico, string>> = {
  sbp: 'Presión máxima',
  dbp: 'Presión mínima',
  bmi: 'Peso para tu altura (IMC)',
  waist: 'Cintura',
  glucoseFasting: 'Azúcar en ayunas',
  hba1c: 'Azúcar promedio (HbA1c)',
  cholesterolTotal: 'Colesterol total',
  nonHdlc: 'Colesterol no-HDL',
  ldlc: 'Colesterol LDL («malo»)',
  hdlc: 'Colesterol HDL («bueno»)',
  triglycerides: 'Triglicéridos',
  creatinine: 'Creatinina',
  egfr: 'Función de los riñones (TFGe)',
};

/** El rótulo corto, alrededor del gráfico (el nombre entero va en la lista de abajo). */
export const ROTULO_HGRAPH: Readonly<Record<ParametroBasico, string>> = {
  sbp: 'Presión máx.',
  dbp: 'Presión mín.',
  bmi: 'IMC',
  waist: 'Cintura',
  glucoseFasting: 'Glucemia',
  hba1c: 'HbA1c',
  cholesterolTotal: 'Colesterol',
  nonHdlc: 'No-HDL',
  ldlc: 'LDL',
  hdlc: 'HDL',
  triglycerides: 'Triglicéridos',
  creatinine: 'Creatinina',
  egfr: 'Riñones',
};

/** Las palabras de cada estado (validadas por la dirección médica, 23.10.2026). */
export const TEXTO_ESTADO: Readonly<Record<EstadoMetricaHgraph, string>> = {
  healthy: 'En rango',
  moderate: 'Para mirar',
  high: 'Para hablar con tu médico',
};

/** Quién cargó el valor que se muestra. */
export type OrigenLectura = 'vos' | 'laboratorio' | 'equipo';

export const TEXTO_ORIGEN: Readonly<Record<OrigenLectura, string>> = {
  vos: 'Cargado por vos',
  laboratorio: 'Leído de tu laboratorio, sin revisar',
  equipo: 'Cargado por tu equipo',
};

export const TEXTO_FALTA_VALOR = 'Falta';
export const TEXTO_VIEJO = 'De hace más de un año';

/**
 * Quién cargó una lectura, por `meta.author` (lo pone el servidor): la paciente, alguien del
 * equipo (Practitioner o PractitionerRole) o el sistema (el bot que lee el PDF del laboratorio,
 * sin revisión médica). Sin autor no se afirma que la cargó el equipo.
 */
export function origenDeLectura(observation: Observation): OrigenLectura {
  const autor = observation.meta?.author?.reference ?? '';
  if (autor.startsWith('Patient/')) {
    return 'vos';
  }
  if (autor.startsWith('Practitioner/') || autor.startsWith('PractitionerRole/')) {
    return 'equipo';
  }
  return 'laboratorio';
}

/** Un valor ganador y la Observation de donde salió. */
export interface LecturaGanadora {
  readonly valor: ValorCkm;
  readonly observation: Observation;
}

/**
 * El último valor de cada parámetro, con la Observation que lo trajo (para decir quién lo
 * cargó). Recorre exactamente como `ultimosValoresCkm` del core (orden canónico, gana la primera
 * lectura utilizable): un test lo compara con él.
 */
export function lecturasGanadoras(
  observaciones: readonly Observation[]
): Partial<Record<ParametroHgraph, LecturaGanadora>> {
  const resultado: Partial<Record<ParametroHgraph, LecturaGanadora>> = {};
  for (const observation of [...observaciones].sort(compararLecturas)) {
    for (const [parametro, valor] of Object.entries(valoresUtilizables(observation)) as [ParametroHgraph, ValorCkm][]) {
      if (resultado[parametro] === undefined) {
        resultado[parametro] = { valor, observation };
      }
    }
  }
  return resultado;
}

const FORMATO_VALOR = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

/** «5,7», «1.250»: con coma decimal, como en la Argentina. */
export function valorVisible(valor: number): string {
  return FORMATO_VALOR.format(valor);
}

/** La unidad como vino, con coma decimal («mL/min/1,73m²»). */
export function unidadVisible(unidad: string): string {
  return unidad.replace(/(\d)\.(\d)/g, '$1,$2');
}

/** ¿Es de hace más de un año (el laboratorio de rutina es anual)? `hoy` es AAAA-MM-DD. */
export function esViejo(fecha: string | undefined, hoy: string): boolean {
  const dia = diaArgentinaDe(fecha);
  if (!dia) {
    return false;
  }
  const [anio, mes, diaDelMes] = hoy.split('-').map(Number);
  const limite = new Date(Date.UTC(anio, mes - 1 - MESES_LABORATORIO_RUTINA, diaDelMes)).toISOString().slice(0, 10);
  return dia < limite;
}

/** Lo que se muestra de un valor que hay. */
export interface DatoHgraph {
  readonly valor: string;
  readonly unidad: string;
  readonly estado: EstadoMetricaHgraph;
  readonly textoEstado: string;
  /** 0 (peor) a 1 (óptimo), el del core redondeado para dibujar. */
  readonly score: number;
  readonly fecha?: string;
  readonly origen: OrigenLectura;
  readonly viejo: boolean;
}

/** Un eje del hGraph. */
export interface PuntoHgraph {
  readonly id: ParametroBasico;
  readonly nombre: string;
  readonly rotulo: string;
  /** Sin dato: el eje queda con «Falta». */
  readonly dato?: DatoHgraph;
}

export interface ModeloHgraph {
  /** Los 13 básicos, siempre, en el orden de los ejes. */
  readonly puntos: readonly PuntoHgraph[];
  readonly conDato: number;
  /** Cuántos no tienen dato. */
  readonly faltan: number;
}

export interface OpcionesHgraph {
  /** `Patient.gender`: la cintura y el HDL tienen un corte para la mujer y otro para el varón. */
  readonly sexo?: string;
  /** Hoy en Argentina, AAAA-MM-DD. */
  readonly hoy: string;
}

/** El modelo del hGraph a partir de las lecturas de la paciente (sin las anuladas). */
export function modeloHgraph(observaciones: readonly Observation[], { sexo, hoy }: OpcionesHgraph): ModeloHgraph {
  const ganadoras = lecturasGanadoras(observaciones);
  const valores: ValoresCkm = {};
  for (const [parametro, lectura] of Object.entries(ganadoras) as [ParametroHgraph, LecturaGanadora][]) {
    valores[parametro] = lectura.valor;
  }
  const metricas = new Map(metricasHgraph(valores, sexo).map((m) => [m.id, m]));
  const puntos = BASICOS.map((id): PuntoHgraph => {
    const metrica = metricas.get(id);
    const lectura = ganadoras[id];
    const base = { id, nombre: NOMBRE_PACIENTE[id], rotulo: ROTULO_HGRAPH[id] };
    if (!metrica || !lectura) {
      return base;
    }
    return {
      ...base,
      dato: {
        valor: valorVisible(metrica.value),
        unidad: unidadVisible(metrica.unit),
        estado: metrica.status,
        textoEstado: TEXTO_ESTADO[metrica.status],
        score: metrica.score,
        fecha: lectura.valor.date,
        origen: origenDeLectura(lectura.observation),
        viejo: esViejo(lectura.valor.date, hoy),
      },
    };
  });
  const conDato = puntos.filter((p) => p.dato).length;
  return { puntos, conDato, faltan: puntos.length - conDato };
}

/** La frase que describe el gráfico entero (el aria-label del SVG). */
export function descripcionHgraph(modelo: ModeloHgraph): string {
  if (modelo.conDato === 0) {
    return 'Tus valores: todavía no hay datos.';
  }
  const cuenta = (estado: EstadoMetricaHgraph): number => modelo.puntos.filter((p) => p.dato?.estado === estado).length;
  const partes = (['healthy', 'moderate', 'high'] as const)
    .filter((e) => cuenta(e) > 0)
    .map((e) => `${cuenta(e)} ${TEXTO_ESTADO[e].toLocaleLowerCase('es-AR')}`);
  const faltan = modelo.faltan > 0 ? ` Faltan ${modelo.faltan}.` : '';
  return `Tus valores: ${partes.join(', ')}.${faltan}`;
}

// ---------------------------------------------------------------------------------------
// Geometría (viewBox de 560 × 440, la paciente en el centro)
// ---------------------------------------------------------------------------------------

export const ANCHO_HGRAPH = 560;
export const ALTO_HGRAPH = 440;
export const CENTRO_X = ANCHO_HGRAPH / 2;
export const CENTRO_Y = ALTO_HGRAPH / 2;
/**
 * Puntaje 0: no en el centro exacto (como el dashboard) sino un poco afuera, para que dos
 * valores altos no queden uno encima del otro.
 */
export const R_MINIMO = 24;
/** Puntaje 1: el anillo de «en rango». */
export const R_ANILLO = 140;
export const R_ROTULO = 162;
/** Anillo del origen alrededor de cada punto. */
export const R_ORIGEN = 12;

/** Radio de un puntaje (recortado a 0–1). */
export function radioHgraph(score: number): number {
  return R_MINIMO + Math.min(1, Math.max(0, score)) * (R_ANILLO - R_MINIMO);
}

/** El radio de la guía de «para mirar»: debajo, «para hablar con tu médico». */
export const R_GUIA_MODERADO = radioHgraph(PUNTAJE_MODERADO);

/** Ángulo del eje i de n, en grados desde las 12 y en sentido horario. */
export function anguloEje(i: number, n: number): number {
  return (360 * i) / n;
}

export function puntoHgraph(r: number, grados: number): { x: number; y: number } {
  const rad = (grados * Math.PI) / 180;
  return { x: redondear(CENTRO_X + r * Math.sin(rad)), y: redondear(CENTRO_Y - r * Math.cos(rad)) };
}

/** Dónde va el rótulo del eje i y hacia qué lado se alinea. */
export function rotuloEje(i: number, n: number): { x: number; y: number; anclaje: 'start' | 'middle' | 'end' } {
  const { x, y } = puntoHgraph(R_ROTULO, anguloEje(i, n));
  const dx = x - CENTRO_X;
  return { x, y, anclaje: Math.abs(dx) < 12 ? 'middle' : dx > 0 ? 'start' : 'end' };
}

/** El contorno que une los puntos con dato, en el orden de los ejes; vacío con menos de tres. */
export function caminoHgraph(puntos: readonly PuntoHgraph[]): string {
  const n = puntos.length;
  const vertices = puntos.flatMap((p, i) => (p.dato ? [puntoHgraph(radioHgraph(p.dato.score), anguloEje(i, n))] : []));
  if (vertices.length < 3) {
    return '';
  }
  return `${vertices.map((v, i) => `${i === 0 ? 'M' : 'L'}${v.x} ${v.y}`).join(' ')} Z`;
}

/**
 * La marca de cada estado: color y forma, para que no dependa sólo del color (círculo en
 * rango, rombo para mirar, triángulo para hablar con el médico). Centrada en (x, y).
 */
export function marcaEstado(estado: EstadoMetricaHgraph, x: number, y: number): string {
  if (estado === 'healthy') {
    const r = 7;
    return `M${x - r} ${y} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
  }
  if (estado === 'moderate') {
    const d = 8.5;
    return `M${x} ${y - d} L${x + d} ${y} L${x} ${y + d} L${x - d} ${y} Z`;
  }
  const h = 9;
  return `M${x} ${redondear(y - h)} L${redondear(x + h * 0.95)} ${redondear(y + h * 0.65)} L${redondear(x - h * 0.95)} ${redondear(y + h * 0.65)} Z`;
}

// ---------------------------------------------------------------------------------------
// Colores (dos temas: el claro de la zona clara de E y del modo claro de D; el oscuro de D)
// ---------------------------------------------------------------------------------------

export type TemaHgraph = 'claro' | 'oscuro';

export interface ColoresHgraph {
  readonly fondo: string;
  readonly texto: string;
  readonly secundario: string;
  readonly guia: string;
  readonly contorno: string;
  readonly enlace: string;
  readonly estado: Readonly<Record<EstadoMetricaHgraph, string>>;
}

/**
 * Sin rojo (dirección médica, 23.10.2026): el alto va en naranja oscuro. Cada color de
 * estado da ≥ 3:1 contra su fondo (lo verifica hgraph.test.ts), y además cambia la forma.
 */
export const COLORES_HGRAPH: Readonly<Record<TemaHgraph, ColoresHgraph>> = {
  claro: {
    fondo: '#ffffff',
    texto: '#141517',
    secundario: '#4a5361',
    guia: '#6f87a3',
    contorno: '#0061b8',
    enlace: '#0061b8',
    estado: { healthy: '#0e7c70', moderate: '#8a5a00', high: '#b4440e' },
  },
  oscuro: {
    fondo: '#0a2645',
    texto: '#f2f7ff',
    secundario: '#cce4ff',
    guia: '#5b8fc9',
    contorno: '#66abff',
    enlace: '#99c8ff',
    estado: { healthy: '#3cc9b0', moderate: '#f2c14e', high: '#ff9a5c' },
  },
};

function redondear(v: number): number {
  return Math.round(v * 10) / 10;
}
