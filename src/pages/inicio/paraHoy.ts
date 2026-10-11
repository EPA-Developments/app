// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// «Para hoy»: la única acción que la Home E le propone a la paciente. La elige una regla
// fija, en este orden (no la elige la IA):
//  1. el consentimiento informado, si nunca lo firmó;
//  2. el consentimiento, si firmó una versión anterior del texto;
//  3. el cuestionario de ingreso, si no lo respondió;
//  4. el informe de la Segunda Opinión, si se completó hace 14 días o menos;
//  5. la teleconsulta para revisar sus resultados, si subió datos que nadie revisó todavía
//     (laboratorio leído por IA o PREVENT estimado) y no tiene turno: quien sube datos tiene
//     que recibir una devolución (ver caminos.ts);
//  6. el primer hito pendiente del Plan Bienestar · 100 días;
//  7. el primer pétalo de la rosa sin dato (en el orden de LE8_DOMINIOS);
//  8. si no, «Hoy estás al día».
// El nombre del servicio («Segunda Opinión») no se escribe acá: entra por parámetro desde
// MARCA.producto (`paraHoy(datos, { producto: MARCA.producto })`).
import { LE8_DOMINIOS } from '@epa/careplan-menopausia';
import { RUTA_ENVIAR_ESTUDIOS } from '../../components/AccionesRapidas';
import { RUTA_CONSENTIMIENTO } from '../../components/AvisoConsentimiento';
import { RUTA_DATOS_DE_SALUD } from '../../fhir/datosDeSalud';
import { diasEntre, hoyArgentina } from '../../fhir/glp1';
import type { LE8QuestionnaireSlug } from '../../le8';
import { RUTA_CUESTIONARIO_INGRESO } from '../health-record/Salud.data';
import { devolucionPendiente } from './caminos';
import { RUTA_MI_SEGUNDA_OPINION, RUTA_RESERVAR_TELECONSULTA, RUTA_TABLERO_LE8 } from './rutas';
import type { DatosHomeE, Le8Domain, ParaHoy } from './tipos';

export { RUTA_MI_SEGUNDA_OPINION, RUTA_TABLERO_LE8 } from './rutas';
const RUTA_CUESTIONARIOS = '/health-record/cuestionarios';

/** Hasta cuántos días después de completada la Segunda Opinión su informe va en «Para hoy». */
export const DIAS_INFORME_RECIENTE = 14;

export interface OpcionesParaHoy {
  /** El servicio que pide la paciente (MARCA.producto). */
  readonly producto: string;
}

/** Cómo se completa un pétalo sin dato: qué hábito es y adónde ir. */
interface ComoCompletar {
  /** El hábito en minúscula, como va dentro de una frase («Tu pétalo de sueño…»). */
  readonly habito: string;
  readonly titulo: string;
  readonly cta: string;
  readonly href: string;
}

function porCuestionario(habito: string, slug: LE8QuestionnaireSlug): ComoCompletar {
  return {
    habito,
    titulo: `Respondé tu cuestionario de ${habito}`,
    cta: 'Responder ahora',
    href: `${RUTA_CUESTIONARIOS}/${slug}`,
  };
}

function porRegistro(habito: string, que: string): ComoCompletar {
  return { habito, titulo: `Registrá tu ${que}`, cta: 'Registrar ahora', href: RUTA_DATOS_DE_SALUD };
}

function porLaboratorio(habito: string): ComoCompletar {
  return { habito, titulo: 'Enviá tu laboratorio en PDF', cta: 'Enviar mi PDF', href: RUTA_ENVIAR_ESTUDIOS };
}

/**
 * Para cada hábito, cómo se completa su pétalo: las conductas, con su cuestionario de
 * src/le8.ts (el slug está tipado: si cambia allá, esto no compila); el peso y la presión,
 * en «Tus datos de salud»; el colesterol y la glucemia, con el PDF del laboratorio.
 */
export const COMO_COMPLETAR_PETALO: Readonly<Record<Le8Domain, ComoCompletar>> = {
  dieta: porCuestionario('alimentación', 'le8-diet-mepa-v1'),
  'actividad-fisica': porCuestionario('actividad física', 'le8-activity-evs-v1'),
  nicotina: porCuestionario('nicotina', 'le8-tobacco-v1'),
  sueno: porCuestionario('sueño', 'le8-sleep-psqi-v1'),
  imc: porRegistro('peso', 'peso'),
  lipidos: porLaboratorio('colesterol'),
  glucemia: porLaboratorio('glucemia'),
  'presion-arterial': porRegistro('presión arterial', 'presión'),
};

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * La fecha AAAA-MM-DD en Argentina de un instante ISO (meta.lastUpdated viene en UTC: a
 * las 23 de Argentina ya es el día siguiente). Una fecha sin hora se toma tal cual.
 */
