import type { Annotation, CarePlan, Patient, Practitioner, PractitionerRole, Reference, Task } from '@medplum/fhirtypes';
import { taskDesdeItem } from '../builders/pb100dBundle.js';
import { itemsAplicables, type PerfilCatalogo } from '../catalogo/seleccion.js';
import { toReference } from '../fhir/codeable.js';
import type { ItemCatalogo, Momento } from '../model/catalogo.js';
import { codigoItemDe } from './recalculo.js';

/**
 * Alertas y derivaciones por persona: los ítems de audiencia `profesional` del
 * catálogo firmado que aplican a su perfil (alertas al médico, con COR/LOE, y
 * derivaciones a especialidades). El sistema no prescribe: la alerta dice qué dice la
 * guía y el médico decide.
 *
 * Cada decisión queda como una `Task` del catálogo (la misma que instancia el plan
 * para los ítems profesionales, `taskDesdeItem`):
 *  - **derivar**: la Task queda `requested` con `intent: order` y la especialidad en
 *    `performerType`. Es la tarea que conoce la agenda de Recepción (slice 4).
 *  - **atender**: `completed`, con la nota del médico.
 *  - **descartar**: `rejected`, con el motivo. Queda la historia; no vuelve a aparecer
 *    como nueva.
 * Sin decisión, la alerta es **nueva**.
 */
export type EstadoAlerta = 'nueva' | 'abierta' | 'atendida' | 'descartada';

export const ESTADO_ALERTA_LABEL: Record<EstadoAlerta, string> = {
  nueva: 'Nueva',
  abierta: 'En curso',
  atendida: 'Atendida',
  descartada: 'Descartada',
};

export type TipoAlerta = 'alerta' | 'derivacion';

export interface AlertaPersona {
  item: ItemCatalogo;
  tipo: TipoAlerta;
  estado: EstadoAlerta;
  task?: Task;
  /** Alguno de sus momentos está vigente hoy (si se pasaron los momentos vigentes). */
  vigente: boolean;
}

const ABIERTAS = new Set<Task['status']>(['draft', 'requested', 'received', 'accepted', 'ready', 'in-progress', 'on-hold']);
const ORDEN_ESTADO: Record<EstadoAlerta, number> = { nueva: 0, abierta: 1, atendida: 2, descartada: 3 };

function fechaTask(task: Task): string {
  return task.lastModified ?? task.authoredOn ?? task.meta?.lastUpdated ?? '';
}

/** Estado de una alerta según su Task (ninguna = nueva). */
export function estadoDeTaskProfesional(task: Task | undefined): EstadoAlerta {
  if (!task) return 'nueva';
  if (task.status === 'completed') return 'atendida';
  if (task.status === 'rejected' || task.status === 'cancelled') return 'descartada';
  if (ABIERTAS.has(task.status)) return 'abierta';
  return 'nueva';
}

/** La última Task (no anulada) de un ítem del catálogo. */
export function tareaDeItem(tasks: Task[], codigo: string): Task | undefined {
  let mejor: Task | undefined;
  for (const task of tasks) {
    if (task.status === 'entered-in-error' || codigoItemDe(task) !== codigo) continue;
    if (!mejor || fechaTask(task) >= fechaTask(mejor)) mejor = task;
  }
  return mejor;
}

/**
 * Las alertas y derivaciones de la persona, con su estado. Con `vigentes`, las de un
 * momento vigente van primero; dentro de cada grupo, las nuevas primero y después en
 * el orden del catálogo.
 */
export function alertasDeLaPersona(perfil: PerfilCatalogo, tasks: Task[] = [], vigentes?: ReadonlySet<Momento>): AlertaPersona[] {
  const items = itemsAplicables(perfil, { audiencia: 'profesional' });
  return items
    .map((item, indice) => {
      const task = tareaDeItem(tasks, item.codigo);
      const alerta: AlertaPersona = {
        item,
        tipo: item.tipo === 'derivacion' ? 'derivacion' : 'alerta',
        estado: estadoDeTaskProfesional(task),
        ...(task ? { task } : {}),
        vigente: vigentes ? item.momentos.some((m) => vigentes.has(m)) : true,
      };
      return { alerta, indice };
    })
    .sort(
      (a, b) =>
        Number(b.alerta.vigente) - Number(a.alerta.vigente) ||
        ORDEN_ESTADO[a.alerta.estado] - ORDEN_ESTADO[b.alerta.estado] ||
        a.indice - b.indice,
    )
    .map(({ alerta }) => alerta);
}

