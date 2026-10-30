import type {
  Appointment,
  CarePlan,
  CarePlanActivity,
  Condition,
  MedicationRequest,
  Observation,
  Patient,
  QuestionnaireResponse,
  Task,
} from '@medplum/fhirtypes';
import { buscarAccion } from '../biblioteca/acciones-nivel1.js';
import { SYS_SUFIJO, coincide, esCarePlanDelPrograma } from '../contrato/pb100d.js';
import { LOINC } from '../terminology/loinc.js';
import { CODIGO_TASK_ACCION, SYSTEM_ACCIONES } from './acciones.js';
import { VIGENCIA_DIA_0_DIAS, evaluarMomento } from './dia0.js';
import {
  CONSULTA_INSCRIPCION_LABEL,
  esCarePlanDeInscripcion,
  inscripcionDesdeFhir,
  type ClaveConsultaInscripcion,
  type ConsultaInscripcion,
} from './inscripcion.js';
import { VENTANA_CONTROL_DIAS, fechaDelControl, sumarDias, type MomentoControl } from './momentos.js';

/**
 * «Tu avance»: cuánto del Plan Bienestar 100 Días® hizo la persona, no cómo están sus
 * valores. Firmado en la hoja de firma médica el 30/10/2026 (B7 y B8) por los Dres.
 * D'Alessandro y Barbagelata.
 *
 * Hay tres cortes, uno por cada consulta de Recepción (días 1, 50 y 100 de la inscripción,
 * con ±7 días). Cada corte es el promedio de sus componentes, de 0 a 100:
 *
 *  - Día 1 · al empezar: cuestionarios iniciales (respondidos sobre pedidos), datos de salud
 *    iniciales (presión, peso, cintura y altura, de 4) y la consulta inicial.
 *  - Día 50 · a la mitad: semanas 1 a 7 con día de mediciones (de 7), semanas 1 a 7 con
 *    alguna acción hecha (de 7), cuestionarios del día 30 y la consulta del día 50.
 *  - Día 100 · al final: lo mismo con las semanas 8 a 14, los cuestionarios de los días 60 y
 *    100 y la consulta final.
 *
 * La consulta vale 100 si está realizada, 50 si está agendada y 0 si falta agendarla.
 * Cuentan también los registros que el equipo carga por cuenta de la persona.
 *
 * Decisiones técnicas (las que la firma no fija), aprobadas por la dirección del plan:
 *
 *  - Las semanas y los cortes cuentan desde el día 1 de la inscripción (la consulta
 *    inicial). Sin inscripción no hay cortes.
 *  - Los cuestionarios son los de los momentos clínicos (`dia-0`, `dia-30`, `dia-60`,
 *    `dia-100`) que la persona carga, con la misma lógica que el seguimiento del equipo.
 *  - «Acción marcada como hecha» es cualquier paso que la persona marca: las acciones de
 *    la biblioteca y los pasos del catálogo.
 *  - Una componente sin nada pedido (ningún cuestionario, ningún paso asignado) no entra al
 *    promedio.
 *  - «Queda fijo al cerrar la consulta»: un corte cerrado se calcula sólo con lo que tiene
 *    fecha y quedó registrado hasta el día de su consulta; lo que se carga después no lo
 *    cambia. Si después se borra un registro anterior o se desmarca un paso anterior, el
 *    corte cerrado sí cambia (no se guarda una foto).
 */

export type ClaveCorte = ClaveConsultaInscripcion;

export type ClaveComponente = 'cuestionarios' | 'datos-iniciales' | 'mediciones' | 'acciones' | 'consulta';

export type EstadoConsultaAvance = 'realizada' | 'agendada' | 'para-agendar';

export const ESTADO_CONSULTA_AVANCE_LABEL: Record<EstadoConsultaAvance, string> = {
  realizada: 'realizada',
  agendada: 'agendada',
  'para-agendar': 'para agendar',
};

