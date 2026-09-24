// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// "Mi equipo de salud": quién acompaña al paciente y en qué rol.
//  - Médico de cabecera (Patient.generalPractitioner): su seguimiento continuo en el
//    Plan Bienestar · 100 días. Lo elige el propio paciente.
//  - Equipo del plan (CareTeam activos del paciente): los demás profesionales del plan.
//  - Segunda opinión (ServiceRequest SOM → performer): el especialista que firma el
//    informe; una revisión puntual, solo si el paciente tiene una solicitud.
import type { MedplumClient } from '@medplum/core';
import { createReference, getReferenceString } from '@medplum/core';
import type { CareTeam, Organization, Patient, Practitioner, PractitionerRole, Reference } from '@medplum/fhirtypes';
import { cargarMisSolicitudesSOM } from './som';

export type RefProfesional = Reference<Practitioner | PractitionerRole | Organization>;

export interface MiembroEquipo {
  readonly ref: RefProfesional;
  /** Rol en el equipo (p. ej. "Nutrición"), tal como lo cargó el equipo. */
  readonly rol?: string;
}

export interface EquipoDeSalud {
  readonly cabecera?: RefProfesional;
  readonly equipoPlan: MiembroEquipo[];
  readonly segundaOpinion: RefProfesional[];
}

/** El médico de cabecera puede ser un centro (Organization) en lugar de una persona. */
export function esCentro(ref: Reference | undefined): boolean {
  return Boolean(ref?.reference?.startsWith('Organization/'));
}

function esProfesional(ref: Reference | undefined): ref is RefProfesional {
  const r = ref?.reference ?? '';
  return r.startsWith('Practitioner/') || r.startsWith('PractitionerRole/') || r.startsWith('Organization/');
}

/** Profesionales de los CareTeam, sin repetir y sin el médico de cabecera. */
export function miembrosDelPlan(careTeams: CareTeam[], cabecera?: Reference): MiembroEquipo[] {
  const vistos = new Set<string>(cabecera?.reference ? [cabecera.reference] : []);
  const miembros: MiembroEquipo[] = [];
  for (const ct of careTeams) {
    if (ct.status && ct.status !== 'active') {
      continue;
    }
    for (const p of ct.participant ?? []) {
      const ref = p.member;
      if (!esProfesional(ref) || !ref.reference || vistos.has(ref.reference)) {
        continue;
      }
      vistos.add(ref.reference);
      miembros.push({ ref, rol: p.role?.[0]?.text ?? p.role?.[0]?.coding?.[0]?.display });
    }
  }
  return miembros;
}

export async function cargarEquipoDeSalud(medplum: MedplumClient, patient: Patient): Promise<EquipoDeSalud> {
  const ref = getReferenceString(patient);
  // El profile queda cacheado al iniciar sesión: leemos el Patient actual.
  const [actual, careTeams, solicitudes] = await Promise.all([
    medplum.readResource('Patient', patient.id as string, { cache: 'no-cache' }).catch(() => patient),
    medplum.searchResources('CareTeam', `subject=${ref}&_count=20`).catch(() => [] as CareTeam[]),
    cargarMisSolicitudesSOM(medplum, patient).catch(() => []),
  ]);
  const cabecera = actual.generalPractitioner?.find(esProfesional);
  const segundaOpinion: RefProfesional[] = [];
  for (const sr of solicitudes) {
    for (const p of sr.performer ?? []) {
      if (esProfesional(p) && !segundaOpinion.some((s) => s.reference === p.reference)) {
        segundaOpinion.push(p);
      }
    }
  }
  return { cabecera, equipoPlan: miembrosDelPlan(careTeams, cabecera), segundaOpinion };
}

/** Profesionales que el paciente puede elegir como médico de cabecera (activos, por nombre). */
export async function listarMedicosDeCabecera(medplum: MedplumClient): Promise<Practitioner[]> {
  const todos = await medplum.searchResources('Practitioner', '_count=100');
  const nombre = (p: Practitioner): string =>
    [p.name?.[0]?.family, ...(p.name?.[0]?.given ?? [])].filter(Boolean).join(' ').toLowerCase();
  return todos.filter((p) => p.active !== false).sort((a, b) => nombre(a).localeCompare(nombre(b)));
}

/**
 * El paciente elige su médico de cabecera. PATCH solo de `generalPractitioner`, para no
 * pisar cambios que Recepción u otro proceso hayan hecho en el resto del Patient.
 */
export async function elegirMedicoDeCabecera(
  medplum: MedplumClient,
  patient: Patient,
  medico: Practitioner
): Promise<Patient> {
  return medplum.patchResource('Patient', patient.id as string, [
    { op: 'add', path: '/generalPractitioner', value: [createReference(medico)] },
  ]);
}
