// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Cobertura de salud del paciente (obra social o prepaga), que carga él mismo en "Mis
// datos". Es un Coverage con type = v3-ActCode|HIP (póliza de seguro de salud): ese tipo
// la distingue de los Coverage de membresía/paquetes que maneja Recepción, y es el que
// habilita la escritura en la AccessPolicy del paciente.
import type { MedplumClient } from '@medplum/core';
import { createReference, getReferenceString } from '@medplum/core';
import type { Coverage, Patient } from '@medplum/fhirtypes';

export const V3_ACT_CODE = 'http://terminology.hl7.org/CodeSystem/v3-ActCode';
export const COBERTURA_SALUD_CODE = 'HIP';
const COVERAGE_CLASS = 'http://terminology.hl7.org/CodeSystem/coverage-class';

export interface DatosCobertura {
  /** Obra social o prepaga (Coverage.payor.display), p. ej. "OSDE". */
  financiador: string;
  /** Plan (Coverage.class de tipo "plan"), p. ej. "210". */
  plan: string;
  /** Número de afiliado (Coverage.subscriberId). */
  numeroAfiliado: string;
}

/** ¿Es la cobertura de salud (obra social / prepaga) y no una membresía de Recepción? */
export function esCoberturaDeSalud(c: Coverage): boolean {
  return Boolean(c.type?.coding?.some((k) => k.system === V3_ACT_CODE && k.code === COBERTURA_SALUD_CODE));
}

export function leerDatosCobertura(c: Coverage | undefined): DatosCobertura {
  return {
    financiador: c?.payor?.[0]?.display ?? '',
    plan: c?.class?.find((k) => k.type.coding?.some((t) => t.code === 'plan'))?.value ?? '',
    numeroAfiliado: c?.subscriberId ?? '',
  };
}

/**
 * Arma el Coverage desde el formulario. Sobre el existente, reemplaza solo lo que maneja
 * el formulario (financiador, plan y afiliado) y conserva el resto.
 */
export function armarCoverage(patient: Patient, datos: DatosCobertura, existente?: Coverage): Coverage {
  const financiador = datos.financiador.trim();
  const plan = datos.plan.trim();
  const numeroAfiliado = datos.numeroAfiliado.trim();
  const otrasClases = (existente?.class ?? []).filter((k) => !k.type.coding?.some((t) => t.code === 'plan'));
  const clases = [
    ...otrasClases,
    ...(plan
      ? [{ type: { coding: [{ system: COVERAGE_CLASS, code: 'plan', display: 'Plan' }] }, value: plan, name: plan }]
      : []),
  ];
  const coverage: Coverage = {
    ...existente,
    resourceType: 'Coverage',
    status: 'active',
    type: {
      coding: [{ system: V3_ACT_CODE, code: COBERTURA_SALUD_CODE, display: 'health insurance plan policy' }],
      text: 'Obra social o prepaga',
    },
    beneficiary: createReference(patient),
    payor: [{ display: financiador }],
    class: clases.length > 0 ? clases : undefined,
    subscriberId: numeroAfiliado || undefined,
  };
  if (!coverage.class) {
    delete coverage.class;
  }
  if (!coverage.subscriberId) {
    delete coverage.subscriberId;
  }
  return coverage;
}

/** La cobertura de salud activa del paciente, si la cargó. */
export async function buscarCobertura(medplum: MedplumClient, patient: Patient): Promise<Coverage | undefined> {
  const coberturas = await medplum.searchResources(
    'Coverage',
    `beneficiary=${getReferenceString(patient)}&type=${V3_ACT_CODE}|${COBERTURA_SALUD_CODE}&status=active&_count=5`,
    { cache: 'no-cache' }
  );
  return coberturas.find(esCoberturaDeSalud);
}

/** Crea o actualiza la cobertura de salud. Exige la obra social o prepaga. */
export async function guardarCobertura(
  medplum: MedplumClient,
  patient: Patient,
  datos: DatosCobertura,
  existente?: Coverage
): Promise<Coverage> {
  const coverage = armarCoverage(patient, datos, existente);
  return existente?.id ? medplum.updateResource(coverage) : medplum.createResource(coverage);
}
