// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Datos demográficos simples que el paciente completa en la Bienvenida/Onboarding.
// El sexo y la fecha de nacimiento habilitan la elegibilidad del Plan Bienestar
// · 100 días (la PlanDefinition evalúa gender + edad en su useContext); el DNI
// usa el sistema de identificación de FHIR Argentina (RENAPER).
import type { Patient, PatientContact } from '@medplum/fhirtypes';

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

/** Celular (WhatsApp) del paciente: Patient.telecom phone/mobile, o el primer teléfono. */
export function leerCelular(patient: Patient): string | undefined {
  return (
    patient.telecom?.find((t) => t.system === 'phone' && t.use === 'mobile')?.value ??
    patient.telecom?.find((t) => t.system === 'phone')?.value
  );
}

/**
 * Normaliza un celular a E.164. Los argentinos quedan como +549 + código de área + número
 * (10 dígitos, sin el 0 ni el 15), que es el formato de WhatsApp. Acepta las formas
 * habituales: "11 5555-1234", "011 15 5555-1234", "+54 9 11 5555-1234", "+54 11 5555-1234".
 * Un número de otro país escrito con + o 00 se guarda como + y sus dígitos.
 * Devuelve undefined si no se puede interpretar (p. ej. falta el código de área).
 */
export function normalizarCelular(celular: string | undefined): string | undefined {
  const texto = celular?.trim() ?? '';
  if (!/^\+?[\d\s().-]+$/.test(texto)) {
    return undefined;
  }
  let digitos = texto.replace(/\D/g, '');
  const internacional = texto.startsWith('+') || digitos.startsWith('00');
  if (digitos.startsWith('00')) {
    digitos = digitos.slice(2);
  }
  if (internacional && !digitos.startsWith('54')) {
    return digitos.length >= 8 && digitos.length <= 15 ? `+${digitos}` : undefined;
  }
  // Los códigos de área argentinos empiezan con 1, 2 o 3: un 54 adelante es el código de país.
  let nacional = digitos.startsWith('54') && digitos.length >= 12 ? digitos.slice(2) : digitos;
  // El 9 de móvil internacional (con o sin el 15 todavía adentro).
  if ((nacional.length === 11 || nacional.length === 13) && nacional.startsWith('9')) {
    nacional = nacional.slice(1);
  }
  if (nacional.startsWith('0')) {
    nacional = nacional.slice(1);
  }
  if (nacional.length === 12) {
    nacional = sinQuince(nacional) ?? '';
  }
  // 10 dígitos: el único código de área que empieza con 1 es el 11; el resto, con 2 o 3.
  return /^(11\d{8}|[23]\d{9})$/.test(nacional) ? `+549${nacional}` : undefined;
}

/**
 * Saca el 15 que va después del código de área (de 2, 3 o 4 dígitos). Si hay más de un
 * lugar posible, solo se resuelve para el 11 (el único código de 2 dígitos).
 */
function sinQuince(nacional: string): string | undefined {
  const posibles = [2, 3, 4].filter((i) => nacional.slice(i, i + 2) === '15');
  let posicion: number | undefined;
  if (posibles.length === 1) {
    posicion = posibles[0];
  } else if (nacional.startsWith('11') && posibles.includes(2)) {
    posicion = 2;
  }
  return posicion === undefined ? undefined : nacional.slice(0, posicion) + nacional.slice(posicion + 2);
}

/** ¿Se puede interpretar como celular? (ver normalizarCelular) */
export function celularValido(celular: string | undefined): boolean {
  return normalizarCelular(celular) !== undefined;
}

/**
 * Reemplaza el celular (phone/mobile), normalizado a +549…, y conserva el resto de los
 * telecom (email, etc.).
 */
export function conCelular(telecom: Patient['telecom'], celular: string | undefined): Patient['telecom'] {
  const resto = (telecom ?? []).filter((t) => !(t.system === 'phone' && t.use === 'mobile'));
  const valor = normalizarCelular(celular) ?? celular?.trim();
  const todos = valor ? [...resto, { system: 'phone' as const, use: 'mobile' as const, value: valor }] : resto;
  return todos.length > 0 ? todos : undefined;
}

/** Lee los datos ya cargados en el Patient (prefill para pacientes invitados). */
export function leerDemografia(patient: Patient): Demografia {
  const gender = patient.gender;
  const domicilio = patient.address?.find((a) => a.use !== 'old');
  return {
    sexo: gender === 'female' || gender === 'male' || gender === 'other' ? gender : undefined,
    fechaNacimiento: patient.birthDate,
    celular: leerCelular(patient),
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
  const telecom = conCelular(patient.telecom, datos.celular);

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
    telecom,
    identifier: identifier.length > 0 ? identifier : undefined,
    address,
  };
}

// Contacto de emergencia: Patient.contact con el código estándar "C" (Emergency Contact,
// v2-0131), así recepción y el dashboard lo identifican. Se carga en Mi perfil.
export const V2_0131 = 'http://terminology.hl7.org/CodeSystem/v2-0131';

export function esContactoEmergencia(c: PatientContact): boolean {
  return Boolean(c.relationship?.some((r) => r.coding?.some((k) => k.system === V2_0131 && k.code === 'C')));
}

/** ¿El paciente tiene cargado su contacto de emergencia? */
export function tieneContactoEmergencia(patient: Patient): boolean {
  return Boolean(patient.contact?.some(esContactoEmergencia));
}
