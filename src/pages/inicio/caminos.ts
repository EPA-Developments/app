// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Los tres caminos que la Home (E y D) le ofrece a la persona, en este orden:
//  1. el Plan Bienestar · 100 días (sumarse o seguirlo);
//  2. la Segunda Opinión (pedirla, o seguir la que ya pidió);
//  3. la teleconsulta para revisar sus resultados con el equipo médico.
// Regla del negocio: quien sube datos tiene que saber que le vamos a dar una devolución. Por eso,
// si ya cargó algo (laboratorio o hábitos) y no tiene un turno reservado, la teleconsulta va
// como «Recomendado para vos». Si no, se recomienda sumarse al plan; si ya está en el plan, pedir
// la Segunda Opinión. Funciones puras: el nombre del servicio entra por parámetro (MARCA.producto).
import { fmtDiaArg, fmtHoraArg } from '../../fhir/agenda';
import { fechaCorta } from './formato';
import {
  RUTA_MI_SEGUNDA_OPINION,
  RUTA_MIS_TURNOS,
  RUTA_PLAN_BIENESTAR,
  RUTA_RESERVAR_TELECONSULTA,
  RUTA_SOLICITAR_SEGUNDA_OPINION,
} from './rutas';
import type { Camino, ClaveCamino, DatosHomeE } from './tipos';

export interface OpcionesCaminos {
  /** El servicio que pide la persona (MARCA.producto). */
  readonly producto: string;
  /** «el Dr. …» (MARCA.dirigidoPor). */
  readonly dirigidoPor: string;
}

/**
 * ¿Ya subió datos? Un laboratorio en PDF que se pudo leer (o se está leyendo) o algún hábito LE8
 * con puntaje. Un PDF demorado (el bot no pudo leerlo) no cuenta: todavía no tenemos esos datos.
 */
export function subioDatos(datos: DatosHomeE): boolean {
  const laboratorio = datos.laboratorio !== undefined && datos.laboratorio.estado !== 'demorado';
  return laboratorio || (datos.le8?.conDato ?? 0) > 0;
}

/**
 * ¿Ya pidió una Segunda Opinión vigente? Una cancelada (o cargada por error) no cuenta: se le
 * vuelve a ofrecer pedirla. Una en pausa sí cuenta.
 */
export function pidioSegundaOpinion(datos: DatosHomeE): boolean {
  return datos.segundaOpinion !== undefined && datos.segundaOpinion.estado !== 'cancelada';
}

/**
 * ¿La devolución de sus datos ya se dio? Si tuvo una consulta después de su último laboratorio
 * (o, sin laboratorio, alguna consulta), no se le vuelve a pedir que reserve.
 */
export function devolucionDada(datos: DatosHomeE): boolean {
  const consulta = datos.ultimaConsulta?.inicio;
  if (!consulta) {
    return false;
  }
  const delLaboratorio = datos.laboratorio?.fecha;
  return !delLaboratorio || Date.parse(consulta) >= Date.parse(delLaboratorio);
}

/**
 * ¿Se le puede ofrecer reservar una teleconsulta para revisar sus datos? No si ya tiene un turno,
 * si su Segunda Opinión está en análisis (la devolución llega con su informe: no se la empuja a
 * pagar otra revisión) o si ya tuvo una consulta después de subir sus datos.
 */
export function puedeOfrecerTeleconsulta(datos: DatosHomeE): boolean {
  return !datos.proximoTurno && datos.segundaOpinion?.estado !== 'en-analisis' && !devolucionDada(datos);
}

/**
 * ¿Hay algo concreto que revisar con un médico y se le puede ofrecer la teleconsulta? Un
 * laboratorio que leyó un agente de IA sin revisión médica, o un PREVENT estimado.
 */
