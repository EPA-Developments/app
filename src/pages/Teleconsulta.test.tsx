// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Teleconsulta en el portal, con el modelo y los bots de SOM: en "Mis turnos" las
// teleconsultas (v3-ActCode `VR`) traen Entrar, Pagar la seña y Cancelar (R-14, primero se
// muestra qué pasa); los presenciales siguen de solo lectura; la videollamada vive en
// /teleconsulta/:appointmentId. Solo se ejecutan bots `som-teleconsulta-*`.
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Appointment, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { buscarBotSOM } from '../fhir/bots';
import { EXT_AGENDA, V3_ACT_CODE } from '../fhir/agenda';
import { indexarDefinicionesFhir } from '../fhir/__fixtures__/glp1';
import { GetCare } from './GetCarePage';
import { TeleconsultaPage } from './TeleconsultaPage';

// Los bots viven en recepcionistas: acá importa qué bot se pide y con qué.
vi.mock('../fhir/bots', () => ({
  buscarBotSOM: vi.fn(async (_medplum: unknown, nombre: string) => ({ resourceType: 'Bot', id: `bot-${nombre}`, name: nombre })),
}));

const DIA = 24 * 3_600_000;
const JITSI = 'https://meet.segundaopinionmedica.org/som-0123456789abcdef0123456789abcdef';
const PAGO = 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=123';

interface Escenario {
  medplum: MockClient;
  confirmada: Appointment & { id: string };
  tentativa: Appointment & { id: string };
  presencial: Appointment & { id: string };
}

async function escenario(): Promise<Escenario> {
  indexarDefinicionesFhir();
  const medplum = new MockClient();
  const patient = (await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Ana'], family: 'García' }],
  })) as Patient & { id: string };
  medplum.setProfile(patient);

  const turno = async (
    dias: number,
    status: Appointment['status'],
    descripcion: string,
    codigo: 'VR' | 'AMB',
    extra: Appointment['extension'] = []
  ): Promise<Appointment & { id: string }> => {
    const inicio = new Date(Date.now() + dias * DIA);
    return medplum.createResource<Appointment>({
      resourceType: 'Appointment',
      status,
      description: descripcion,
      start: inicio.toISOString(),
      end: new Date(inicio.getTime() + 30 * 60_000).toISOString(),
      participant: [
        { actor: { reference: `Patient/${patient.id}` }, status: 'accepted' },
        { actor: { reference: 'Practitioner/dra', display: 'Dra. Laura Paz' }, status: 'accepted' },
      ],
      extension: [{ url: EXT_AGENDA.modalidad, valueCoding: { system: V3_ACT_CODE, code: codigo } }, ...extra],
    });
  };

  const presencial = await turno(2, 'booked', 'Consulta de Cardiología', 'AMB');
  const confirmada = await turno(3, 'booked', 'Teleconsulta de Cardiología', 'VR', [
    { url: EXT_AGENDA.teleconsultaUrl, valueUrl: JITSI },
  ]);
  const tentativa = await turno(5, 'pending', 'Teleconsulta de Nutrición', 'VR');
  return { medplum, confirmada, tentativa, presencial };
}

async function renderEn(medplum: MockClient, ruta: string, redirigir?: (url: string) => void): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[ruta]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/get-care" element={<GetCare />} />
              <Route path="/teleconsulta/:appointmentId" element={<TeleconsultaPage redirigir={redirigir} />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

afterEach(() => {
  // Regla: el portal solo pide bots de SOM.
  for (const [, nombre] of vi.mocked(buscarBotSOM).mock.calls) {
    expect(nombre).toMatch(/^som-/);
  }
  vi.mocked(buscarBotSOM).mockClear();
});

describe('Mis turnos con teleconsultas', () => {
  test('la teleconsulta confirmada trae Entrar y Cancelar; la tentativa, Pagar; la presencial, nada', async () => {
    const { medplum, confirmada, tentativa, presencial } = await escenario();
    await renderEn(medplum, '/get-care');

    const tarjeta = await screen.findByTestId(`turno-${confirmada.id}`);
    expect(within(tarjeta).getByText('Confirmado')).toBeInTheDocument();
    expect(within(tarjeta).getByRole('link', { name: 'Entrar a la videollamada' })).toHaveAttribute(
      'href',
      `/teleconsulta/${confirmada.id}`
    );
    expect(within(tarjeta).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();

    const aPagar = screen.getByTestId(`turno-${tentativa.id}`);
    expect(within(aPagar).getByRole('button', { name: 'Pagar la seña' })).toBeInTheDocument();
    expect(within(aPagar).queryByRole('link', { name: 'Entrar a la videollamada' })).not.toBeInTheDocument();

    const enElCentro = screen.getByTestId(`turno-${presencial.id}`);
    expect(within(enElCentro).queryAllByRole('button')).toHaveLength(0);
    expect(within(enElCentro).queryAllByRole('link')).toHaveLength(0);
  });

  test('cancelar primero muestra qué pasa con la seña (R-14) y recién al confirmar cancela', async () => {
    const { medplum, confirmada } = await escenario();
    const bot = vi
      .spyOn(medplum, 'executeBot')
      .mockResolvedValueOnce({
        ok: true,
        cancelado: false,
        conSena: true,
        consumeSesion: false,
        mensaje: 'Faltan más de 24 horas: la seña no se pierde. Recepción te contacta para devolverla o usarla en otro turno.',
      })
      .mockResolvedValueOnce({ ok: true, cancelado: true, mensaje: 'Cancelamos tu teleconsulta. Recepción te contacta.' });
    await renderEn(medplum, '/get-care');

    const tarjeta = await screen.findByTestId(`turno-${confirmada.id}`);
    await act(async () => {
      fireEvent.click(within(tarjeta).getByRole('button', { name: 'Cancelar' }));
    });
    expect(await screen.findByText(/la seña no se pierde/)).toBeInTheDocument();
    expect(bot).toHaveBeenLastCalledWith('bot-som-teleconsulta-cancelar', { appointmentId: confirmada.id, confirmar: false });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar el turno' }));
    });
    expect(bot).toHaveBeenLastCalledWith('bot-som-teleconsulta-cancelar', { appointmentId: confirmada.id, confirmar: true });
    expect(await screen.findByText('Cancelamos tu teleconsulta. Recepción te contacta.')).toBeInTheDocument();
  });

  test('pagar la seña sigue solo un checkout de Mercado Pago', async () => {
    const { medplum, tentativa } = await escenario();
    const bot = vi.spyOn(medplum, 'executeBot').mockResolvedValue({ ok: true, url: 'javascript:alert(1)' });
    await renderEn(medplum, '/get-care');

    const tarjeta = await screen.findByTestId(`turno-${tentativa.id}`);
    await act(async () => {
      fireEvent.click(within(tarjeta).getByRole('button', { name: 'Pagar la seña' }));
    });
    expect(bot).toHaveBeenCalledWith('bot-som-teleconsulta-pago', { appointmentId: tentativa.id });
    expect(await within(tarjeta).findByText(/No pudimos abrir el pago/)).toBeInTheDocument();
  });
});

