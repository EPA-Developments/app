import type { ReactElement } from 'react';
import type { Patient } from '@medplum/fhirtypes';
import { Route, Routes } from 'react-router';
import { CuestionarioDelPlan } from './pages/CuestionarioDelPlan';
import { MetasDelPlan } from './pages/MetasDelPlan';
import { PasosDelPlan } from './pages/PasosDelPlan';

export interface PlanBienestarRoutesProps {
  /** Patient override; defaults to provider config or the logged-in profile. */
  patient?: Patient;
  /** Path where this component is mounted (used to build internal links). */
  basePath?: string;
}

/**
 * Plan screens, ready to mount under the host router:
 *
 * ```tsx
 * <Route path="/care-plan/plan-100-dias/*" element={<PlanBienestarRoutes />} />
 * ```
 *
 * Index: pasos del plan · `metas`: goals · `cuestionario/:taskId`: screening.
 */
export function PlanBienestarRoutes(props: PlanBienestarRoutesProps): ReactElement {
  return (
    <Routes>
      <Route index element={<PasosDelPlan patient={props.patient} basePath={props.basePath} />} />
      <Route path="metas" element={<MetasDelPlan patient={props.patient} basePath={props.basePath} />} />
      <Route
        path="cuestionario/:taskId"
        element={<CuestionarioDelPlan patient={props.patient} basePath={props.basePath} />}
      />
    </Routes>
  );
}