export interface ResumenAlertas {
  total: number;
  nuevas: number;
  abiertas: number;
  atendidas: number;
  descartadas: number;
  /** Derivaciones nuevas o en curso. */
  derivaciones: number;
}

export function resumenAlertas(alertas: readonly AlertaPersona[]): ResumenAlertas {
  const contar = (estado: EstadoAlerta): number => alertas.filter((a) => a.estado === estado).length;
  return {
    total: alertas.length,
    nuevas: contar('nueva'),
    abiertas: contar('abierta'),
    atendidas: contar('atendida'),
    descartadas: contar('descartada'),
    derivaciones: alertas.filter((a) => a.tipo === 'derivacion' && (a.estado === 'nueva' || a.estado === 'abierta')).length,
  };
}

export type DecisionAlerta = 'derivar' | 'atender' | 'descartar';

export const DECISION_LABEL: Record<DecisionAlerta, string> = {
  derivar: 'Derivar',
  atender: 'Atendida',
  descartar: 'Descartar',
};

export interface RegistroDecision {
  patient: Reference<Patient> | string;
  /** El plan activo, si hay: la Task queda `basedOn` él. */
  carePlan?: CarePlan | string;
  /** El profesional que decide. */
  autor?: Reference<Practitioner | PractitionerRole> | string;
  comentario?: string;
  /** ISO dateTime de la decisión (default: ahora). */
  now?: string;
}

function referenciaPlan(carePlan: CarePlan | string | undefined): string | undefined {
  if (!carePlan) return undefined;
  if (typeof carePlan === 'string') return carePlan;
  return carePlan.id ? `CarePlan/${carePlan.id}` : undefined;
}

/** Lo que una decisión cambia en la Task del ítem. */
function cambiosDe(decision: DecisionAlerta, r: RegistroDecision, now: string): Partial<Task> {
  const comentario = r.comentario?.trim();
  const autor = r.autor ? (toReference(r.autor) as Reference<Practitioner | PractitionerRole>) : undefined;
  const nota: Annotation[] = comentario
    ? [{ text: comentario, time: now, ...(autor ? { authorReference: autor as Reference<Practitioner> } : {}) }]
    : [];
  const base: Partial<Task> = { lastModified: now, ...(autor ? { requester: autor } : {}) };
  switch (decision) {
    case 'derivar':
      return { ...base, status: 'requested', intent: 'order', note: nota };
    case 'atender':
      return { ...base, status: 'completed', executionPeriod: { end: now }, note: nota };
    case 'descartar':
      return { ...base, status: 'rejected', statusReason: { text: comentario || 'Descartada por el equipo médico.' } };
  }
}

/**
 * La Task de una alerta después de la decisión: si ya existía se actualiza (las notas
 * se acumulan); si no, se crea desde el ítem del catálogo. Sin plan activo, la Task no
 * lleva `basedOn`.
 */
export function aplicarDecision(alerta: Pick<AlertaPersona, 'item' | 'task'>, decision: DecisionAlerta, r: RegistroDecision): Task {
  const now = r.now ?? new Date().toISOString();
  const cambios = cambiosDe(decision, r, now);
  if (alerta.task) {
    return { ...alerta.task, ...cambios, note: [...(alerta.task.note ?? []), ...(cambios.note ?? [])] };
  }
  const plan = referenciaPlan(r.carePlan);
  const task = taskDesdeItem(alerta.item, { patient: toReference(r.patient), carePlan: plan ?? '', now: now.slice(0, 10) });
  if (!plan) delete task.basedOn;
  return { ...task, ...cambios, note: [...(task.note ?? []), ...(cambios.note ?? [])] };
}
