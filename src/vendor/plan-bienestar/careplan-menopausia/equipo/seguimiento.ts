import type { CarePlan, Condition, MedicationRequest, Observation, Patient, QuestionnaireResponse, Task } from '@medplum/fhirtypes';
import { PB100D_DURACION_DIAS } from '../contrato/pb100d.js';
import { entradaLe8DesdeFhir } from '../le8/desdeFhir.js';
import { puntajeLe8, type ResultadoLe8 } from '../le8/puntaje.js';
import type { EstadioCkm } from '../model/catalogo.js';
import {
  condicionesDeRespuesta,
  respuestaA100Dias,
  respuestaLe8,
  respuestaPesoCinturaDesdeFhir,
  type RespuestaA100Dias,
} from '../respuesta/index.js';
import { SYSTEM } from '../terminology/systems.js';
import { codigosRegistrados } from './condiciones.js';
import { evaluarMomento, type ResultadoDia0 } from './dia0.js';
import { CONTROLES, VENTANA_CONTROL_DIAS, controlActual, diaDelPlan, fechaDelControl, momentosDeTask, sumarDias, type MomentoControl } from './momentos.js';
import { estadioDelPlan } from './recalculo.js';

/**
 * Seguimiento del plan visto desde el equipo: en qué día va, qué control corre, qué
 * evaluaciones pide cada control (días 30, 60 y 100) y si están cargadas, cuántos pasos
 * completó la persona por momento, el LE8 del día 0 contra el de hoy y la respuesta a
 * 100 días con la regla firmada (peso o cintura en los estadíos 1 a 4, LE8 en el 0).
 *
 * La respuesta al día 100 puede sugerir la condición `sin-respuesta` (Tabla 47, peso
 * bajó menos de 5 %): el sistema la sugiere y el equipo la registra; no se registra sola.
 */
export interface ContextoSeguimiento {
  patient?: Patient;
  carePlan: CarePlan;
  /** Las Tasks del plan (`basedOn` el CarePlan). */
  tasks?: Task[];
  observations?: Observation[];
  conditions?: Condition[];
  medicationRequests?: MedicationRequest[];
  questionnaireResponses?: QuestionnaireResponse[];
  /** ISO date de "hoy". */
  hoy?: string;
}

export interface PasosControl {
  total: number;
  completados: number;
  cancelados: number;
}

export interface ControlSeguimiento {
  momento: MomentoControl;
  dia: number;
  /** ISO date del control. */
  fecha: string;
  estado: 'pasado' | 'en-curso' | 'futuro';
  /** Las evaluaciones del catálogo de este momento, con su estado (como el día 0). */
  evaluaciones: ResultadoDia0;
  /** Pasos de la persona con este momento. */
  pasos: PasosControl;
}

export interface Seguimiento {
  inicio: string;
  hoy: string;
  /** Día del plan (0 = alta). */
  dia: number;
  diasTotales: number;
  momentoActual: MomentoControl;
  /** Estadío del plan (extensión del CarePlan). */
  estadio?: EstadioCkm;
  controles: ControlSeguimiento[];
  le8: ResultadoLe8;
  le8Inicial: ResultadoLe8;
  respuesta: RespuestaA100Dias;
  /** Al día 100 (o después), la respuesta sugiere registrar `sin-respuesta` y todavía no está registrada. */
  sugiereSinRespuesta: boolean;
  /** Pasos de la persona en todo el plan. */
  pasos: PasosControl;
  /** Evaluaciones que faltan en el control en curso. */
  pendientes: number;
}

/** Ventana después del inicio en que una medición todavía cuenta como "del día 0". */
export const VENTANA_BASAL_DIAS = 14;

function tipoDeTask(task: Task): string | undefined {
  return (task.code?.coding ?? []).find((k) => k.system === SYSTEM.epa)?.code;
}

