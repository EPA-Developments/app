import { getReferenceString } from '@medplum/core';
import type { Coverage, Patient, ServiceRequest } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useCallback, useEffect, useState } from 'react';
import { usePaciente, usePlanBienestarConfig } from '../PlanBienestarContext';

/** Codigo del Plan Bienestar 100 Dias dentro del CodeSystem de planes de la plataforma. */
export const PB100D_CODIGO = 'PB100D';

/** Extension por defecto que lleva el codigo de plan en el Coverage (modelo de Recepcion). */
export const PLAN_CODIGO_EXT_DEFAULT =
  'https://segundaopinionmedica.org/fhir/StructureDefinition/plan-codigo';

/** CodeSystem del servicio solicitado, usado al pedir el alta desde la app del paciente. */
export const PB100D_SERVICE_SYSTEM = 'https://epabienestar.com/fhir/CodeSystem/servicios';

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
  solicitud?: ServiceRequest;
  /** Crea la solicitud de alta para que Recepcion la cobre y active. */
  solicitarAlta: () => Promise<ServiceRequest | undefined>;
  refrescar: () => void;
}

/** Lee el codigo de plan de un Coverage. */
function codigoDePlan(coverage: Coverage, extensionUrl: string): string | undefined {
  return coverage.extension?.find((e) => e.url === extensionUrl)?.valueString;
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

  const [version, setVersion] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [coverage, setCoverage] = useState<Coverage | undefined>();
  const [vencida, setVencida] = useState<Coverage | undefined>();
  const [solicitud, setSolicitud] = useState<ServiceRequest | undefined>();

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
        medplum
          .searchResources('ServiceRequest', { subject: getReferenceString(paciente) })
          .catch(() => [] as ServiceRequest[]),
      ]);
      if (cancelado) return;

      const delPlan = (coberturas as Coverage[]).filter(
        (c) => codigoDePlan(c, extensionUrl)?.toUpperCase() === codigo.toUpperCase(),
      );
      setCoverage(delPlan.find((c) => estaVigente(c, hoy)));
      setVencida(delPlan.find((c) => !estaVigente(c, hoy)));
      setSolicitud(
        (solicitudes as ServiceRequest[]).find(
          (s) =>
            s.code?.coding?.some((k) => k.system === PB100D_SERVICE_SYSTEM && k.code === codigo) &&
            s.status !== 'completed' &&
            s.status !== 'revoked',
        ),
      );
      setCargando(false);
    })().catch(() => {
      if (!cancelado) setCargando(false);
    });

    return () => {
      cancelado = true;
    };
  }, [medplum, paciente, requiere, extensionUrl, codigo, version]);

  const solicitarAlta = useCallback(async (): Promise<ServiceRequest | undefined> => {
    if (!paciente?.id) return undefined;
    // Idempotente: si ya hay una solicitud abierta, no se duplica.
    if (solicitud) return solicitud;
    const creada = await medplum.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      status: 'draft',
      intent: 'order',
      subject: { reference: getReferenceString(paciente) },
      authoredOn: new Date().toISOString(),
      code: {
        coding: [{ system: PB100D_SERVICE_SYSTEM, code: codigo, display: 'Plan Bienestar 100 Días' }],
        text: 'Plan Bienestar 100 Días',
      },
    });
    medplum.invalidateSearches('ServiceRequest');
    setSolicitud(creada);
    return creada;
  }, [medplum, paciente, codigo, solicitud]);

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
