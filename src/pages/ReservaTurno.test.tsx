// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Reservar un turno desde el portal: Modalidad → Consulta → Profesional → Horario →
// Confirmar, y la respuesta del bot (tentativo con link de la seña). El bot se simula: el
// portal solo lo ejecuta.
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { ActivityDefinition, Patient, PractitionerRole, Schedule, Slot } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { indexarDefinicionesFhir } from '../fhir/__fixtures__/glp1';
import { EXT_AGENDA, SYSTEM_CONSENTIMIENTO, SYSTEM_GRUPO_ESPECIALIDAD, SYSTEM_MEDICO, SYSTEM_SERVICIO, V3_ACT_CODE } from '../fhir/agenda';
import { GetCare } from './GetCarePage';

// El MockClient solo filtra por `status`, `start`, `active`, … con las definiciones FHIR indexadas.
beforeAll(() => indexarDefinicionesFhir());

// El bot vive en el servidor: acá solo importa que el portal lo encuentre y lo ejecute.
vi.mock('../fhir/bots', () => ({
  buscarBotSOM: vi.fn(async (_medplum: unknown, nombre: string) => ({ resourceType: 'Bot', id: `bot-${nombre}`, name: nombre })),
}));

const AMB = { system: V3_ACT_CODE, code: 'AMB' };
const VR = { system: V3_ACT_CODE, code: 'VR' };
const USAGE = 'http://terminology.hl7.org/CodeSystem/usage-context-type';
const LINK = 'https://mp.test/pagar/abc';

// Mañana a las 18:00 de Argentina (21:00Z).
const manana = new Date();
manana.setUTCDate(manana.getUTCDate() + 1);
manana.setUTCHours(21, 0, 0, 0);
const INICIO = manana.toISOString();
const FIN = new Date(manana.getTime() + 30 * 60_000).toISOString();

async function escenario(): Promise<{ medplum: MockClient; patient: Patient; slotId: string }> {
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({ resourceType: 'Patient', name: [{ given: ['Ana'], family: 'García' }] });
  medplum.setProfile(patient);
  await medplum.createResource<ActivityDefinition>({
    resourceType: 'ActivityDefinition',
    status: 'active',
    name: 'CARDIOLOGIA',
    title: 'Consulta de Cardiología',
    identifier: [{ system: SYSTEM_SERVICIO, value: 'CARDIOLOGIA' }],
    topic: [{ coding: [{ system: SYSTEM_GRUPO_ESPECIALIDAD, code: 'cardiologia', display: 'Cardiología' }], text: 'Cardiología' }],
    useContext: [AMB, VR].map((m) => ({ code: { system: USAGE, code: 'workflow' }, valueCodeableConcept: { coding: [m] } })),
    extension: [{ url: EXT_AGENDA.precioArs, valueDecimal: 150000 }],
  });
  await medplum.createResource<PractitionerRole>({
    resourceType: 'PractitionerRole',
    active: true,
    identifier: [{ system: SYSTEM_MEDICO, value: 'ROL_MED_TEST' }],
    practitioner: { display: 'Dra. Prueba' },
    specialty: [{ text: 'Cardiología' }],
    code: [{ coding: [{ system: SYSTEM_SERVICIO, code: 'CARDIOLOGIA' }] }],
    extension: [AMB, VR].map((m) => ({ url: EXT_AGENDA.modalidad, valueCoding: m })),
  });
  const agenda = await medplum.createResource<Schedule>({
    resourceType: 'Schedule',
    identifier: [{ system: SYSTEM_MEDICO, value: 'SCH_MED_TEST' }],
    actor: [{ display: 'Dra. Prueba' }],
  });
  const slot = await medplum.createResource<Slot>({
    resourceType: 'Slot',
    status: 'free',
    schedule: { reference: `Schedule/${agenda.id}` },
    start: INICIO,
    end: FIN,
    extension: [{ url: EXT_AGENDA.profesional, valueString: 'MED_TEST' }, ...[AMB, VR].map((m) => ({ url: EXT_AGENDA.modalidad, valueCoding: m }))],
  });
  return { medplum, patient, slotId: slot.id! };
}

