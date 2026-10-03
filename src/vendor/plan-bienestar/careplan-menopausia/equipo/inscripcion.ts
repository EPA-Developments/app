import type { Bundle, CarePlan, Patient, Reference, Task } from '@medplum/fhirtypes';
import { buildPb100dCarePlanBundle } from '../builders/pb100dBundle.js';
import { COD, PB100D_DURACION_DIAS, SYS_SUFIJO, coincide } from '../contrato/pb100d.js';
import { toReference } from '../fhir/codeable.js';
import { diaDelPlan, sumarDias } from './momentos.js';
import type { PerfilPersona } from './perfil.js';
import { pasosDeLaPersona } from './seguimiento.js';

/**
 * Inscribir y estado del plan: la persona tiene dos planes que hay que distinguir.
 *
 * - La **inscripción** al programa la hace Recepción (`som-bienestar-inscribir`): un
 *   `CarePlan` con categoría `care-plans|plan-bienestar-100`, período de 100 días (el
 *   día 1 es la consulta inicial) y una `Task` por consulta programada
 *   (`task-tipo|agendar-consulta-pb100d`: inicial, día 50 y final) que Recepción agenda.
 *   Acá se lee (tolerante al namespace); se escribe sólo desde Recepción.
 * - El **plan clínico** es el `CarePlan` que instancia `pb100d-ckm` (el portal o el
 *   equipo): metas, pasos y controles por estadío. Acá se puede empezar (con el perfil
 *   de la persona, igual que el portal) y cerrar.
 */
export type ClaveConsultaInscripcion = 'inicial' | 'mitad' | 'final';

export const CONSULTA_INSCRIPCION_LABEL: Record<ClaveConsultaInscripcion, string> = {
  inicial: 'Consulta inicial',
  mitad: 'Consulta del día 50',
  final: 'Consulta final',
};

const ORDEN_CONSULTA: ClaveConsultaInscripcion[] = ['inicial', 'mitad', 'final'];

export type EstadoConsultaInscripcion = 'por-agendar' | 'agendada' | 'cancelada';

export const ESTADO_CONSULTA_LABEL: Record<EstadoConsultaInscripcion, string> = {
  'por-agendar': 'Por agendar',
  agendada: 'Agendada',
  cancelada: 'Cancelada',
};

export interface ConsultaInscripcion {
  clave: ClaveConsultaInscripcion;
  titulo: string;
  /** Día del plan (1, 50, 100), si la Task lo trae. */
  dia?: number;
  estado: EstadoConsultaInscripcion;
  /** Desde cuándo se agenda (ISO date). */
  desde?: string;
  /** Ventana para agendar (la inicial no tiene). */
  ventana?: { desde: string; hasta: string };
  taskId?: string;
  /** El turno con que se resolvió (`Task.output`), si lo hay. */
  appointment?: string;
}

export interface Inscripcion {
  inscripto: boolean;
  carePlan?: CarePlan;
  /** Día 1 del programa (ISO date). */
  inicio?: string;
  fin?: string;
  /** Día del programa según Recepción (1 = la consulta inicial). */
  dia?: number;
  consultas: ConsultaInscripcion[];
  porAgendar: number;
}

export function esCarePlanDeInscripcion(carePlan: CarePlan): boolean {
  return (carePlan.category ?? []).some((cat) =>
    (cat.coding ?? []).some((k) => coincide(k.system, SYS_SUFIJO.planCuidado) && k.code === COD.planBienestar100),
  );
}

export function esTaskDeConsultaInscripcion(task: Task): boolean {
  return (task.code?.coding ?? []).some((k) => coincide(k.system, SYS_SUFIJO.taskTipo) && k.code === COD.agendarConsultaPb100d);
}

const ABIERTAS = new Set<Task['status']>(['draft', 'requested', 'received', 'accepted', 'ready', 'in-progress', 'on-hold']);

function estadoDeConsulta(task: Task): EstadoConsultaInscripcion {
  if (task.status === 'completed') return 'agendada';
  if (ABIERTAS.has(task.status)) return 'por-agendar';
  return 'cancelada';
}

/** Lo operativo de una Task de consulta del programa (como la lee Recepción). */
export function leerConsultaInscripcion(task: Task): ConsultaInscripcion | undefined {
  const input = (nombre: string) => task.input?.find((i) => i.type?.text === nombre);
  const clave = input('consulta')?.valueCode as ClaveConsultaInscripcion | undefined;
  if (!clave || !ORDEN_CONSULTA.includes(clave)) return undefined;
  const desde = task.restriction?.period?.start?.slice(0, 10);
  const hasta = task.restriction?.period?.end?.slice(0, 10);
  const dia = input('dia')?.valueInteger;
  const appointment = task.output?.find((o) => o.valueReference?.reference)?.valueReference?.reference;
  return {
    clave,
    titulo: CONSULTA_INSCRIPCION_LABEL[clave],
    ...(dia !== undefined ? { dia } : {}),
    estado: estadoDeConsulta(task),
    ...(desde ? { desde } : {}),
    ...(desde && hasta ? { ventana: { desde, hasta } } : {}),
    ...(task.id ? { taskId: task.id } : {}),
    ...(appointment ? { appointment } : {}),
  };
}

function planDeTask(task: Task): string | undefined {
  return (task.basedOn ?? []).find((b) => b.reference?.startsWith('CarePlan/'))?.reference;
}

