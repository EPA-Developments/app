import type { Extension, HealthcareService, Money } from '@medplum/fhirtypes';
import { TC } from './terminologia.js';

/**
 * Business rules of a teleconsulta service. They live as data on the
 * HealthcareService (complex extension), so they are edited on the server and
 * apply to every app instantly — no redeploy.
 */
export interface PoliticaTeleconsulta {
  /** How many times a patient can move one appointment. */
  maxMovimientos: number;
  /** Moves are allowed up to this many hours before the start. */
  horasLimiteCambios: number;
  /** Cancelling up to this many hours before the start refunds in full. */
  horasReintegro: number;
  /** The room opens this many minutes before the start. */
  minutosAntesAcceso: number;
  /** The room stays open this many minutes after the end. */
  minutosDespuesAcceso: number;
  /** Length used when an appointment has no end. */
  duracionMinutos: number;
  /** Price of the consultation, when it is charged online. */
  precio?: { valor: number; moneda: string };
}

export const POLITICA_DEFAULT: PoliticaTeleconsulta = {
  maxMovimientos: 3,
  horasLimiteCambios: 24,
  horasReintegro: 24,
  minutosAntesAcceso: 15,
  minutosDespuesAcceso: 60,
  duracionMinutos: 30,
};

const CAMPOS_ENTEROS = [
  'maxMovimientos',
  'horasLimiteCambios',
  'horasReintegro',
  'minutosAntesAcceso',
  'minutosDespuesAcceso',
  'duracionMinutos',
] as const;

/** Reads the policy from a HealthcareService, falling back to defaults field by field. */
export function leerPolitica(servicio?: HealthcareService): PoliticaTeleconsulta {
  const politica: PoliticaTeleconsulta = { ...POLITICA_DEFAULT };
  const ext = servicio?.extension?.find((e) => e.url === TC.extPolitica);
  for (const sub of ext?.extension ?? []) {
    if ((CAMPOS_ENTEROS as readonly string[]).includes(sub.url) && typeof sub.valueInteger === 'number') {
      politica[sub.url as (typeof CAMPOS_ENTEROS)[number]] = sub.valueInteger;
    }
    if (sub.url === 'precio' && typeof sub.valueMoney?.value === 'number') {
      politica.precio = { valor: sub.valueMoney.value, moneda: sub.valueMoney.currency ?? 'ARS' };
    }
  }
  return politica;
}

/** Builds the complex extension that stores a policy on a HealthcareService. */
export function extensionPolitica(politica: Partial<PoliticaTeleconsulta>): Extension {
  const completa = { ...POLITICA_DEFAULT, ...politica };
  const extension: Extension[] = CAMPOS_ENTEROS.map((campo) => ({ url: campo, valueInteger: completa[campo] }));
  if (completa.precio) {
    extension.push({
      url: 'precio',
      valueMoney: { value: completa.precio.valor, currency: completa.precio.moneda as Money['currency'] },
    });
  }
  return { url: TC.extPolitica, extension };
}