export type EstadoCorte = 'cerrado' | 'en-curso' | 'futuro';

export interface DefinicionCorte {
  clave: ClaveCorte;
  dia: 1 | 50 | 100;
  titulo: string;
  /** Nombre de la componente de cuestionarios en la tabla firmada. */
  cuestionarios: string;
  /** Momentos clínicos de los cuestionarios de este corte. */
  momentos: readonly MomentoControl[];
  /** Semanas del plan que mide (día de mediciones y acciones), ambas inclusive. */
  semanas?: readonly [number, number];
  /** Día del plan desde el que el corte está en curso. */
  empieza: number;
}

export const CORTES_AVANCE: readonly DefinicionCorte[] = Object.freeze([
  {
    clave: 'inicial',
    dia: 1,
    titulo: 'Día 1 · al empezar',
    cuestionarios: 'Cuestionarios iniciales',
    momentos: ['dia-0'],
    empieza: Number.NEGATIVE_INFINITY,
  },
  {
    clave: 'mitad',
    dia: 50,
    titulo: 'Día 50 · a la mitad',
    cuestionarios: 'Cuestionarios del día 30',
    momentos: ['dia-30'],
    semanas: [1, 7],
    empieza: 1,
  },
  {
    clave: 'final',
    dia: 100,
    titulo: 'Día 100 · al final',
    cuestionarios: 'Cuestionarios de los días 60 y 100',
    momentos: ['dia-60', 'dia-100'],
    semanas: [8, 14],
    empieza: 50,
  },
]);

export type DatoInicial = 'presion' | 'peso' | 'cintura' | 'altura';

const DATO_INICIAL_TEXTO: Record<DatoInicial, string> = {
  presion: 'la presión',
  peso: 'el peso',
  cintura: 'la cintura',
  altura: 'la altura',
};

export interface ComponenteAvance {
  clave: ClaveComponente;
  /** El nombre de la tabla firmada. */
  titulo: string;
  /** De 0 a 100, sin redondear. */
  valor: number;
  hechos?: number;
  total?: number;
  /** Sólo la componente de consulta. */
  consulta?: EstadoConsultaAvance;
  /** Sólo los datos de salud iniciales: los que faltan. */
  faltan?: DatoInicial[];
}

export interface CorteAvance {
  clave: ClaveCorte;
  dia: 1 | 50 | 100;
  titulo: string;
  estado: EstadoCorte;
  /** Día (AAAA-MM-DD) hasta el que cuenta lo registrado: la consulta si está cerrado, hoy si no. */
  hasta: string;
  /** Día (AAAA-MM-DD) de la consulta realizada que cerró el corte. */
  cerradoEl?: string;
  /** Las componentes que entran al promedio, en el orden de la tabla firmada. */
  componentes: ComponenteAvance[];
  /** Promedio de las componentes, de 0 a 100, entero. */
  puntaje: number;
}

export interface AvanceDelPlan {
  inscripto: boolean;
  /** Día 1 de la inscripción (AAAA-MM-DD). */
  inicio?: string;
  /** Día del plan hoy (1 = la consulta inicial; puede ser 0 o menos antes de empezar). */
  dia?: number;
  hoy: string;
  cortes: CorteAvance[];
  /** El próximo corte: el primero que está en curso. */
  actual?: CorteAvance;
}

export interface ContextoAvance {
  patient?: Patient;
  /** Los CarePlan activos de la persona: la inscripción y el plan clínico. */
  carePlans?: CarePlan[];
  /** Todas sus Tasks: las consultas de Recepción, los pasos del plan y las acciones. */
  tasks?: Task[];
  observations?: Observation[];
  questionnaireResponses?: QuestionnaireResponse[];
  conditions?: Condition[];
  medicationRequests?: MedicationRequest[];
  /** Los turnos de las consultas del plan (`Task.output` de las Tasks de consulta). */
  appointments?: Appointment[];
  /** Hoy (AAAA-MM-DD, Argentina). Default: hoy en Argentina. */
  hoy?: string;
}