/**
 * La inscripción de la persona desde su historia: el CarePlan de inscripción activo (si
 * se puede leer) y sus tres consultas desde las Tasks de Recepción. Si hay Tasks de más
 * de un plan, valen las del más reciente.
 */
export function inscripcionDesdeFhir(d: { carePlans?: CarePlan[]; tasks?: Task[]; hoy?: string }): Inscripcion {
  const hoy = d.hoy ?? new Date().toISOString().slice(0, 10);
  const carePlan = (d.carePlans ?? [])
    .filter((cp) => esCarePlanDeInscripcion(cp) && cp.status === 'active')
    .sort((a, b) => (b.period?.start ?? b.created ?? '').localeCompare(a.period?.start ?? a.created ?? ''))[0];
  const propias = (d.tasks ?? []).filter(esTaskDeConsultaInscripcion);
  let delPlan = propias;
  if (carePlan?.id) {
    delPlan = propias.filter((t) => planDeTask(t) === `CarePlan/${carePlan.id}`);
  } else if (propias.length > 0) {
    const reciente = [...propias].sort((a, b) => (b.authoredOn ?? '').localeCompare(a.authoredOn ?? ''))[0]!;
    delPlan = propias.filter((t) => planDeTask(t) === planDeTask(reciente));
  }
  const consultas: ConsultaInscripcion[] = [];
  for (const clave of ORDEN_CONSULTA) {
    const task = delPlan.find((t) => leerConsultaInscripcion(t)?.clave === clave);
    const consulta = task ? leerConsultaInscripcion(task) : undefined;
    if (consulta) consultas.push(consulta);
  }
  const inicio = carePlan?.period?.start?.slice(0, 10) ?? consultas.find((c) => c.clave === 'inicial')?.desde;
  const fin = carePlan?.period?.end?.slice(0, 10) ?? (inicio ? sumarDias(inicio, PB100D_DURACION_DIAS) : undefined);
  const diaCero = inicio ? diaDelPlan(inicio, hoy) : undefined;
  return {
    inscripto: Boolean(carePlan) || consultas.length > 0,
    ...(carePlan ? { carePlan } : {}),
    ...(inicio ? { inicio } : {}),
    ...(fin ? { fin } : {}),
    ...(diaCero !== undefined ? { dia: diaCero + 1 } : {}),
    consultas,
    porAgendar: consultas.filter((c) => c.estado === 'por-agendar').length,
  };
}

export type EstadoPlanClinico = 'sin-plan' | 'activo' | 'terminado' | 'cerrado';

export const ESTADO_PLAN_CLINICO_LABEL: Record<EstadoPlanClinico, string> = {
  'sin-plan': 'Sin plan clínico',
  activo: 'Plan activo',
  terminado: 'Cumplió los 100 días',
  cerrado: 'Plan cerrado',
};

export interface PlanClinico {
  estado: EstadoPlanClinico;
  carePlan?: CarePlan;
  inicio?: string;
  fin?: string;
  /** Día del plan clínico (0 = alta). */
  dia?: number;
  pasos: { total: number; completados: number };
}

/** El estado del plan clínico (el CarePlan `pb100d-ckm`) al día `hoy`. */
export function estadoPlanClinico(d: { carePlan?: CarePlan; tasks?: Task[]; hoy?: string }): PlanClinico {
  const hoy = d.hoy ?? new Date().toISOString().slice(0, 10);
  const pasosTodos = pasosDeLaPersona(d.tasks ?? []);
  const pasos = { total: pasosTodos.length, completados: pasosTodos.filter((t) => t.status === 'completed').length };
  const cp = d.carePlan;
  if (!cp) return { estado: 'sin-plan', pasos };
  const inicio = (cp.period?.start ?? cp.created)?.slice(0, 10);
  const fin = cp.period?.end?.slice(0, 10) ?? (inicio ? sumarDias(inicio, PB100D_DURACION_DIAS) : undefined);
  const dia = inicio ? diaDelPlan(inicio, hoy) : undefined;
  const estado: EstadoPlanClinico =
    cp.status === 'completed' || cp.status === 'revoked' ? 'cerrado' : dia !== undefined && dia >= PB100D_DURACION_DIAS ? 'terminado' : 'activo';
  return { estado, carePlan: cp, ...(inicio ? { inicio } : {}), ...(fin ? { fin } : {}), ...(dia !== undefined ? { dia } : {}), pasos };
}

/** El plan clínico cerrado por el equipo (queda la historia). */
export function cerrarPlanClinico(carePlan: CarePlan, now = new Date().toISOString()): CarePlan {
  const hoy = now.slice(0, 10);
  return { ...carePlan, status: 'completed', period: { ...(carePlan.period ?? {}), end: carePlan.period?.end ?? hoy } };
}

/**
 * La transacción para empezar el plan clínico desde el equipo, con el perfil de la
 * persona (igual que el portal: estadío validado o estimado más sus condiciones).
 * undefined sin perfil (faltan datos para estadificar).
 */
export function bundleInicioPlanClinico(persona: PerfilPersona, patient: Reference<Patient> | string, now: string = new Date().toISOString().slice(0, 10)): Bundle | undefined {
  if (!persona.perfil) return undefined;
  return buildPb100dCarePlanBundle({
    patient: toReference(patient),
    perfil: persona.perfil,
    ...(persona.validado ? { ckmObservation: persona.validado.observation } : {}),
    now,
  });
}
