import type { CkmStage } from '../ckm/types.js';
import { MOMENTO_LABEL } from '../model/catalogo.js';
import type { ResultadoDia0 } from './dia0.js';
import { ESTADO_PLAN_CLINICO_LABEL, type EstadoPlanClinico } from './inscripcion.js';
import type { MomentoControl } from './momentos.js';

/**
 * El menú del equipo para el Plan Bienestar 100 Días: un registro de módulos, no una
 * lista fija de pantallas. Cada módulo declara para qué rol es y cuándo aplica a una
 * persona; el menú se arma solo por datos, con la misma idea del portal (la tarjeta
 * aparece cuando corresponde).
 *
 * Roles (confirmados el 28/09/2026):
 *  - `operativo`: Recepción. Ve lo operativo del plan y nunca el detalle clínico.
 *  - `clinico`: el equipo médico (Director Médico y quien defina SOM).
 *
 * `slice` es el orden de construcción acordado; un módulo con `implementado: false`
 * se muestra deshabilitado, para que el menú completo se vea desde el primer día.
 */
export type RolEquipo = 'operativo' | 'clinico';

export const ROL_EQUIPO_LABEL: Record<RolEquipo, string> = {
  operativo: 'Recepción',
  clinico: 'Equipo médico',
};

export type ClaveModulo =
  | 'inscribir'
  | 'dia-0'
  | 'validar-estadio'
  | 'condiciones'
  | 'eventos'
  | 'alertas'
  | 'acciones'
  | 'seguimiento'
  | 'material';

/** Lo que el registro necesita saber de la persona para decidir qué módulos aplican. */
export interface ContextoEquipo {
  /** Tiene un CarePlan activo del programa. */
  tienePlan: boolean;
  /** Estadío validado por el equipo, si lo hay. */
  estadioValidado?: CkmStage;
  /** Estadío que estima el sistema con los datos de hoy, si alcanzan. */
  estadioEstimado?: CkmStage;
  /** El día 0 evaluado (`evaluarDia0`). */
  dia0?: ResultadoDia0;
  /** Condiciones del catálogo registradas por el equipo (vigentes). */
  condicionesRegistradas?: number;
  /** Eventos vigentes. */
  eventosActivos?: number;
  /** El plan activo no refleja el perfil de hoy: hay que recalcularlo. */
  planDesactualizado?: boolean;
  /** Alertas y derivaciones de la persona (`resumenAlertas`). */
  alertas?: { nuevas: number; abiertas: number };
  /** Acciones de la biblioteca activas. */
  accionesActivas?: number;
  /** El seguimiento del plan activo (`seguimientoDelPlan`). */
  seguimiento?: { dia: number; momento: MomentoControl; pendientes: number; respuesta?: string };
  /** La inscripción al programa que hace Recepción (`inscripcionDesdeFhir`). */
  inscripcion?: { inscripto: boolean; porAgendar: number };
  /** El plan clínico (`estadoPlanClinico`). */
  planClinico?: { estado: EstadoPlanClinico; dia?: number; pasos?: { total: number; completados: number } };
}

export interface EstadoModulo {
  /** Se ofrece a esta persona en este momento. */
  visible: boolean;
  /** Texto corto de estado para el menú ("3 de 12 cargados", "Estadío 2 validado"). */
  estado?: string;
  /** Hay algo por hacer (el menú lo destaca). */
  pendiente?: boolean;
}

export interface ModuloEquipo {
  clave: ClaveModulo;
  titulo: string;
  descripcion: string;
  roles: readonly RolEquipo[];
  slice: number;
  implementado: boolean;
  aplica: (ctx: ContextoEquipo) => EstadoModulo;
}

