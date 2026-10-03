import type { Task } from '@medplum/fhirtypes';
import { EXT_SUFIJO, PB100D_DURACION_DIAS, coincide } from '../contrato/pb100d.js';
import { MOMENTO_LABEL, type Momento } from '../model/catalogo.js';

/**
 * Los momentos del plan vistos desde el calendario de la persona: en qué día del plan
 * está, qué control corre y qué momentos del catálogo están vigentes hoy.
 *
 * Día 0 es el alta (`PB100D_EVALUACION_DIAS`); los controles son a los días 30, 60 y
 * 100. Las **ventanas** de cada control son provisorias (a confirmar con el equipo
 * médico): un dato del control del día 30 vale si se cargó desde 15 días antes.
 */
export type MomentoControl = 'dia-0' | 'dia-30' | 'dia-60' | 'dia-100';

export interface Control {
  momento: MomentoControl;
  /** Día del plan del control. */
  dia: number;
  /** Primer y último día del plan en que este control es "el actual". */
  desde: number;
  hasta: number;
}

export const CONTROLES: readonly Control[] = Object.freeze([
  { momento: 'dia-0', dia: 0, desde: Number.NEGATIVE_INFINITY, hasta: 14 },
  { momento: 'dia-30', dia: 30, desde: 15, hasta: 44 },
  { momento: 'dia-60', dia: 60, desde: 45, hasta: 79 },
  { momento: 'dia-100', dia: 100, desde: 80, hasta: Number.POSITIVE_INFINITY },
]);

/** Días antes del control desde los que un dato cuenta para ese control (provisorio). */
export const VENTANA_CONTROL_DIAS = 15;

export const DIA_MS = 86_400_000;

/** ISO date (`YYYY-MM-DD`) `dias` después de `iso` (fecha o dateTime). */
export function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Día del plan (0 = el día del alta) al día `hoy`; undefined sin inicio válido. */
export function diaDelPlan(inicio: string | undefined, hoy: string): number | undefined {
  if (!inicio) return undefined;
  const desde = Date.parse(`${inicio.slice(0, 10)}T00:00:00Z`);
  const hasta = Date.parse(`${hoy.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(desde) || Number.isNaN(hasta)) return undefined;
  return Math.floor((hasta - desde) / DIA_MS);
}

/** El control que corre en este día del plan. */
export function controlActual(dia: number): Control {
  return CONTROLES.find((c) => dia >= c.desde && dia <= c.hasta) ?? CONTROLES[CONTROLES.length - 1]!;
}

/** Fecha (ISO date) del control para un plan que empezó en `inicio`. */
export function fechaDelControl(inicio: string, momento: MomentoControl): string {
  const control = CONTROLES.find((c) => c.momento === momento)!;
  return sumarDias(inicio, control.dia);
}

/**
 * Momentos del catálogo vigentes hoy: el control que corre, lo continuo, lo semanal y
 * lo mensual siempre, y `evento` sólo con un evento vigente. Sin plan (día undefined)
 * rige el día 0.
 */
export function momentosVigentes(dia: number | undefined, opciones: { eventosActivos?: boolean } = {}): Set<Momento> {
  const out = new Set<Momento>(['continuo', 'semanal', 'mensual']);
  out.add(dia === undefined ? 'dia-0' : controlActual(dia).momento);
  if (opciones.eventosActivos) out.add('evento');
  return out;
}

const MOMENTOS = new Set<string>(Object.keys(MOMENTO_LABEL));

/** Momentos de una Task del plan (extensión `catalogo-momento`, en cualquier base aceptada). */
export function momentosDeTask(task: Task): Momento[] {
  const momentos = (task.extension ?? [])
    .filter((e) => coincide(e.url, EXT_SUFIJO.catalogoMomento))
    .map((e) => e.valueCode)
    .filter((code): code is Momento => code !== undefined && MOMENTOS.has(code));
  return [...new Set(momentos)];
}

/** Texto corto del día del plan ("Día 34 de 100"). */
export function etiquetaDia(dia: number): string {
  return `Día ${Math.max(0, dia)} de ${PB100D_DURACION_DIAS}`;
}