/** Códigos LOINC que cuentan como día de mediciones y dato inicial (para las búsquedas). */
const PRESION = [LOINC.bloodPressurePanel.code!, LOINC.systolicBloodPressure.code!, LOINC.diastolicBloodPressure.code!];
const PESO = [LOINC.bodyWeight.code!];
/** 8280-0 la carga la persona en el portal; 56086-2, el equipo en el dashboard. */
const CINTURA = [LOINC.waistCircumference.code!, '56086-2'];
const ALTURA = [LOINC.bodyHeight.code!];

export const LOINC_MEDICIONES_AVANCE: readonly string[] = Object.freeze([...PRESION, ...PESO, ...CINTURA, ...ALTURA]);

const CODIGOS_DATO: Record<DatoInicial, readonly string[]> = { presion: PRESION, peso: PESO, cintura: CINTURA, altura: ALTURA };

/** Argentina no tiene horario de verano: UTC−3 todo el año. */
const OFFSET_ARGENTINA_MS = 3 * 3_600_000;

/** El día en Argentina (AAAA-MM-DD) de una fecha FHIR; un AAAA-MM-DD queda como está. */
export function diaEnArgentina(fecha: string | undefined): string | undefined {
  if (!fecha) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha;
  if (!fecha.includes('T')) return undefined;
  const ms = Date.parse(fecha);
  if (Number.isNaN(ms)) return undefined;
  return new Date(ms - OFFSET_ARGENTINA_MS).toISOString().slice(0, 10);
}

/** Une listas de recursos sin repetir los que tienen el mismo id. */
export function unirPorId<T extends { id?: string }>(...listas: T[][]): T[] {
  const vistos = new Set<string>();
  const unidos: T[] = [];
  for (const r of listas.flat()) {
    if (r.id && vistos.has(r.id)) continue;
    if (r.id) vistos.add(r.id);
    unidos.push(r);
  }
  return unidos;
}

const ESTADOS_OBS_FUERA = new Set<Observation['status']>(['entered-in-error', 'cancelled']);

function fechaObservacion(o: Observation): string | undefined {
  return diaEnArgentina(o.effectiveDateTime ?? o.effectivePeriod?.start ?? o.effectiveInstant ?? o.issued);
}

/** Quedó registrado hasta ese día (sin `meta.lastUpdated`, se asume que sí). */
function registradoHasta(r: { meta?: { lastUpdated?: string } }, hasta: string): boolean {
  const dia = diaEnArgentina(r.meta?.lastUpdated);
  return dia === undefined || dia <= hasta;
}

function tieneCodigo(coding: { code?: string }[] | undefined, codigos: readonly string[]): boolean {
  return (coding ?? []).some((k) => k.code !== undefined && codigos.includes(k.code));
}

/** La Observation trae un valor de alguno de esos códigos (propio o en un componente). */
function midio(o: Observation, codigos: readonly string[]): boolean {
  if (tieneCodigo(o.code?.coding, codigos) && o.valueQuantity?.value !== undefined) return true;
  const enComponente = (o.component ?? []).some((c) => tieneCodigo(c.code?.coding, codigos) && c.valueQuantity?.value !== undefined);
  if (enComponente) return true;
  // Un panel de presión (85354-9) con algún componente con valor.
  return (
    codigos === PRESION &&
    tieneCodigo(o.code?.coding, [LOINC.bloodPressurePanel.code!]) &&
    (o.component ?? []).some((c) => c.valueQuantity?.value !== undefined)
  );
}

const TIPOS_DE_PASO = new Set(['educacion', 'conducta', 'monitoreo']);

