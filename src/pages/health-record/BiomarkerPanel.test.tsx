// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Observation, ObservationDefinition, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { indexarDefinicionesFhir } from '../../fhir/__fixtures__/glp1';
import definiciones from '../../fhir/__fixtures__/biomarcadores-servidor.json';
import { fechaDesde } from '../../fhir/biomarkers';
import { BiomarkerPanel } from './BiomarkerPanel';

const LOINC = 'http://loinc.org';

// El gráfico necesita canvas, que jsdom no tiene.
vi.mock('../../components/LineChart', () => ({ LineChart: () => null }));

async function pacienteConLaboratorio(): Promise<{ medplum: MockClient; patient: Patient }> {
  indexarDefinicionesFhir();
  const medplum = new MockClient();
  for (const od of definiciones as ObservationDefinition[]) {
    await medplum.createResource(od);
  }
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Ana'], family: 'Prueba' }],
    gender: 'female',
    birthDate: '1976-03-10',
  });
  const reciente = fechaDesde(1);
  const resultado = (codigos: string[], extra: Partial<Observation>): Promise<Observation> =>
    medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      category: [
        { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] },
      ],
      code: { coding: codigos.map((code) => ({ system: LOINC, code })) },
      subject: { reference: `Patient/${patient.id}` },
      effectiveDateTime: reciente,
      ...extra,
    });
  // Lo que escribe el bot de laboratorio con un PDF: creatinina con el rango del laboratorio y
  // el eGFR calculado (CKD-EPI 2021) con los tres códigos.
  await resultado(['2160-0'], {
    valueQuantity: { value: 1.3, unit: 'mg/dL', system: 'http://unitsofmeasure.org', code: 'mg/dL' },
    referenceRange: [{ low: { value: 0.5 }, high: { value: 1.1 }, text: '0,5 - 1,1' }],
  });
  await resultado(['62238-1', '33914-3', '98979-8'], {
    valueQuantity: { value: 47, unit: 'mL/min/1,73 m²', system: 'http://unitsofmeasure.org', code: 'mL/min/{1.73_m2}' },
    method: { text: 'CKD-EPI 2021 (sin coeficiente de raza), calculado desde la creatinina' },
  });
  medplum.setProfile(patient);
  return { medplum, patient };
}

async function renderPanel(medplum: MockClient, panel: string): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[`/health-record/biomarkers/${panel}`]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/health-record/biomarkers/:panelId" element={<BiomarkerPanel />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

test('panel renal: el eGFR calculado por el bot, con su unidad, el rango de la guía y cómo se obtuvo', async () => {
  const { medplum } = await pacienteConLaboratorio();
  await renderPanel(medplum, 'renal');

  expect(await screen.findByRole('heading', { name: 'Función renal y síndrome cardiorrenal' })).toBeInTheDocument();
  const egfr = await screen.findByRole('button', { name: /Filtrado glomerular estimado \(eGFR\)/ });
  expect(within(egfr).getByText('47 mL/min/1,73 m²')).toBeInTheDocument();
  expect(within(egfr).getByText('Esencial')).toBeInTheDocument();
  await act(async () => fireEvent.click(egfr));
  expect(screen.getByText(/≥ 60 mL\/min\/1,73 m²/)).toBeInTheDocument();
  expect(screen.getByText(/Último valor: CKD-EPI 2021/)).toBeInTheDocument();

  // Creatinina: sin rango de guía, vale el del laboratorio.
  const creatinina = screen.getByRole('button', { name: /Creatinina/ });
  expect(within(creatinina).getByText('1.3 mg/dL')).toBeInTheDocument();
  await act(async () => fireEvent.click(creatinina));
  expect(screen.getByText(/Rango de tu laboratorio:/)).toBeInTheDocument();
});

test('te faltan los esenciales sin resultado en el último año', async () => {
  const { medplum } = await pacienteConLaboratorio();
  await renderPanel(medplum, 'metabolico');
  expect(await screen.findByText('Te faltan 15 de 17 estudios esenciales')).toBeInTheDocument();
  expect(screen.getByText(/Sin resultados en los últimos 12 meses: Colesterol total, .*Cloro/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'envianos el PDF' })).toHaveAttribute('href', '/enviar-estudios');
});

test('un valor cargado a mano lleva todos los códigos del analito', async () => {
  const { medplum, patient } = await pacienteConLaboratorio();
  await renderPanel(medplum, 'renal');
  const egfr = await screen.findByRole('button', { name: /Filtrado glomerular estimado/ });
  await act(async () => fireEvent.click(egfr));
  const item = egfr.closest('.mantine-Accordion-item') as HTMLElement;
  await act(async () => fireEvent.click(within(item).getByRole('button', { name: 'Cargar resultado', hidden: true })));
  await act(async () => fireEvent.change(screen.getByLabelText(/Valor/), { target: { value: '72' } }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Guardar' })));

  const cargadas = await medplum.searchResources('Observation', `patient=Patient/${patient.id}&status=preliminary`);
  expect(cargadas).toHaveLength(1);
  expect(cargadas[0].code?.coding?.map((c) => c.code)).toEqual(['62238-1', '33914-3']);
  expect(cargadas[0].valueQuantity).toMatchObject({ value: 72, code: 'mL/min/{1.73_m2}' });
});

test('sin el catálogo del servidor, el panel lo dice en vez de quedar vacío', async () => {
  const medplum = new MockClient();
  vi.spyOn(medplum, 'searchResources').mockRejectedValue(new Error('Forbidden'));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  await renderPanel(medplum, 'cardiaco');
  expect(await screen.findByText(/no están disponibles en este momento/)).toBeInTheDocument();
});
