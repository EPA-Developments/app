/**
 * @epa/plan-bienestar-react
 *
 * Drop-in React module of the Plan Bienestar 100 Dias (CKM stages 0-4, signed
 * catalog; the menopause plan is still read) for FooMedical / Medplum apps.
 * Two integration lines:
 *
 * ```tsx
 * // HomePage
 * <PlanBienestarCard />
 * <TableroLe8 />
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
  buscarPlanActivo,
  estadioValidado,
  perfilParaEmpezar,
  type PerfilParaEmpezar,
  type PlanBienestar,
  type UsePlanBienestarOptions,
} from './hooks/usePlanBienestar';
export { PlanBienestarCard, type PlanBienestarCardProps } from './components/PlanBienestarCard';
export { EstadioCkmCard, type EstadioCkmCardProps } from './components/EstadioCkmCard';
export { useCkm, type Ckm, type UseCkmOptions } from './hooks/useCkm';
export { RiesgoPreventCard, type RiesgoPreventCardProps } from './components/RiesgoPreventCard';
export { CargarDatosCkm, type CargarDatosCkmProps } from './components/CargarDatosCkm';
export { TableroLe8, colorLe8, type TableroLe8Props } from './components/TableroLe8';
export {
  useTableroLe8,
  estadioDelCarePlan,
  type TableroLe8 as TableroLe8Estado,
  type UseTableroLe8Options,
} from './hooks/useTableroLe8';
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
export {
  useCobertura,
  PB100D_CODIGO,
  PLAN_CODIGO_EXT_DEFAULT,
  TASK_TIPO_SYSTEM_DEFAULT,
  SOLICITUD_PLAN_CODIGO,
  type Cobertura,
  type CoberturaConfig,
  type EstadoCobertura,
} from './hooks/useCobertura';
export { useBaseline, type Baseline, type SeleccionBaseline, type UseBaselineOptions } from './hooks/useBaseline';
export { PlanBienestarRoutes, type PlanBienestarRoutesProps } from './PlanBienestarRoutes';
export { PasosDelPlan, type PasosDelPlanProps } from './pages/PasosDelPlan';
export { MetasDelPlan, type MetasDelPlanProps } from './pages/MetasDelPlan';
export { CuestionarioDelPlan, type CuestionarioDelPlanProps } from './pages/CuestionarioDelPlan';
export { CuestionarioBaseline, type CuestionarioBaselineProps } from './pages/CuestionarioBaseline';
export { asegurarPlanDefinition, asegurarRecursosDelPlan } from './servidor';
export {
  textoMeta,
  tipoDePaso,
  claveDeTipo,
  pasoConCuestionario,
  momentosDePaso,
  etiquetasDeMomentos,
  GRUPOS_DE_PASOS,
  type GrupoDePasos,
} from './fhirTexto';

// Re-exports handy for seeding and advanced use.
export {
  MENOPAUSE_PLAN_DEFINITION_URL,
  PB100D_PLAN_DEFINITION_URL,
  PLAN_DEFINITION_URL,
  buildMenopausePlanDefinition,
  buildMenopauseCarePlanBundle,
  buildPb100dPlanDefinition,
  buildPb100dCarePlanBundle,
  evaluateEligibility,
} from '@epa/careplan-menopausia';
