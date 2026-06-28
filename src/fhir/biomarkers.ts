// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Puente entre el portal y el modelo FHIR de biomarcadores en Medplum.
// Los rangos canónicos (convencional/funcional, por sexo) viven en el servidor como
// ObservationDefinition; este módulo los trae y los mapea a la forma que usa la UI.
import type { MedplumClient } from '@medplum/core';
import type { ObservationDefinition } from '@medplum/fhirtypes';
import type { Biomarker, BiomarkerRange, PatientSex } from '../pages/health-record/Biomarkers.data';

/** CodeSystems canónicos de Segunda Opinión Médica (deben coincidir con el modelo FHIR en Medplum). */
export const PANEL_SYSTEM = 'https://segundaopinionmedica.org/fhir/CodeSystem/panel-biomarcador';
export const TIPO_RANGO_SYSTEM = 'https://segundaopinionmedica.org/fhir/CodeSystem/tipo-rango';
export const BIOMARKER_SYSTEM = 'https://segundaopinionmedica.org/fhir/CodeSystem/biomarker';

/** Rangos de un analito publicados por el servidor (ObservationDefinition.qualifiedInterval). */
export interface ServerBiomarkerRanges {
  conventional?: BiomarkerRange;
  functional?: BiomarkerRange;
  male?: { conventional?: BiomarkerRange; functional?: BiomarkerRange };
  female?: { conventional?: BiomarkerRange; functional?: BiomarkerRange };
}

/** Convierte una ObservationDefinition al shape {conventional, functional, male, female}. */
export function parseObservationDefinition(od: ObservationDefinition): ServerBiomarkerRanges {
  const out: ServerBiomarkerRanges = {};
  for (const iv of od.qualifiedInterval ?? []) {
    const tipo = iv.context?.coding?.find((c) => c.system === TIPO_RANGO_SYSTEM)?.code;
    if (tipo !== 'convencional' && tipo !== 'funcional') {
      continue;
    }
    const key = tipo === 'convencional' ? 'conventional' : 'functional';
    const range: BiomarkerRange = { low: iv.range?.low?.value, high: iv.range?.high?.value };
    if (iv.gender === 'male') {
      (out.male ??= {})[key] = range;
    } else if (iv.gender === 'female') {
      (out.female ??= {})[key] = range;
    } else {
      out[key] = range;
    }
  }
  return out;
}

/**
 * Trae las ObservationDefinition del proyecto y devuelve un mapa code -> rangos.
 * Se traen todas y se mapean por código (evita depender de un search param de category,
 * que ObservationDefinition no define en R4).
 */
export async function fetchBiomarkerRanges(medplum: MedplumClient): Promise<Record<string, ServerBiomarkerRanges>> {
  const defs = await medplum.searchResources('ObservationDefinition', '_count=200');
  const map: Record<string, ServerBiomarkerRanges> = {};
  for (const od of defs) {
    const code = od.code?.coding?.[0]?.code;
    if (code) {
      map[code] = parseObservationDefinition(od);
    }
  }
  return map;
}

/** Resuelve los rangos aplicables a un paciente (sexo-específico si existe, si no unisex). */
export function resolveServerRanges(
  r: ServerBiomarkerRanges,
  sex: PatientSex
): { conventional?: BiomarkerRange; functional?: BiomarkerRange } {
  const override = sex ? r[sex] : undefined;
  return {
    conventional: override?.conventional ?? r.conventional,
    functional: override?.functional ?? r.functional,
  };
}

/** Biomarcador completo publicado por el servidor (código, panel, nombre, unidad + rangos). */
export interface ServerBiomarker extends ServerBiomarkerRanges {
  code: string;
  system?: string;
  title: string;
  unit: string;
  panel?: string;
  description?: string;
}

/** Mapea una ObservationDefinition a un ServerBiomarker (panel desde category, nombre desde code, unidad desde quantitativeDetails). */
export function parseServerBiomarker(od: ObservationDefinition): ServerBiomarker | undefined {
  const coding = od.code?.coding?.[0];
  const code = coding?.code;
  if (!code) {
    return undefined;
  }
  const panel =
    od.category?.flatMap((c) => c.coding ?? []).find((c) => c.system === PANEL_SYSTEM)?.code ??
    od.category?.[0]?.coding?.[0]?.code;
  const unit = od.quantitativeDetails?.unit?.coding?.[0]?.code ?? od.quantitativeDetails?.unit?.text ?? '';
  return {
    code,
    system: coding?.system,
    title: coding?.display ?? od.code?.text ?? code,
    unit,
    panel,
    ...parseObservationDefinition(od),
  };
}

/** Trae todos los biomarcadores publicados por el servidor (ObservationDefinition). */
export async function fetchServerBiomarkers(medplum: MedplumClient): Promise<ServerBiomarker[]> {
  const defs = await medplum.searchResources('ObservationDefinition', '_count=200');
  return defs.map(parseServerBiomarker).filter((b): b is ServerBiomarker => b !== undefined);
}

/** Convierte un ServerBiomarker al shape de UI (Biomarker). */
export function serverBiomarkerToBiomarker(sb: ServerBiomarker): Biomarker {
  return {
    code: sb.code,
    system: sb.system,
    title: sb.title,
    unit: sb.unit,
    description: sb.description ?? '',
    conventional: sb.conventional,
    functional: sb.functional,
    male: sb.male,
    female: sb.female,
  };
}
