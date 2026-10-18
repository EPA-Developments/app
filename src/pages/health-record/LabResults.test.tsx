// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Resultados de laboratorio lista sólo los informes emitidos, como la policy de la paciente: el
// borrador de la Segunda Opinión (`preliminary`, espera la firma del cardiólogo) no aparece
// aunque la policy vieja todavía lo deje leer. Paciente sintética, sin nombre.
import { MantineProvider } from '@mantine/core';
import type { DiagnosticReport, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { MemoryRouter } from 'react-router';
import { indexarDefinicionesFhir } from '../../fhir/__fixtures__/glp1';
import { LabResults } from './LabResults';

function informe(patient: Patient, status: DiagnosticReport['status'], texto: string): DiagnosticReport {
  return {
    resourceType: 'DiagnosticReport',
    status,
    code: { text: texto },
    subject: { reference: `Patient/${patient.id}` },
  };
}

test('no lista el borrador de la Segunda Opinión, sólo los informes emitidos', async () => {
  indexarDefinicionesFhir();
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({ resourceType: 'Patient' });
  medplum.setProfile(patient);
  await medplum.createResource(informe(patient, 'final', 'Laboratorio de rutina'));
  await medplum.createResource(informe(patient, 'corrected', 'Laboratorio corregido'));
  await medplum.createResource(informe(patient, 'preliminary', 'Segunda opinión cardiológica'));

  render(
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <Suspense fallback={null}>
            <LabResults />
          </Suspense>
        </MantineProvider>
      </MedplumProvider>
    </MemoryRouter>
  );

  expect(await screen.findByText('Laboratorio de rutina')).toBeInTheDocument();
  expect(screen.getByText('Laboratorio corregido')).toBeInTheDocument();
  expect(screen.queryByText('Segunda opinión cardiológica')).not.toBeInTheDocument();
});