describe('/teleconsulta/:appointmentId', () => {
  test('antes de hora muestra cuándo abre la sala (lo decide el bot)', async () => {
    const { medplum, confirmada } = await escenario();
    const bot = vi.spyOn(medplum, 'executeBot').mockResolvedValue({
      ok: false,
      abre: new Date().toISOString(),
      mensaje: 'La sala abre 15 minutos antes del turno, a las 17:45.',
    });
    await renderEn(medplum, `/teleconsulta/${confirmada.id}`);

    expect(await screen.findByText('Teleconsulta de Cardiología')).toBeInTheDocument();
    expect(screen.getByText(/Dra\. Laura Paz/)).toBeInTheDocument();
    expect(bot).not.toHaveBeenCalled(); // entrar marca presencia: solo al tocar el botón
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Entrar a la videollamada' }));
    });
    expect(bot).toHaveBeenCalledWith('bot-som-teleconsulta-entrar', { appointmentId: confirmada.id });
    expect(await screen.findByText('La sala abre 15 minutos antes del turno, a las 17:45.')).toBeInTheDocument();
    expect(screen.queryByTitle('Videollamada')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a Mis turnos' })).toHaveAttribute('href', '/get-care');
  });

  test('con la sala abierta muestra la videollamada del Jitsi de SOM', async () => {
    const { medplum, confirmada } = await escenario();
    vi.spyOn(medplum, 'executeBot').mockResolvedValue({ ok: true, url: JITSI });
    await renderEn(medplum, `/teleconsulta/${confirmada.id}`);

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Entrar a la videollamada' }));
    });
    expect(await screen.findByTitle('Videollamada')).toHaveAttribute('src', JITSI);
    expect(screen.getByRole('link', { name: /Abrir la videollamada en otra pestaña/ })).toHaveAttribute('href', JITSI);
  });

  test('sin la seña ofrece pagarla y redirige a Mercado Pago', async () => {
    const { medplum, tentativa } = await escenario();
    vi.spyOn(medplum, 'executeBot')
      .mockResolvedValueOnce({ ok: false, pagar: true, mensaje: 'Tu turno todavía no está confirmado: pagá la seña para confirmarlo.' })
      .mockResolvedValueOnce({ ok: true, url: PAGO });
    const redirigir = vi.fn();
    await renderEn(medplum, `/teleconsulta/${tentativa.id}`, redirigir);

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Entrar a la videollamada' }));
    });
    expect(await screen.findByText(/pagá la seña para confirmarlo/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pagar la seña' }));
    });
    expect(redirigir).toHaveBeenCalledWith(PAGO);
  });

  test('un turno presencial no es una sala de videollamada', async () => {
    const { medplum, presencial } = await escenario();
    await renderEn(medplum, `/teleconsulta/${presencial.id}`);
    expect(await screen.findByText('Este turno no es una teleconsulta.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entrar a la videollamada' })).not.toBeInTheDocument();
  });
});

test('fuera de src/vendor, el portal no usa el módulo de teleconsulta de otro proyecto', () => {
  const fuentes = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../vendor/**', '!../**/*.test.{ts,tsx}'], {
    query: '?raw',
    import: 'default',
    eager: true,
  });
  expect(Object.keys(fuentes).length).toBeGreaterThan(20);
  const usan = Object.entries(fuentes)
    .filter(([, codigo]) => /@epa\/teleconsulta|epa-teleconsulta-/.test(codigo))
    .map(([archivo]) => archivo);
  expect(usan).toEqual([]);
});