/** Pasos de la persona: Tasks `plan` del catálogo que no son evaluaciones ni alertas. */
export function pasosDeLaPersona(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.intent === 'plan' && ['educacion', 'conducta', 'monitoreo'].includes(tipoDeTask(t) ?? ''));
}

function contarPasos(tasks: Task[]): PasosControl {
  return {
    total: tasks.length,
    completados: tasks.filter((t) => t.status === 'completed').length,
    cancelados: tasks.filter((t) => t.status === 'cancelled' || t.status === 'rejected').length,
  };
}

/** El seguimiento del plan activo; undefined si el plan no tiene fecha de inicio. */
export function seguimientoDelPlan(ctx: ContextoSeguimiento): Seguimiento | undefined {
  const inicio = ctx.carePlan.period?.start ?? ctx.carePlan.created;
  if (!inicio) return undefined;
  const hoy = ctx.hoy ?? new Date().toISOString().slice(0, 10);
  const dia = diaDelPlan(inicio, hoy);
  if (dia === undefined) return undefined;
  const observations = ctx.observations ?? [];
  const conditions = ctx.conditions ?? [];
  const tasks = ctx.tasks ?? [];
  const historia = {
    patient: ctx.patient,
    observations,
    conditions,
    medicationRequests: ctx.medicationRequests ?? [],
    questionnaireResponses: ctx.questionnaireResponses ?? [],
  };

  const estadioPlan = estadioDelPlan(ctx.carePlan);
  const estadio = estadioPlan === '0' || estadioPlan === '1' || estadioPlan === '2' || estadioPlan === '3' || estadioPlan === '4' ? estadioPlan : undefined;
  const le8 = puntajeLe8(entradaLe8DesdeFhir(historia));
  const le8Inicial = puntajeLe8(entradaLe8DesdeFhir({ ...historia, hasta: sumarDias(inicio, VENTANA_BASAL_DIAS) }));
  const pesoCintura = respuestaPesoCinturaDesdeFhir(observations, inicio);
  const respuesta = respuestaA100Dias({ estadio: estadio ?? '1', pesoCintura, le8: respuestaLe8(le8Inicial, le8) });

  const pasos = pasosDeLaPersona(tasks);
  const actual = controlActual(dia).momento;
  const controles: ControlSeguimiento[] = CONTROLES.map((control) => {
    const fecha = fechaDelControl(inicio, control.momento);
    const estado = dia < control.desde ? 'futuro' : dia > control.hasta ? 'pasado' : 'en-curso';
    const evaluaciones = evaluarMomento(
      {
        patient: ctx.patient,
        observations,
        conditions,
        questionnaireResponses: ctx.questionnaireResponses ?? [],
        medicationRequests: ctx.medicationRequests ?? [],
        hoy,
        ...(control.momento !== 'dia-0' ? { desde: sumarDias(fecha, -VENTANA_CONTROL_DIAS) } : {}),
      },
      control.momento,
    );
    return {
      momento: control.momento,
      dia: control.dia,
      fecha,
      estado,
      evaluaciones,
      pasos: contarPasos(pasos.filter((t) => momentosDeTask(t).includes(control.momento))),
    };
  });
  const enCurso = controles.find((c) => c.momento === actual);
  const sinRespuestaRegistrada = codigosRegistrados(conditions, hoy).includes('sin-respuesta');

  return {
    inicio: inicio.slice(0, 10),
    hoy,
    dia,
    diasTotales: PB100D_DURACION_DIAS,
    momentoActual: actual,
    ...(estadio ? { estadio } : {}),
    controles,
    le8,
    le8Inicial,
    respuesta,
    sugiereSinRespuesta: dia >= PB100D_DURACION_DIAS && condicionesDeRespuesta(pesoCintura).includes('sin-respuesta') && !sinRespuestaRegistrada,
    pasos: contarPasos(pasos),
    pendientes: enCurso?.evaluaciones.faltan ?? 0,
  };
}
