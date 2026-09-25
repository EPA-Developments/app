// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Communication, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { indexarDefinicionesFhir } from '../../fhir/__fixtures__/glp1';
import { cargarMensajes, crearConversacion } from '../../fhir/mensajes';
import { Conversacion } from './Conversacion';
import { Conversaciones } from './Conversaciones';
import { NuevoMensaje } from './NuevoMensaje';

async function paciente(): Promise<{ medplum: MockClient; patient: WithId<Patient> }> {
  indexarDefinicionesFhir();
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Ana'], family: 'García' }],
  });
  medplum.setProfile(patient);
  return { medplum, patient };
}

async function renderMensajes(medplum: MockClient, ruta: string): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[ruta]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/Communication" element={<Conversaciones />} />
              <Route path="/Communication/nuevo" element={<NuevoMensaje />} />
              <Route path="/Communication/:messageId" element={<Conversacion />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

function responder(medplum: MockClient, topic: WithId<Communication>, texto: string): Promise<WithId<Communication>> {
  return medplum.createResource<Communication>({
    resourceType: 'Communication',
    status: 'in-progress',
    subject: topic.subject,
    sender: { reference: 'Practitioner/dra', display: 'Dra. Laura Pérez' },
    recipient: [topic.subject ?? {}],
    partOf: [{ reference: `Communication/${topic.id}` }],
    sent: '2099-01-01T10:00:00.000Z',
    payload: [{ contentString: texto }],
  });
}

test('sin mensajes: todo en castellano y "Nuevo mensaje" a la vista', async () => {
  const { medplum } = await paciente();
  await renderMensajes(medplum, '/Communication');
  expect(await screen.findByText('Todavía no tenés mensajes')).toBeInTheDocument();
  expect(screen.queryByText(/In Progress|No messages found/)).not.toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Nuevo mensaje' })));
  expect(await screen.findByText('1. ¿Sobre qué es tu mensaje?')).toBeInTheDocument();
});

test('nuevo mensaje: primero el motivo, después el texto; al enviar abre la conversación', async () => {
  const { medplum, patient } = await paciente();
  await renderMensajes(medplum, '/Communication/nuevo');

  const enviar = screen.getByRole('button', { name: 'Enviar mensaje' });
  const caja = screen.getByRole('textbox');
  expect(caja).toBeDisabled();
  expect(enviar).toBeDisabled();

  await act(async () => fireEvent.click(screen.getByRole('radio', { name: /Turnos y reservas/ })));
  expect(caja).toBeEnabled();
  expect(caja).toHaveAttribute('placeholder', expect.stringMatching(/cambiar mi turno/));
  expect(enviar).toBeDisabled();

  await act(async () => fireEvent.change(caja, { target: { value: 'Necesito pasar mi turno al viernes.' } }));
  await act(async () => fireEvent.click(enviar));

  // La conversación: el motivo arriba, el mensaje y el lugar para escribir abajo.
  expect(await screen.findByRole('heading', { name: 'Turnos y reservas' })).toBeInTheDocument();
  expect(await screen.findByText('Necesito pasar mi turno al viernes.')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Tu mensaje' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Enviar' })).toBeInTheDocument();
  expect((await medplum.searchResources('Communication', `subject=Patient/${patient.id}`)).length).toBe(2);
});

test('con ?motivo= llega elegido; en consultas de salud avisa qué hacer ante una urgencia', async () => {
  const { medplum } = await paciente();
  await renderMensajes(medplum, '/Communication/nuevo?motivo=consulta-salud');
  expect(screen.getByRole('radio', { name: /Consulta sobre mi salud/ })).toBeChecked();
  expect(screen.getByText('Si es una urgencia, no esperes la respuesta')).toBeInTheDocument();
  expect(screen.getByRole('textbox')).toBeEnabled();
});

test('la lista muestra el motivo, el último mensaje y lo nuevo del equipo; la conversación lo marca leído', async () => {
  const { medplum, patient } = await paciente();
  const topic = await crearConversacion(medplum, patient, 'pagos', 'No veo mi seña registrada.');
  const respuesta = await responder(medplum, topic, 'Ya la registramos. ¡Gracias!');
  await renderMensajes(medplum, '/Communication');

  expect(await screen.findByText('Pagos y membresía')).toBeInTheDocument();
  expect(screen.getByText('Ya la registramos. ¡Gracias!')).toBeInTheDocument();
  expect(screen.getByText('1')).toBeInTheDocument();

  await act(async () => fireEvent.click(screen.getByText('Pagos y membresía')));
  expect(await screen.findByText('Dra. Laura Pérez')).toBeInTheDocument();
  expect(screen.getByText('No veo mi seña registrada.')).toBeInTheDocument();

  // Responder desde el lugar de escritura.
  await act(async () =>
    fireEvent.change(screen.getByRole('textbox', { name: 'Tu mensaje' }), { target: { value: 'Perfecto, gracias.' } })
  );
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Enviar' })));
  expect(await screen.findByText('Perfecto, gracias.')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Tu mensaje' })).toHaveValue('');

  const mensajes = await cargarMensajes(medplum, topic);
  expect(mensajes).toHaveLength(3);
  expect(mensajes.find((m) => m.id === respuesta.id)?.status).toBe('completed');
});

test('una conversación finalizada no deja escribir en ella, pero ofrece un mensaje nuevo con el mismo motivo', async () => {
  const { medplum, patient } = await paciente();
  const topic = await crearConversacion(medplum, patient, 'estudios', 'Subí el PDF.');
  await medplum.updateResource({ ...topic, status: 'completed' });
  await renderMensajes(medplum, `/Communication/${topic.id}`);

  expect(await screen.findByText('Esta conversación está finalizada')).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Tu mensaje' })).not.toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Escribir un mensaje nuevo' })));
  expect(await screen.findByRole('radio', { name: /Estudios y resultados/ })).toBeChecked();
});
