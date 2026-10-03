import type { Bundle, BundleEntry, CarePlan, Goal, Patient, Reference, Task } from '@medplum/fhirtypes';
import { evaluacionesAplicables, itemsAplicables, metasAplicables, type PerfilCatalogo } from '../catalogo/seleccion.js';
import { EXT_SUFIJO, buscarExtension, coincide, SYS_SUFIJO } from '../contrato/pb100d.js';
import { goalDesdeMetaCatalogo, taskDesdeEvaluacion, taskDesdeItem } from '../builders/pb100dBundle.js';
import { extensionesDeAplicabilidad } from '../builders/pb100dPlanDefinition.js';
import { defaultIdGenerator, urn, type IdGenerator } from '../fhir/index.js';
import { ETIQUETA_ESTADIO, type Audiencia, type Condicion } from '../model/catalogo.js';

/**
 * Recálculo del plan de una persona cuando cambia su perfil (el equipo valida o
 * corrige el estadío, registra una condición, carga un instrumento o un evento).
 *
 * El plan es un `CarePlan` con `Task`s (ítems y evaluaciones) y `Goal`s (metas),
 * cada uno con el código del catálogo en su extensión `catalogo-item`. El recálculo
 * compara lo que aplica al perfil de hoy con lo que ya existe, por código:
 *  - lo que aplica y no tiene Task o Goal → se crea;
 *  - lo que tiene Task abierta y ya no aplica → se cancela (queda la historia);
 *  - lo completado o cancelado no se toca; las metas nunca se cancelan.
 * El CarePlan se actualiza con los nuevos Goals y Tasks, el estadío en el título y
 * las extensiones del perfil. Todo va en una sola transacción (`bundleRecalculo`).
 */
export interface EstadoPlan {
  carePlan: CarePlan;
  tasks: Task[];
  goals: Goal[];
}

export interface OpcionesRecalculo {
  /** Audiencias cuyos ítems se instancian como Task. Default: sólo `persona` (como al empezar). */
  audiencias?: readonly Audiencia[];
  incluirEvaluaciones?: boolean;
  /** ISO date (`YYYY-MM-DD`) del recálculo. */
  now?: string;
  idGenerator?: IdGenerator;
}

export interface DiffPlan {
  /** Tasks nuevas (ya con `basedOn` al CarePlan). */
  crear: Task[];
  /** Tasks abiertas que ya no aplican, cerradas como canceladas. */
  cancelar: Task[];
  /** Metas nuevas. */
  metasCrear: Goal[];
  /** El CarePlan como queda (título, extensiones; los Goals y Tasks nuevos se enlazan en el bundle). */
  carePlan: CarePlan;
  sinCambios: boolean;
  resumen: { nuevos: string[]; cancelados: string[]; metasNuevas: string[]; estadioAnterior?: string; estadio: string };
}

const ABIERTAS = new Set<Task['status']>(['draft', 'requested', 'received', 'accepted', 'ready', 'in-progress', 'on-hold']);

/** El código del catálogo de una Task o un Goal instanciados por el plan. */
export function codigoItemDe(recurso: Task | Goal): string | undefined {
  const ext = buscarExtension(recurso.extension, EXT_SUFIJO.catalogoItem)?.valueCode;
  if (ext) return ext;
  if (recurso.resourceType === 'Goal') {
    return recurso.identifier?.find((i) => coincide(i.system, SYS_SUFIJO.catalogo))?.value;
  }
  return (recurso.code?.coding ?? []).find((k) => coincide(k.system, SYS_SUFIJO.catalogo))?.code;
}

/** El estadío que el CarePlan lleva en sus extensiones (`catalogo-estadios`), si lo tiene. */
export function estadioDelPlan(carePlan: CarePlan): string | undefined {
  return buscarExtension(carePlan.extension, EXT_SUFIJO.catalogoEstadios)?.valueCode;
}

