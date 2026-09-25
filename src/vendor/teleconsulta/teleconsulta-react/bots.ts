import { identificadorBot, leerPolitica, referenciaServicio, type NombreBot, type PoliticaTeleconsulta } from '@epa/teleconsulta-core';
import type { MedplumClient } from '@medplum/core';
import type { Appointment, HealthcareService } from '@medplum/fhirtypes';

export interface RespuestaBot {
  ok: boolean;
  mensaje?: string;
}

/**
 * Calls a teleconsulta bot by its business identifier (never by server id).
 * Network or server errors come back as `{ ok: false, mensaje }` so the UI
 * always has something patient-safe to show.
 */
export async function llamarBot<T extends RespuestaBot>(
  medplum: MedplumClient,
  nombre: NombreBot,
  input: Record<string, unknown>,
): Promise<T> {
  try {
    return (await medplum.executeBot(identificadorBot(nombre), input, 'application/json')) as T;
  } catch {
    return { ok: false, mensaje: 'No pudimos conectar. Probá de nuevo en unos segundos.' } as T;
  }
}

const CHECKOUT_MP = /^https:\/\/([a-z0-9-]+\.)*mercadopago\.com(\.[a-z]{2})?\//i;

/** Only Mercado Pago checkout URLs are followed (never `javascript:` or other hosts). */
export function esUrlDePago(url: string | undefined): url is string {
  return typeof url === 'string' && CHECKOUT_MP.test(url);
}

/** The service policy of an appointment (defaults when it has no service). */
export async function cargarPolitica(medplum: MedplumClient, turno: Appointment): Promise<PoliticaTeleconsulta> {
  const ref = referenciaServicio(turno)?.reference;
  if (!ref) return leerPolitica(undefined);
  try {
    return leerPolitica((await medplum.readReference({ reference: ref })) as HealthcareService);
  } catch {
    return leerPolitica(undefined);
  }
}
