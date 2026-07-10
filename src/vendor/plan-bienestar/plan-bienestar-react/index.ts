/**
 * @epa/plan-bienestar-react
 *
 * Drop-in React module of the Plan Bienestar 100 Dias (menopause CV health)
 * for FooMedical / Medplum apps. Two integration lines:
 *
 * ```tsx
 * // HomePage
 * <PlanBienestarCard />
 * // Router
 * <Route path="/care-plan/plan-100-dias/*" element={<PlanBienestarRoutes />} />
 * ```
 *
 * The card self-gates via the ACTIVE PlanDefinition's useContext (gender/age)
 * on the FHIR server — apps carry no eligibility logic.
 */

export {
  PlanBienestarProvider,
  usePaciente,
  useBasePath,
  usePlanBienestarConfig,
  DEFAULT_BASE_PATH,
  type PlanBienestarConfig,
} from './PlanBienestarContext';
export {
  useElegibilidad,
  type Elegibilidad,
  type UseElegibilidadOptions,
} from './hooks/useElegibilidad';
export {
  usePlanBienestar,
  esCarePlanDelPlan,
  type PlanBienestar,
  type UsePlanBienestarOptions,
} from './hooks/usePlanBienestar';
export { PlanBienestarCard, type PlanBienestarCardProps } from './components/PlanBienestarCard';
export { EstadioCkmCard, type EstadioCkmCardProps } from './components/EstadioCkmCard';
export { useCkm, type Ckm, type UseCkmOptions } from './hooks/useCkm';
export { RiesgoPreventCard, type RiesgoPreventCardProps } from './components/RiesgoPreventCard';
export { CargarDatosCkm, type CargarDatosCkmProps } from './components/CargarDatosCkm';
export {
  useRiesgoPrevent,
  type RiesgoPrevent,
  type UseRiesgoPreventOptions,
} from './hooks/useRiesgoPrevent';
export {
  useDatosCkm,
  type DatosCkm,
  type ValorParametro,
  type UseDatosCkmOptions,
} from './hooks/useDatosCkm';
export { PlanBienestarRoutes, type PlanBienestarRoutesProps } from './PlanBienestarRoutes';
export { PasosDelPlan, type PasosDelPlanProps } from './pages/PasosDelPlan';
export { MetasDelPlan, type MetasDelPlanProps } from './pages/MetasDelPlan';
export { CuestionarioDelPlan, type CuestionarioDelPlanProps } from './pages/CuestionarioDelPlan';
export { asegurarPlanDefinition, asegurarRecursosDelPlan } from './servidor';
export { textoMeta, tipoDePaso, pasoConCuestionario } from './fhirTexto';

// Re-exports handy for seeding and advanced use.
export {
  MENOPAUSE_PLAN_DEFINITION_URL,
  buildMenopausePlanDefinition,
  buildMenopauseCarePlanBundle,
  evaluateEligibility,
} from '@epa/careplan-menopausia';
