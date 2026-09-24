// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { Observation, Patient, Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Suspense } from 'react';
import type { JSX } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { SeguimientoGlp1Card } from '../../components/SeguimientoGlp1Card';
import { cargarFixtureGlp1, indexarDefinicionesFhir } from '../../fhir/__fixtures__/glp1';
import { INDICACION_GLP1_CODE, TASK_TIPO_SYSTEM } from '../../fhir/glp1';
import { ActionItem } from './ActionItem';
import { SeguimientoGlp1 } from './SeguimientoGlp1';
import { datosGraficoPeso } from './SeguimientoGlp1.grafico';

function Marca({ texto }: { texto: string }): JSX.Element {
  return <div>{texto}</div>;
}

async function renderEn(medplum: MockClient, ruta: string): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[ruta]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Suspense fallback={<div>cargando</div>}>
              <Routes>
                <Route path="/" element={<SeguimientoGlp1Card />} />
                <Route path="/care-plan/glp1" element={<SeguimientoGlp1 />} />
                <Route path="/care-plan/action-items/:itemId" element={<ActionItem />} />
                <Route path="/health-record/vitals/weight" element={<Marca texto="pantalla de peso" />} />
                <Route path="/Communication" element={<Marca texto="pantalla de mensajes" />} />
              </Routes>
            </Suspense>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

async function pacienteConPrograma(pesos: number[] = []): Promise<MockClient> {
  const medplum = new MockClient();
  const patient = await cargarFixtureGlp1(medplum);
  for (const [i, kg] of pesos.entries()) {
    await medplum.createResource<Observation>({
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '29463-7' }] },
      subject: { reference: `Patient/${patient.id}` },
      effectiveDateTime: `2026-09-${String(10 + i).padStart(2, '0')}T12:00:00.000Z`,
      valueQuantity: { value: kg, unit: 'kg' },
    });
  }
  medplum.setProfile(patient);
  return medplum;
}

