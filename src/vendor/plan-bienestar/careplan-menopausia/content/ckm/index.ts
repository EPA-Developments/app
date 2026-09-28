import type {
  CatalogoEstadio,
  EstadioCkm,
  EvaluacionCatalogo,
  ItemCatalogo,
  MetaCatalogo,
} from '../../model/catalogo.js';
import { CATALOGO_ESTADIO_0 } from './estadio-0.js';
import { CATALOGO_ESTADIO_1 } from './estadio-1.js';
import { CATALOGO_ESTADIO_2 } from './estadio-2.js';
import { CATALOGO_ESTADIO_3 } from './estadio-3.js';
import { CATALOGO_ESTADIO_4 } from './estadio-4.js';

export { GUIA } from './util.js';
export { E0_METAS, E0_ITEMS, E0_EVALUACIONES, CATALOGO_ESTADIO_0 } from './estadio-0.js';
export { E1_METAS, E1_ITEMS, E1_EVALUACIONES, CATALOGO_ESTADIO_1 } from './estadio-1.js';
export { E2_METAS, E2_ITEMS, E2_EVALUACIONES, CATALOGO_ESTADIO_2 } from './estadio-2.js';
export { E3_METAS, E3_ITEMS, E3_EVALUACIONES, CATALOGO_ESTADIO_3 } from './estadio-3.js';
export { E4_METAS, E4_ITEMS, E4_EVALUACIONES, CATALOGO_ESTADIO_4 } from './estadio-4.js';
export * from './plan.js';

/** Los cinco catálogos firmados el 27/09/2026, por estadío en que se firmaron. */
export const CATALOGOS_POR_ESTADIO: Readonly<Record<EstadioCkm, CatalogoEstadio>> = Object.freeze({
  '0': CATALOGO_ESTADIO_0,
  '1': CATALOGO_ESTADIO_1,
  '2': CATALOGO_ESTADIO_2,
  '3': CATALOGO_ESTADIO_3,
  '4': CATALOGO_ESTADIO_4,
});

const CATALOGOS: readonly CatalogoEstadio[] = [
  CATALOGO_ESTADIO_0,
  CATALOGO_ESTADIO_1,
  CATALOGO_ESTADIO_2,
  CATALOGO_ESTADIO_3,
  CATALOGO_ESTADIO_4,
];

/**
 * El catálogo completo del Plan Bienestar 100 Días, aplanado. Cada elemento lleva
 * sus propios `estadios`, así que la selección (`catalogo/seleccion.ts`) no necesita
 * saber en qué archivo se escribió.
 */
export const CATALOGO_PB100D: Readonly<{
  metas: readonly MetaCatalogo[];
  items: readonly ItemCatalogo[];
  evaluaciones: readonly EvaluacionCatalogo[];
}> = Object.freeze({
  metas: Object.freeze(CATALOGOS.flatMap((c) => [...c.metas])),
  items: Object.freeze(CATALOGOS.flatMap((c) => [...c.items])),
  evaluaciones: Object.freeze(CATALOGOS.flatMap((c) => [...c.evaluaciones])),
});

/** Busca un elemento del catálogo por su código firmado (por ejemplo `E2-HTA-MED-01`). */
export function buscarEnCatalogo(codigo: string): MetaCatalogo | ItemCatalogo | EvaluacionCatalogo | undefined {
  return (
    CATALOGO_PB100D.items.find((i) => i.codigo === codigo) ??
    CATALOGO_PB100D.metas.find((m) => m.codigo === codigo) ??
    CATALOGO_PB100D.evaluaciones.find((e) => e.codigo === codigo)
  );
}