/** Qué habría que crear, cancelar y actualizar para que el plan refleje el perfil de hoy. */
export function diffPlan(estado: EstadoPlan, perfil: PerfilCatalogo, opciones: OpcionesRecalculo = {}): DiffPlan {
  const { carePlan, tasks, goals } = estado;
  if (!carePlan.id) throw new Error('El CarePlan tiene que estar guardado (con id) para recalcularlo.');
  const audiencias = opciones.audiencias ?? ['persona'];
  const incluirEvaluaciones = opciones.incluirEvaluaciones ?? true;
  const now = opciones.now;
  const patient = carePlan.subject as Reference<Patient>;
  const ctx = { patient, carePlan: `CarePlan/${carePlan.id}`, now };

  const items = itemsAplicables(perfil).filter((item) => audiencias.includes(item.audiencia));
  const evaluaciones = incluirEvaluaciones ? evaluacionesAplicables(perfil) : [];
  const metas = metasAplicables(perfil);

  const tasksPorCodigo = new Map<string, Task[]>();
  for (const task of tasks) {
    const codigo = codigoItemDe(task);
    if (!codigo) continue;
    tasksPorCodigo.set(codigo, [...(tasksPorCodigo.get(codigo) ?? []), task]);
  }
  const goalsPorCodigo = new Set(goals.map(codigoItemDe).filter((c): c is string => c !== undefined));

  const aplican = new Set<string>([...items.map((i) => i.codigo), ...evaluaciones.map((e) => e.codigo)]);
  const crear: Task[] = [
    ...items.filter((item) => !tasksPorCodigo.has(item.codigo)).map((item) => taskDesdeItem(item, ctx)),
    ...evaluaciones.filter((e) => !tasksPorCodigo.has(e.codigo)).map((e) => taskDesdeEvaluacion(e, ctx)),
  ];
  const cancelar: Task[] = [];
  for (const [codigo, lista] of tasksPorCodigo) {
    if (aplican.has(codigo)) continue;
    for (const task of lista) {
      if (!ABIERTAS.has(task.status)) continue;
      cancelar.push({
        ...task,
        status: 'cancelled',
        statusReason: { text: 'Ya no aplica al perfil de la persona (recálculo del plan).' },
      });
    }
  }
  const metasCrear = metas.filter((meta) => !goalsPorCodigo.has(meta.codigo)).map((meta) => goalDesdeMetaCatalogo(meta, { patient, now }));

  const estadioAnterior = estadioDelPlan(carePlan);
  const condiciones: Condicion[] = [...perfil.condiciones];
  const actualizado: CarePlan = {
    ...carePlan,
    title: (carePlan.title ?? '').replace(/Estadío \d\s*$/u, `Estadío ${perfil.estadio}`) || carePlan.title,
    description: `${ETIQUETA_ESTADIO[perfil.estadio]}. ${(carePlan.description ?? '').replace(/^[^.]*\.\s*/u, '')}`.trim(),
    extension: [
      ...(carePlan.extension ?? []).filter(
        (e) => !coincide(e.url, EXT_SUFIJO.catalogoEstadios) && !coincide(e.url, EXT_SUFIJO.catalogoCondicion),
      ),
      ...extensionesDeAplicabilidad({ estadios: [perfil.estadio], condiciones }),
    ],
  };
  if (actualizado.title && !/Estadío \d/u.test(actualizado.title)) {
    actualizado.title = `${actualizado.title} · Estadío ${perfil.estadio}`;
  }

  const cambioPerfil = estadioAnterior !== perfil.estadio;
  return {
    crear,
    cancelar,
    metasCrear,
    carePlan: actualizado,
    sinCambios: crear.length === 0 && cancelar.length === 0 && metasCrear.length === 0 && !cambioPerfil,
    resumen: {
      nuevos: crear.map((t) => codigoItemDe(t) ?? '?'),
      cancelados: cancelar.map((t) => codigoItemDe(t) ?? '?'),
      metasNuevas: metasCrear.map((g) => codigoItemDe(g) ?? '?'),
      ...(estadioAnterior ? { estadioAnterior } : {}),
      estadio: perfil.estadio,
    },
  };
}

/**
 * La transacción que aplica el diff: crea Tasks y Goals (con `urn:uuid`), cancela las
 * Tasks que ya no aplican y actualiza el CarePlan enlazando lo nuevo. Atómica: o entra
 * todo o nada.
 */
export function bundleRecalculo(diff: DiffPlan, idGenerator: IdGenerator = defaultIdGenerator): Bundle {
  const entries: BundleEntry[] = [];
  const goalRefs: string[] = [];
  const taskRefs: string[] = [];
  for (const goal of diff.metasCrear) {
    const fullUrl = urn(idGenerator());
    goalRefs.push(fullUrl);
    entries.push({ fullUrl, resource: goal, request: { method: 'POST', url: 'Goal' } });
  }
  for (const task of diff.crear) {
    const fullUrl = urn(idGenerator());
    taskRefs.push(fullUrl);
    entries.push({ fullUrl, resource: task, request: { method: 'POST', url: 'Task' } });
  }
  for (const task of diff.cancelar) {
    entries.push({ resource: task, request: { method: 'PUT', url: `Task/${task.id}` } });
  }
  const carePlan: CarePlan = {
    ...diff.carePlan,
    goal: [...(diff.carePlan.goal ?? []), ...goalRefs.map((reference) => ({ reference }))],
    activity: [...(diff.carePlan.activity ?? []), ...taskRefs.map((reference) => ({ reference: { reference } }))],
  };
  entries.push({ resource: carePlan, request: { method: 'PUT', url: `CarePlan/${carePlan.id}` } });
  return { resourceType: 'Bundle', type: 'transaction', entry: entries };
}
