import {
  EXT_SUFIJO,
  buscarExtension,
  entradaLe8DesdeFhir,
  esCarePlanDelPrograma,
  puntajeLe8,
  respuestaA100Dias,
  respuestaLe8,
  respuestaPesoCinturaDesdeFhir,
  type EstadioCkm,
  type RespuestaA100Dias,
  type ResultadoLe8,
} from '@epa/careplan-menopausia';
import { getReferenceString } from '@medplum/core';
import type { CarePlan, Condition, MedicationRequest, Observation, Patient, QuestionnaireResponse } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useCallback, useEffect, useState } from 'react';
import { usePaciente } from '../PlanBienestarContext';

export interface UseTableroLe8Options {
  /** Patient override; defaults to provider config or the logged-in profile. */
  patient?: Patient;
  /** The active CarePlan, if the caller already has it (saves a search). */
  carePlan?: CarePlan;
}

export interface TableroLe8 {
  cargando: boolean;
  /** LE8 score today (8 domains, total, what is missing). */
  le8?: ResultadoLe8;
  /** LE8 score at day 0 (resources dated up to plan start + 14 days), when there is a plan. */
  le8Inicial?: ResultadoLe8;
  /** 100-day response by the signed rule: weight/waist (stages 1-4) or LE8 (stage 0). */
  respuesta?: RespuestaA100Dias;
  /** Catalog stage of the plan (from the CarePlan extension); undefined for menopause plans. */
  estadio?: EstadioCkm;
  /** ISO start of the plan and the current plan day (1..). */
  inicio?: string;
  dia?: number;
  refrescar: () => void;
}

const DIA_MS = 24 * 60 * 60 * 1000;
/** Window after the plan start in which a measurement still counts as "day 0". */
const VENTANA_BASAL_DIAS = 14;

function sumarDias(iso: string, dias: number): string {
  return new Date(Date.parse(iso) + dias * DIA_MS).toISOString().slice(0, 10);
}

/** Stage written by the PB100D bundle on the CarePlan (`catalogo-estadios` extension). */
export function estadioDelCarePlan(carePlan: CarePlan | undefined): EstadioCkm | undefined {
  const code = buscarExtension(carePlan?.extension, EXT_SUFIJO.catalogoEstadios)?.valueCode;
  return code === '0' || code === '1' || code === '2' || code === '3' || code === '4' ? code : undefined;
}

/**
 * The person's dashboard: Life's Essential 8 today, at day 0 and the 100-day
 * response, all computed client-side from the patient's FHIR record (latest
 * observations, active conditions and medication, LE8 questionnaire responses).
 * LE8 is what the person sees move; the CKM stage stays with the physician.
 */
export function useTableroLe8(options: UseTableroLe8Options = {}): TableroLe8 {
  const medplum = useMedplum();
  const paciente = usePaciente(options.patient);
  const [version, setVersion] = useState(0);
  const [estado, setEstado] = useState<Omit<TableroLe8, 'refrescar'>>({ cargando: true });

  const refrescar = useCallback(() => setVersion((current) => current + 1), []);
  const planDado = options.carePlan;

  useEffect(() => {
    let cancelado = false;
    if (!paciente?.id) {
      setEstado({ cargando: false });
      return undefined;
    }
    setEstado((previo) => ({ ...previo, cargando: true }));
    (async () => {
      const ref = getReferenceString(paciente);
      const buscar = <T,>(tipo: string, params: Record<string, string>): Promise<T[]> =>
        (medplum.searchResources(tipo as never, { subject: ref, ...params }) as Promise<T[]>).catch(() => [] as T[]);
      const [observations, conditions, medicationRequests, questionnaireResponses, planes] = await Promise.all([
        buscar<Observation>('Observation', { _count: '200' }),
        buscar<Condition>('Condition', { _count: '100' }),
        buscar<MedicationRequest>('MedicationRequest', { _count: '100' }),
        buscar<QuestionnaireResponse>('QuestionnaireResponse', { _count: '100' }),
        planDado ? Promise.resolve([planDado]) : buscar<CarePlan>('CarePlan', { status: 'active' }),
      ]);
      if (cancelado) return;

      const carePlan = planes
        .filter((plan) => esCarePlanDelPrograma(plan.instantiatesCanonical))
        .sort((a, b) => (b.period?.start ?? b.created ?? '').localeCompare(a.period?.start ?? a.created ?? ''))[0];
      const historia = { patient: paciente, observations, conditions, medicationRequests, questionnaireResponses };
      const le8 = puntajeLe8(entradaLe8DesdeFhir(historia));

      const inicio = carePlan?.period?.start ?? carePlan?.created;
      if (!inicio || !Number.isFinite(Date.parse(inicio))) {
        setEstado({ cargando: false, le8 });
        return;
      }
      const estadio = estadioDelCarePlan(carePlan);
      const le8Inicial = puntajeLe8(entradaLe8DesdeFhir({ ...historia, hasta: sumarDias(inicio, VENTANA_BASAL_DIAS) }));
      const respuesta = respuestaA100Dias({
        estadio: estadio ?? '1',
        pesoCintura: respuestaPesoCinturaDesdeFhir(observations, inicio),
        le8: respuestaLe8(le8Inicial, le8),
      });
      const dia = Math.max(1, Math.floor((Date.now() - Date.parse(inicio)) / DIA_MS) + 1);
      setEstado({ cargando: false, le8, le8Inicial, respuesta, estadio, inicio, dia });
    })().catch(() => {
      if (!cancelado) setEstado({ cargando: false });
    });
    return () => {
      cancelado = true;
    };
  }, [medplum, paciente, planDado, version]);

  return { ...estado, refrescar };
}
