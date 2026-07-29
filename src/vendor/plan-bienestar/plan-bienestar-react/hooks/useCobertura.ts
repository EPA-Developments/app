import { getReferenceString } from '@medplum/core';
import type { Coverage, Patient, Task } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useCallback, useEffect, useState } from 'react';
import { usePaciente, usePlanBienestarConfig } from '../PlanBienestarContext';

/** Codigo del Plan Bienestar 100 Dias dentro del CodeSystem de planes de la plataforma. */
export const PB100D_CODIGO = 'PB100D';

/** Extension por defecto que lleva el codigo de plan en el Coverage (modelo de Recepcion). */
export const PLAN_CODIGO_EXT_DEFAULT =
  'https://segundaopinionmedica.org/fhir/StructureDefinition/plan-codigo';

/** CodeSystem por defecto del tipo de Task (espeja `SYSTEM.taskTipo` de Recepcion). */
export const TASK_TIPO_SYSTEM_DEFAULT = 'https://segundaopinionmedica.org/fhir/CodeSystem/task-tipo';

/** Codigo del Task de solicitud de alta del plan, que Recepcion atiende en su bandeja. */
export const SOLICITUD_PLAN_CODIGO = 'solicitud-plan';

export interface CoberturaConfig {
  /**
   * Cuando es false (por defecto) el plan no exige cobertura: sirve para la
   * cohorte de investigacion y para instalaciones sin monetizacion.
   * Ponerlo en true activa el gate comercial.
   */
  requiereCobertura?: boolean;
  /** URL de la extension que lleva el codigo de plan en el Coverage. */
  planCodigoExtension?: string;
  /** Codigo que habilita el plan. Por defecto `PB100D`. */
  planCodigo?: string;
  /** CodeSystem del tipo de Task de la plataforma anfitriona. */
  taskTipoSystem?: string;
  /**
   * Nombre del bot que registra la solicitud (p. ej. `bw-solicitar-plan`).
   * Es el camino recomendado: bajo AccessPolicy de paciente el portal no puede
   * crear Tasks, y ejecutar el bot evita que el solicitante se falsifique.
   * Sin bot configurado el hook crea el Task directamente (instalaciones
   * permisivas o entornos de prueba).
   */
  solicitudBot?: string;
}

/** Estado comercial del paciente frente al plan. */
export type EstadoCobertura =
  /** Todavia no pidio el alta ni tiene cobertura: se le ofrece sumarse. */
  | 'sin-cobertura'
  /** Pidio el alta y Recepcion todavia no la cobro/activo. */
  | 'pendiente'
  /** Cobertura vigente: el plan funciona completo. */
  | 'vigente'
  /** Tuvo cobertura y se corto: el plan queda en solo lectura. */
  | 'vencida';

export interface Cobertura {
  cargando: boolean;
  estado: EstadoCobertura;
  /** El plan puede crearse y avanzar (alta de pasos, completar tareas). */
  habilitado: boolean;
  /**
   * El programa esta congelado pero los datos siguen visibles. Nunca se ocultan
   * biomarcadores, LE8 ni la historia: si se corta el pago se apaga el avance
   * del programa, no la informacion de salud de la paciente.
   */
  soloLectura: boolean;
  coverage?: Coverage;
  /** Solicitud de alta pendiente, si la paciente ya la pidio. */
  solicitud?: Task;
  /** Registra la solicitud de alta para que Recepcion la cobre y active. */
  solicitarAlta: () => Promise<Task | undefined>;
  refrescar: () => void;
}

/** Lee el codigo de plan de un Coverage. */
function codigoDePlan(coverage: Coverage, extensionUrl: string): string | undefined {
  return coverage.extension?.find((e) => e.url === extensionUrl)?.valueString;
}

/** Estados de Task que ya no representan una solicitud en curso. */
const CERRADOS = new Set(['completed', 'cancelled', 'rejected', 'failed', 'entered-in-error']);

/** ¿Es una solicitud de alta de ESTE plan que Recepcion todavia no resolvio? */
function esSolicitudAbierta(task: Task, taskSystem: string, codigo: string): boolean {
  const esDelPlan = task.code?.coding?.some(
    (k) => k.system === taskSystem && k.code === SOLICITUD_PLAN_CODIGO,
  );
  if (!esDelPlan) return false;
  const plan = task.input?.find((i) => i.type?.text === 'plan-codigo')?.valueString;
  if (plan && plan.toUpperCase() !== codigo.toUpperCase()) return false;
  return !CERRADOS.has(task.status);
}

/** ¿El Coverage es del plan y esta vigente hoy? */
function estaVigente(coverage: Coverage, hoy: Date): boolean {
  if (coverage.status !== 'active') return false;
  const fin = coverage.period?.end;
  if (fin && new Date(fin).getTime() < hoy.getTime()) return false;
  const inicio = coverage.period?.start;
  if (inicio && new Date(inicio).getTime() > hoy.getTime()) return false;
  return true;
}

