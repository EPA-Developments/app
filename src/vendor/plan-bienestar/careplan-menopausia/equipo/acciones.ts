import type { CarePlan, Patient, Practitioner, PractitionerRole, QuestionnaireResponse, Reference, Task } from '@medplum/fhirtypes';
import { perfilDesdeRespuesta } from '../baseline/perfil.js';
import { BASELINE_QUESTIONNAIRE_URL } from '../baseline/preguntas.js';
import {
  BIBLIOTECA_AMPLIADA,
  PILARES,
  accionesDisponibles,
  buscarAccion,
  validarSeleccion,
  type Accion,
  type Anexo,
  type PerfilBaseline,
  type Pilar,
  type Rechazo,
} from '../biblioteca/index.js';
import { perfilBibliotecaDesdeCatalogo, type PerfilCatalogo } from '../catalogo/seleccion.js';
import { toReference } from '../fhir/codeable.js';
import { ultimaRespuesta } from '../le8/desdeFhir.js';
import { RESPONSABLE_LABEL } from '../model/catalogo.js';
import { SYSTEM } from '../terminology/systems.js';

/**
 * Acciones de la biblioteca (Anexo C y Anexo C bis) para una persona, activadas por el
 * equipo. La biblioteca es cerrada: el sistema propone lo que está disponible para el
 * perfil (`accionesDisponibles`), el médico elige y `validarSeleccion` rechaza lo que no
 * corresponde (código desconocido, contraindicada, pares excluyentes, GLP-1).
 *
 * Cada acción activada es una `Task` de la persona (`intent: plan`) con el código de la
 * acción en el CodeSystem `pb100d-acciones`, enlazada al plan activo. Desactivarla la
 * cancela (queda la historia).
 *
 * Los anexos tienen estado de firma: un anexo en borrador se ve pero no se activa
 * (`ANEXOS[anexo].activable`). El Anexo C está publicado y el **Anexo C bis quedó
 * firmado el 03/10/2026** por los Dres. Barbagelata y D'Alessandro: sus acciones se
 * activan. Las funciones aceptan otro estado de firma (`anexos`) para un anexo futuro
 * en borrador y para los tests.
 */
export const SYSTEM_ACCIONES = 'https://epa-bienestar.ar/fhir/CodeSystem/pb100d-acciones';

/** Código EPA que marca una Task como acción de la biblioteca. */
export const CODIGO_TASK_ACCION = 'accion-biblioteca';

export interface EstadoAnexo {
  anexo: Anexo;
  nombre: string;
  estado: 'publicado' | 'borrador';
  /** Sus acciones se pueden activar para una persona. */
  activable: boolean;
  nota: string;
}

export const ANEXOS: Readonly<Record<Anexo, EstadoAnexo>> = Object.freeze({
  C: {
    anexo: 'C',
    nombre: 'Anexo C (nivel 1)',
    estado: 'publicado',
    activable: true,
    nota: 'Biblioteca publicada del nivel 1, escrita para la mujer en menopausia.',
  },
  'C-bis': {
    anexo: 'C-bis',
    nombre: 'Anexo C bis (ampliada por estadío y condición)',
    estado: 'publicado',
    activable: true,
    nota: "Firmado el 03/10/2026 por los Dres. Barbagelata y D'Alessandro: 36 acciones aprobadas y 4 modificadas (A14, P01, P05, R02).",
  },
});

/** El estado de firma de cada anexo (el vigente es `ANEXOS`). */
export type EstadoDeFirma = Readonly<Record<Anexo, EstadoAnexo>>;

export function anexoActivable(anexo: Anexo, anexos: EstadoDeFirma = ANEXOS): boolean {
  return anexos[anexo].activable;
}

export type EstadoAccion = 'no-activada' | 'activa' | 'completada' | 'desactivada';

export const ESTADO_ACCION_LABEL: Record<EstadoAccion, string> = {
  'no-activada': 'No activada',
  activa: 'Activa',
  completada: 'Completada',
  desactivada: 'Desactivada',
};

export interface AccionPersona {
  accion: Accion;
  estado: EstadoAccion;
  task?: Task;
  /** Disponible para el perfil de hoy (`accionesDisponibles`). Una activa puede haber dejado de estarlo. */
  disponible: boolean;
  /** Se puede activar: disponible, no activa y con el anexo firmado. */
  activable: boolean;
  motivoNoActivable?: string;
}

