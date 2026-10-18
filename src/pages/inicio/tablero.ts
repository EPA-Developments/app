// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// El tablero «Salidas y llegadas de tus datos» de la Home D, sin red: de los recursos FHIR
// que trae `useTableroHomeD` a las filas que se muestran. Cada fila es un recurso real con
// su estado real (no se inventan pasos, fechas ni revisiones):
//  - PDFs de laboratorio (DocumentReference): una salida por documento y, si el bot ya sumó
//    su DiagnosticReport, una llegada con los valores que leyó (con o sin revisión médica; si
//    el informe no se pudo leer, no se afirma ni una cosa ni la otra).
//  - La Segunda Opinión (ServiceRequest): una salida por pedido y la llegada del informe del
//    más nuevo (en camino, en revisión por el cardiólogo, listo o firmado: firmado solo con la
//    firma médica registrada).
//  - Los cuestionarios de hábitos y el de ingreso (QuestionnaireResponse).
//  - Lo que se mide en casa y el laboratorio cargado a mano (Observation), por día de Argentina.
//  - Las novedades (Communication), como llegadas.
// Todo es puro y se prueba sin red (tablero.test.ts).
import type {
  Communication,
  DiagnosticReport,
  DocumentReference,
  Observation,
  QuestionnaireResponse,
  ServiceRequest,
  Task,
} from '@medplum/fhirtypes';
import { RUTA_ENVIAR_ESTUDIOS } from '../../components/AccionesRapidas';
import { estadoEstudio } from '../../fhir/estudios';
import { destinoNotificacion, esNoLeida, tipoNotificacion } from '../../fhir/notificaciones';
import { estadoSolicitudSOM, etiquetaSolicitudSOM } from '../../fhir/som';
import { LE8_QUESTIONNAIRES } from '../../le8';
import { INTAKE_QUESTIONNAIRE_URL } from '../intake.questionnaire';
import {
  aInstante,
  diaArgentinaDe,
  fechaCorta,
  mayuscula,
  MESES_ABREVIADOS,
  minusculaNatural,
  plural,
} from './formato';
import { RUTA_MI_SEGUNDA_OPINION } from './rutas';
import type { FilaTablero, TableroHomeD, TonoEstado } from './tipos';
import { estudioVigente, informeFirmado, laboratorioHome, NOTA_PDF_DEMORADO } from './useDatosHomeE';

export { estudioVigente, NOTA_PDF_DEMORADO };

// ─── Límites y textos ────────────────────────────────────────────────────────────────

/** Cuántas filas muestra el tablero como mucho (las más nuevas y lo que sigue en curso). */
export const MAX_FILAS = 20;
/** Cuántos pedidos de la Segunda Opinión entran (los más nuevos). */
export const MAX_PEDIDOS_SOM = 5;

/** Valores que leyó un agente de IA y que ningún médico revisó todavía. */
export const NOTA_LABORATORIO_SIN_REVISION =
  'Estos valores los leyó un agente de IA de tu PDF. Todavía no los revisó un médico.';
/** El informe que todavía no llegó: sin plazos. */
export const NOTA_INFORME_EN_CAMINO = 'Te avisamos en Novedades cuando esté listo.';
/** El informe que espera la firma del cardiólogo (R-24): sin plazos. */
export const NOTA_INFORME_EN_REVISION = 'Lo está revisando un cardiólogo. Te avisamos en Novedades cuando lo firme.';
/**
 * El informe completado sin la firma médica registrada: uno de antes de la firma del cardiólogo
 * (R-24), que preparó con IA el bot que completaba la orden (ver SegundaOpinionHome en tipos.ts).
 * Nunca se dice «firmado» sin la firma.
 */
export const NOTA_INFORME_SIN_FIRMA = 'Preparado con IA. Todavía no tiene la firma de un médico.';

const RUTA_RESULTADOS_LABORATORIO = '/health-record/lab-results';
const RUTA_RESPUESTAS = '/health-record/questionnaire-responses';
const RUTA_SIGNOS_VITALES = '/health-record/vitals';
const RUTA_BIOMARCADORES = '/health-record/biomarkers';

// ─── Fechas (hora de Argentina) ──────────────────────────────────────────────────────

/** El instante de una fecha FHIR (formato.ts: una fecha sin hora es el mediodía de Argentina). */
function instante(valor: string | undefined): Date | undefined {
  return valor ? aInstante(valor) : undefined;
}

