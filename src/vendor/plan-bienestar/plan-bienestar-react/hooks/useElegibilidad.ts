import { MENOPAUSE_PLAN_DEFINITION_URL, evaluateEligibility } from '@epa/careplan-menopausia';
import type { Patient, PlanDefinition } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useCallback, useEffect, useState } from 'react';
import { usePaciente } from '../PlanBienestarContext';

export interface UseElegibilidadOptions {
  /** Patient override; defaults to provider config or the logged-in profile. */
  patient?: Patient;
  /** Canonical URL of the PlanDefinition to check. Defaults to the menopause plan. */
  planDefinitionUrl?: string;
}

export interface Elegibilidad {
  /** True while the PlanDefinition search is in flight. */
  cargando: boolean;
  /** True when an active PlanDefinition exists and the patient matches its useContext. */
  elegible: boolean;
  /** The active PlanDefinition found on the server, if any. */
  planDefinition?: PlanDefinition;
  /** The patient the evaluation ran against. */
  paciente?: Patient;
  /** Spanish reasons when not eligible (empty while loading or when eligible). */
  motivos: string[];
  /** Age computed from Patient.birthDate. */
  edad?: number;
  /** Re-runs the server lookup (e.g. after an admin toggles the plan). */
  refrescar: () => void;
}

/**
 * The self-gating rule of the module: looks up the ACTIVE PlanDefinition on
 * the FHIR server and evaluates its `useContext` (gender/age) against the
 * patient. The rule lives server-side — editing the PlanDefinition changes
 * who sees the plan in every host app, with no redeploy.
 */
export function useElegibilidad(options: UseElegibilidadOptions = {}): Elegibilidad {
  const medplum = useMedplum();
  const paciente = usePaciente(options.patient);
  const url = options.planDefinitionUrl ?? MENOPAUSE_PLAN_DEFINITION_URL;
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<Omit<Elegibilidad, 'refrescar' | 'paciente'>>({
    cargando: true,
    elegible: false,
    motivos: [],
  });

  const refrescar = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let cancelado = false;

    if (!paciente) {
      setState({ cargando: false, elegible: false, motivos: ['No hay un paciente en sesion.'] });
      return undefined;
    }

    setState((previous) => ({ ...previous, cargando: true }));
    medplum
      .searchResources('PlanDefinition', { url, status: 'active' })
      .then((definiciones) => {
        if (cancelado) return;
        const planDefinition = definiciones[0];
        if (!planDefinition) {
          setState({
            cargando: false,
            elegible: false,
            motivos: ['El plan no esta disponible por el momento.'],
          });
          return;
        }
        const resultado = evaluateEligibility(paciente, planDefinition);
        setState({
          cargando: false,
          elegible: resultado.eligible,
          planDefinition,
          motivos: resultado.reasons,
          edad: resultado.age,
        });
      })
      .catch(() => {
        if (cancelado) return;
        setState({ cargando: false, elegible: false, motivos: ['No se pudo consultar el plan.'] });
      });

    return () => {
      cancelado = true;
    };
  }, [medplum, paciente, url, version]);

  return { ...state, paciente, refrescar };
}
