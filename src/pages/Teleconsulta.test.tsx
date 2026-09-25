// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Teleconsulta en el portal: en "Mis turnos" las videollamadas traen sus acciones (entrar,
// pagar, mover, cancelar) y los turnos presenciales siguen siendo de solo lectura; la
// videollamada de un turno vive en /teleconsulta/:appointmentId.
import { BOTS, TC, buildServicioTeleconsulta, buildTurnoVirtual, identificadorBot } from '@epa/teleconsulta-core';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Appointment, HealthcareService, Patient, Practitioner } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { indexarDefinicionesFhir } from '../fhir/__fixtures__/glp1';
import { GetCare } from './GetCarePage';
import { TeleconsultaPage } from './TeleconsultaPage';

const DIA = 24 * 3_600_000;

interface Escenario {
  medplum: MockClient;
  virtual: Appointment & { id: string };
  pendiente: Appointment & { id: string };
}

async function escenario(): Promise<Escenario> {
  indexarDefinicionesFhir();
  const medplum = new MockClient();
  const patient = (await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Ana'], family: 'García' }],
  })) as Patient & { id: string };
  const medica = (await medplum.createResource<Practitioner>({
    resourceType: 'Practitioner',
    name: [{ prefix: ['Dra.'], given: ['Laura'], family: 'Paz' }],
  })) as Practitioner & { id: string };
  const servicio = (await medplum.createResource<HealthcareService>(
    buildServicioTeleconsulta({
      nombre: 'Teleconsulta cardiología',
      codigo: 'TELECONSULTA_CARDIO',
      politica: { precio: { valor: 35000, moneda: 'ARS' } },
    })
  )) as HealthcareService & { id: string };
  medplum.setProfile(patient);

  const turno = async (dias: number, extra: Partial<Appointment>): Promise<Appointment & { id: string }> => {
    const inicio = new Date(Date.now() + dias * DIA);
    return (await medplum.createResource<Appointment>({
      ...buildTurnoVirtual({
        paciente: { reference: `Patient/${patient.id}` },
        profesional: { reference: `Practitioner/${medica.id}`, display: 'Dra. Laura Paz' },
        servicio: { reference: `HealthcareService/${servicio.id}` },
        titulo: 'Teleconsulta cardiología',
        inicio: inicio.toISOString(),
        fin: new Date(inicio.getTime() + 30 * 60_000).toISOString(),
        estado: 'booked',
      }),
      ...extra,
    })) as Appointment & { id: string };
  };

  const virtual = await turno(3, { identifier: [{ system: TC.pagoMercadoPago, value: '1001' }] });
  const pendiente = await turno(5, { status: 'pending' });
  await medplum.createResource<Appointment>({
    resourceType: 'Appointment',
    status: 'booked',
    description: 'Ecocardiograma',
    start: new Date(Date.now() + 2 * DIA).toISOString(),
    end: new Date(Date.now() + 2 * DIA + 30 * 60_000).toISOString(),
    participant: [{ actor: { reference: `Patient/${patient.id}` }, status: 'accepted' }],
  });
  return { medplum, virtual, pendiente };
}

async function renderEn(medplum: MockClient, ruta: string): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[ruta]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/get-care" element={<GetCare />} />
              <Route path="/teleconsulta/:appointmentId" element={<TeleconsultaPage />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

describe('Mis turnos con videollamadas', () => {
  test('las videollamadas traen sus acciones y los presenciales siguen de solo lectura', async () => {
    const { medplum, virtual, pendiente } = await escenario();
    await renderEn(medplum, '/get-care');

    const tarjeta = await screen.findByTestId(`turno-${virtual.id}`);
    expect(within(tarjeta).getByText('Confirmado')).toBeInTheDocument();
    expect(within(tarjeta).getByRole('link', { name: 'Entrar a la videollamada' })).toHaveAttribute(
      'href',
      `/teleconsulta/${virtual.id}`
    );
    expect(within(tarjeta).getByRole('button', { name: 'Mover' })).toBeInTheDocument();
    expect(within(tarjeta).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();

    const aPagar = screen.getByTestId(`turno-${pendiente.id}`);
    expect(within(aPagar).getByRole('button', { name: 'Pagar con Mercado Pago' })).toBeInTheDocument();

    // El presencial sigue igual: sin acciones.
    expect(screen.getByText('Ecocardiograma')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Mover' })).toHaveLength(2);

    // Orden cronológico: presencial (2 días), videollamada (3), pendiente (5).
    const texto = document.body.textContent ?? '';
    expect(texto.indexOf('Ecocardiograma')).toBeLessThan(texto.indexOf('Confirmado'));
  });

  test('mover una videollamada muestra cuántos movimientos quedan', async () => {
    const { medplum, virtual } = await escenario();
    const bot = vi.spyOn(medplum, 'executeBot').mockResolvedValue({
      ok: true,
      mensaje: 'Movimos tu turno. Te quedan 2 movimientos.',
    });
    await renderEn(medplum, '/get-care');

    const tarjeta = await screen.findByTestId(`turno-${virtual.id}`);
    fireEvent.click(within(tarjeta).getByRole('button', { name: 'Mover' }));
    expect(await screen.findByText(/Te quedan 3 movimientos para este turno/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nuevo día y horario'), { target: { value: '2030-05-20T18:30' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mover turno' }));
    });

    expect(await screen.findByText('Movimos tu turno. Te quedan 2 movimientos.')).toBeInTheDocument();
    expect(bot).toHaveBeenCalledWith(
      identificadorBot(BOTS.mover),
      expect.objectContaining({ appointmentId: virtual.id }),
      'application/json'
    );
  });
});

describe('/teleconsulta/:appointmentId', () => {
  test('antes de la hora dice desde cuándo se puede entrar', async () => {
    const { medplum, virtual } = await escenario();
    await renderEn(medplum, `/teleconsulta/${virtual.id}`);
    expect(await screen.findByText(/Vas a poder entrar desde el/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar a la videollamada' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Volver a Mis turnos' })).toHaveAttribute('href', '/get-care');
  });

  test('pendiente de pago ofrece pagar', async () => {
    const { medplum, pendiente } = await escenario();
    await renderEn(medplum, `/teleconsulta/${pendiente.id}`);
    expect(await screen.findByText('Para confirmar la videollamada falta el pago.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pagar con Mercado Pago' })).toBeInTheDocument();
  });
});