function esAccionDeBiblioteca(t: Task): boolean {
  return (t.code?.coding ?? []).some(
    (k) => k.system === SYSTEM_ACCIONES || coincide(k.system, 'CodeSystem/pb100d-acciones') || k.code === CODIGO_TASK_ACCION,
  );
}

function codigoDeAccion(t: Task): string | undefined {
  return (t.code?.coding ?? []).find((k) => k.system === SYSTEM_ACCIONES || coincide(k.system, 'CodeSystem/pb100d-acciones'))
    ?.code;
}

/** Un paso que la persona marca: una acción de la biblioteca o un paso del catálogo para ella. */
export function esPasoMarcable(t: Task): boolean {
  if (t.intent !== 'plan' || t.status === 'entered-in-error') return false;
  if (esAccionDeBiblioteca(t)) return true;
  return (t.code?.coding ?? []).some(
    (k) => coincide(k.system, 'CodeSystem/plan-bienestar-100-dias') && TIPOS_DE_PASO.has(k.code ?? ''),
  );
}

/** El día en que la persona marcó el paso como hecho (los marcados antes de guardar la fecha: `lastModified`). */
export function diaDeMarca(t: Task): string | undefined {
  return diaEnArgentina(t.executionPeriod?.end ?? (t.status === 'completed' ? t.lastModified : undefined));
}

function diaDeAlta(t: Task): string | undefined {
  return diaEnArgentina(t.authoredOn ?? t.restriction?.period?.start ?? t.meta?.lastUpdated);
}

const TURNO_CAIDO = new Set<Appointment['status']>(['cancelled', 'noshow', 'entered-in-error']);

function actividadDeConsulta(carePlan: CarePlan | undefined, clave: ClaveCorte): CarePlanActivity | undefined {
  return (carePlan?.activity ?? []).find((a) =>
    (a.detail?.code?.coding ?? []).some((k) => coincide(k.system, SYS_SUFIJO.consultaPlanBienestar) && k.code === clave),
  );
}

interface EstadoDeConsulta {
  estado: EstadoConsultaAvance;
  /** Día (Argentina) del turno, si se conoce. */
  dia?: string;
}

function estadoDeLaConsulta(
  consulta: ConsultaInscripcion | undefined,
  appointments: Appointment[],
  actividad: CarePlanActivity | undefined,
): EstadoDeConsulta {
  const id = consulta?.appointment?.startsWith('Appointment/') ? consulta.appointment.slice('Appointment/'.length) : undefined;
  const turno = id ? appointments.find((a) => a.id === id) : undefined;
  if (turno) {
    const dia = diaEnArgentina(turno.start);
    if (turno.status === 'fulfilled') return { estado: 'realizada', ...(dia ? { dia } : {}) };
    if (TURNO_CAIDO.has(turno.status)) return { estado: 'para-agendar' };
    return { estado: 'agendada', ...(dia ? { dia } : {}) };
  }
  // Sin el turno (no se pudo leer): la actividad del plan de inscripción que marca Recepción.
  const status = actividad?.detail?.status;
  if (status === 'completed') return { estado: 'realizada' };
  if (status === 'scheduled' || consulta?.estado === 'agendada') return { estado: 'agendada' };
  return { estado: 'para-agendar' };
}

function hoyEnArgentina(): string {
  return diaEnArgentina(new Date().toISOString())!;
}

const VALOR_CONSULTA: Record<EstadoConsultaAvance, number> = { realizada: 100, agendada: 50, 'para-agendar': 0 };

