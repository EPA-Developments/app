// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Formatos de texto y de fechas que comparten las Homes E y D. Funciones puras: las fechas se
// muestran siempre en hora de Argentina (ZONA_HORARIA), donde vive la persona, y no en la del
// navegador.
import { hoyArgentina, ZONA_HORARIA } from '../../fhir/glp1';

const FECHA_SOLA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Un instante de una fecha FHIR. Una fecha sin hora (AAAA-MM-DD) es un día de Argentina: va al
 * mediodía de allá, para que ninguna zona horaria la corra de día. Undefined si no se entiende.
 */
export function aInstante(valor: string): Date | undefined {
  const ms = Date.parse(FECHA_SOLA.test(valor) ? `${valor}T12:00:00-03:00` : valor);
  return Number.isFinite(ms) ? new Date(ms) : undefined;
}

const FORMATO_DIA = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA_HORARIA, day: 'numeric', month: 'long' });
const FORMATO_DIA_Y_ANIO = new Intl.DateTimeFormat('es-AR', {
  timeZone: ZONA_HORARIA,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const FORMATO_CON_SEMANA = new Intl.DateTimeFormat('es-AR', {
  timeZone: ZONA_HORARIA,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const FORMATO_PORCENTAJE = new Intl.NumberFormat('es-AR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * «3 de octubre» (con el año si no es el de `hoy`: «3 de diciembre de 2025»), en hora de
 * Argentina. `hoy` es AAAA-MM-DD (DatosHomeE.hoy). Undefined sin fecha o si no se entiende.
 */
export function fechaCorta(valor: string | undefined, hoy: string): string | undefined {
  const instante = valor ? aInstante(valor) : undefined;
  if (!instante) {
    return undefined;
  }
  const mismoAnio = hoyArgentina(instante).slice(0, 4) === hoy.slice(0, 4);
  return (mismoAnio ? FORMATO_DIA : FORMATO_DIA_Y_ANIO).format(instante);
}

/** «sábado 10 de octubre» (Intl pone una coma después del día de la semana: acá no va). */
export function fechaConDia(hoy: string): string {
  const instante = aInstante(hoy);
  if (!instante) {
    return '';
  }
  const partes = FORMATO_CON_SEMANA.formatToParts(instante);
  const parte = (tipo: Intl.DateTimeFormatPartTypes): string => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${parte('weekday')} ${parte('day')} de ${parte('month')}`;
}

/** Una probabilidad 0-1 como porcentaje con un decimal y coma: «4,2%». */
export function porcentaje(probabilidad: number): string {
  return FORMATO_PORCENTAJE.format(probabilidad);
}

/** «+6», «−3» (con el signo menos tipográfico) o «0». */
export function conSigno(diferencia: number): string {
  if (diferencia > 0) {
    return `+${diferencia}`;
  }
  return diferencia < 0 ? `−${Math.abs(diferencia)}` : '0';
}

/** «1 semana», «4 semanas»: el número con la palabra en singular o en plural. */
export function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** La primera letra en mayúscula («moderada» → «Moderada»). */
export function mayuscula(texto: string): string {
  return texto.charAt(0).toLocaleUpperCase('es-AR') + texto.slice(1);
}

/** La primera letra en minúscula («Factores de riesgo activos» → «factores de riesgo activos»). */
export function minuscula(texto: string): string {
  return texto.charAt(0).toLocaleLowerCase('es-AR') + texto.slice(1);
}