/**
 * Gate comercial del Plan Bienestar 100 Dias.
 *
 * El entitlement vive en un `Coverage` con el codigo del plan — el mismo
 * recurso que Recepcion ya emite y factura con `Invoice`. Cambiando
 * `Coverage.payor` el mismo modelo cubre los tres esquemas de venta: la
 * paciente (B2C), la institucion (B2B) o un patrocinador (B2B2C); y la cohorte
 * de investigacion se distingue por payor sin logica extra.
 *
 * Cuando `requiereCobertura` es false el hook devuelve siempre `vigente`, de
 * modo que las instalaciones sin monetizacion no cambian de comportamiento.
 */
export function useCobertura(options: { patient?: Patient } & CoberturaConfig = {}): Cobertura {
  const medplum = useMedplum();
  const config = usePlanBienestarConfig();
  const paciente = usePaciente(options.patient);

  const requiere = options.requiereCobertura ?? config.requiereCobertura ?? false;
  const extensionUrl = options.planCodigoExtension ?? config.planCodigoExtension ?? PLAN_CODIGO_EXT_DEFAULT;
  const codigo = options.planCodigo ?? config.planCodigo ?? PB100D_CODIGO;
  const taskSystem = options.taskTipoSystem ?? config.taskTipoSystem ?? TASK_TIPO_SYSTEM_DEFAULT;
  const bot = options.solicitudBot ?? config.solicitudBot;

  const [version, setVersion] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [coverage, setCoverage] = useState<Coverage | undefined>();
  const [vencida, setVencida] = useState<Coverage | undefined>();
  const [solicitud, setSolicitud] = useState<Task | undefined>();

  const refrescar = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let cancelado = false;

    if (!requiere || !paciente?.id) {
      setCargando(false);
      return undefined;
    }

    setCargando(true);
    (async () => {
      const hoy = new Date();
      const [coberturas, solicitudes] = await Promise.all([
        medplum
          .searchResources('Coverage', { beneficiary: getReferenceString(paciente) })
          .catch(() => [] as Coverage[]),
        // El paciente solo lee sus propios Task (AccessPolicy del portal).
        medplum
          .searchResources('Task', { patient: getReferenceString(paciente) })
          .catch(() => [] as Task[]),
      ]);
      if (cancelado) return;

      const delPlan = (coberturas as Coverage[]).filter(
        (c) => codigoDePlan(c, extensionUrl)?.toUpperCase() === codigo.toUpperCase(),
      );
      setCoverage(delPlan.find((c) => estaVigente(c, hoy)));
      setVencida(delPlan.find((c) => !estaVigente(c, hoy)));
      setSolicitud((solicitudes as Task[]).find((t) => esSolicitudAbierta(t, taskSystem, codigo)));
      setCargando(false);
    })().catch(() => {
      if (!cancelado) setCargando(false);
    });

    return () => {
      cancelado = true;
    };
  }, [medplum, paciente, requiere, extensionUrl, codigo, version]);

  const solicitarAlta = useCallback(async (): Promise<Task | undefined> => {
    if (!paciente?.id) return undefined;
    // Idempotente: si ya hay una solicitud abierta, no se duplica.
    if (solicitud) return solicitud;

    const pacienteRef = getReferenceString(paciente);

    // Camino recomendado: el bot registra la solicitud del lado del servidor.
    // Bajo la AccessPolicy del portal el paciente no puede crear Tasks, y
    // ejecutar el bot evita que el solicitante se falsifique.
    if (bot) {
      await medplum.executeBot({ system: undefined, value: bot } as never, {
        pacienteRef,
        planCodigo: codigo,
      });
      medplum.invalidateSearches('Task');
      const tareas = await medplum
        .searchResources('Task', { patient: pacienteRef })
        .catch(() => [] as Task[]);
      const registrada = (tareas as Task[]).find((t) => esSolicitudAbierta(t, taskSystem, codigo));
      setSolicitud(registrada);
      return registrada;
    }

    const creada = await medplum.createResource<Task>({
      resourceType: 'Task',
      status: 'requested',
      intent: 'proposal',
      authoredOn: new Date().toISOString(),
      for: { reference: pacienteRef },
      requester: { reference: pacienteRef },
      code: {
        coding: [{ system: taskSystem, code: SOLICITUD_PLAN_CODIGO, display: 'Solicitud de alta de plan' }],
        text: 'Plan Bienestar 100 Días',
      },
      input: [{ type: { text: 'plan-codigo' }, valueString: codigo }],
    });
    medplum.invalidateSearches('Task');
    setSolicitud(creada);
    return creada;
  }, [medplum, paciente, codigo, taskSystem, bot, solicitud]);

  // Sin gate comercial: el plan siempre esta habilitado.
  if (!requiere) {
    return {
      cargando: false,
      estado: 'vigente',
      habilitado: true,
      soloLectura: false,
      solicitarAlta,
      refrescar,
    };
  }

  const estado: EstadoCobertura = coverage
    ? 'vigente'
    : solicitud
      ? 'pendiente'
      : vencida
        ? 'vencida'
        : 'sin-cobertura';

  return {
    cargando,
    estado,
    habilitado: estado === 'vigente',
    soloLectura: estado === 'vencida',
    coverage,
    solicitud,
    solicitarAlta,
    refrescar,
  };
}