export const MODULOS_EQUIPO: readonly ModuloEquipo[] = Object.freeze([
  {
    clave: 'inscribir',
    titulo: 'Inscribir y estado del plan',
    descripcion: 'La inscripción (Recepción) con sus tres consultas programadas, y el plan clínico: empezarlo, en qué día va, cerrarlo.',
    roles: ['operativo', 'clinico'],
    slice: 4,
    implementado: true,
    aplica: (ctx) => {
      const i = ctx.inscripcion;
      const p = ctx.planClinico;
      if (!i && !p) return { visible: true, estado: ctx.tienePlan ? 'Plan activo' : 'Sin plan' };
      const partes: string[] = [];
      if (i) partes.push(i.inscripto ? `Inscripción hecha${i.porAgendar ? ` · ${i.porAgendar} por agendar` : ''}` : 'Sin inscripción');
      if (p) {
        partes.push(p.estado === 'activo' && p.dia !== undefined ? `plan clínico día ${p.dia}` : ESTADO_PLAN_CLINICO_LABEL[p.estado].toLowerCase());
      }
      const pendiente = Boolean(i && (!i.inscripto || i.porAgendar > 0)) || Boolean(i?.inscripto && p?.estado === 'sin-plan');
      return { visible: true, estado: partes.join(' · '), ...(pendiente ? { pendiente: true } : {}) };
    },
  },
  {
    clave: 'dia-0',
    titulo: 'Día 0: qué falta',
    descripcion: 'Los datos y cuestionarios del día 0 según el catálogo firmado, y quién los carga.',
    roles: ['operativo', 'clinico'],
    slice: 1,
    implementado: true,
    aplica: (ctx) => {
      const d = ctx.dia0;
      if (!d) return { visible: true };
      return {
        visible: true,
        estado: d.completo ? 'Completo' : `${d.cargados} de ${d.datos.length} cargados`,
        pendiente: !d.completo,
      };
    },
  },
  {
    clave: 'validar-estadio',
    titulo: 'Validar estadío',
    descripcion: 'El estadío CKM que estima el sistema, con su evidencia, para confirmarlo o corregirlo.',
    roles: ['clinico'],
    slice: 1,
    implementado: true,
    aplica: (ctx) => {
      if (ctx.estadioValidado !== undefined) {
        return { visible: true, estado: `Estadío ${ctx.estadioValidado} validado` };
      }
      return {
        visible: true,
        estado: ctx.estadioEstimado !== undefined ? `Estimado ${ctx.estadioEstimado}, sin validar` : 'Faltan datos para estimar',
        pendiente: true,
      };
    },
  },
  {
    clave: 'condiciones',
    titulo: 'Condiciones del catálogo',
    descripcion: 'Lo que no sale de un número: menopausia, GLP-1, medicación por clase, potenciadores, imágenes, fragilidad y los instrumentos del equipo.',
    roles: ['clinico'],
    slice: 2,
    implementado: true,
    aplica: (ctx) => {
      const n = ctx.condicionesRegistradas ?? 0;
      return {
        visible: true,
        estado: `${n} ${n === 1 ? 'registrada' : 'registradas'}${ctx.planDesactualizado ? ' · plan por recalcular' : ''}`,
        ...(ctx.planDesactualizado ? { pendiente: true } : {}),
      };
    },
  },
  {
    clave: 'eventos',
    titulo: 'Eventos',
    descripcion: 'Inicio de RASi, MRA o SGLT2i, procedimientos y síntomas nuevos: activan los ítems de momento evento mientras están vigentes.',
    roles: ['clinico'],
    slice: 2,
    implementado: true,
    aplica: (ctx) => {
      const n = ctx.eventosActivos ?? 0;
      return {
        visible: ctx.tienePlan || ctx.estadioValidado !== undefined || n > 0,
        estado: `${n} ${n === 1 ? 'activo' : 'activos'}`,
        ...(ctx.planDesactualizado && n > 0 ? { pendiente: true } : {}),
      };
    },
  },
  {
    clave: 'alertas',
    titulo: 'Alertas y derivaciones',
    descripcion: 'Las del catálogo firmado para esta persona, con COR/LOE. Derivar crea la tarea que conoce la agenda.',
    roles: ['clinico'],
    slice: 3,
    implementado: true,
    aplica: (ctx) => {
      const a = ctx.alertas;
      return {
        visible: ctx.estadioValidado !== undefined,
        ...(a ? { estado: `${a.nuevas} ${a.nuevas === 1 ? 'nueva' : 'nuevas'} · ${a.abiertas} en curso` } : {}),
        ...(a && a.nuevas > 0 ? { pendiente: true } : {}),
      };
    },
  },
  {
    clave: 'acciones',
    titulo: 'Acciones de la biblioteca',
    descripcion: 'Activar acciones del Anexo C por estadío y condición. Las del Anexo C bis, después de la firma.',
    roles: ['clinico'],
    slice: 3,
    implementado: true,
    aplica: (ctx) => {
      const n = ctx.accionesActivas ?? 0;
      return { visible: ctx.tienePlan, estado: `${n} ${n === 1 ? 'activa' : 'activas'}` };
    },
  },
  {
    clave: 'seguimiento',
    titulo: 'Seguimiento',
    descripcion: 'El tablero LE8 y la respuesta a 100 días vistos desde el equipo: días 30, 60 y 100.',
    roles: ['clinico'],
    slice: 3,
    implementado: true,
    aplica: (ctx) => {
      const s = ctx.seguimiento;
      if (!s) return { visible: ctx.tienePlan };
      const partes = [`Día ${s.dia}`, MOMENTO_LABEL[s.momento]];
      if (s.pendientes > 0) partes.push(`${s.pendientes} por cargar`);
      if (s.respuesta) partes.push(s.respuesta);
      return { visible: ctx.tienePlan, estado: partes.join(' · '), ...(s.pendientes > 0 ? { pendiente: true } : {}) };
    },
  },
  {
    clave: 'material',
    titulo: 'Material para el paciente',
    descripcion: 'El aviso por WhatsApp con los próximos pasos y los pasos del plan para imprimir.',
    roles: ['operativo', 'clinico'],
    slice: 4,
    implementado: true,
    aplica: (ctx) => {
      const pasos = ctx.planClinico?.pasos;
      return { visible: ctx.tienePlan, ...(pasos ? { estado: `${pasos.total} pasos · ${pasos.completados} completados` } : {}) };
    },
  },
]);

export interface ModuloDelMenu extends ModuloEquipo, EstadoModulo {}

/**
 * El menú de un rol para una persona: los módulos del rol que aplican, en el orden del
 * registro. Los no implementados quedan (deshabilitados) para que se vea el camino.
 */
export function menuEquipo(rol: RolEquipo, ctx: ContextoEquipo): ModuloDelMenu[] {
  return MODULOS_EQUIPO.filter((m) => m.roles.includes(rol))
    .map((m) => ({ ...m, ...m.aplica(ctx) }))
    .filter((m) => m.visible);
}

export function moduloPorClave(clave: ClaveModulo): ModuloEquipo {
  const modulo = MODULOS_EQUIPO.find((m) => m.clave === clave);
  if (!modulo) throw new Error(`Módulo desconocido: ${clave}`);
  return modulo;
}