/** Los tres cortes de «Tu avance» de la persona, desde su historia FHIR. */
export function avanceDelPlan(ctx: ContextoAvance): AvanceDelPlan {
  const hoy = ctx.hoy ?? hoyEnArgentina();
  const carePlans = ctx.carePlans ?? [];
  const tasks = ctx.tasks ?? [];
  const inscripcion = inscripcionDesdeFhir({ carePlans, tasks, hoy });
  const inicio = inscripcion.inicio;
  if (!inscripcion.inscripto || !inicio) return { inscripto: false, hoy, cortes: [] };
  const dia = inscripcion.dia ?? 1;

  // El día 0 del plan clínico ancla los controles de los cuestionarios, como en el
  // seguimiento del equipo; sin plan clínico, el día 1 de la inscripción (es la misma fecha
  // cuando el plan clínico arranca en la consulta inicial).
  const clinico = carePlans
    .filter((cp) => cp.status === 'active' && !esCarePlanDeInscripcion(cp) && esCarePlanDelPrograma(cp.instantiatesCanonical))
    .sort((a, b) => (b.period?.start ?? b.created ?? '').localeCompare(a.period?.start ?? a.created ?? ''))[0];
  const ancla = diaEnArgentina(clinico?.period?.start ?? clinico?.created) ?? inicio;

  const observations = (ctx.observations ?? []).filter((o) => !ESTADOS_OBS_FUERA.has(o.status));
  const respuestas = (ctx.questionnaireResponses ?? []).filter((r) => r.status !== 'entered-in-error');
  const marcables = tasks.filter(esPasoMarcable);
  const appointments = ctx.appointments ?? [];

  const cortes = CORTES_AVANCE.map((def): CorteAvance => {
    const consulta = inscripcion.consultas.find((c) => c.clave === def.clave);
    const estadoConsulta = estadoDeLaConsulta(consulta, appointments, actividadDeConsulta(inscripcion.carePlan, def.clave));
    const cerrado = estadoConsulta.estado === 'realizada';
    const cerradoEl = cerrado ? (estadoConsulta.dia ?? sumarDias(inicio, def.dia - 1)) : undefined;
    const estado: EstadoCorte = cerrado ? 'cerrado' : dia >= def.empieza ? 'en-curso' : 'futuro';
    const hasta = cerradoEl && cerradoEl < hoy ? cerradoEl : hoy;

    const obsHasta = observations.filter((o) => {
      const fecha = fechaObservacion(o);
      return registradoHasta(o, hasta) && (fecha === undefined || fecha <= hasta);
    });
    const respuestasHasta = respuestas.filter((r) => {
      const fecha = diaEnArgentina(r.authored);
      return registradoHasta(r, hasta) && (fecha === undefined || fecha <= hasta);
    });

    const componentes: ComponenteAvance[] = [];

    // Semanas del período: día de mediciones y acciones.
    if (def.semanas) {
      const [primera, ultima] = def.semanas;
      const semanas = Array.from({ length: ultima - primera + 1 }, (_, i) => {
        const n = primera + i;
        return { desde: sumarDias(inicio, 7 * (n - 1)), hasta: sumarDias(inicio, 7 * n - 1) };
      });
      const enAlgunaSemana = (fechas: string[]) =>
        semanas.filter((s) => fechas.some((f) => f >= s.desde && f <= s.hasta)).length;

      const fechasMedicion = obsHasta
        .filter((o) => midio(o, PRESION) || midio(o, PESO) || midio(o, CINTURA))
        .map(fechaObservacion)
        .filter((f): f is string => f !== undefined);
      const mediciones = enAlgunaSemana(fechasMedicion);
      componentes.push({ clave: 'mediciones', titulo: 'Día de mediciones', valor: (100 * mediciones) / semanas.length, hechos: mediciones, total: semanas.length });

      const finDelPeriodo = semanas[semanas.length - 1]!.hasta;
      const asignados = marcables.filter((t) => {
        const alta = diaDeAlta(t);
        return alta === undefined || (alta <= finDelPeriodo && alta <= hasta);
      });
      if (asignados.length > 0) {
        const fechasMarca = asignados
          .map(diaDeMarca)
          .filter((f): f is string => f !== undefined && f <= hasta);
        const acciones = enAlgunaSemana(fechasMarca);
        componentes.push({ clave: 'acciones', titulo: 'Acciones del plan', valor: (100 * acciones) / semanas.length, hechos: acciones, total: semanas.length });
      }
    }

    // Cuestionarios que la persona carga en los momentos clínicos del corte.
    let pedidos = 0;
    let respondidos = 0;
    for (const momento of def.momentos) {
      const resultado = evaluarMomento(
        {
          ...(ctx.patient ? { patient: ctx.patient } : {}),
          observations: obsHasta,
          conditions: ctx.conditions ?? [],
          questionnaireResponses: respuestasHasta,
          medicationRequests: ctx.medicationRequests ?? [],
          hoy: hasta,
          ...(momento !== 'dia-0' ? { desde: sumarDias(fechaDelControl(ancla, momento), -VENTANA_CONTROL_DIAS) } : {}),
        },
        momento,
      );
      const deLaPersona = resultado.datos.filter((d) => d.quien === 'persona');
      pedidos += deLaPersona.length;
      respondidos += deLaPersona.filter((d) => d.estado === 'cargado').length;
    }
    if (pedidos > 0) {
      componentes.push({ clave: 'cuestionarios', titulo: def.cuestionarios, valor: (100 * respondidos) / pedidos, hechos: respondidos, total: pedidos });
    }

    // Datos de salud iniciales: presión, peso y cintura de los últimos 90 días; la altura, de cuando sea.
    if (def.clave === 'inicial') {
      const desdeIniciales = sumarDias(inicio, -VIGENCIA_DIA_0_DIAS);
      const cargados = (Object.keys(CODIGOS_DATO) as DatoInicial[]).map((dato) => ({
        dato,
        ok: obsHasta.some((o) => {
          if (!midio(o, CODIGOS_DATO[dato])) return false;
          const fecha = fechaObservacion(o);
          if (fecha === undefined) return false;
          return dato === 'altura' || fecha >= desdeIniciales;
        }),
      }));
      const hechos = cargados.filter((c) => c.ok).length;
      const faltan = cargados.filter((c) => !c.ok).map((c) => c.dato);
      componentes.push({
        clave: 'datos-iniciales',
        titulo: 'Datos de salud iniciales',
        valor: (100 * hechos) / cargados.length,
        hechos,
        total: cargados.length,
        ...(faltan.length > 0 ? { faltan } : {}),
      });
    }

    componentes.push({
      clave: 'consulta',
      titulo: CONSULTA_INSCRIPCION_LABEL[def.clave],
      valor: VALOR_CONSULTA[estadoConsulta.estado],
      consulta: estadoConsulta.estado,
    });

    const puntaje = Math.round(componentes.reduce((s, c) => s + c.valor, 0) / componentes.length);
    return {
      clave: def.clave,
      dia: def.dia,
      titulo: def.titulo,
      estado,
      hasta,
      ...(cerradoEl ? { cerradoEl } : {}),
      componentes: ordenarComponentes(def.clave, componentes),
      puntaje,
    };
  });

  const actual = cortes.find((c) => c.estado === 'en-curso');
  return { inscripto: true, inicio, dia, hoy, cortes, ...(actual ? { actual } : {}) };
}

