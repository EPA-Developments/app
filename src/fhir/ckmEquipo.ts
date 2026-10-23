// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Lo que el equipo ve de la salud CKM de la paciente, leído para mostrárselo a ella: las
// lecturas del hGraph y el estadío CKM que registró el equipo.
//
// - **Las lecturas** son las Observations con los códigos del hGraph (`CODIGOS_LECTURA_CKM`,
//   del core del Plan Bienestar). Quién gana entre ellas lo decide el core
//   (`ultimosValoresCkm`), el mismo que usa el dashboard: con los mismos datos, la paciente y
//   su médico ven el mismo valor.
// - **El estadío** es el del equipo, no una estimación del portal (decisión del 22.10.2026:
//   supone supervisión médica). Primero la serie que escribe el bot `ckm-recalculate` del
//   dashboard, que es el número que el médico ve en la ficha; si no hay serie, el último que
//   validó un médico en «Validar estadío». Los dos son Observations `estadio-ckm` del Plan
//   Bienestar; la serie se reconoce por su identifier (paciente/día), como en el dashboard
//   (`src/ckm/estadio-conciliacion.ts`, `esDeLaSerie` y `ultimaEvaluacion`).
//
// La paciente puede crear Observations (carga su presión), así que nada escrito por ella cuenta
// como del equipo: se mira `meta.author`, que pone el servidor y el cliente no puede falsear.
// Por la misma razón no se lee la extensión CKMStage del Patient (la paciente puede escribir
// su Patient, y la caché no tiene fecha).
import type { CkmStage } from '@epa/careplan-menopausia';
import {
  CODIGOS_LECTURA_CKM,
  ESTADIO_CKM,
  estadioDesdeCodigo,
  esObservationEstadio,
  origenDeEstadio,
  SYSTEM,
} from '@epa/careplan-menopausia';
import type { MedplumClient } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { Observation, Patient } from '@medplum/fhirtypes';

/** Identifier de cada evaluación de la serie del estadío (valor `<paciente>/<AAAA-MM-DD>`). */
export const SERIE_ESTADIO_SYSTEM = 'https://seguimiento.medplum.com.ar/fhir/identifier/ckm-estadio-evaluacion';

/** El estadío CKM del equipo, listo para la Home. */
export interface EstadioDelEquipo {
  readonly estadio: CkmStage;
  /** `serie`: lo calculó el sistema del equipo con el algoritmo firmado; `validado`: lo validó un médico. */
  readonly origen: 'serie' | 'validado';
  /** Fecha clínica de la evaluación (o de la validación). */
  readonly fecha?: string;
  /** La serie lo marca `preliminary` cuando falta algún dato: es «al menos este estadío». */
  readonly provisorio: boolean;
}

/** ¿La escribió la paciente (o cualquier Patient)? Lo que ella escribe nunca es del equipo. */
export function laEscribioUnaPaciente(observation: Observation): boolean {
  return observation.meta?.author?.reference?.startsWith('Patient/') ?? false;
}

function estadioDe(observation: Observation): CkmStage | undefined {
  const codigo = observation.valueCodeableConcept?.coding?.find((c) => c.system === SYSTEM.epa)?.code;
  return estadioDesdeCodigo(codigo)?.stage;
}

function claveDeLaSerie(observation: Observation): string | undefined {
  return observation.identifier?.find((i) => i.system === SERIE_ESTADIO_SYSTEM)?.value;
}

function fechaDe(observation: Observation): string {
  return observation.effectiveDateTime ?? observation.issued ?? observation.meta?.lastUpdated ?? '';
}

function vigente(observation: Observation): boolean {
  return (
    esObservationEstadio(observation) &&
    observation.status !== 'entered-in-error' &&
    !laEscribioUnaPaciente(observation) &&
    estadioDe(observation) !== undefined
  );
}

/**
 * El estadío del equipo entre las Observations `estadio-ckm` de la paciente: la evaluación más
 * nueva de la serie (por su clave paciente/día, como el dashboard) o, sin serie, la última
 * validación médica. Undefined si no hay ninguna de las dos. Pura.
 */
export function estadioDelEquipo(observaciones: readonly Observation[]): EstadioDelEquipo | undefined {
  const validas = observaciones.filter(vigente);
  const serie = validas
    .filter((o) => claveDeLaSerie(o) !== undefined)
    .sort((a, b) => (claveDeLaSerie(b) ?? '').localeCompare(claveDeLaSerie(a) ?? ''))[0];
  if (serie) {
    return {
      estadio: estadioDe(serie) as CkmStage,
      origen: 'serie',
      fecha: serie.effectiveDateTime,
      provisorio: serie.status === 'preliminary',
    };
  }
  const validado = validas
    .filter((o) => claveDeLaSerie(o) === undefined && origenDeEstadio(o) === 'validado')
    .sort((a, b) => fechaDe(b).localeCompare(fechaDe(a)))[0];
  return validado
    ? {
        estadio: estadioDe(validado) as CkmStage,
        origen: 'validado',
        fecha: fechaDe(validado) || undefined,
        provisorio: false,
      }
    : undefined;
}

/** Las Observations `estadio-ckm` de la paciente y, de ellas, el estadío del equipo. */
export async function cargarEstadioDelEquipo(
  medplum: MedplumClient,
  patient: Patient
): Promise<EstadioDelEquipo | undefined> {
  const observaciones = await medplum.searchResources(
    'Observation',
    {
      subject: getReferenceString(patient) ?? '',
      code: `${SYSTEM.epa}|${ESTADIO_CKM.code}`,
      _sort: '-date',
      _count: '100',
    },
    { cache: 'no-cache' }
  );
  return estadioDelEquipo(observaciones);
}

/**
 * Las lecturas del hGraph de la paciente (sin las anuladas), de la más nueva a la más vieja:
 * las 500 más recientes alcanzan para el último valor de cada parámetro, como en el dashboard.
 */
export async function cargarLecturasCkm(medplum: MedplumClient, patient: Patient): Promise<Observation[]> {
  const observaciones = await medplum.searchResources(
    'Observation',
    {
      subject: getReferenceString(patient) ?? '',
      code: CODIGOS_LECTURA_CKM.join(','),
      _sort: '-date',
      _count: '500',
    },
    { cache: 'no-cache' }
  );
  return observaciones.filter((o) => o.status !== 'entered-in-error');
}
