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

/** The activity kind label the core stamps on Task.businessStatus. */
export function tipoDePaso(paso: Task): string | undefined {
  return paso.businessStatus?.text;
}

/** Patient-friendly grouping of plan steps, in presentation order. */
export interface GrupoDePasos {
  /** Matches Task.businessStatus.text stamped by the core. */
  tipo: string;
  emoji: string;
  titulo: string;
  descripcion: string;
}

export const GRUPOS_DE_PASOS: GrupoDePasos[] = [
  {
    tipo: 'Monitoreo',
    emoji: '📋',
    titulo: 'Conocé tus números',
    descripcion: 'Datos simples que cuentan cómo está tu corazón hoy.',
  },
  {
    tipo: 'Conducta',
    emoji: '🌱',
    titulo: 'Construí tus hábitos',
    descripcion: 'Pequeños cambios sostenidos: ahí está la magia de los 100 días.',
  },
  {
    tipo: 'Educacion',
    emoji: '💡',
    titulo: 'Aprendé y disfrutá',
    descripcion: 'Talleres y contenidos pensados para esta etapa de tu vida.',
  },
  {
    tipo: 'Derivacion',
    emoji: '🤝',
    titulo: 'Con tu equipo de salud',
    descripcion: 'No estás sola: tu equipo te acompaña en el camino.',
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