/** El orden de la tabla firmada. */
function ordenarComponentes(clave: ClaveCorte, componentes: ComponenteAvance[]): ComponenteAvance[] {
  const orden: ClaveComponente[] =
    clave === 'inicial' ? ['cuestionarios', 'datos-iniciales', 'consulta'] : ['mediciones', 'acciones', 'cuestionarios', 'consulta'];
  return [...componentes].sort((a, b) => orden.indexOf(a.clave) - orden.indexOf(b.clave));
}

// ---------------------------------------------------------------------------
// Próximo paso simple (la regla de la recuperación, B9)
// ---------------------------------------------------------------------------

export interface ProximoPaso {
  /** Una acción activa de su plan que ya hizo alguna vez (si no hizo ninguna, la más reciente). */
  accion?: { codigo: string; nombre: string };
}

const ACCION_ACTIVA = new Set<Task['status']>(['draft', 'requested', 'received', 'accepted', 'ready', 'in-progress', 'on-hold', 'completed']);

/**
 * Lo más simple para retomar, con la regla firmada de la recuperación (B9): su día de
 * mediciones y una acción activa que ya hizo alguna vez; si no hizo ninguna, la acción
 * activa más reciente. Nunca una acción de medicación ni de GLP-1.
 */
export function proximoPasoSimple(tasks: Task[]): ProximoPaso {
  const candidatas = tasks
    .filter((t) => esAccionDeBiblioteca(t) && ACCION_ACTIVA.has(t.status))
    .map((t) => {
      const codigo = codigoDeAccion(t);
      const accion = codigo ? buscarAccion(codigo) : undefined;
      return { t, accion };
    })
    .filter(
      (c): c is { t: Task; accion: NonNullable<ReturnType<typeof buscarAccion>> } =>
        c.accion !== undefined && c.accion.pilar !== 'medicacion-seguridad' && !c.accion.requiereGlp1,
    );
  const hechas = candidatas
    .map((c) => ({ ...c, marca: diaDeMarca(c.t) }))
    .filter((c) => c.marca !== undefined)
    .sort((a, b) => (b.marca as string).localeCompare(a.marca as string));
  const elegida =
    hechas[0] ?? [...candidatas].sort((a, b) => (diaDeAlta(b.t) ?? '').localeCompare(diaDeAlta(a.t) ?? ''))[0];
  return elegida ? { accion: { codigo: elegida.accion.codigo, nombre: elegida.accion.nombre } } : {};
}

