// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Qué Home ve cada paciente. Regla de la dirección médica: las mujeres de 45 a 55 años
// (inclusive, en años cumplidos) ven el estilo E; el resto, el D. El sexo sale de
// Patient.gender y la edad de Patient.birthDate, con el mismo cálculo que la elegibilidad
// del plan (calculateAge: extremos inclusivos). Sin sexo o sin fecha de nacimiento, D.
import { calculateAge } from '@epa/careplan-menopausia';
import type { ProfileResource } from '@medplum/core';
import type { EstiloHome } from './tipos';

/** Rango de edad del estilo E, en años cumplidos, ambos extremos incluidos. */
export const EDAD_ESTILO_E = { desde: 45, hasta: 55 } as const;

/**
 * El estilo de Home de un perfil. `hoy` es AAAA-MM-DD en hora de Argentina (hoyArgentina()):
 * con la fecha UTC, entre las 21 y las 24 el cumpleaños se adelantaría un día.
 * Un Practitioner u otro perfil que no sea Patient ve el D aunque tenga sexo y fecha.
 */
export function estiloDeHome(perfil: ProfileResource | undefined, hoy: string): EstiloHome {
  if (perfil?.resourceType !== 'Patient' || perfil.gender !== 'female' || !perfil.birthDate) {
    return 'D';
  }
  const edad = calculateAge(perfil.birthDate, hoy);
  return edad !== undefined && edad >= EDAD_ESTILO_E.desde && edad <= EDAD_ESTILO_E.hasta ? 'E' : 'D';
}

/**
 * Estilo forzado por la URL (`/?estilo=e` o `/?estilo=d`), para que el equipo pueda ver
 * cualquiera de las dos Homes con cualquier perfil. Cualquier otro valor no fuerza nada.
 */
export function estiloForzado(valor: string | null | undefined): EstiloHome | undefined {
  const v = valor?.trim().toUpperCase();
  return v === 'E' || v === 'D' ? v : undefined;
}
