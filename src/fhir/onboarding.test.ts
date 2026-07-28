// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import type { Patient } from '@medplum/fhirtypes';
import { ONBOARDING_COMPLETED_EXT, PATIENT_ORIGIN_EXT, getPatientOrigin, isOnboardingDone } from './onboarding';

const BIOWELLNESS_ORIGIN_EXT = 'https://biowellness.ar/fhir/StructureDefinition/patient-origin';

const paciente = (extension?: Patient['extension']): Patient => ({
  resourceType: 'Patient',
  id: 'p1',
  extension,
});

test('sin la extensión, el paciente es auto-registrado', () => {
  expect(getPatientOrigin(paciente())).toBe('self');
  expect(getPatientOrigin(paciente([]))).toBe('self');
});

test('lee el origen escrito por esta app', () => {
  expect(getPatientOrigin(paciente([{ url: PATIENT_ORIGIN_EXT, valueCode: 'reception' }]))).toBe('reception');
  expect(getPatientOrigin(paciente([{ url: PATIENT_ORIGIN_EXT, valueCode: 'referral' }]))).toBe('referral');
});

test('lee el origen escrito por Recepción, que usa su propio namespace', () => {
  expect(getPatientOrigin(paciente([{ url: BIOWELLNESS_ORIGIN_EXT, valueCode: 'reception' }]))).toBe('reception');
  expect(getPatientOrigin(paciente([{ url: BIOWELLNESS_ORIGIN_EXT, valueCode: 'referral' }]))).toBe('referral');
});

test('un código desconocido cae en auto-registrado', () => {
  expect(getPatientOrigin(paciente([{ url: PATIENT_ORIGIN_EXT, valueCode: 'mostrador' }]))).toBe('self');
});

test('el onboarding sólo está hecho con la fecha registrada', () => {
  expect(isOnboardingDone(paciente())).toBe(false);
  expect(isOnboardingDone(paciente([{ url: ONBOARDING_COMPLETED_EXT }]))).toBe(false);
  expect(
    isOnboardingDone(paciente([{ url: ONBOARDING_COMPLETED_EXT, valueDateTime: '2026-07-25T10:00:00Z' }]))
  ).toBe(true);
});
