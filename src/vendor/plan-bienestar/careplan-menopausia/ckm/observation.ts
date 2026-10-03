import type { Observation, Patient, Reference } from '@medplum/fhirtypes';
import { toReference } from '../fhir/codeable.js';
import { SYSTEM } from '../terminology/systems.js';
import { CKM_STAGE_LABEL } from './staging.js';
import type { CkmResult } from './types.js';

export interface CkmObservationContext {
  patient: Reference<Patient> | string;
  /** ISO dateTime/date stamped on Observation.effectiveDateTime. */
  now?: string;
  id?: string;
}

/**
 * Builds the FHIR Observation that records a computed CKM stage, with the
 * matched criteria as components and missing data as a note. There is no
 * official LOINC for the CKM stage yet, so the EPA local code system is used.
 */
export function buildCkmStageObservation(result: CkmResult, ctx: CkmObservationContext): Observation {
  if (result.stage === undefined) {
    throw new Error('No se puede registrar una Observation sin estadio calculado.');
  }
  const etiqueta = result.label ?? CKM_STAGE_LABEL[result.stage];
  const codigo = `estadio-ckm-${result.stage}${result.subStage ? `-${result.subStage.slice(1)}` : ''}`;

  const observation: Observation = {
    resourceType: 'Observation',
    status: 'final',
    category: [
      {
        coding: [
          { system: SYSTEM.observationCategory, code: 'survey', display: 'Survey' },
        ],
      },
    ],
    code: {
      coding: [{ system: SYSTEM.epa, code: 'estadio-ckm', display: 'Estadio CKM (0-4) AHA/Ndumele' }],
      text: 'Estadio CKM',
    },
    subject: toReference(ctx.patient),
    // Estimación del sistema: nunca vale como el estadío validado por el equipo
    // (`estadioValidado` sólo toma el método `estadio-ckm-validado`).
    method: {
      coding: [{ system: SYSTEM.epa, code: 'estadio-ckm-estimado', display: 'Estimado por el sistema' }],
      text: 'Estimado por el sistema',
    },
    valueCodeableConcept: {
      coding: [{ system: SYSTEM.epa, code: codigo, display: etiqueta }],
      text: `Estadio ${result.stage}${result.subStage ? ` (${result.subStage})` : ''} - ${etiqueta}`,
    },
  };

  if (result.criterios.length > 0) {
    observation.component = result.criterios.map((criterio) => ({
      code: {
        coding: [{ system: SYSTEM.epa, code: `ckm-criterio-${criterio.key}` }],
        text: 'Criterio CKM',
      },
      valueString: criterio.label,
    }));
  }

  if (result.faltantes.length > 0) {
    observation.note = [{ text: `Datos faltantes para afinar el estadio: ${result.faltantes.join(', ')}.` }];
  }

  if (ctx.now) observation.effectiveDateTime = ctx.now;
  if (ctx.id) observation.id = ctx.id;

  return observation;
}
