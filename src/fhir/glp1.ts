// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Seguimiento de tratamiento GLP-1 — lectura del programa del paciente (SOLO LECTURA).
//
// El programa lo arma el backend (recepcionistas, bot `som-glp1-plan`): CarePlan, Goal
// (meta de peso), ServiceRequest (estudios de cada semana) y Task (un control por semana,
// con su ventana para agendar). Recepción agenda cada control (Appointment) y completa la
// tarea. EL SISTEMA CALCULA, LA APP MUESTRA: ventanas, semanas y estudios se leen de los
// recursos; acá solo hay cálculos de presentación (semanas transcurridas, formato).
// Contrato: recepcionistas/docs/glp1.md, sección "App del paciente".
import type { MedplumClient } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type {
  Appointment,
  CarePlan,
  Goal,
  Observation,
  Patient,
  Reference,
  ServiceRequest,
  Task,
} from '@medplum/fhirtypes';
import { etiquetaTurno } from './turnos';

// Systems y códigos: deben coincidir con recepcionistas/src/fhir/identifiers.ts.
const SOM_FHIR = 'https://segundaopinionmedica.org/fhir';
export const CARE_PLANS_SYSTEM = `${SOM_FHIR}/CodeSystem/care-plans`;
export const SEGUIMIENTO_GLP1_CODE = 'seguimiento-glp1';
export const TASK_TIPO_SYSTEM = `${SOM_FHIR}/CodeSystem/task-tipo`;
export const AGENDAR_CONTROL_GLP1_CODE = 'agendar-control-glp1';
export const INDICACION_GLP1_CODE = 'indicacion-glp1';
/** Catálogo de biomarcadores de CKM (slugs). No es el `…/CodeSystem/biomarker` de la app. */
export const BIOMARCADOR_SYSTEM = `${SOM_FHIR}/CodeSystem/biomarcador`;
export const LOINC_PESO = '29463-7';

export const ZONA_HORARIA = 'America/Argentina/Buenos_Aires';

/** Pantalla del seguimiento en el portal. */
export const RUTA_SEGUIMIENTO_GLP1 = '/care-plan/glp1';

/** Nombre visible de cada estudio del programa (slug del catálogo de biomarcadores). */
export const NOMBRES_ESTUDIOS: Record<string, string> = {
  hba1c: 'Hemoglobina glicosilada (HbA1c)',
  'glucosa-en-ayunas': 'Glucemia en ayunas',
  'insulina-en-ayunas': 'Insulina (ayunas)',
  'homa-ir': 'Índice HOMA-IR',
  'colesterol-total': 'Colesterol total',
  'hdl-colesterol': 'Colesterol HDL',
  'ldl-colesterol': 'Colesterol LDL',
  trigliceridos: 'Triglicéridos',
  creatinina: 'Creatinina',
  'egfr-tfg-estimada': 'Filtrado glomerular estimado (eGFR)',
  'ast-got': 'AST (TGO)',
  'alt-tgp': 'ALT (TGP)',
};

export type EstadoControl = 'por-agendar' | 'agendado' | 'realizado';

export interface EstudioGlp1 {
  slug: string;
  nombre: string;
}

export interface ControlGlp1 {
  taskId: string;
  semana: number;
  nombre: string;
  /** Ventana para agendar, fechas locales 'AAAA-MM-DD'. */
  ventana: { inicio?: string; fin?: string };
  estado: EstadoControl;
  requiereLaboratorio: boolean;
  estudios: EstudioGlp1[];
  turno?: Appointment;
  esRevision: boolean;
}

export type MetaGlp1 =
  | { tipo: 'kg'; valor: number; fecha?: string }
  | { tipo: 'porcentaje'; porcentaje: number; fecha?: string }
  | { tipo: 'texto'; fecha?: string };

export interface PesoRegistrado {
  /** effectiveDateTime de la Observation (instante ISO). */
  fecha: string;
  kg: number;
}

export interface SeguimientoGlp1Activo {
  estado: 'activo';
  carePlanId: string;
  titulo?: string;
  molecula?: string;
  /** Esquema de titulación, tal como lo escribió el equipo médico. */
  esquema?: string;
  /** Fecha de inicio del tratamiento ('AAAA-MM-DD'). */
  inicio?: string;
  controles: ControlGlp1[];
  meta?: MetaGlp1;
  /** Pesos cargados, del más viejo al más nuevo. */
  pesos: PesoRegistrado[];
}

export type SeguimientoGlp1 = { estado: 'indicacion-pendiente' } | SeguimientoGlp1Activo;

// ─── Fechas ────────────────────────────────────────────────────────────────────────────
// 'AAAA-MM-DD' es una fecha LOCAL: nunca pasa por `new Date('AAAA-MM-DD')`, que la toma
// como medianoche UTC y en Argentina la corre al día anterior.