async function pacienteNuevo(conIndicacion: boolean): Promise<MockClient> {
  indexarDefinicionesFhir();
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({ resourceType: 'Patient', name: [{ family: 'Nuevo' }] });
  if (conIndicacion) {
    await medplum.createResource<Task>({
      resourceType: 'Task',
      status: 'requested',
      intent: 'order',
      code: { coding: [{ system: TASK_TIPO_SYSTEM, code: INDICACION_GLP1_CODE }] },
      for: { reference: `Patient/${patient.id}` },
    });
  }
  medplum.setProfile(patient);
  return medplum;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-23T15:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('página Mi seguimiento GLP-1', () => {
  test('AC-2: controles en orden, con ventana y estado', async () => {
    await renderEn(await pacienteConPrograma(), '/care-plan/glp1');
    expect(await screen.findByText('Semaglutida')).toBeInTheDocument();
    expect(screen.getByText('Empezás el 05/10')).toBeInTheDocument();
    expect(screen.getByText('Seguí siempre las indicaciones de tu médico.')).toBeInTheDocument();

    const controles = screen.getAllByTestId(/^control-semana-/).map((el) => el.dataset.testid);
    expect(controles).toEqual([
      'control-semana-0',
      'control-semana-4',
      'control-semana-12',
      'control-semana-20',
      'control-semana-26',
    ]);
    const basal = within(screen.getByTestId('control-semana-0'));
    expect(basal.getByText('Control inicial')).toBeInTheDocument();
    expect(basal.getByText('Agendado: mié 30/09 10:00 · Reservado')).toBeInTheDocument();
    for (const semana of [4, 12, 20, 26]) {
      expect(
        within(screen.getByTestId(`control-semana-${semana}`)).getByText('Por agendar: Recepción te va a contactar')
      ).toBeInTheDocument();
    }
    expect(within(screen.getByTestId('control-semana-12')).getByText('Entre el 28/12 y el 04/01/2027')).toBeInTheDocument();
    expect(within(screen.getByTestId('proximo-control')).getByText('Próximo paso: Control inicial')).toBeInTheDocument();
  });

  test('AC-3 y AC-4: revisión en la semana 20, meta y estudios con nombre visible', async () => {
    await renderEn(await pacienteConPrograma(), '/care-plan/glp1');
    const revision = within(await screen.findByTestId('control-semana-20'));
    expect(revision.getByText('Revisión de tu respuesta al tratamiento')).toBeInTheDocument();
    expect(revision.getByText(/12 semanas después de llegar a tu dosis/)).toBeInTheDocument();
    expect(screen.getByTestId('meta-glp1')).toHaveTextContent(
      'Tu meta: llegar a 87,4 kg o menos para el 22/02/2027.'
    );

    const basal = within(screen.getByTestId('control-semana-0')).getByText(/^Traé los resultados de:/);
    for (const nombre of ['Hemoglobina glicosilada (HbA1c)', 'Filtrado glomerular estimado (eGFR)', 'ALT (TGP)']) {
      expect(basal).toHaveTextContent(nombre);
    }
    expect(within(screen.getByTestId('control-semana-4')).queryByText(/Traé los resultados/)).not.toBeInTheDocument();
  });

  test('AC-7: no muestra la nota clínica ni las descripciones para el equipo', async () => {
    await renderEn(await pacienteConPrograma(), '/care-plan/glp1');
    await screen.findByText('Semaglutida');
    expect(document.body).not.toHaveTextContent('Antes de concluir que no responde');
    expect(document.body).not.toHaveTextContent('considerar cambio de molécula');
    expect(document.body).not.toHaveTextContent('Dejar registrado el punto de partida');
  });

  test('AC-9: último peso y "Cargar mi peso" lleva a la pantalla existente', async () => {
    await renderEn(await pacienteConPrograma([92, 90.5]), '/care-plan/glp1');
    expect(await screen.findByText(/Tu último peso:/)).toHaveTextContent('Tu último peso: 90,5 kg, el 11/09/2026.');
    fireEvent.click(screen.getByRole('button', { name: 'Cargar mi peso' }));
    expect(await screen.findByText('pantalla de peso')).toBeInTheDocument();
  });

  test('"Escribile a tu equipo" lleva a Mensajes', async () => {
    await renderEn(await pacienteConPrograma(), '/care-plan/glp1');
    fireEvent.click(await screen.findByRole('button', { name: 'Escribile a tu equipo' }));
    expect(await screen.findByText('pantalla de mensajes')).toBeInTheDocument();
  });

  test('AC-6: sin programa, la página lo explica', async () => {
    await renderEn(await pacienteNuevo(false), '/care-plan/glp1');
    expect(await screen.findByText('Todavía no tenés un seguimiento de tratamiento GLP-1')).toBeInTheDocument();
  });

  test('AC-6: con la indicación pendiente, muestra el plan en preparación', async () => {
    await renderEn(await pacienteNuevo(true), '/care-plan/glp1');
    expect(await screen.findByText('Tu médico está preparando tu plan de seguimiento')).toBeInTheDocument();
  });
});

describe('AC-9: gráfico de peso', () => {
  const pesos = [
    { fecha: '2026-09-10T12:00:00.000Z', kg: 92 },
    { fecha: '2026-09-17T12:00:00.000Z', kg: 90.5 },
  ];

  test('con meta en kg agrega la línea de meta', () => {
    const datos = datosGraficoPeso(pesos, { tipo: 'kg', valor: 87.4, fecha: '2027-02-22' });
    expect(datos?.labels).toEqual(['10/09', '17/09']);
    expect(datos?.datasets.map((d) => d.label)).toEqual(['Tu peso (kg)', 'Tu meta (kg)']);
    expect(datos?.datasets[1].data).toEqual([87.4, 87.4]);
  });

  test('con meta relativa no hay línea de meta; sin pesos no hay gráfico', () => {
    expect(datosGraficoPeso(pesos, { tipo: 'porcentaje', porcentaje: 5 })?.datasets).toHaveLength(1);
    expect(datosGraficoPeso([], { tipo: 'kg', valor: 87.4 })).toBeUndefined();
  });
});

describe('tarjeta de Inicio', () => {
  test('AC-1: muestra las semanas y el próximo control, y lleva a la página', async () => {
    await renderEn(await pacienteConPrograma(), '/');
    const tarjeta = await screen.findByRole('button', { name: 'Ver mi seguimiento GLP-1' });
    expect(tarjeta).toHaveTextContent('Empezás el 05/10');
    expect(tarjeta).toHaveTextContent('Próximo: Control inicial');
    expect(tarjeta).toHaveTextContent('Agendado: mié 30/09 10:00 · Reservado');
    fireEvent.click(tarjeta);
    expect(await screen.findByText('Mi seguimiento GLP-1')).toBeInTheDocument();
  });

  test('AC-6: sin programa no renderiza nada', async () => {
    await renderEn(await pacienteNuevo(false), '/');
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('button', { name: 'Ver mi seguimiento GLP-1' })).not.toBeInTheDocument();
  });
});

test('AC-7: el detalle genérico del CarePlan GLP-1 redirige a la página nueva', async () => {
  await renderEn(await pacienteConPrograma(), '/care-plan/action-items/careplan-3');
  expect(await screen.findByText('Mi seguimiento GLP-1')).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent('Antes de concluir que no responde');
});
