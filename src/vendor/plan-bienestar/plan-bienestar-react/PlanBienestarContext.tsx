import type { Patient } from '@medplum/fhirtypes';
import { useMedplumProfile } from '@medplum/react';
import { createContext, useContext, type ReactElement, type ReactNode } from 'react';

export interface PlanBienestarConfig {
  /**
   * Patient the module works with. When omitted, falls back to the logged-in
   * profile (the usual case in patient portals like FooMedical).
   */
  patient?: Patient;
  /** Base path where `PlanBienestarRoutes` is mounted. */
  basePath?: string;
}

export const DEFAULT_BASE_PATH = '/care-plan/plan-100-dias';

const PlanBienestarReactContext = createContext<PlanBienestarConfig>({});

/**
 * Optional configuration wrapper. Host apps only need it to override the
 * patient (e.g. professional portals) or the mount path.
 */
export function PlanBienestarProvider(props: PlanBienestarConfig & { children: ReactNode }): ReactElement {
  const { children, ...config } = props;
  return <PlanBienestarReactContext.Provider value={config}>{children}</PlanBienestarReactContext.Provider>;
}

export function usePlanBienestarConfig(): PlanBienestarConfig {
  return useContext(PlanBienestarReactContext);
}

/**
 * Resolves the working Patient: explicit prop > provider config > logged-in
 * profile (only when the profile is a Patient).
 */
export function usePaciente(explicit?: Patient): Patient | undefined {
  const config = usePlanBienestarConfig();
  const profile = useMedplumProfile();
  if (explicit) return explicit;
  if (config.patient) return config.patient;
  return profile?.resourceType === 'Patient' ? profile : undefined;
}

export function useBasePath(explicit?: string): string {
  const config = usePlanBienestarConfig();
  return explicit ?? config.basePath ?? DEFAULT_BASE_PATH;
}
