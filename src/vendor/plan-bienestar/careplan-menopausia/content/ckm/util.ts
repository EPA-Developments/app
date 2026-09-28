import type {
  Audiencia,
  EvaluacionCatalogo,
  ItemCatalogo,
  MetaCatalogo,
  TipoItem,
} from '../../model/catalogo.js';

type BaseItem = Omit<ItemCatalogo, 'tipo' | 'audiencia'>;

function item(tipo: TipoItem, audiencia: Audiencia, base: BaseItem): ItemCatalogo {
  return Object.freeze({ tipo, audiencia, ...base });
}

/** Ítem de educación que ve la persona. */
export const educacion = (base: BaseItem): ItemCatalogo => item('educacion', 'persona', base);

/** Ítem de conducta (acción concreta) que ve la persona. */
export const conducta = (base: BaseItem): ItemCatalogo => item('conducta', 'persona', base);

/** Ítem de automonitoreo que ve la persona. */
export const monitoreo = (base: BaseItem): ItemCatalogo => item('monitoreo', 'persona', base);

/** Alerta al médico: sólo la ve el profesional; nunca es una indicación para la persona. */
export const alerta = (base: BaseItem): ItemCatalogo => item('alerta', 'profesional', base);

/** Derivación a una especialidad. */
export const derivacion = (base: BaseItem): ItemCatalogo => item('derivacion', 'profesional', base);

export const meta = (base: MetaCatalogo): MetaCatalogo => Object.freeze(base);

export const evaluacion = (base: EvaluacionCatalogo): EvaluacionCatalogo => Object.freeze(base);

export const GUIA = 'Guía CKM 2026';
