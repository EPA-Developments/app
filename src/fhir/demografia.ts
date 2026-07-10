// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Datos demográficos simples que el paciente completa en la Bienvenida/Onboarding.
// El sexo y la fecha de nacimiento habilitan la elegibilidad del Plan Bienestar
// · 100 días (la PlanDefinition evalúa gender + edad en su useContext); el DNI
// usa el sistema de identificación de FHIR Argentina (RENAPER).
import type { Patient } from '@medplum/fhirtypes';

/** Sistema de identificación del DNI argentino (RENAPER), según FHIR Argentina. */
export const DNI_SYSTEM = 'http://www.renaper.gob.ar/dni';

/** Opciones de sexo del formulario (mapean a Patient.gender de FHIR). */
export const SEXO_OPCIONES = [
  { value: 'female', label: 'Femenino' },
  { value: 'male', label: 'Masculino' },
  { value: 'other', label: 'Otros' },
] as const;

export type Sexo = (typeof SEXO_OPCIONES)[number]['value'];

/** Formulario plano de la Bienvenida; cada campo mapea a un elemento del Patient. */
export interface Demografia {
  /** Patient.gender */
  sexo?: Sexo;
  /** Patient.birthDate (YYYY-MM-DD) */
  fechaNacimiento?: string;
  /** Patient.telecom (system=phone, use=mobile) */
  celular?: string;
  /** Patient.identifier (system RENAPER) */
  dni?: string;
  /** Patient.address.line[0] */
  calle?: string;
  /** Patient.address.city */
  localidad?: string;
  /** Patient.address.state */
  provincia?: string;
}

/** Lee los datos ya cargados en el Patient (prefill para pacientes invitados). */
export function leerDemografia(patient: Patient): Demografia {
  const gender = patient.gender;
  const domicilio = patient.address?.find((a) => a.use !== 'old');
  return {
    sexo: gender === 'female' || gender === 'male' || gender === 'other' ? gender : undefined,
    fechaNacimiento: patient.birthDate,
    celular:
      patient.telecom?.find((t) => t.system === 'phone' && t.use === 'mobile')?.value ??
      patient.telecom?.find((t) => t.system === 'phone')?.value,
    dni: patient.identifier?.find((i) => i.system === DNI_SYSTEM)?.value,
    calle: domicilio?.line?.[0],
    localidad: domicilio?.city,
    provincia: domicilio?.state,
  };
}

/**
 * Aplica los datos del formulario sobre el Patient. Función pura: devuelve el
 * recurso listo para guardar sin tocar el servidor, preservando los telecom e
 * identifiers que no administra este formulario (email, obra social, etc.).
 */
export function aplicarDemografia(patient: Patient, datos: Demografia): Patient {
  const telecom = (patient.telecom ?? []).filter((t) => !(t.system === 'phone' && t.use === 'mobile'));
  if (datos.celular) {
    telecom.push({ system: 'phone', use: 'mobile', value: datos.celular });
  }

  const identifier = (patient.identifier ?? []).filter((i) => i.system !== DNI_SYSTEM);
  if (datos.dni) {
    identifier.push({ system: DNI_SYSTEM, value: datos.dni });
  }

  const tieneDomicilio = Boolean(datos.calle || datos.localidad || datos.provincia);
  const address = tieneDomicilio
    ? [
        {
          use: 'home' as const,
          line: datos.calle ? [datos.calle] : undefined,
          city: datos.localidad || undefined,
          state: datos.provincia || undefined,
          country: 'AR',
        },
      ]
    : patient.address;

  return {
    ...patient,
    gender: datos.sexo ?? patient.gender,
    birthDate: datos.fechaNacimiento || patient.birthDate,
    telecom: telecom.length > 0 ? telecom : undefined,
    identifier: identifier.length > 0 ? identifier : undefined,
    address,
  };
}
