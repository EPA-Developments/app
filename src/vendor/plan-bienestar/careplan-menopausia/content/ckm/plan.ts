import type { EligibilitySpec } from '../../model/planTemplate.js';
import { PLAN_DEFINITION_SUFIJO, PLAN_DEFINITION_URL } from '../../contrato/pb100d.js';

/**
 * Metadatos de la PlanDefinition única del Plan Bienestar 100 Días por estadío CKM.
 *
 * Una sola definición para los cinco estadíos: cada acción lleva los estadíos y la
 * condición que la activan (extensiones del contrato) y una condición FHIRPath de
 * aplicabilidad sobre la Observation `estadio-ckm`. El CarePlan de cada persona se
 * instancia con los ítems que le aplican (`buildPb100dCarePlanBundle`).
 */

/** Clave estable de la definición; también su `identifier` en el sistema EPA. */
export const PB100D_PLAN_KEY = 'pb100d-ckm';

/** URL canónica, la misma del contrato (`PLAN_DEFINITION_URL`). */
export const PB100D_PLAN_DEFINITION_URL: string = PLAN_DEFINITION_URL;

/** Sufijo sin namespace, para lectura tolerante. */
export const PB100D_PLAN_DEFINITION_SUFIJO: string = PLAN_DEFINITION_SUFIJO;

/** Nombre computable (PascalCase) de la PlanDefinition. */
export const PB100D_PLAN_NAME = 'PlanBienestar100DiasCKM';

export const PB100D_PLAN_TITLE = 'Plan Bienestar 100 Días · CKM';

export const PB100D_PLAN_DESCRIPTION =
  'Plan de 100 días de salud cardio-renal-metabólica para adultos de 30 a 79 años, por estadío CKM 0 a 4 ' +
  '(guía AHA/ACC/ADA/ASN 2026) con Life’s Essential 8 como tablero de la persona. ' +
  'Catálogo firmado el 27/09/2026 por los Dres. Barbagelata y D’Alessandro. ' +
  'El sistema no prescribe: lo farmacológico llega al médico como alerta.';

/** Versión de negocio: fecha de la firma del catálogo. */
export const PB100D_PLAN_VERSION = '2026.09.27';

/**
 * Elegibilidad firmada: adultos de 30 a 79 años (rango de PREVENT), ambos sexos.
 * La menopausia es potenciador y módulo, no criterio de entrada.
 */
export const PB100D_ELIGIBILITY: EligibilitySpec = {
  genders: ['female', 'male'],
  ageRange: { low: 30, high: 79 },
};

/** Firmantes del catálogo, tal como figuran en los documentos de firma. */
export const PB100D_FIRMANTES: readonly string[] = Object.freeze([
  'Dr. Alejandro "Alex" Barbagelata',
  "Dr. Alejandro Sergio D'Alessandro",
]);

export const PB100D_FECHA_FIRMA = '2026-09-27';