// ---------------------------------------------------------------------------
// Textos para la persona (firmados en B8)
// ---------------------------------------------------------------------------

export const TITULO_AVANCE = 'Tu avance en el plan';

export const BAJADA_AVANCE =
  'Se mide en tus tres consultas: al empezar, a la mitad (día 50) y al final (día 100). Cuenta lo que hiciste, no los resultados de tus valores.';

export interface TextoCorte {
  clave: ClaveCorte;
  titulo: string;
  estado: EstadoCorte;
  /** «83 de 100», «Hasta ahora: 40 de 100» o «Empieza el día 50». */
  resumen: string;
  /** Las líneas del detalle firmado (cortes cerrados o en curso). */
  detalle: string[];
}

export interface TextosAvance {
  titulo: string;
  bajada: string;
  /** «Tu próximo corte es en la consulta del día {dia}. Hasta ahora: {puntaje} de 100.» */
  antesDelCorte?: string;
  /** El mensaje del corte en curso según su puntaje (80 o más, de 50 a 79, menos de 50). */
  mensaje?: string;
  cortes: TextoCorte[];
}

function unirConY(partes: string[]): string {
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

function enMinuscula(texto: string): string {
  return texto.charAt(0).toLowerCase() + texto.slice(1);
}

/** «responder 2 cuestionarios, tu día de mediciones cada semana y agendar la consulta del día 50». */
export function loQueFalta(corte: CorteAvance): string {
  const partes: string[] = [];
  for (const c of corte.componentes) {
    if (c.valor >= 100) continue;
    if (c.clave === 'cuestionarios') {
      const n = (c.total ?? 0) - (c.hechos ?? 0);
      partes.push(`responder ${n} ${n === 1 ? 'cuestionario' : 'cuestionarios'}`);
    } else if (c.clave === 'datos-iniciales') {
      partes.push(`cargar ${unirConY((c.faltan ?? []).map((d) => DATO_INICIAL_TEXTO[d]))}`);
    } else if (c.clave === 'mediciones') {
      partes.push('tu día de mediciones cada semana');
    } else if (c.clave === 'acciones') {
      partes.push('marcar una acción hecha cada semana');
    } else if (c.clave === 'consulta') {
      partes.push(`${c.consulta === 'agendada' ? 'ir a' : 'agendar'} la ${enMinuscula(c.titulo)}`);
    }
  }
  return unirConY(partes);
}

/** «tu día de mediciones y «Pescado dos veces por semana»». */
export function textoProximoPaso(proximo: ProximoPaso | undefined): string {
  return proximo?.accion ? `tu día de mediciones y «${proximo.accion.nombre}»` : 'tu día de mediciones';
}

/** El mensaje firmado según el puntaje del corte en curso. */
export function mensajeDelCorte(corte: CorteAvance, proximo?: ProximoPaso): string {
  if (corte.puntaje >= 80) return '¡Muy bien! Completaste casi todo lo de esta etapa.';
  if (corte.puntaje >= 50) return `Vas bien. Para completar esta etapa te falta: ${loQueFalta(corte)}.`;
  return `Cada semana es una nueva oportunidad. Lo más simple para empezar: ${textoProximoPaso(proximo)}.`;
}

function detalleDelCorte(corte: CorteAvance): string[] {
  const por = (clave: ClaveComponente) => corte.componentes.find((c) => c.clave === clave);
  const lineas: string[] = [];
  const cuestionarios = por('cuestionarios');
  if (cuestionarios) lineas.push(`Cuestionarios: ${cuestionarios.hechos} de ${cuestionarios.total}`);
  const datos = por('datos-iniciales');
  if (datos) lineas.push(`Datos de salud iniciales: ${datos.hechos} de ${datos.total}`);
  const mediciones = por('mediciones');
  if (mediciones) lineas.push(`Semanas con tu día de mediciones: ${mediciones.hechos} de ${mediciones.total}`);
  const acciones = por('acciones');
  if (acciones) lineas.push(`Semanas con alguna acción hecha: ${acciones.hechos} de ${acciones.total}`);
  const consulta = por('consulta');
  if (consulta?.consulta) lineas.push(`${consulta.titulo}: ${ESTADO_CONSULTA_AVANCE_LABEL[consulta.consulta]}`);
  return lineas;
}

/** Los textos de la tarjeta «Tu avance» (firmados en B8). */
export function textosAvance(avance: AvanceDelPlan, proximo?: ProximoPaso): TextosAvance {
  const actual = avance.actual;
  return {
    titulo: TITULO_AVANCE,
    bajada: BAJADA_AVANCE,
    ...(actual
      ? {
          antesDelCorte: `Tu próximo corte es en la consulta del día ${actual.dia}. Hasta ahora: ${actual.puntaje} de 100.`,
          mensaje: mensajeDelCorte(actual, proximo),
        }
      : {}),
    cortes: avance.cortes.map((corte) => {
      const def = CORTES_AVANCE.find((d) => d.clave === corte.clave)!;
      const resumen =
        corte.estado === 'cerrado'
          ? `${corte.puntaje} de 100`
          : corte.estado === 'en-curso'
            ? `Hasta ahora: ${corte.puntaje} de 100`
            : `Empieza el día ${def.empieza}`;
      return { clave: corte.clave, titulo: corte.titulo, estado: corte.estado, resumen, detalle: corte.estado === 'futuro' ? [] : detalleDelCorte(corte) };
    }),
  };
}

/** Lo que muestra la tarjeta del módulo en el menú del equipo. */
export function resumenAvanceEquipo(avance: AvanceDelPlan): { inscripto: boolean; corte?: { dia: number; puntaje: number; estado: 'cerrado' | 'en-curso' } } {
  const corte = avance.actual ?? [...avance.cortes].reverse().find((c) => c.estado === 'cerrado');
  if (!avance.inscripto || !corte) return { inscripto: avance.inscripto };
  return { inscripto: true, corte: { dia: corte.dia, puntaje: corte.puntaje, estado: corte.estado === 'cerrado' ? 'cerrado' : 'en-curso' } };
}
