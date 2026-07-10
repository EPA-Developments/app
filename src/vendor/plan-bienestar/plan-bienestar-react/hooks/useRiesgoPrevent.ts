import {
  bandaAscvd,
  calculatePrevent,
  extractPreventInput,
  PREVENT_CITATION,
  type PreventBanda,
  type PreventResult,
} from '@epa/careplan-menopausia';
import { getReferenceString } from '@medplum/core';
import type { Condition, Observation, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useCallback, useEffect, useState } from 'react';
import { usePaciente } from '../PlanBienestarContext';

export interface RiesgoPrevent {
  cargando: boolean;
  /** Undefined when cholesterol (or other required data) is missing. */
  resultado?: PreventResult;
  /** AHA risk band from the 10-year ASCVD estimate. */
  banda?: PreventBanda;
  /** Missing data (Spanish) preventing or limiting the estimate. */
  faltantes: string[];
  citacion: string;
  refrescar: () => void;
}

export interface UseRiesgoPreventOptions {
  patient?: Patient;
  /** Statin use (no standard Observation). */
  usaEstatina?: boolean;
}

/**
 * Computes the AHA PREVENT risk client-side from the patient's FHIR record.
 * The base model needs cholesterol (total+HDL); until it is loaded, `resultado`
 * is undefined and `faltantes` lists what to add.
 */
export function useRiesgoPrevent(options: UseRiesgoPreventOptions = {}): RiesgoPrevent {
  const medplum = useMedplum();
  const paciente = usePaciente(options.patient);
  const [version, setVersion] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [resultado, setResultado] = useState<PreventResult | undefined>(undefined);
  const [faltantes, setFaltantes] = useState<string[]>([]);

  const refrescar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelado = false;
    if (!paciente?.id) {
      setCargando(false);
      setResultado(undefined);
      setFaltantes(['No hay un paciente en sesion.']);
      return undefined;
    }
    setCargando(true);
    const referencia = getReferenceString(paciente);
    Promise.all([
      medplum.searchResources('Observation', { subject: referencia, _count: '200' }) as Promise<Observation[]>,
      medplum.searchResources('Condition', { subject: referencia, _count: '100' }) as Promise<Condition[]>,
    ])
      .then(([observations, conditions]) => {
        if (cancelado) return;
        const input = extractPreventInput({
          patient: paciente,
          observations,
          conditions,
          usaEstatina: options.usaEstatina,
        });
        const r = calculatePrevent(input);
        setResultado(r);
        setFaltantes(r?.faltantes ?? ['colesterol total y HDL']);
        setCargando(false);
      })
      .catch(() => {
        if (!cancelado) {
          setResultado(undefined);
          setCargando(false);
        }
      });
    return () => {
      cancelado = true;
    };
  }, [medplum, paciente, options.usaEstatina, version]);

  return {
    cargando,
    resultado,
    banda: resultado ? bandaAscvd(resultado.diezAnios.ascvd) : undefined,
    faltantes,
    citacion: PREVENT_CITATION,
    refrescar,
  };
}
