export {
  type CkmStage,
  type CkmSubStage,
  type CkmCriterion,
  type CkmConditions,
  type CkmInput,
  type CkmPreventInput,
  type CkmResult,
  type CategoriaKdigo,
  type RiesgoKdigo,
} from './types.js';
export {
  evaluateCkmStage,
  categoriaKdigo,
  criteriosSindromeMetabolico,
  bmiLimite,
  cinturaLimite,
  CKM_LIMITES,
  CKM_STAGE_LABEL,
} from './staging.js';
export { extractCkmInput, type CkmFhirContext } from './fromFhir.js';
export { buildCkmStageObservation, type CkmObservationContext } from './observation.js';
