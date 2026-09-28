import { EXT_SUFIJO, MOMENTO_LABEL, coincide, type Momento } from '@epa/careplan-menopausia';
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
  const texto = paso.businessStatus?.text;
  return texto ? claveDeTipo(texto) : undefined;
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
    descripcion: 'Talleres y contenidos pensados para esta etapa de tu vida.',
  },
  {
    tipo: 'derivacion',
    emoji: '🤝',
    titulo: 'Con tu equipo de salud',
    descripcion: 'No estás sola: tu equipo te acompaña en el camino.',
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
  bienestar: '🧘‍♀️',
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

/** Short labels of a step's moments ("Día 0", "Día 30", "Evento"). */
export function etiquetasDeMomentos(paso: Task): string[] {
  return momentosDePaso(paso).map((momento) => MOMENTO_LABEL[momento]);
}
