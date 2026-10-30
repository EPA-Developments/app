import {
  ESTADIO_CKM,
  LOINC_MEDICIONES_AVANCE,
  SYSTEM,
  avanceDelPlan,
  esTaskDeConsultaInscripcion,
  leerConsultaInscripcion,
  proximoPasoSimple,
  textosAvance,
  unirPorId,
  type AvanceDelPlan,
  type ProximoPaso,
  type TextosAvance,
} from '@epa/careplan-menopausia';
import { getReferenceString } from '@medplum/core';
import type {
  Appointment,
  CarePlan,
  Condition,
  Observation,
  Patient,
  QuestionnaireResponse,
  Reference,
  Task,
} from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useCallback, useEffect, useState } from 'react';
import { usePaciente } from '../PlanBienestarContext';

export interface UseAvanceDelPlanOptions {
  patient?: Patient;
  /** Hoy (AAAA-MM-DD, Argentina). Default: hoy en Argentina. */
  hoy?: string;
}

export interface AvanceDelPlanCargado {
  cargando: boolean;
  avance?: AvanceDelPlan;
  proximo?: ProximoPaso;
  textos?: TextosAvance;
  refrescar: () => void;
}

/**
 * «Tu avance» de la persona (B7 y B8, firmadas el 30/10/2026): carga su historia y la
 * evalúa con `avanceDelPlan` del core, la misma cuenta que ve el equipo en la ficha.
 * Carga la inscripción de Recepción y sus consultas (con los turnos), los pasos que ella
 * marca, sus mediciones de presión, peso, cintura y altura, sus cuestionarios y el
 * estadío. Cada búsqueda tolera un error: se calcula con lo que se pudo leer.
 */
export function useAvanceDelPlan(options: UseAvanceDelPlanOptions = {}): AvanceDelPlanCargado {
  const medplum = useMedplum();
  const paciente = usePaciente(options.patient);
  const { hoy } = options;
  const [version, setVersion] = useState(0);
  const [estado, setEstado] = useState<Omit<AvanceDelPlanCargado, 'refrescar'>>({ cargando: true });

  const refrescar = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let cancelado = false;
    if (!paciente?.id) {
      setEstado({ cargando: false });
      return undefined;
    }
    setEstado((previo) => ({ ...previo, cargando: true }));
    (async () => {
      const ref = getReferenceString(paciente) as string;
      const buscar = <T,>(tipo: string, params: Record<string, string>): Promise<T[]> =>
        (medplum.searchResources(tipo as never, params) as Promise<T[]>).catch(() => [] as T[]);
      const [carePlans, consultas, pasos, lecturas, estadios, mediciones, questionnaireResponses, conditions] = await Promise.all([
        buscar<CarePlan>('CarePlan', { subject: ref, status: 'active', _count: '50' }),
        buscar<Task>('Task', { patient: ref, code: 'agendar-consulta-pb100d', _count: '20' }),
        buscar<Task>('Task', { patient: ref, intent: 'plan', _count: '500' }),
        buscar<Observation>('Observation', { subject: ref, _sort: '-date', _count: '200' }),
        buscar<Observation>('Observation', { subject: ref, code: `${SYSTEM.epa}|${ESTADIO_CKM.code}`, _sort: '-date', _count: '50' }),
        // Las mediciones aparte: en 100 días pueden quedar fuera de las 200 más recientes.
        buscar<Observation>('Observation', {
          subject: ref,
          code: LOINC_MEDICIONES_AVANCE.map((code) => `http://loinc.org|${code}`).join(','),
          _sort: '-date',
          _count: '1000',
        }),
        buscar<QuestionnaireResponse>('QuestionnaireResponse', { subject: ref, _count: '200' }),
        buscar<Condition>('Condition', { subject: ref, _count: '200' }),
      ]);
      const deConsulta = consultas.filter(esTaskDeConsultaInscripcion);
      const appointments = (
        await Promise.all(
          deConsulta
            .map((t) => leerConsultaInscripcion(t)?.appointment)
            .filter((r): r is string => r !== undefined && r.startsWith('Appointment/'))
            .map((reference) => medplum.readReference({ reference } as Reference<Appointment>).catch(() => undefined)),
        )
      ).filter((a): a is NonNullable<typeof a> => a !== undefined);
      if (cancelado) return;

      const tasks = unirPorId(deConsulta, pasos);
      const avance = avanceDelPlan({
        patient: paciente,
        carePlans,
        tasks,
        observations: unirPorId(lecturas, estadios, mediciones),
        questionnaireResponses,
        conditions,
        appointments,
        ...(hoy ? { hoy } : {}),
      });
      const proximo = proximoPasoSimple(tasks);
      setEstado({ cargando: false, avance, proximo, textos: textosAvance(avance, proximo) });
    })().catch(() => {
      if (!cancelado) setEstado({ cargando: false });
    });
    return () => {
      cancelado = true;
    };
  }, [medplum, paciente, hoy, version]);

  return { ...estado, refrescar };
}