const ABIERTAS = new Set<Task['status']>(['draft', 'requested', 'received', 'accepted', 'ready', 'in-progress', 'on-hold']);
const BASELINE_SUFIJO = BASELINE_QUESTIONNAIRE_URL.replace(/^.*\/fhir\//, '');

export function esTaskDeAccion(task: Task): boolean {
  return (task.code?.coding ?? []).some((k) => k.system === SYSTEM_ACCIONES);
}

export function codigoAccionDe(task: Task): string | undefined {
  return (task.code?.coding ?? []).find((k) => k.system === SYSTEM_ACCIONES)?.code;
}

function fechaTask(task: Task): string {
  return task.lastModified ?? task.authoredOn ?? task.meta?.lastUpdated ?? '';
}

/** La última Task (no anulada) de una acción. */
export function tareaDeAccion(tasks: Task[], codigo: string): Task | undefined {
  let mejor: Task | undefined;
  for (const task of tasks) {
    if (task.status === 'entered-in-error' || codigoAccionDe(task) !== codigo) continue;
    if (!mejor || fechaTask(task) >= fechaTask(mejor)) mejor = task;
  }
  return mejor;
}

export function estadoDeTaskAccion(task: Task | undefined): EstadoAccion {
  if (!task) return 'no-activada';
  if (task.status === 'completed') return 'completada';
  if (ABIERTAS.has(task.status)) return 'activa';
  return 'desactivada';
}

/**
 * El perfil de la biblioteca de la persona: lo que respondió en el cuestionario inicial
 * (señales) más el estadío y las condiciones del catálogo (`perfilBibliotecaDesdeCatalogo`).
 * Sin estadío se trata como el del Anexo C (las pacientes actuales del nivel 1).
 */
export function perfilBibliotecaDeLaPersona(perfil: PerfilCatalogo | undefined, respuestas: QuestionnaireResponse[] = []): PerfilBaseline {
  const baseline = perfilDesdeRespuesta(ultimaRespuesta(respuestas, BASELINE_SUFIJO));
  return perfil ? perfilBibliotecaDesdeCatalogo(perfil, baseline) : baseline;
}

/**
 * Las acciones para la persona: las disponibles para su perfil, con su estado, más las
 * activas que ya no están disponibles (para que el equipo las vea y decida).
 */
export function accionesParaLaPersona(
  perfilBiblioteca: PerfilBaseline,
  tasks: Task[] = [],
  biblioteca: readonly Accion[] = BIBLIOTECA_AMPLIADA,
  anexos: EstadoDeFirma = ANEXOS,
): AccionPersona[] {
  const disponibles = accionesDisponibles(perfilBiblioteca, biblioteca);
  const codigosDisponibles = new Set<string>(disponibles.map((a) => a.codigo));
  const out: AccionPersona[] = disponibles.map((accion) => {
    const task = tareaDeAccion(tasks, accion.codigo);
    const estado = estadoDeTaskAccion(task);
    const firmado = anexoActivable(accion.anexo, anexos);
    const activable = firmado && estado !== 'activa';
    return {
      accion,
      estado,
      ...(task ? { task } : {}),
      disponible: true,
      activable,
      ...(!firmado ? { motivoNoActivable: anexos[accion.anexo].nota } : estado === 'activa' ? { motivoNoActivable: 'Ya está activa.' } : {}),
    };
  });
  for (const task of tasks) {
    const codigo = codigoAccionDe(task);
    if (!codigo || codigosDisponibles.has(codigo) || estadoDeTaskAccion(task) !== 'activa') continue;
    const accion = buscarAccion(codigo);
    if (!accion || out.some((a) => a.accion.codigo === codigo)) continue;
    out.push({ accion, estado: 'activa', task, disponible: false, activable: false, motivoNoActivable: 'Ya no está disponible para el perfil de hoy.' });
  }
  return out;
}

export interface GrupoPilar {
  pilar: Pilar;
  nombre: string;
  emoji: string;
  acciones: AccionPersona[];
}

/** Las acciones agrupadas por pilar, en el orden de la biblioteca. */
export function agruparPorPilar(acciones: readonly AccionPersona[]): GrupoPilar[] {
  return (Object.keys(PILARES) as Pilar[])
    .map((pilar) => ({ pilar, ...PILARES[pilar], acciones: acciones.filter((a) => a.accion.pilar === pilar) }))
    .filter((g) => g.acciones.length > 0);
}

export interface RegistroAccion {
  patient: Reference<Patient> | string;
  carePlan?: CarePlan | string;
  /** Quién la activa. */
  autor?: Reference<Practitioner | PractitionerRole> | string;
  /** ISO dateTime (default: ahora). */
  now?: string;
}

function referenciaPlan(carePlan: CarePlan | string | undefined): string | undefined {
  if (!carePlan) return undefined;
  if (typeof carePlan === 'string') return carePlan;
  return carePlan.id ? `CarePlan/${carePlan.id}` : undefined;
}

/** La Task de una acción activada para la persona. */
export function buildTaskAccion(accion: Accion, r: RegistroAccion): Task {
  const now = r.now ?? new Date().toISOString();
  const plan = referenciaPlan(r.carePlan);
  const task: Task = {
    resourceType: 'Task',
    status: 'requested',
    intent: 'plan',
    code: {
      coding: [
        { system: SYSTEM_ACCIONES, code: accion.codigo, display: accion.nombre },
        { system: SYSTEM.epa, code: CODIGO_TASK_ACCION, display: 'Acción de la biblioteca' },
      ],
      text: accion.nombre,
    },
    description: accion.practica,
    for: toReference(r.patient),
    businessStatus: { text: `Anexo ${accion.anexo} · ${PILARES[accion.pilar].nombre}` },
    performerType: [{ coding: [{ system: SYSTEM.epa, code: 'persona', display: RESPONSABLE_LABEL.persona }] }],
    note: [{ text: accion.racional }],
    authoredOn: now,
    lastModified: now,
  };
  if (plan) task.basedOn = [{ reference: plan }];
  if (r.autor) task.requester = toReference(r.autor) as Reference<Practitioner | PractitionerRole>;
  if (accion.derivaA) task.note!.push({ text: `Deriva a: ${accion.derivaA}.` });
  return task;
}

/** La acción desactivada por el equipo: la Task cancelada, con motivo. */
export function desactivarTaskAccion(task: Task, opciones: { motivo?: string; now?: string } = {}): Task {
  return {
    ...task,
    status: 'cancelled',
    statusReason: { text: opciones.motivo?.trim() || 'Desactivada por el equipo.' },
    lastModified: opciones.now ?? new Date().toISOString(),
  };
}

export interface ActivacionPreparada {
  /** Acciones que se activan (ya validadas), con su Task lista para crear. */
  aceptadas: Accion[];
  tasks: Task[];
  /** Lo que la biblioteca rechazó (`validarSeleccion`) o el anexo sin firma. */
  rechazadas: Rechazo[];
}

/**
 * Valida una selección contra la biblioteca (junto con lo que ya está activo, para los
 * pares excluyentes) y arma las Tasks de lo aceptado. Las acciones de un anexo sin firma
 * se rechazan antes de validar.
 */
export function prepararActivacion(
  codigos: readonly string[],
  perfilBiblioteca: PerfilBaseline,
  r: RegistroAccion,
  opciones: { yaActivas?: readonly string[]; biblioteca?: readonly Accion[]; anexos?: EstadoDeFirma } = {},
): ActivacionPreparada {
  const yaActivas = new Set(opciones.yaActivas ?? []);
  const anexos = opciones.anexos ?? ANEXOS;
  const rechazadas: Rechazo[] = [];
  const aValidar: string[] = [];
  for (const codigo of new Set(codigos)) {
    if (yaActivas.has(codigo)) continue;
    const accion = buscarAccion(codigo);
    if (accion && !anexoActivable(accion.anexo, anexos)) {
      rechazadas.push({ codigo, motivo: 'no-disponible-para-el-perfil', detalle: anexos[accion.anexo].nota });
      continue;
    }
    aValidar.push(codigo);
  }
  const validacion = validarSeleccion([...yaActivas, ...aValidar], perfilBiblioteca, opciones.biblioteca ?? BIBLIOTECA_AMPLIADA);
  const aceptadas = validacion.aceptadas.filter((a) => !yaActivas.has(a.codigo));
  rechazadas.push(...validacion.rechazadas.filter((x) => !yaActivas.has(x.codigo)));
  return { aceptadas, tasks: aceptadas.map((accion) => buildTaskAccion(accion, r)), rechazadas };
}
