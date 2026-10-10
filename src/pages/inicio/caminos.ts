// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Los tres caminos que la Home le ofrece a la paciente, en este orden:
//  1. el Plan Bienestar · 100 días (sumarse o seguirlo);
//  2. la Segunda Opinión (pedirla, o seguir la que ya pidió);
//  3. la teleconsulta para revisar sus resultados con el equipo médico.
// Regla del negocio: quien sube datos tiene que saber que le vamos a dar una devolución. Por eso,
// si ya cargó algo (laboratorio o hábitos) y no tiene un turno reservado, la teleconsulta va
// como «Recomendado para vos». Si no, se recomienda sumarse al plan; si ya está en el plan, pedir
// la Segunda Opinión. Funciones puras: el nombre del servicio entra por parámetro (MARCA.producto).
import {
  RUTA_MI_SEGUNDA_OPINION,
  RUTA_MIS_TURNOS,
  RUTA_PLAN_BIENESTAR,
  RUTA_RESERVAR_TELECONSULTA,
  RUTA_SOLICITAR_SEGUNDA_OPINION,
} from './rutas';
import type { Camino, ClaveCamino, DatosHomeE } from './tipos';

export interface OpcionesCaminos {
  /** El servicio que pide la paciente (MARCA.producto). */
  readonly producto: string;
  /** «el Dr. …» (MARCA.dirigidoPor). */
  readonly dirigidoPor: string;
}

/** ¿Ya subió datos? Un laboratorio en PDF o algún hábito LE8 con puntaje. */
export function subioDatos(datos: DatosHomeE): boolean {
  return datos.laboratorio !== undefined || (datos.le8?.conDato ?? 0) > 0;
}

/**
 * ¿Hay algo concreto que revisar con un médico y todavía no tiene turno? Un laboratorio que leyó
 * un agente de IA sin revisión médica, o un PREVENT estimado. Mientras la Segunda Opinión está en
 * análisis, la devolución llega con su informe: no se la empuja a reservar también.
 */
export function devolucionPendiente(datos: DatosHomeE): boolean {
  if (datos.proximoTurno || datos.segundaOpinion?.estado === 'en-analisis') {
    return false;
  }
  const laboratorioSinRevisar = datos.laboratorio?.estado === 'procesado' && !datos.laboratorio.revisionMedica;
  return laboratorioSinRevisar || datos.preventEstimado !== undefined;
}

/** Cuál de los tres caminos va como «Recomendado para vos» (o ninguno). */
export function caminoRecomendado(datos: DatosHomeE): ClaveCamino | undefined {
  if (!datos.esPaciente) {
    return undefined;
  }
  if (subioDatos(datos) && !datos.proximoTurno) {
    return 'teleconsulta';
  }
  if (!datos.plan) {
    return 'plan';
  }
  if (!datos.segundaOpinion) {
    return 'segunda-opinion';
  }
  return undefined;
}

/** Fecha y hora en Argentina, para el estado de un camino («sábado 17 de octubre, 10:30»). */
export function fechaHoraTurno(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(fecha);
}

function fechaCorta(iso: string | undefined): string | undefined {
  if (!iso) {
    return undefined;
  }
  const fecha = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return Number.isNaN(fecha.getTime())
    ? undefined
    : new Intl.DateTimeFormat('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: 'numeric',
        month: 'long',
      }).format(fecha);
}

/** Los tres caminos, en orden, con el estado de la paciente en cada uno. */
export function caminosDe(datos: DatosHomeE, opciones: OpcionesCaminos): readonly Camino[] {
  const recomendado = caminoRecomendado(datos);
  const { plan, segundaOpinion: som, proximoTurno: turno } = datos;

  const caminoPlan: Camino = {
    clave: 'plan',
    numero: 1,
    titulo: 'Plan Bienestar · 100 días',
    descripcion: plan
      ? 'Tus hábitos, tus datos y tus metas, paso a paso, con tu equipo médico.'
      : 'Un programa guiado de 100 días para ordenar tu prevención cardiovascular: tus hábitos, tus datos y tus metas, con tu equipo médico.',
    estado: plan ? (plan.terminado ? '¡Completaste los 100 días!' : `Día ${plan.dia} de ${plan.totalDias}`) : undefined,
    cta: plan ? 'Seguir mi plan' : 'Empezar mi Plan Bienestar',
    href: RUTA_PLAN_BIENESTAR,
    recomendado: recomendado === 'plan',
  };

  let estadoSom: string | undefined;
  let ctaSom = `Pedir mi ${opciones.producto}`;
  let hrefSom = RUTA_SOLICITAR_SEGUNDA_OPINION;
  if (som) {
    const desde = fechaCorta(som.pedida);
    estadoSom =
      som.estado === 'en-analisis' && desde
        ? `${som.etiqueta} desde el ${desde}`
        : som.estado === 'completada'
          ? 'Tu informe está firmado'
          : som.etiqueta;
    ctaSom = som.estado === 'completada' ? 'Ver mi informe' : `Ver mi ${opciones.producto}`;
    hrefSom = RUTA_MI_SEGUNDA_OPINION;
  }
  const caminoSom: Camino = {
    clave: 'segunda-opinion',
    numero: 2,
    titulo: `Tu ${opciones.producto}`,
    descripcion: `El equipo médico dirigido por ${opciones.dirigidoPor} analiza tu caso y tus estudios, con el apoyo de nuestros agentes de IA, y te entrega un informe firmado con tu riesgo cardiovascular.`,
    estado: estadoSom,
    cta: ctaSom,
    href: hrefSom,
    recomendado: recomendado === 'segunda-opinion',
  };

  const caminoTeleconsulta: Camino = {
    clave: 'teleconsulta',
    numero: 3,
    titulo: 'Teleconsulta con tu equipo médico',
    descripcion: subioDatos(datos)
      ? 'Ya tenemos tus datos. Revisémoslos juntos por videollamada: tu equipo médico te explica tus resultados y te propone los próximos pasos.'
      : 'Por videollamada, desde donde estés: tu equipo médico revisa tus datos con vos y te propone los próximos pasos.',
    estado: turno ? `Tu turno: ${fechaHoraTurno(turno.inicio)}` : undefined,
    cta: turno ? (turno.teleconsulta ? 'Ver mi teleconsulta' : 'Ver mis turnos') : 'Reservar mi teleconsulta',
    href: turno ? (turno.teleconsulta ? `/teleconsulta/${turno.id}` : RUTA_MIS_TURNOS) : RUTA_RESERVAR_TELECONSULTA,
    recomendado: recomendado === 'teleconsulta',
  };

  return [caminoPlan, caminoSom, caminoTeleconsulta];
}
