import {
  CODIGO_TASK_ACCION,
  EXT_SUFIJO,
  MOMENTO_LABEL,
  SYSTEM_ACCIONES,
  coincide,
  type Momento,
} from '@epa/careplan-menopausia';
import type { Goal, Quantity, Task } from '@medplum/fhirtypes';

function cantidad(quantity: Quantity | undefined): string | undefined {
  if (quantity?.value === undefined) return undefined;
  const unidad = quantity.unit ? ` ${quantity.unit}` : '';
  const comparador = quantity.comparator ? `${quantity.comparator} ` : '';
  return `${comparador}${quantity.value}${unidad}`;
}

/** Human-readable (Spanish) text for a Goal target: `7 a 9 h`, `< 130 mg/dL`. */
export function textoMeta(meta: Goal): string | undefined {
  const target = meta.target?.[0];
  if (!target) return undefined;
  if (target.detailRange) {
    const low = cantidad(target.detailRange.low);
    const high = cantidad(target.detailRange.high);
    if (low && high) return `${low} a ${high}`;
    return low ?? high;
  }
  return cantidad(target.detailQuantity);
}

/** Lower-case, accent-free key of a label (`Educación` and `Educacion` are the same step kind). */
export function claveDeTipo(texto: string | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * The activity kind the core stamps on Task.businessStatus (menopause plan:
 * `Educacion`/`Conducta`/...; PB100D catalog: `Educación`/`Evaluación`/...),
 * normalised so both spell the same group.
 */
export function tipoDePaso(paso: Task): string | undefined {
  if (esAccionDeBiblioteca(paso)) return 'accion';
  const texto = paso.businessStatus?.text;
  return texto ? claveDeTipo(texto) : undefined;
}

/**
 * An action of the library (Anexo C / C bis) the team activated for the person: a Task
 * with the action's code in `pb100d-acciones`. Its businessStatus carries the annex and
 * the pillar (`Anexo C bis · Presión y corazón`), not a step kind, so it is told apart by
 * its code.
 */
export function esAccionDeBiblioteca(paso: Task): boolean {
  return (paso.code?.coding ?? []).some(
    (c) =>
      c.system === SYSTEM_ACCIONES ||
      coincide(c.system, 'CodeSystem/pb100d-acciones') ||
      c.code === CODIGO_TASK_ACCION,
  );
}

/** Statuses of a step that no longer belongs to the plan (the team cancelled it, or it was an error). */
const ESTADOS_FUERA_DEL_PLAN = new Set<Task['status']>(['cancelled', 'entered-in-error', 'rejected', 'failed']);

/** Whether a step is still part of the plan: an action the team deactivated is cancelled and not shown. */
export function pasoVigente(paso: Task): boolean {
  return !ESTADOS_FUERA_DEL_PLAN.has(paso.status);
}

export interface ProgresoDelPlan {
  completados: number;
  total: number;
  /** 0 to 100, rounded. */
  porcentaje: number;
}

/**
 * The one progress count of the plan, for the home card and the plan page alike: the
 * steps the person ticks (library actions included), without the team's evaluations
 * (she reads them, she does not tick them) and without the steps no longer in the plan.
 */
export function progresoDelPlan(pasos: readonly Task[]): ProgresoDelPlan {
  const marcables = pasos.filter((paso) => pasoVigente(paso) && tipoDePaso(paso) !== 'evaluacion');
  const completados = marcables.filter((paso) => paso.status === 'completed').length;
  const total = marcables.length;
  return { completados, total, porcentaje: total > 0 ? Math.round((completados / total) * 100) : 0 };
}

/**
 * The step as the person leaves it when she ticks or unticks it: the status, when it
 * changed (`lastModified`) and, when ticked, the day she did it (`executionPeriod.end`),
 * so that the plan's progress over time can be read back. Unticking removes that day.
 */
export function pasoMarcado(paso: Task, completado: boolean, ahora: string): Task {
  const { end: _end, ...periodo } = paso.executionPeriod ?? {};
  const executionPeriod = completado ? { ...periodo, end: ahora } : periodo;
  const marcado: Task = { ...paso, status: completado ? 'completed' : 'requested', lastModified: ahora };
  if (Object.keys(executionPeriod).length > 0) {
    marcado.executionPeriod = executionPeriod;
  } else {
    delete marcado.executionPeriod;
  }
  return marcado;
}

/** Patient-friendly grouping of plan steps, in presentation order. */
export interface GrupoDePasos {
  /** Normalised kind (`claveDeTipo`) of Task.businessStatus.text. */
  tipo: string;
  emoji: string;
  titulo: string;
  descripcion: string;
  /** The team measures these; the person reads them, does not tick them. */
  soloLectura?: boolean;
}

export const GRUPOS_DE_PASOS: GrupoDePasos[] = [
  {
    tipo: 'accion',
    emoji: '✅',
    titulo: 'Tus acciones',
    descripcion: 'Las eligió tu equipo para vos. Marcalas cuando las hagas.',
  },
  {
    tipo: 'monitoreo',
    emoji: '📋',
    titulo: 'Conocé tus números',
    descripcion: 'Datos simples que cuentan cómo está tu corazón hoy.',
  },
  {
    tipo: 'conducta',
    emoji: '🌱',
    titulo: 'Construí tus hábitos',
    descripcion: 'Pequeños cambios sostenidos: ahí está la magia de los 100 días.',
  },
  {
    tipo: 'educacion',
    emoji: '💡',
    titulo: 'Aprendé y disfrutá',
    descripcion: 'Talleres y contenidos pensados para tu plan.',
  },
  {
    tipo: 'derivacion',
    emoji: '🤝',
    titulo: 'Con tu equipo de salud',
    descripcion: 'Tu equipo te acompaña en todo el camino.',
  },
  {
    tipo: 'evaluacion',
    emoji: '🩺',
    titulo: 'Tus controles',
    descripcion: 'Lo que tu equipo mide en el camino y cuándo.',
    soloLectura: true,
  },
];

/** Encouraging one-liner for the progress section. */
export function fraseDeAliento(progreso: number): string {
  if (progreso <= 0) return '¡Hoy empieza tu camino! Marcá cada paso a medida que lo completes.';
  if (progreso < 50) return '¡Buen comienzo! Cada paso que das suma salud para tu corazón.';
  if (progreso < 100) return '¡Ya pasaste la mitad! Seguí así, vas muy bien.';
  return '¡Completaste tu plan! 🎉 Tu equipo va a revisar tus logros con vos.';
}

/** Emoji per goal category (Goal.category coding code from the EPA system). */
export const EMOJI_POR_CATEGORIA: Record<string, string> = {
  'estilo-de-vida': '🌱',
  metabolico: '🍎',
  cardiovascular: '❤️',
  renal: '💧',
  bienestar: '🧘',
};

/** True when the step asks the patient to fill the plan questionnaire. */
export function pasoConCuestionario(paso: Task): boolean {
  return paso.focus?.reference?.startsWith('Questionnaire/') ?? false;
}

const MOMENTOS = new Set<string>(Object.keys(MOMENTO_LABEL));

/** Plan moments of a PB100D step (`catalogo-momento` extension, any namespace), in catalog order. */
export function momentosDePaso(paso: Task): Momento[] {
  const momentos = (paso.extension ?? [])
    .filter((e) => coincide(e.url, EXT_SUFIJO.catalogoMomento))
    .map((e) => e.valueCode)
    .filter((code): code is Momento => code !== undefined && MOMENTOS.has(code));
  return [...new Set(momentos)];
}

/** Short labels of a step's moments ("Día 0", "Día 30", "Novedad de salud"). */
export function etiquetasDeMomentos(paso: Task): string[] {
  return momentosDePaso(paso).map((momento) => MOMENTO_LABEL[momento]);
}