function fechaEnArgentina(valor: string): string | undefined {
  if (FECHA_RE.test(valor)) {
    return valor;
  }
  const ms = Date.parse(valor);
  return Number.isFinite(ms) ? hoyArgentina(new Date(ms)) : undefined;
}

/** ¿La Segunda Opinión se completó (se actualizó por última vez) hace 14 días o menos? */
function informeReciente(datos: DatosHomeE): boolean {
  const som = datos.segundaOpinion;
  if (som?.estado !== 'completada' || !som.actualizada) {
    return false;
  }
  const fecha = fechaEnArgentina(som.actualizada);
  // Una fecha futura (reloj corrido) cuenta como reciente; una ilegible (NaN), no.
  return fecha !== undefined && diasEntre(fecha, datos.hoy) <= DIAS_INFORME_RECIENTE;
}

/** Hábitos que completa el laboratorio: si hay uno en camino, no se le pide que lo mande de nuevo. */
const DEL_LABORATORIO: ReadonlySet<Le8Domain> = new Set<Le8Domain>(['lipidos', 'glucemia']);

/** El primer hábito sin puntaje, en el orden de la rosa (LE8_DOMINIOS). */
function primerPetaloSinDato(datos: DatosHomeE): Le8Domain | undefined {
  const dominios = datos.le8?.dominios;
  if (!dominios) {
    return undefined;
  }
  const laboratorioEnCamino = datos.laboratorio?.estado === 'en-proceso';
  return LE8_DOMINIOS.find(
    (dominio) =>
      dominios.find((d) => d.dominio === dominio)?.puntaje === undefined &&
      !(laboratorioEnCamino && DEL_LABORATORIO.has(dominio))
  );
}

/** La acción de hoy, por la regla fija de arriba. Función pura: no consulta nada. */
export function paraHoy(datos: DatosHomeE, opciones: OpcionesParaHoy): ParaHoy {
  if (datos.consentimiento === 'falta') {
    return {
      clave: 'consentimiento',
      titulo: 'Firmá tu consentimiento informado',
      detalle: 'Es el primer paso: sin tu firma, tus datos clínicos no pasan por nuestros agentes de IA.',
      cta: 'Leer y firmar',
      href: RUTA_CONSENTIMIENTO,
    };
  }
  if (datos.consentimiento === 'desactualizado') {
    return {
      clave: 'consentimiento-actualizado',
      titulo: 'Actualizamos el consentimiento informado',
      detalle: 'Leelo y firmá la versión nueva.',
      cta: 'Revisar y firmar',
      href: RUTA_CONSENTIMIENTO,
    };
  }
  if (datos.ingresoPendiente) {
    return {
      clave: 'ingreso',
      titulo: 'Completá tu cuestionario de ingreso',
      detalle: 'Con tus antecedentes, tu equipo médico te conoce mejor.',
      cta: 'Completar ahora',
      href: RUTA_CUESTIONARIO_INGRESO,
    };
  }
  if (informeReciente(datos)) {
    return {
      clave: 'informe',
      titulo: `Tu informe de ${opciones.producto} está listo`,
      // «Firmó» solo con la firma médica registrada: la orden la completa el bot que prepara el informe.
      detalle: datos.segundaOpinion?.firmada
        ? 'Lo firmó tu equipo médico.'
        : 'Leelo con calma; si te surgen dudas, revisalo con un profesional en una teleconsulta.',
      cta: 'Ver mi informe',
      href: RUTA_MI_SEGUNDA_OPINION,
    };
  }
  if (devolucionPendiente(datos)) {
    return {
      clave: 'teleconsulta',
      titulo: 'Revisemos juntos tus resultados',
      detalle:
        'Ya tenemos tus datos. En una teleconsulta, un profesional de nuestro equipo te los explica y te propone los próximos pasos.',
      cta: 'Reservar mi teleconsulta',
      href: RUTA_RESERVAR_TELECONSULTA,
    };
  }
  const hito = datos.plan?.hitos.find((h) => !h.cumplido);
  if (hito) {
    return {
      clave: `hito-${hito.id}`,
      titulo: hito.label,
      detalle: hito.descripcion,
      cta: 'Hacerlo ahora',
      href: hito.href,
    };
  }
  const faltante = primerPetaloSinDato(datos);
  if (faltante) {
    const como = COMO_COMPLETAR_PETALO[faltante];
    return {
      clave: `le8-${faltante}`,
      titulo: como.titulo,
      detalle: `Tu pétalo de ${como.habito} se completa con tu dato.`,
      cta: como.cta,
      href: como.href,
    };
  }
  return {
    clave: 'al-dia',
    titulo: 'Hoy estás al día',
    detalle: 'Tu equipo tiene lo que necesita por ahora.',
    cta: 'Ver mis 8 hábitos',
    href: RUTA_TABLERO_LE8,
  };
}