/** Milisegundos de una fecha FHIR, o undefined si no la hay o no se entiende. */
function ms(valor: string | undefined): number | undefined {
  return instante(valor)?.getTime();
}

/** Cómo se muestra la fecha de una fila. */
export interface FechaTablero {
  /** En mono, para la pantalla: «03 OCT», o «—» si todavía no hay fecha. */
  readonly corta: string;
  /** El año, solo si no es el de hoy («2025»). */
  readonly anio?: string;
  /** Para lectores de pantalla: «3 de octubre» (con el año si no es el de hoy) o «Sin fecha todavía». */
  readonly larga: string;
}

/** La fecha de una fila en hora de Argentina: «03 OCT» en pantalla y «3 de octubre» para leer. */
export function fechaDelTablero(valor: string | undefined, hoy: string): FechaTablero {
  const dia = diaArgentinaDe(valor);
  // fechaCorta (formato.ts) ya pone el año solo si no es el de hoy: «30 de diciembre de 2025».
  const larga = fechaCorta(valor, hoy);
  if (!dia || !larga) {
    return { corta: '—', larga: 'Sin fecha todavía' };
  }
  const [anio, mes, diaDelMes] = dia.split('-');
  // Abreviatura fija (formato.ts), en mayúsculas como el resto del tablero.
  const corta = `${diaDelMes} ${MESES_ABREVIADOS[Number(mes) - 1].toLocaleUpperCase('es-AR')}`;
  return anio === hoy.slice(0, 4) ? { corta, larga } : { corta, anio, larga };
}

// ─── Textos ──────────────────────────────────────────────────────────────────────────