export function devolucionPendiente(datos: DatosHomeE): boolean {
  if (!puedeOfrecerTeleconsulta(datos)) {
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
  if (subioDatos(datos) && puedeOfrecerTeleconsulta(datos)) {
    return 'teleconsulta';
  }
  if (!datos.plan) {
    return 'plan';
  }
  if (!pidioSegundaOpinion(datos)) {
    return 'segunda-opinion';
  }
  return undefined;
}

/** Qué se paga al reservar (src/pages/GetCarePage.tsx): lo dice el camino, para que no sorprenda. */
export const NOTA_COSTO_TELECONSULTA =
  'Las consultas del Plan Bienestar están incluidas; las demás se confirman con una seña.';

/** Día y hora en Argentina, con el reloj de 24 horas del resto del portal («sábado, 17 de octubre, 10:30»). */
export function fechaHoraTurno(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) {
    return '';
  }
  return `${fmtDiaArg.format(fecha)}, ${fmtHoraArg.format(fecha)}`;
}

/** Los tres caminos, en orden, con el estado de la persona en cada uno. */
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
  // Una cancelada o con error no cuenta como pedida: se ofrece pedir otra.
  if (som && pidioSegundaOpinion(datos)) {
    const desde = fechaCorta(som.pedida, datos.hoy);
    if (som.estado === 'en-analisis') {
      estadoSom = desde ? `${som.etiqueta} desde el ${desde}` : som.etiqueta;
    } else if (som.estado === 'completada') {
      // «Firmado» solo con la firma médica registrada (ver tipos.ts).
      estadoSom = som.firmada ? 'Tu informe está firmado' : 'Tu informe está listo';
    } else {
      estadoSom = som.etiqueta;
    }
    ctaSom = som.estado === 'completada' ? 'Ver mi informe' : `Ver mi ${opciones.producto}`;
    hrefSom = RUTA_MI_SEGUNDA_OPINION;
  }
  const caminoSom: Camino = {
    clave: 'segunda-opinion',
    numero: 2,
    titulo: `Tu ${opciones.producto}`,
    descripcion: `Nuestro equipo médico, dirigido por ${opciones.dirigidoPor}, analiza tu caso y tus estudios con el apoyo de nuestros agentes de IA, y te entrega un informe con tu riesgo cardiovascular.`,
    estado: estadoSom,
    cta: ctaSom,
    href: hrefSom,
    recomendado: recomendado === 'segunda-opinion',
  };

  // La reserva abre el catálogo de consultas por videollamada: atiende un profesional de nuestro
  // equipo (no necesariamente el de su plan), así que no se promete «tu equipo médico».
  const ultima =
    datos.ultimaConsulta && devolucionDada(datos) ? fechaCorta(datos.ultimaConsulta.inicio, datos.hoy) : undefined;
  let estadoTele: string | undefined;
  if (turno) {
    estadoTele = `Tu turno: ${fechaHoraTurno(turno.inicio)}`;
  } else if (ultima) {
    estadoTele = `Tu última consulta: ${ultima}`;
  }
  const caminoTeleconsulta: Camino = {
    clave: 'teleconsulta',
    numero: 3,
    titulo: 'Teleconsulta por videollamada',
    descripcion: subioDatos(datos)
      ? 'Ya tenemos tus datos. Revisémoslos juntos por videollamada: un profesional de nuestro equipo te explica tus resultados y te propone los próximos pasos.'
      : 'Por videollamada, desde donde estés: un profesional de nuestro equipo revisa tus datos con vos y te propone los próximos pasos.',
    estado: estadoTele,
    cta: turno
      ? turno.teleconsulta
        ? 'Ver mi teleconsulta'
        : 'Ver mis turnos'
      : ultima
        ? 'Reservar otra teleconsulta'
        : 'Reservar mi teleconsulta',
    href: turno ? (turno.teleconsulta ? `/teleconsulta/${turno.id}` : RUTA_MIS_TURNOS) : RUTA_RESERVAR_TELECONSULTA,
    recomendado: recomendado === 'teleconsulta',
    nota: turno ? undefined : NOTA_COSTO_TELECONSULTA,
  };

  return [caminoPlan, caminoSom, caminoTeleconsulta];
}