const FECHA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function partesFecha(fecha: string): [number, number, number] | undefined {
  const m = FECHA_RE.exec(fecha.slice(0, 10));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
}

/** Hoy en Argentina, como 'AAAA-MM-DD'. */
export function hoyArgentina(ahora: Date = new Date()): string {
  // en-CA formatea como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

/** 'AAAA-MM-DD' → 'dd/mm/aaaa' (o 'dd/mm' sin año), sin conversión de zona horaria. */
export function formatearFecha(fecha: string | undefined, conAnio = true): string {
  const p = fecha ? partesFecha(fecha) : undefined;
  if (!p) {
    return '';
  }
  const [a, m, d] = p;
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return conAnio ? `${dd}/${mm}/${a}` : `${dd}/${mm}`;
}

/** Días entre dos fechas 'AAAA-MM-DD' (hasta − desde). */
export function diasEntre(desde: string, hasta: string): number {
  const a = partesFecha(desde);
  const b = partesFecha(hasta);
  if (!a || !b) {
    return Number.NaN;
  }
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86_400_000);
}

/**
 * Semanas de tratamiento cumplidas (días desde el inicio / 7, para abajo): la misma
 * numeración que los controles. Negativo si el tratamiento todavía no empezó.
 */
export function semanasTranscurridas(inicio: string, hoy: string): number {
  return Math.floor(diasEntre(inicio, hoy) / 7);
}