/** «a», «a y b», «a, b y c». */
function enumerar(partes: readonly string[]): string {
  if (partes.length <= 1) {
    return partes.join('');
  }
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

// ─── PDFs de laboratorio ─────────────────────────────────────────────────────────────

/**
 * Los ids de los DiagnosticReport de todos los PDFs procesados (sin repetir): se traen en una
 * sola búsqueda (useTableroHomeD), así ninguna llegada queda sin su informe por un tope.
 */
export function informesALeer(documentos: readonly DocumentReference[]): string[] {
  const ids = documentos
    .filter(estudioVigente)
    .map((doc) => estadoEstudio(doc))
    .flatMap((estado) => (estado.estado === 'procesado' ? [estado.informeId] : []));
  return [...new Set(ids)];
}

/**
 * Una salida por PDF («En proceso», «Demorado» o «Procesado», con la regla de demora de la Home
 * E) y, por cada PDF procesado, la llegada de sus valores. `informes` son los DiagnosticReport
 * que se pudieron leer, por id. Sin el informe, la llegada dice «Listo» en tono neutro y sin
 * nota: no se afirma que lo revisó un médico ni que no lo revisó (no se pudo leer).
 */
export function filasDeEstudios(
  documentos: readonly DocumentReference[],
  informes: ReadonlyMap<string, DiagnosticReport>,
  ahora: Date = new Date()
): FilaTablero[] {
  const filas: FilaTablero[] = [];
  for (const doc of documentos.filter(estudioVigente)) {
    const estado = estadoEstudio(doc);
    const informe = estado.estado === 'procesado' ? informes.get(estado.informeId) : undefined;
    const lab = laboratorioHome(doc, informe, ahora);
    let estadoSalida = 'En proceso';
    let tonoSalida: TonoEstado = 'en-curso';
    if (lab.estado === 'demorado') {
      estadoSalida = 'Demorado';
      tonoSalida = 'demorado';
    } else if (lab.estado === 'procesado') {
      estadoSalida = 'Procesado';
      tonoSalida = 'listo';
    }
    filas.push({
      id: `DocumentReference/${doc.id}`,
      sentido: 'salida',
      recurso: 'DocumentReference',
      fecha: doc.date,
      actualizada: doc.meta?.lastUpdated,
      que: 'PDF de laboratorio',
      ruta: 'Tu app → Agente de laboratorio',
      estado: estadoSalida,
      tono: tonoSalida,
      ...(lab.estado === 'demorado' ? { nota: NOTA_PDF_DEMORADO } : {}),
      // «Enviar estudios en PDF» lista los enviados con su estado.
      href: RUTA_ENVIAR_ESTUDIOS,
    });
    if (estado.estado !== 'procesado') {
      continue;
    }
    let estadoLlegada = 'Listo';
    if (lab.valores !== undefined) {
      estadoLlegada = lab.valores === 0 ? 'Listo: sin valores' : `Listo: ${plural(lab.valores, 'valor', 'valores')}`;
    }
    // El mismo criterio que la Home E: sin `final` + `resultsInterpreter`, sin revisión médica.
    // Sin el informe no se sabe: ni la nota ni el tono de «atención».
    let tonoLlegada: TonoEstado = 'neutro';
    if (informe) {
      tonoLlegada = lab.revisionMedica ? 'listo' : 'atencion';
    }
    filas.push({
      id: `DiagnosticReport/${estado.informeId}`,
      sentido: 'llegada',
      recurso: 'DiagnosticReport',
      // Sin el informe, cuando el bot lo sumó al PDF (el DocumentReference cambió entonces).
      fecha: informe?.issued ?? informe?.meta?.lastUpdated ?? doc.meta?.lastUpdated ?? doc.date,
      actualizada: informe?.meta?.lastUpdated ?? doc.meta?.lastUpdated,
      que: 'Resultados de laboratorio',
      ruta: 'Llegada → Biomarcadores',
      estado: estadoLlegada,
      tono: tonoLlegada,
      ...(tonoLlegada === 'atencion' ? { nota: NOTA_LABORATORIO_SIN_REVISION } : {}),
      href: `${RUTA_RESULTADOS_LABORATORIO}/${estado.informeId}`,
    });
  }
  return filas;
}

// ─── Segunda Opinión ─────────────────────────────────────────────────────────────────

function tonoPedido(status: ServiceRequest['status']): TonoEstado {
  if (status === 'active') {
    return 'en-curso';
  }
  return status === 'completed' ? 'listo' : 'neutro';
}

/** Los pedidos que cuentan, del más nuevo al más viejo: uno cargado por error no es un pedido. */
export function pedidosVigentes(pedidos: readonly ServiceRequest[]): ServiceRequest[] {
  return pedidos.filter((p) => p.id && p.status !== 'entered-in-error').slice(0, MAX_PEDIDOS_SOM);
}

/**
 * Una salida por pedido (los MAX_PEDIDOS_SOM más nuevos, que llegan ordenados por fecha de
 * pedido; los cargados por error no van) y la llegada del informe del más nuevo: «En camino»
 * mientras está en análisis, «En revisión por el cardiólogo» mientras espera la firma (los dos
 * sin fecha ni plazo) y, completado, «Firmado» solo con la firma médica registrada; si no,
 * «Listo». `informe` es el DiagnosticReport del más nuevo, si está completado y se pudo leer: sin
 * él, «Listo» en tono neutro, sin afirmar nada de la firma. `tareasFirma`, las tareas de firma
 * de la paciente (`estadoSolicitudSOM`: el mismo estado que Mi Segunda Opinión).
 */
export function filasDeSegundaOpinion(
  pedidos: readonly ServiceRequest[],
  informe: DiagnosticReport | undefined,
  producto: string,
  tareasFirma: readonly Task[] = []
): FilaTablero[] {
  const recientes = pedidosVigentes(pedidos);
  const filas: FilaTablero[] = recientes.map((p) => ({
    id: `ServiceRequest/${p.id}`,
    sentido: 'salida',
    recurso: 'ServiceRequest',
    fecha: p.authoredOn,
    actualizada: p.meta?.lastUpdated,
    que: `Pedido de ${producto}`,
    ruta: 'Tu app → Agentes de IA y equipo médico',
    estado: etiquetaSolicitudSOM(p, tareasFirma).label,
    tono: tonoPedido(p.status),
    href: RUTA_MI_SEGUNDA_OPINION,
  }));
  const [ultimo] = recientes;
  const base = {
    sentido: 'llegada',
    que: `Informe de ${producto}`,
    ruta: `Llegada → Mi ${producto}`,
    href: RUTA_MI_SEGUNDA_OPINION,
  } as const;
  if (ultimo?.status === 'active') {
    // Todavía no hay informe para la paciente (el borrador no le llega): ni fecha ni plazo.
    const enRevision = estadoSolicitudSOM(ultimo, tareasFirma) === 'en-revision';
    filas.push({
      ...base,
      id: `ServiceRequest/${ultimo.id}#llegada`,
      recurso: 'ServiceRequest',
      estado: enRevision ? etiquetaSolicitudSOM(ultimo, tareasFirma).label : 'En camino',
      tono: 'en-curso',
      nota: enRevision ? NOTA_INFORME_EN_REVISION : NOTA_INFORME_EN_CAMINO,
    });
  } else if (ultimo?.status === 'completed') {
    const firmado = informeFirmado(informe);
    let tono: TonoEstado = 'neutro';
    if (informe) {
      tono = firmado ? 'listo' : 'atencion';
    }
    filas.push({
      ...base,
      ...(informe?.id
        ? ({ id: `DiagnosticReport/${informe.id}`, recurso: 'DiagnosticReport' } as const)
        : ({ id: `ServiceRequest/${ultimo.id}#llegada`, recurso: 'ServiceRequest' } as const)),
      fecha: informe?.issued ?? informe?.meta?.lastUpdated ?? ultimo.meta?.lastUpdated,
      actualizada: informe?.meta?.lastUpdated ?? ultimo.meta?.lastUpdated,
      estado: firmado ? 'Firmado' : 'Listo',
      tono,
      ...(tono === 'atencion' ? { nota: NOTA_INFORME_SIN_FIRMA } : {}),
    });
  }
  return filas;
}

// ─── Cuestionarios ───────────────────────────────────────────────────────────────────

const LE8_POR_URL: ReadonlyMap<string, string> = new Map(LE8_QUESTIONNAIRES.map((q) => [q.url, q.label]));

/** La URL canónica sin la versión («url|1.0» → «url»). */
function canonica(url: string | undefined): string | undefined {
  return url?.split('|')[0];
}

/**
 * Los cuestionarios de los 8 hábitos («Sumado a tu LE8») y el de ingreso («Guardado»), solo
 * completados. El de la Segunda Opinión no va (el pedido ya es su fila) y los desconocidos
 * tampoco.
 */
export function filasDeCuestionarios(respuestas: readonly QuestionnaireResponse[]): FilaTablero[] {
  const filas: FilaTablero[] = [];
  for (const qr of respuestas) {
    if (!qr.id || (qr.status !== 'completed' && qr.status !== 'amended')) {
      continue;
    }
    const url = canonica(qr.questionnaire);
    const habito = url ? LE8_POR_URL.get(url) : undefined;
    const comun = {
      id: `QuestionnaireResponse/${qr.id}`,
      sentido: 'salida',
      recurso: 'QuestionnaireResponse',
      fecha: qr.authored ?? qr.meta?.lastUpdated,
      actualizada: qr.meta?.lastUpdated,
      tono: 'listo',
      href: `${RUTA_RESPUESTAS}/${qr.id}`,
    } as const;
    if (habito) {
      filas.push({
        ...comun,
        que: `Cuestionario de ${minusculaNatural(habito)}`,
        ruta: 'Tu app → Tus 8 hábitos',
        estado: 'Sumado a tu LE8',
      });
    } else if (url === INTAKE_QUESTIONNAIRE_URL) {
      filas.push({
        ...comun,
        que: 'Cuestionario de ingreso',
        ruta: 'Tu app → Tu historia clínica',
        estado: 'Guardado',
      });
    }
  }
  return filas;
}

// ─── Mediciones de casa ──────────────────────────────────────────────────────────────

/**
 * Nombre corto de cada código de CODIGOS_CASA (src/fhir/datosDeSalud.ts; si suma uno, que tenga
 * nombre: lo prueba tablero.test.ts), en el orden en que se nombran: la presión (el panel
 * 85354-9, con la sistólica y la diastólica de CAMPOS_CASA), el peso, la altura, la cintura y el
 * IMC, que el portal calcula con el peso y la altura.
 */
export const NOMBRE_MEDICION: Readonly<Record<string, string>> = {
  '85354-9': 'presión',
  '29463-7': 'peso',
  '8302-2': 'altura',
  '8280-0': 'cintura',
  '39156-5': 'IMC',
};
const ORDEN_MEDICIONES = Object.keys(NOMBRE_MEDICION);
const CODIGO_PESO = '29463-7';
const CODIGO_IMC = '39156-5';

/**
 * «Presión y peso», «Peso», «Presión, peso y cintura»… El IMC no se nombra si está el peso
 * (sale de él).
 */
export function nombreMediciones(codigos: ReadonlySet<string>): string {
  const nombres = ORDEN_MEDICIONES.filter((c) => codigos.has(c))
    .filter((c) => c !== CODIGO_IMC || !codigos.has(CODIGO_PESO))
    .map((c) => NOMBRE_MEDICION[c] as string);
  return nombres.length > 0 ? mayuscula(enumerar(nombres)) : 'Mediciones';
}

function fechaObservacion(o: Observation): string | undefined {
  return o.effectiveDateTime ?? o.effectivePeriod?.start ?? o.effectiveInstant ?? o.issued;
}

/** Lo midió la persona (el portal no pone `performer`); lo que registró un profesional no es una salida. */
function laMidioLaPersona(o: Observation): boolean {
  const performer = o.performer ?? [];
  return performer.length === 0 || performer.some((p) => p.reference?.startsWith('Patient/'));
}

/** La más nueva de dos fechas FHIR (comparadas como instantes). */
function masNueva(a: string | undefined, b: string | undefined): string | undefined {
  const [ma, mb] = [ms(a), ms(b)];
  if (mb === undefined) {
    return ma === undefined ? undefined : a;
  }
  return ma === undefined || mb > ma ? b : a;
}

/** Una medición o un valor que cuenta: no cargado por error ni cancelado, y medido por la persona. */
function observacionVigente(o: Observation): boolean {
  return Boolean(o.id) && o.status !== 'entered-in-error' && o.status !== 'cancelled' && laMidioLaPersona(o);
}

/** Una salida por día de Argentina con lo que se midió en casa ese día. */
export function filasDeMediciones(observaciones: readonly Observation[]): FilaTablero[] {
  interface Dia {
    id: string;
    fecha: string;
    actualizada?: string;
    readonly codigos: Set<string>;
  }
  const dias = new Map<string, Dia>();
  for (const o of observaciones) {
    if (!o.id || !observacionVigente(o)) {
      continue;
    }
    const fecha = fechaObservacion(o);
    const dia = diaArgentinaDe(fecha);
    const codigos = (o.code?.coding ?? []).map((c) => c.code).filter((c): c is string => !!c && c in NOMBRE_MEDICION);
    if (!fecha || !dia || codigos.length === 0) {
      continue;
    }
    const previo = dias.get(dia);
    if (!previo) {
      dias.set(dia, { id: o.id, fecha, actualizada: o.meta?.lastUpdated, codigos: new Set(codigos) });
      continue;
    }
    codigos.forEach((c) => previo.codigos.add(c));
    previo.actualizada = masNueva(previo.actualizada, o.meta?.lastUpdated);
    if (masNueva(previo.fecha, fecha) !== previo.fecha) {
      // La fila lleva el id de la medición más nueva del día.
      previo.id = o.id;
      previo.fecha = fecha;
    }
  }
  return [...dias.values()].map((d) => ({
    id: `Observation/${d.id}`,
    sentido: 'salida',
    recurso: 'Observation',
    fecha: d.fecha,
    actualizada: d.actualizada,
    que: nombreMediciones(d.codigos),
    ruta: 'Tu app → Tu tablero',
    estado: 'Registrado',
    tono: 'listo',
    href: RUTA_SIGNOS_VITALES,
  }));
}

// ─── Laboratorio cargado a mano ──────────────────────────────────────────────────────

/**
 * El laboratorio que la persona cargó a mano («Tus datos de salud» o Biomarcadores): una salida
 * por día de Argentina en que lo cargó (`meta.lastUpdated`; si no está, la fecha del estudio).
 * Lo que leyó el bot de un PDF (`derivedFrom` el documento) no va: ya es la llegada de ese PDF.
 */
export function filasDeLaboratorioManual(observaciones: readonly Observation[]): FilaTablero[] {
  const dias = new Map<string, { id: string; fecha: string; actualizada?: string }>();
  for (const o of observaciones) {
    const fecha = o.meta?.lastUpdated ?? fechaObservacion(o);
    const dia = diaArgentinaDe(fecha);
    if (!o.id || !observacionVigente(o) || (o.derivedFrom?.length ?? 0) > 0 || !fecha || !dia) {
      continue;
    }
    const previo = dias.get(dia);
    if (!previo || masNueva(previo.fecha, fecha) !== previo.fecha) {
      // La fila lleva el id del valor cargado último ese día.
      dias.set(dia, { id: o.id, fecha, actualizada: o.meta?.lastUpdated });
    }
  }
  return [...dias.values()].map((d) => ({
    id: `Observation/${d.id}`,
    sentido: 'salida',
    recurso: 'Observation',
    fecha: d.fecha,
    actualizada: d.actualizada,
    que: 'Laboratorio cargado a mano',
    ruta: 'Tu app → Tus biomarcadores',
    estado: 'Registrado',
    tono: 'listo',
    href: RUTA_BIOMARCADORES,
  }));
}

// ─── Novedades ───────────────────────────────────────────────────────────────────────

/**
 * Una llegada por novedad: «Sin leer» o «Leída». La de «resultados listos» cuyo `about` es un
 * DiagnosticReport que ya es fila no se repite. `actualizada` no va: leerla (que cambia
 * `meta.lastUpdated`) no la vuelve nueva; cuenta cuándo llegó.
 */
export function filasDeNovedades(novedades: readonly Communication[], idsFilas: ReadonlySet<string>): FilaTablero[] {
  const filas: FilaTablero[] = [];
  for (const c of novedades) {
    if (!c.id || c.status === 'entered-in-error') {
      continue;
    }
    const { tipo, titulo } = tipoNotificacion(c);
    const informe = c.about?.find((a) => a.reference?.startsWith('DiagnosticReport/'))?.reference;
    if (tipo === 'resultados-listos' && informe && idsFilas.has(informe)) {
      continue;
    }
    const noLeida = esNoLeida(c);
    const href = destinoNotificacion(c);
    filas.push({
      id: `Communication/${c.id}`,
      sentido: 'llegada',
      recurso: 'Communication',
      fecha: c.sent ?? c.meta?.lastUpdated,
      que: titulo,
      ruta: 'Llegada → Novedades',
      estado: noLeida ? 'Sin leer' : 'Leída',
      tono: noLeida ? 'atencion' : 'neutro',
      ...(href ? { href } : {}),
    });
  }
  return filas;
}

// ─── El tablero ──────────────────────────────────────────────────────────────────────

/** Lo que sigue en marcha (en proceso, en análisis, en camino, demorado o sin fecha todavía). */
function sigueEnCurso(fila: FilaTablero): boolean {
  return fila.tono === 'en-curso' || fila.tono === 'demorado' || ms(fila.fecha) === undefined;
}

/**
 * De la más nueva a la más vieja; las que todavía no llegaron (sin fecha), al final. Con la
 * misma fecha, primero la llegada (vuelve después de salir) y después por id, para que el orden
 * sea estable. Como mucho `max`: lo que sigue en curso (un pedido en análisis y su informe en
 * camino, un PDF en proceso o demorado) entra siempre, aunque haya muchas filas más nuevas; el
 * resto del lugar es para las más nuevas.
 */
export function ordenarFilas(filas: readonly FilaTablero[], max: number = MAX_FILAS): FilaTablero[] {
  const ordenadas = [...filas].sort((a, b) => {
    const [ma, mb] = [ms(a.fecha), ms(b.fecha)];
    if (ma !== mb) {
      if (ma === undefined) {
        return 1;
      }
      if (mb === undefined) {
        return -1;
      }
      return mb - ma;
    }
    if (a.sentido !== b.sentido) {
      return a.sentido === 'llegada' ? -1 : 1;
    }
    return a.id.localeCompare(b.id);
  });
  const enCurso = new Set(ordenadas.filter(sigueEnCurso).slice(0, max));
  let lugar = max - enCurso.size;
  return ordenadas.filter((f) => {
    if (enCurso.has(f)) {
      return true;
    }
    lugar -= 1;
    return lugar >= 0;
  });
}

/** Lo que traen las cargas de los PDFs (con los informes que se pudieron leer, por id). */
export interface EstudiosTablero {
  readonly documentos: readonly DocumentReference[];
  readonly informes: ReadonlyMap<string, DiagnosticReport>;
  /** true si la búsqueda de los informes falló: el tablero avisa que no trajo todo. */
  readonly incompleto?: boolean;
}

/** Los pedidos de la Segunda Opinión (del más nuevo al más viejo) y el informe del más nuevo. */
export interface SegundaOpinionTablero {
  readonly pedidos: readonly ServiceRequest[];
  readonly informe?: DiagnosticReport;
  /** Las tareas de firma de la paciente, si algún pedido está activo (para «En revisión por el cardiólogo»). */
  readonly tareasFirma?: readonly Task[];
  /**
   * true si no se pudo leer el informe del más nuevo (completado) o las tareas de firma (con un
   * pedido activo): el tablero avisa que no trajo todo.
   */
  readonly incompleto?: boolean;
}

/** Cada consulta del tablero, tal como la deja `Promise.allSettled`. */
export interface FuentesTablero {
  readonly estudios: PromiseSettledResult<EstudiosTablero>;
  readonly segundaOpinion: PromiseSettledResult<SegundaOpinionTablero>;
  readonly cuestionarios: PromiseSettledResult<readonly QuestionnaireResponse[]>;
  readonly mediciones: PromiseSettledResult<readonly Observation[]>;
  /** El laboratorio cargado a mano; si no se pidió, el tablero no tiene esas filas. */
  readonly laboratorioManual?: PromiseSettledResult<readonly Observation[]>;
  readonly novedades: PromiseSettledResult<readonly Communication[]>;
}

export interface OpcionesTablero {
  /** El nombre del servicio (MARCA.producto). */
  readonly producto: string;
  /** Para la regla de demora de los PDFs; por defecto, ahora. */
  readonly ahora?: Date;
}

/** Lo que dejó una carga del tablero. */
export interface CargaTablero {
  readonly filas: readonly FilaTablero[];
  /** true si alguna consulta falló (el resto se muestra igual). */
  readonly incompleto: boolean;
}

function valor<T>(resultado: PromiseSettledResult<T>): T | undefined {
  return resultado.status === 'fulfilled' ? resultado.value : undefined;
}

/** Las filas del tablero a partir de lo que trajo cada consulta; si una falló, `incompleto`. */
export function filasTablero(fuentes: FuentesTablero, opciones: OpcionesTablero): CargaTablero {
  const estudios = valor(fuentes.estudios);
  const som = valor(fuentes.segundaOpinion);
  const filas = [
    ...(estudios ? filasDeEstudios(estudios.documentos, estudios.informes, opciones.ahora) : []),
    ...(som ? filasDeSegundaOpinion(som.pedidos, som.informe, opciones.producto, som.tareasFirma) : []),
    ...filasDeCuestionarios(valor(fuentes.cuestionarios) ?? []),
    ...filasDeMediciones(valor(fuentes.mediciones) ?? []),
    ...filasDeLaboratorioManual((fuentes.laboratorioManual && valor(fuentes.laboratorioManual)) ?? []),
  ];
  const ids = new Set(filas.map((f) => f.id));
  filas.push(...filasDeNovedades(valor(fuentes.novedades) ?? [], ids));
  const fallo = Object.values(fuentes).some((r: PromiseSettledResult<unknown> | undefined) => r?.status === 'rejected');
  return {
    filas: ordenarFilas(filas),
    incompleto: fallo || Boolean(estudios?.incompleto) || Boolean(som?.incompleto),
  };
}

/**
 * Las filas que cambiaron desde la última visita en este dispositivo: `actualizada` (o, si no
 * la hay, `fecha`) posterior. En la primera visita (sin dato guardado), ninguna.
 */
export function nuevasDesde(filas: readonly FilaTablero[], ultimaVisita: string | undefined): Set<string> {
  const desde = ms(ultimaVisita);
  if (desde === undefined) {
    return new Set();
  }
  return new Set(
    filas
      .filter((f) => {
        const cambio = ms(f.actualizada ?? f.fecha);
        return cambio !== undefined && cambio > desde;
      })
      .map((f) => f.id)
  );
}

/** El tablero ya cargado (sin `cargando`). */
export type TableroCargado = Omit<TableroHomeD, 'cargando'>;

/**
 * El tablero después de una carga. Las nuevas se cuentan desde la última visita guardada al
 * entrar (guardar «ahora» al terminar no las borra en esta sesión) y, en una recarga (tiempo
 * real), lo que no estaba en la carga anterior entra como nuevo. Si la anterior estaba
 * incompleta, lo que faltaba no cuenta como llegado (ya estaba, no se había podido traer).
 */
export function siguienteTablero(
  previo: TableroCargado | undefined,
  carga: CargaTablero,
  ultimaVisita: string | undefined
): TableroCargado {
  const nuevas = nuevasDesde(carga.filas, ultimaVisita);
  if (previo) {
    const antes = new Set(previo.filas.map((f) => f.id));
    for (const f of carga.filas) {
      if (previo.nuevas.has(f.id) || (!previo.incompleto && !antes.has(f.id))) {
        nuevas.add(f.id);
      }
    }
  }
  return { filas: carga.filas, incompleto: carga.incompleto, nuevas };
}
