// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Carga en un MockClient el ejemplo real del programa GLP-1 que generan los bots de
// recepcionistas (docs/ejemplos/glp1-paciente.json), conservando los ids: los recursos
// se referencian entre sí (CarePlan → Goal, Task → Appointment, ServiceRequest → CarePlan).
import type { MedplumClient } from '@medplum/core';
import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import type { Bundle, Patient, Resource, SearchParameter } from '@medplum/fhirtypes';
import ejemplo from './glp1-paciente.json';

let indexado = false;

/** Sin los SearchParameters indexados, el MockClient ignora `subject`, `code`, `based-on`… */
export function indexarDefinicionesFhir(): void {
  if (indexado) {
    return;
  }
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  for (const file of SEARCH_PARAMETER_BUNDLE_FILES) {
    indexSearchParameterBundle(readJson(file) as Bundle<SearchParameter>);
  }
  indexado = true;
}

export const PACIENTE_EJEMPLO_ID = 'paciente-ejemplo';

export async function cargarFixtureGlp1(medplum: MedplumClient): Promise<Patient> {
  indexarDefinicionesFhir();
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    id: PACIENTE_EJEMPLO_ID,
    name: [{ given: ['Paciente'], family: 'Ejemplo' }],
  });
  for (const entry of (ejemplo as unknown as Bundle).entry ?? []) {
    await medplum.createResource(entry.resource as Resource);
  }
  return patient;
}