/** Instante ISO → 'mié 30/09 10:00' en hora argentina. */
export function formatearTurno(instante: string): string {
  const partes = new Intl.DateTimeFormat('es-AR', {
    timeZone: ZONA_HORARIA,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(instante));
  const v = (tipo: Intl.DateTimeFormatPartTypes): string => partes.find((p) => p.type === tipo)?.value ?? '';
  const dia = v('weekday').replace('.', '');
  return `${dia} ${v('day')}/${v('month')} ${v('hour')}:${v('minute')}`;
}

/** Instante ISO → 'dd/mm/aaaa' en hora argentina. */
export function formatearInstante(instante: string): string {
  return formatearFecha(hoyArgentina(new Date(instante)));
}

// ─── Recursos del programa ─────────────────────────────────────────────────────────────

function tieneCodigo(
  codings: { system?: string; code?: string }[] | undefined,
  system: string,
  code: string
): boolean {
  return Boolean(codings?.some((c) => c.system === system && c.code === code));
}

/** ¿Es el CarePlan del programa de seguimiento GLP-1? */
export function esCarePlanGlp1(carePlan: CarePlan): boolean {
  return Boolean(
    carePlan.category?.some((cat) => tieneCodigo(cat.coding, CARE_PLANS_SYSTEM, SEGUIMIENTO_GLP1_CODE))
  );
}

function inputDe(task: Task, nombre: string): NonNullable<Task['input']>[number] | undefined {
  return task.input?.find((i) => i.type?.text === nombre);
}

function nombreControl(semana: number, esRevision: boolean): string {
  if (esRevision) {
    return 'Revisión de tu respuesta al tratamiento';
  }
  return semana === 0 ? 'Control inicial' : `Semana ${semana}`;
}

function slugDe(sr: ServiceRequest): string | undefined {
  return (
    sr.code?.coding?.find((c) => c.system === BIOMARCADOR_SYSTEM)?.code ?? sr.code?.coding?.[0]?.code ?? sr.code?.text
  );
}

/** Estudios de una semana: los pedidos del programa agrupados por `requisition`, sin revocados. */
export function estudiosDeSemana(pedidos: ServiceRequest[], carePlanId: string, semana: number): EstudioGlp1[] {
  const grupo = `${carePlanId}:semana-${semana}`;
  const estudios: EstudioGlp1[] = [];
  for (const sr of pedidos) {
    if (sr.status === 'revoked' || sr.status === 'entered-in-error' || sr.requisition?.value !== grupo) {
      continue;
    }
    const slug = slugDe(sr);
    if (slug && !estudios.some((e) => e.slug === slug)) {
      estudios.push({ slug, nombre: NOMBRES_ESTUDIOS[slug] ?? sr.code?.text ?? slug });
    }
  }
  return estudios;
}

/** Referencia al turno que Recepción dejó en la tarea al agendar. */
export function referenciaTurno(task: Task): Reference<Appointment> | undefined {
  const out = task.output?.find((o) => o.type?.text === 'turno')?.valueReference;
  return out?.reference?.startsWith('Appointment/') ? (out as Reference<Appointment>) : undefined;
}

const TASK_OCULTAS = new Set(['cancelled', 'entered-in-error', 'rejected', 'failed']);

/**
 * Controles del programa, ordenados por semana, con su estado, estudios y turno.
 * Las tareas canceladas (el médico recalculó) no se muestran.
 */
export function armarControles(
  tareas: Task[],
  pedidos: ServiceRequest[],
  turnos: Map<string, Appointment>,
  carePlanId: string,
  fechaRevision?: string
): ControlGlp1[] {
  const controles: ControlGlp1[] = [];
  for (const task of tareas) {
    if (!task.id || !task.status || TASK_OCULTAS.has(task.status)) {
      continue;
    }
    const semana = inputDe(task, 'semana')?.valueInteger;
    if (semana === undefined) {
      continue;
    }
    const ventana = { inicio: task.restriction?.period?.start, fin: task.restriction?.period?.end };
    const esRevision = Boolean(fechaRevision && ventana.inicio?.slice(0, 10) === fechaRevision);
    const ref = referenciaTurno(task)?.reference;
    const turno = ref ? turnos.get(ref) : undefined;
    let estado: EstadoControl = 'por-agendar';
    if (task.status === 'completed') {
      estado = turno?.status === 'fulfilled' ? 'realizado' : 'agendado';
    }
    controles.push({
      taskId: task.id,
      semana,
      nombre: nombreControl(semana, esRevision),
      ventana,
      estado,
      requiereLaboratorio: inputDe(task, 'requiere-laboratorio')?.valueBoolean === true,
      estudios: estudiosDeSemana(pedidos, carePlanId, semana),
      turno,
      esRevision,
    });
  }
  return controles.sort((a, b) => a.semana - b.semana || (a.ventana.inicio ?? '').localeCompare(b.ventana.inicio ?? ''));
}

/**
 * Próximo control: el primero que falta agendar, o que está agendado para más adelante.
 * Los ya realizados y los agendados con fecha pasada quedan atrás.
 */
export function proximoControl(controles: ControlGlp1[], ahora: Date = new Date()): ControlGlp1 | undefined {
  return controles.find((c) => {
    if (c.estado === 'realizado') {
      return false;
    }
    if (c.estado === 'agendado' && c.turno?.start) {
      return new Date(c.turno.start).getTime() >= ahora.getTime();
    }
    return true;
  });
}

export function controlDeRevision(controles: ControlGlp1[]): ControlGlp1 | undefined {
  return controles.find((c) => c.esRevision);
}

/** Meta de peso del Goal: en kg ("<= 87,4 kg") o relativa al peso basal ("≤ 95 % del peso basal"). */
export function leerMeta(goal: Goal | undefined): MetaGlp1 | undefined {
  const target = goal?.target?.find((t) => tieneCodigo(t.measure?.coding, 'http://loinc.org', LOINC_PESO));
  if (!target) {
    return undefined;
  }
  const fecha = target.dueDate;
  const q = target.detailQuantity;
  if (q?.value !== undefined && (q.unit === 'kg' || q.code === 'kg')) {
    return { tipo: 'kg', valor: q.value, fecha };
  }
  // "≤ 95 % del peso basal" → bajar al menos un 5 %.
  const m = /(\d+(?:[.,]\d+)?)\s*%/.exec(target.detailString ?? '');
  if (m) {
    const restante = Number(m[1].replace(',', '.'));
    if (restante > 0 && restante < 100) {
      return { tipo: 'porcentaje', porcentaje: Math.round((100 - restante) * 10) / 10, fecha };
    }
  }
  return { tipo: 'texto', fecha };
}

export function leerPesos(observaciones: Observation[]): PesoRegistrado[] {
  return observaciones
    .filter((o) => o.status !== 'entered-in-error' && o.effectiveDateTime && typeof o.valueQuantity?.value === 'number')
    .map((o) => ({ fecha: o.effectiveDateTime as string, kg: o.valueQuantity?.value as number }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

function formatearNumero(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 1 });
}

/** Frase de la meta para el paciente, sin interpretar la respuesta al tratamiento. */
export function textoMeta(meta: MetaGlp1): string {
  const para = meta.fecha ? ` para el ${formatearFecha(meta.fecha)}` : '';
  switch (meta.tipo) {
    case 'kg':
      return `Llegar a ${formatearNumero(meta.valor)} kg o menos${para}`;
    case 'porcentaje':
      return `Bajar al menos un ${formatearNumero(meta.porcentaje)} % de tu peso inicial${para}`;
    default:
      return `Tu equipo va a revisar tu peso${para}`;
  }
}

// ─── Textos para el paciente ───────────────────────────────────────────────────────────

/** 'dd/mm', con año solo si no es el año en curso. */
function fechaCorta(fecha: string, hoy: string): string {
  return formatearFecha(fecha, fecha.slice(0, 4) !== hoy.slice(0, 4));
}

/** "Llevás N semanas de tratamiento" o "Empezás el dd/mm". */
export function textoSemanas(inicio: string | undefined, hoy: string): string {
  if (!inicio) {
    return '';
  }
  const n = semanasTranscurridas(inicio, hoy);
  if (n < 0) {
    return `Empezás el ${fechaCorta(inicio, hoy)}`;
  }
  if (n === 0) {
    return 'Estás en tu primera semana de tratamiento';
  }
  return `Llevás ${n} ${n === 1 ? 'semana' : 'semanas'} de tratamiento`;
}

/** "Entre el dd/mm y el dd/mm" (la ventana la calcula el sistema). */
export function textoVentana(control: ControlGlp1, hoy: string): string {
  const { inicio, fin } = control.ventana;
  if (inicio && fin) {
    return `Entre el ${fechaCorta(inicio, hoy)} y el ${fechaCorta(fin, hoy)}`;
  }
  if (inicio) {
    return `Desde el ${fechaCorta(inicio, hoy)}`;
  }
  return fin ? `Hasta el ${fechaCorta(fin, hoy)}` : '';
}

export function textoEstado(control: ControlGlp1): string {
  switch (control.estado) {
    case 'realizado':
      return 'Realizado';
    case 'agendado':
      return control.turno?.start
        ? `Agendado: ${formatearTurno(control.turno.start)} · ${etiquetaTurno(control.turno.status)}`
        : 'Agendado';
    default:
      return 'Por agendar: Recepción te va a contactar';
  }
}

// ─── Carga ─────────────────────────────────────────────────────────────────────────────

/**
 * Lee el programa GLP-1 del paciente. `undefined` si no está inscripto;
 * `indicacion-pendiente` si Recepción lo inscribió pero el médico todavía no armó el plan.
 */
export async function cargarSeguimientoGlp1(
  medplum: MedplumClient,
  patient: Patient
): Promise<SeguimientoGlp1 | undefined> {
  const paciente = getReferenceString(patient);
  const carePlans = await medplum.searchResources(
    'CarePlan',
    `subject=${paciente}&category=${CARE_PLANS_SYSTEM}|${SEGUIMIENTO_GLP1_CODE}&status=active&_sort=-_lastUpdated`
  );
  const carePlan = carePlans.find((cp) => cp.status === 'active' && esCarePlanGlp1(cp));

  if (!carePlan?.id) {
    const indicaciones = await medplum.searchResources(
      'Task',
      `patient=${paciente}&code=${TASK_TIPO_SYSTEM}|${INDICACION_GLP1_CODE}&status=requested`
    );
    return indicaciones.some((t) => t.status === 'requested') ? { estado: 'indicacion-pendiente' } : undefined;
  }

  const carePlanRef = `CarePlan/${carePlan.id}`;
  const goalRef = carePlan.goal?.[0];
  const [goal, tareas, pedidos, observaciones] = await Promise.all([
    goalRef ? medplum.readReference(goalRef).catch(() => undefined) : Promise.resolve(undefined),
    medplum.searchResources(
      'Task',
      `patient=${paciente}&code=${TASK_TIPO_SYSTEM}|${AGENDAR_CONTROL_GLP1_CODE}&_count=100`
    ),
    medplum.searchResources('ServiceRequest', `subject=${paciente}&based-on=${carePlanRef}&_count=200`),
    medplum.searchResources('Observation', `code=${LOINC_PESO}&patient=${paciente}&_sort=-date&_count=200`),
  ]);

  // Solo las tareas de ESTE programa (si la tarea declara su CarePlan).
  const tareasDelPlan = tareas.filter((t) => !t.basedOn?.length || t.basedOn.some((b) => b.reference === carePlanRef));

  const turnos = new Map<string, Appointment>();
  await Promise.all(
    tareasDelPlan.map(async (t) => {
      const ref = t.status === 'completed' ? referenciaTurno(t) : undefined;
      if (ref?.reference) {
        const turno = await medplum.readReference(ref).catch(() => undefined);
        if (turno) {
          turnos.set(ref.reference, turno);
        }
      }
    })
  );

  const meta = leerMeta(goal);
  const medicacion = carePlan.activity?.find((a) => a.detail?.kind === 'MedicationRequest')?.detail;

  return {
    estado: 'activo',
    carePlanId: carePlan.id,
    titulo: carePlan.title,
    molecula: medicacion?.productCodeableConcept?.text ?? medicacion?.productCodeableConcept?.coding?.[0]?.display,
    esquema: medicacion?.description,
    inicio: carePlan.period?.start,
    controles: armarControles(tareasDelPlan, pedidos, turnos, carePlan.id, meta?.fecha),
    meta,
    pesos: leerPesos(observaciones),
  };
}