async function renderGetCare(medplum: MockClient): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/get-care']}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/get-care" element={<GetCare />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

const click = async (el: HTMLElement): Promise<void> => {
  await act(async () => {
    fireEvent.click(el);
  });
};

test('la paciente reserva una teleconsulta: acepta el consentimiento, el bot responde tentativo y se ofrece pagar la seña', async () => {
  const { medplum, patient, slotId } = await escenario();
  const ejecutar = vi.spyOn(medplum, 'executeBot').mockResolvedValue({
    ok: true,
    appointmentId: 'appt-1',
    estado: 'tentativo',
    descripcion: 'Teleconsulta de Cardiología',
    inicio: INICIO,
    fin: FIN,
    modalidad: 'teleconsulta',
    medicoCodigo: 'MED_TEST',
    incluida: false,
    senaARS: 75000,
    linkPago: LINK,
    expira: '2026-09-25T12:30:00Z',
  });
  await renderGetCare(medplum);

  // Modalidad → consulta (con el nombre de la modalidad y el precio) → profesional → horario.
  await click(await screen.findByRole('button', { name: 'Consulta por videollamada' }));
  const consulta = await screen.findByRole('button', { name: 'Teleconsulta de Cardiología' });
  expect(consulta).toHaveTextContent('$150.000');
  await click(consulta);
  await click(await screen.findByRole('button', { name: 'Dra. Prueba' }));
  await click(await screen.findByRole('button', { name: '18:00' }));

  // Confirmación: resumen, seña del 50 % y consentimiento de teleconsulta (todavía no lo firmó).
  expect(screen.getByText(/Para confirmar el turno se paga una seña/)).toHaveTextContent('$75.000');
  const reservar = screen.getByRole('button', { name: 'Reservar' });
  expect(reservar).toBeDisabled();
  await click(screen.getByRole('checkbox', { name: 'Leí y acepto el consentimiento de teleconsulta' }));
  await click(reservar);

  // El Consent quedó registrado y el bot recibió el pedido de la propia paciente.
  const consents = await medplum.searchResources('Consent', `patient=Patient/${patient.id}`);
  expect(consents).toHaveLength(1);
  expect(consents[0]?.policyRule?.coding?.[0]).toMatchObject({ system: SYSTEM_CONSENTIMIENTO, code: 'teleconsulta' });
  expect(ejecutar).toHaveBeenCalledWith('bot-som-reservar-portal', {
    pacienteRef: `Patient/${patient.id}`,
    servicioCodigo: 'CARDIOLOGIA',
    slotId,
    modalidad: 'teleconsulta',
  });

  // Resultado: tentativo con el link de la seña y la hora límite (09:30 de Argentina).
  expect(await screen.findByText('Reservado: falta la seña para confirmarlo')).toBeInTheDocument();
  expect(screen.getByText(/hasta las 09:30 h/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Pagar la seña con Mercado Pago' })).toHaveAttribute('href', LINK);
});

test('si el bot rechaza el horario, se muestra su mensaje y se puede elegir otro', async () => {
  const { medplum } = await escenario();
  vi.spyOn(medplum, 'executeBot').mockResolvedValue({ ok: false, mensaje: 'Ese horario ya está ocupado. Elegí otro.' });
  await renderGetCare(medplum);

  await click(await screen.findByRole('button', { name: 'Consulta en el centro' }));
  await click(await screen.findByRole('button', { name: 'Consulta de Cardiología' }));
  await click(await screen.findByRole('button', { name: 'Dra. Prueba' }));
  await click(await screen.findByRole('button', { name: '18:00' }));
  // Presencial: no hace falta el consentimiento de teleconsulta.
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  await click(screen.getByRole('button', { name: 'Reservar' }));

  expect(await screen.findByText('Ese horario ya está ocupado. Elegí otro.')).toBeInTheDocument();
  await click(screen.getByRole('button', { name: 'Elegir otro horario' }));
  expect(await screen.findByText('¿Cuándo?')).toBeInTheDocument();
});
