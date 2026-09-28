import type { ReactElement } from 'react';
import type { Patient } from '@medplum/fhirtypes';
import { Route, Routes } from 'react-router';
import { CargarDatosCkm } from './components/CargarDatosCkm';
import { TableroLe8 } from './components/TableroLe8';
import { CuestionarioBaseline } from './pages/CuestionarioBaseline';
import { CuestionarioDelPlan } from './pages/CuestionarioDelPlan';
import { MetasDelPlan } from './pages/MetasDelPlan';
import { PasosDelPlan } from './pages/PasosDelPlan';

export interface PlanBienestarRoutesProps {
  /** Patient override; defaults to provider config or the logged-in profile. */
  patient?: Patient;
  /** Path where this component is mounted (used to build internal links). */
  basePath?: string;
  /** Host route with the LE8 questionnaires, linked from the dashboard. */
  rutaCuestionarios?: string;
}

/**
 * Plan screens, ready to mount under the host router:
 *
 * ```tsx
 * <Route path="/care-plan/plan-100-dias/*" element={<PlanBienestarRoutes />} />
 * ```
 *
 * Index: pasos del plan · `metas`: goals · `tablero`: LE8 dashboard and 100-day
 * response · `mis-datos`: CKM · `contanos`: cuestionario inicial ·
 * `cuestionario/:taskId`: screening de un paso.
 */
export function PlanBienestarRoutes(props: PlanBienestarRoutesProps): ReactElement {
  return (
    <Routes>
      <Route index element={<PasosDelPlan patient={props.patient} basePath={props.basePath} />} />
      <Route path="metas" element={<MetasDelPlan patient={props.patient} basePath={props.basePath} />} />
      <Route
        path="tablero"
        element={
          <TableroLe8 patient={props.patient} basePath={props.basePath} rutaCuestionarios={props.rutaCuestionarios} detalle />
        }
      />
      <Route path="mis-datos" element={<CargarDatosCkm patient={props.patient} />} />
      <Route
        path="contanos"
        element={<CuestionarioBaseline patient={props.patient} basePath={props.basePath} />}
      />
      <Route
        path="cuestionario/:taskId"
        element={<CuestionarioDelPlan patient={props.patient} basePath={props.basePath} />}
      />
    </Routes>
  );
}
