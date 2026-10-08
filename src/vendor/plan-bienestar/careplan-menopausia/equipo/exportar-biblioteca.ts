import { BIBLIOTECA_AMPLIADA, EXCLUSIONES_MUTUAS, PILARES, type Accion, type Anexo, type Pilar } from '../biblioteca/acciones-nivel1.js';
import { NIVELES, type Nivel } from '../biblioteca/niveles.js';
import { ANEXOS, type EstadoAnexo } from './acciones.js';

/**
 * La biblioteca firmada como datos, para los consumidores que no dependen de este paquete.
 *
 * El primero es el sitio de información para la paciente (`EPA-Developments/info`), que
 * genera sus tablas de acciones y la escalera de niveles desde este JSON en lugar de
 * copiar los textos a mano: así el contenido que lee la persona no puede divergir de lo
 * que elige la IA y aprueba el médico. Lo escribe `scripts/exportar-biblioteca.ts`.
 *
 * Viaja todo lo que ya es público en el paquete; nada de pacientes.
 */
export interface BibliotecaExportada {
  /** Versión del paquete que la generó. */
  version: string;
  /** Fecha de generación, YYYY-MM-DD. */
  generado: string;
  /** Estado de firma de cada anexo (`ANEXOS`). */
  firmas: Readonly<Record<Anexo, EstadoAnexo>>;
  pilares: Readonly<Record<Pilar, { nombre: string; emoji: string }>>;
  /** Las 80 acciones, tal como están en la biblioteca. */
  acciones: readonly Accion[];
  exclusionesMutuas: readonly (readonly [string, string])[];
  /** La escalera, con sus puertas de seguridad. */
  niveles: readonly Nivel[];
}

export function exportarBiblioteca(version: string, hoy: Date = new Date()): BibliotecaExportada {
  return {
    version,
    generado: hoy.toISOString().slice(0, 10),
    firmas: ANEXOS,
    pilares: PILARES,
    acciones: BIBLIOTECA_AMPLIADA,
    exclusionesMutuas: EXCLUSIONES_MUTUAS,
    niveles: NIVELES,
  };
}
