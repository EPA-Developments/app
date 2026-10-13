// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// «Estudios para esta consulta», el componente suelto: los estados que no se ven en las
// páginas (errores de red, archivos que no sirven, turnos cancelados o con la reserva vencida,
// adjuntos embebidos o de otra categoría), a dónde vuelve el foco del teclado después de cada
// acción y qué pasa si se pliega en medio de una subida. Lo que se escribe en FHIR lo fijan
// src/fhir/adjuntosTurno.test.ts y los recorridos completos, src/pages/Teleconsulta.test.tsx.
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Appointment, DocumentReference, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { JSX } from 'react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { forbidden, OperationOutcomeError } from '@medplum/core';
import { armarAdjuntoTurno, cargarAdjuntosDelTurno, MENSAJE_TIPO_NO_ADMITIDO } from '../../fhir/adjuntosTurno';
import { EXT_AGENDA, V3_ACT_CODE } from '../../fhir/agenda';
import { CONSENT_TYPE_CODE, CONSENT_TYPE_SYSTEM } from '../../fhir/consentimiento';
import { armarDocumentoLaboratorio, enviarLaboratorioPdf } from '../../fhir/estudios';
import { indexarDefinicionesFhir } from '../../fhir/__fixtures__/glp1';
import { AdjuntosDelTurno, AdjuntosDelTurnoPlegables } from './AdjuntosDelTurno';

const DIA = 24 * 3_600_000;

interface Escenario {
  medplum: MockClient;
  patient: WithId<Patient>;
  turno: WithId<Appointment>;
}

async function escenario(cambios: Partial<Appointment> = {}): Promise<Escenario> {
  indexarDefinicionesFhir();
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({ resourceType: 'Patient', name: [{ given: ['Alex'] }] });
  medplum.setProfile(patient);
  await medplum.createResource<DocumentReference>({
    resourceType: 'DocumentReference',
    status: 'current',
    type: { coding: [{ system: CONSENT_TYPE_SYSTEM, code: CONSENT_TYPE_CODE }] },
    subject: { reference: `Patient/${patient.id}` },
    date: new Date().toISOString(),
    content: [{ attachment: { contentType: 'text/plain', data: 'ZmlybWFkbw==' } }],
  });
  const inicio = new Date(Date.now() + 2 * DIA);
  const turno = await medplum.createResource<Appointment>({
    resourceType: 'Appointment',
    status: 'booked',
    start: inicio.toISOString(),
    end: new Date(inicio.getTime() + 30 * 60_000).toISOString(),
    participant: [{ actor: { reference: `Patient/${patient.id}` }, status: 'accepted' }],
    ...cambios,
  });
  return { medplum, patient, turno };
}

async function mostrar(medplum: MockClient, ui: JSX.Element): Promise<HTMLElement> {
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>{ui}</MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
  return screen.findByRole('region', { name: /^Estudios para esta consulta/ });
}

function elegirArchivo(zona: HTMLElement, file: File): void {
  fireEvent.change(zona.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
}

const pdf = (nombre: string): File =>
  new File([new TextEncoder().encode('%PDF-1.7\n')], nombre, { type: 'application/pdf' });

const TELECONSULTA: Partial<Appointment> = {
  extension: [{ url: EXT_AGENDA.modalidad, valueCoding: { system: V3_ACT_CODE, code: 'VR' } }],
};

const EN_EL_CENTRO: Partial<Appointment> = {
  extension: [{ url: EXT_AGENDA.modalidad, valueCoding: { system: V3_ACT_CODE, code: 'AMB' } }],
};

/** Adjunta un PDF con URL (como lo deja el server) directo en FHIR. */
function adjuntoConUrl(e: Escenario, titulo: string): Promise<WithId<DocumentReference>> {
  return e.medplum.createResource(
    armarAdjuntoTurno(e.patient, e.turno, {
      contentType: 'application/pdf',
      url: `https://example.com/binary/${titulo}`,
      title: titulo,
    })
  ) as Promise<WithId<DocumentReference>>;
}

/** La subida queda «en el aire» hasta que el test la suelta (una conexión lenta). */
function subidaLenta(medplum: MockClient): { soltar: () => void } {
  const subirDeVerdad = medplum.createAttachment.bind(medplum);
  let soltar = (): void => undefined;
  const espera = new Promise<void>((r) => {
    soltar = r;
  });
  type Subir = typeof medplum.createAttachment;
  vi.spyOn(medplum, 'createAttachment').mockImplementation((async (...args: Parameters<Subir>) => {
    await espera;
    return subirDeVerdad(...args);
  }) as Subir);
  return { soltar: () => soltar() };
}

test('el título es del nivel que se pide y nombra la sección', async () => {
  const { medplum, turno } = await escenario(TELECONSULTA);
  const zona = await mostrar(medplum, <AdjuntosDelTurno appointment={turno} nivel={2} />);
  expect(within(zona).getByRole('heading', { level: 2, name: 'Estudios para esta consulta' })).toBeInTheDocument();
  expect(within(zona).getByText(/Lo que adjuntes lo ve el profesional que te atiende/)).toBeInTheDocument();
  // La ficha previa no se relee sola: lo de último momento puede no aparecerle.
  expect(
    within(zona).getByText(/Si lo adjuntás a último momento, puede que todavía no le aparezca/)
  ).toBeInTheDocument();
  expect(await within(zona).findByText(/PDF o foto \(JPG o PNG\), de hasta 15 MB/)).toBeInTheDocument();
});

test('en un turno en el centro promete menos: el profesional los puede ver ese día, y pide llevarlos', async () => {
  // El dashboard los muestra solo desde la «Agenda de hoy» de su tablero, y no siempre.
  const { medplum, turno } = await escenario(EN_EL_CENTRO);
  const zona = await mostrar(medplum, <AdjuntosDelTurno appointment={turno} />);
  expect(
    within(zona).getByText(
      /Quedan guardados con este turno y el profesional los puede ver el día de la consulta\. Llevalos igual, por las dudas\./
    )
  ).toBeInTheDocument();
  expect(within(zona).queryByText(/lo ve el profesional que te atiende, antes de la consulta/)).not.toBeInTheDocument();
  expect(within(zona).getByRole('link', { name: 'Enviar estudios en PDF' })).toBeInTheDocument();
});

test('quitar una foto no habla de los PDF que ya mandó: una foto nunca es una copia', async () => {
  const e = await escenario();
  await adjuntoConUrl(e, 'receta.pdf');
  await e.medplum.createResource(
    armarAdjuntoTurno(e.patient, e.turno, {
      contentType: 'image/jpeg',
      url: 'https://example.com/binary/foto-orden',
      title: 'foto-orden.jpg',
    })
  );
  const zona = await mostrar(e.medplum, <AdjuntosDelTurno appointment={e.turno} />);

  await act(async () => fireEvent.click(await within(zona).findByRole('button', { name: 'Quitar foto-orden.jpg' })));
  const dialogo = await screen.findByRole('dialog', { name: '¿Quitar este estudio de la consulta?' });
  expect(within(dialogo).getByText(/deja de estar entre los estudios de esta consulta/)).toBeInTheDocument();
  expect(within(dialogo).queryByText(/Elegir de los que ya mandaste/)).not.toBeInTheDocument();
  await act(async () => fireEvent.click(within(dialogo).getByRole('button', { name: 'No, dejarlo' })));

  // Un PDF sí puede serlo: ahí la salvedad aparece.
  await act(async () => fireEvent.click(within(zona).getByRole('button', { name: 'Quitar receta.pdf' })));
  const otro = await screen.findByRole('dialog', { name: '¿Quitar este estudio de la consulta?' });
  expect(within(otro).getByText(/Si lo sumaste con «Elegir de los que ya mandaste»/)).toBeInTheDocument();
});

test('con el contexto del turno, el título dice de qué turno es (para lectores de pantalla)', async () => {
  const { medplum, turno } = await escenario();
  const zona = await mostrar(
    medplum,
    <AdjuntosDelTurno appointment={turno} contexto="Consulta de Cardiología, 14 de octubre de 2026 a las 15:00" />
  );
  // (jsdom separa con un espacio el texto oculto; un lector de pantalla lo lee igual.)
  expect(zona).toHaveAccessibleName(
    /^Estudios para esta consulta ?: Consulta de Cardiología, 14 de octubre de 2026 a las 15:00$/
  );
  // Lo que se ve sigue siendo el título corto.
  expect(within(zona).getByText('Estudios para esta consulta')).toBeVisible();
});

test('un archivo que no es PDF ni foto: lo dice y no adjunta nada', async () => {
  const { medplum, turno } = await escenario();
  const zona = await mostrar(medplum, <AdjuntosDelTurno appointment={turno} />);
  await within(zona).findByRole('button', { name: 'Subir un PDF o una foto' });
  await act(async () => elegirArchivo(zona, new File(['hola'], 'notas.jpg', { type: 'image/jpeg' })));
  expect(await within(zona).findByRole('alert')).toHaveTextContent(MENSAJE_TIPO_NO_ADMITIDO);
  expect(await cargarAdjuntosDelTurno(medplum, turno.id)).toHaveLength(0);
});

test('si no se pudo leer la lista, lo dice (no «no adjuntaste nada») y deja reintentar', async () => {
  const { medplum, patient, turno } = await escenario();
  await medplum.createResource(
    armarAdjuntoTurno(patient, turno, { contentType: 'application/pdf', data: 'JVBERi0=', title: 'a.pdf' })
  );
  const buscar = medplum.searchResources.bind(medplum);
  type Buscar = typeof medplum.searchResources;
  const fallar = vi
    .spyOn(medplum, 'searchResources')
    .mockImplementation(((...args: Parameters<Buscar>) =>
      args[0] === 'DocumentReference' && JSON.stringify(args[1]).includes('related')
        ? Promise.reject(new Error('Failed to fetch'))
        : buscar(...args)) as Buscar);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

  const zona = await mostrar(medplum, <AdjuntosDelTurno appointment={turno} />);
  expect(await within(zona).findByText('No pudimos traer los estudios adjuntos a esta consulta.')).toBeInTheDocument();
  expect(within(zona).queryByText('Todavía no adjuntaste estudios a esta consulta.')).not.toBeInTheDocument();
  // Igual se puede adjuntar.
  expect(await within(zona).findByRole('button', { name: 'Subir un PDF o una foto' })).toBeInTheDocument();

  fallar.mockRestore();
  await act(async () => fireEvent.click(within(zona).getByRole('button', { name: 'Reintentar' })));
  expect(await within(zona).findByText('a.pdf')).toBeInTheDocument();
});

test('si adjuntar falla por la red: el mensaje, y la lista sigue', async () => {
  const { medplum, patient, turno } = await escenario();
  await medplum.createResource(
    armarAdjuntoTurno(patient, turno, {
      contentType: 'application/pdf',
      url: 'https://example.com/binary/b1',
      title: 'ya.pdf',
    })
  );
  vi.spyOn(medplum, 'createAttachment').mockRejectedValue(new Error('Failed to fetch'));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

  const zona = await mostrar(medplum, <AdjuntosDelTurno appointment={turno} />);
  await within(zona).findByRole('button', { name: 'Subir un PDF o una foto' });
  await act(async () => elegirArchivo(zona, pdf('nuevo.pdf')));
  expect(await within(zona).findByRole('alert')).toHaveTextContent(/No pudimos adjuntar el estudio/);
  expect(within(zona).getByRole('link', { name: /ya\.pdf/ })).toBeInTheDocument();
  expect(within(zona).getByRole('button', { name: 'Subir un PDF o una foto' })).toBeEnabled();
});

test('un adjunto embebido (sin URL) se lista como texto; uno de otra categoría, sin «Quitar»', async () => {
  const { medplum, patient, turno } = await escenario();
  await medplum.createResource(
    armarAdjuntoTurno(patient, turno, { contentType: 'image/jpeg', data: '/9j/', title: 'foto.jpg', size: 3 })
  );
  // Lo que otro (p. ej. el equipo) asoció al turno: se ve, pero la persona no lo quita.
  await medplum.createResource<DocumentReference>({
    resourceType: 'DocumentReference',
    status: 'current',
    subject: { reference: `Patient/${patient.id}` },
    date: new Date().toISOString(),
    description: 'Indicaciones previas',
    content: [{ attachment: { contentType: 'application/pdf', url: 'javascript:alert(1)' } }],
    context: { related: [{ reference: `Appointment/${turno.id}` }] },
  });

  const zona = await mostrar(medplum, <AdjuntosDelTurno appointment={turno} />);
  expect(await within(zona).findByText('foto.jpg')).toBeInTheDocument();
  expect(within(zona).queryByRole('link', { name: /foto\.jpg/ })).not.toBeInTheDocument();
  expect(within(zona).getByRole('button', { name: 'Quitar foto.jpg' })).toBeInTheDocument();
  // Una URL que no es https no se linkea.
  expect(within(zona).getByText('Indicaciones previas')).toBeInTheDocument();
  expect(within(zona).queryByRole('link', { name: /Indicaciones previas/ })).not.toBeInTheDocument();
  expect(within(zona).queryByRole('button', { name: 'Quitar Indicaciones previas' })).not.toBeInTheDocument();
});

test('si quitar falla, lo dice en el diálogo y el estudio sigue adjunto', async () => {
  const { medplum, patient, turno } = await escenario();
  await medplum.createResource(
    armarAdjuntoTurno(patient, turno, {
      contentType: 'application/pdf',
      url: 'https://example.com/binary/b1',
      title: 'eco.pdf',
    })
  );
  vi.spyOn(medplum, 'updateResource').mockRejectedValue(new Error('Failed to fetch'));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

  const zona = await mostrar(medplum, <AdjuntosDelTurno appointment={turno} />);
  await act(async () => fireEvent.click(await within(zona).findByRole('button', { name: 'Quitar eco.pdf' })));
  const dialogo = await screen.findByRole('dialog', { name: '¿Quitar este estudio de la consulta?' });
  // La cruz del diálogo también tiene nombre (y 44 px): no es un botón mudo.
  expect(within(dialogo).getByRole('button', { name: 'Cerrar sin quitar' })).toBeInTheDocument();
  await act(async () => fireEvent.click(within(dialogo).getByRole('button', { name: 'Sí, quitarlo' })));
  expect(await within(dialogo).findByRole('alert')).toHaveTextContent(/No pudimos quitar el estudio/);
  await act(async () => fireEvent.click(within(dialogo).getByRole('button', { name: 'No, dejarlo' })));
  expect(within(zona).getByRole('link', { name: /eco\.pdf/ })).toBeInTheDocument();
  expect(await cargarAdjuntosDelTurno(medplum, turno.id)).toHaveLength(1);
});

test('«Elegir de los que ya mandaste» sin PDFs enviados lo dice', async () => {
  const { medplum, turno } = await escenario();
  const zona = await mostrar(medplum, <AdjuntosDelTurno appointment={turno} />);
  await act(async () =>
    fireEvent.click(await within(zona).findByRole('button', { name: 'Elegir de los que ya mandaste' }))
  );
  expect(await within(zona).findByText('Todavía no mandaste estudios en PDF.')).toBeInTheDocument();
});

test('«Elegir de los que ya mandaste»: si el único que mandó está anulado, no dice que ya está adjunto', async () => {
  const { medplum, patient, turno } = await escenario();
  const enviado = await medplum.createResource(
    armarDocumentoLaboratorio(patient, {
      contentType: 'application/pdf',
      url: 'https://example.com/binary/anulado',
      title: 'anulado.pdf',
    })
  );
  await medplum.updateResource({ ...enviado, status: 'entered-in-error' });

  const zona = await mostrar(medplum, <AdjuntosDelTurno appointment={turno} />);
  await act(async () =>
    fireEvent.click(await within(zona).findByRole('button', { name: 'Elegir de los que ya mandaste' }))
  );
  expect(await within(zona).findByText('No tenés estudios enviados para elegir.')).toBeInTheDocument();
  expect(within(zona).queryByText(/ya están adjuntos/)).not.toBeInTheDocument();
});

test('«Elegir de los que ya mandaste» no ofrece uno que se mandó embebido (el profesional no lo podría abrir) y dice por qué', async () => {
  const { medplum, patient, turno } = await escenario();
  const sinBinario = vi.spyOn(medplum, 'createAttachment').mockRejectedValue(new OperationOutcomeError(forbidden));
  await enviarLaboratorioPdf(medplum, patient, pdf('embebido.pdf'));
  sinBinario.mockRestore();
  await enviarLaboratorioPdf(medplum, patient, pdf('con-archivo.pdf'));

  const zona = await mostrar(medplum, <AdjuntosDelTurno appointment={turno} />);
  await act(async () =>
    fireEvent.click(await within(zona).findByRole('button', { name: 'Elegir de los que ya mandaste' }))
  );
  expect(await within(zona).findByRole('button', { name: 'Adjuntar con-archivo.pdf' })).toBeInTheDocument();
  expect(within(zona).queryByRole('button', { name: 'Adjuntar embebido.pdf' })).not.toBeInTheDocument();
  expect(
    within(zona).getByText(/Algunos PDFs que mandaste no se pueden elegir acá: el profesional no podría abrirlos/)
  ).toBeInTheDocument();
});

test('«Elegir de los que ya mandaste» no ofrece un PDF anulado', async () => {
  const { medplum, patient, turno } = await escenario();
  const enviado = (titulo: string, status: DocumentReference['status']): Promise<DocumentReference> =>
    medplum
      .createResource(
        armarDocumentoLaboratorio(patient, {
          contentType: 'application/pdf',
          url: `https://example.com/binary/${titulo}`,
          title: titulo,
        })
      )
      .then((d) => medplum.updateResource({ ...d, status }));
  await enviado('vigente.pdf', 'current');
  await enviado('anulado.pdf', 'entered-in-error');

  const zona = await mostrar(medplum, <AdjuntosDelTurno appointment={turno} />);
  await act(async () =>
    fireEvent.click(await within(zona).findByRole('button', { name: 'Elegir de los que ya mandaste' }))
  );
  expect(await within(zona).findByRole('button', { name: 'Adjuntar vigente.pdf' })).toBeInTheDocument();
  expect(within(zona).queryByRole('button', { name: 'Adjuntar anulado.pdf' })).not.toBeInTheDocument();
});

test('una reserva vencida sin la seña no admite estudios y lo dice', async () => {
  const { medplum, turno } = await escenario({
    status: 'pending',
    extension: [{ url: EXT_AGENDA.reservaExpira, valueDateTime: new Date(Date.now() - 3_600_000).toISOString() }],
  });
  const zona = await mostrar(medplum, <AdjuntosDelTurno appointment={turno} />);
  expect(within(zona).getByText('Venció la reserva de este turno: no se pueden sumar estudios.')).toBeInTheDocument();
  expect(await within(zona).findByText('No se adjuntaron estudios a esta consulta.')).toBeInTheDocument();
  expect(within(zona).queryAllByRole('button')).toHaveLength(0);
});

test('un turno cancelado no admite estudios y lo dice', async () => {
  const { medplum, turno } = await escenario({ status: 'cancelled' });
  const zona = await mostrar(medplum, <AdjuntosDelTurno appointment={turno} />);
  expect(within(zona).getByText('Este turno se canceló: no se pueden sumar más estudios.')).toBeInTheDocument();
  expect(await within(zona).findByText('No se adjuntaron estudios a esta consulta.')).toBeInTheDocument();
  expect(within(zona).queryAllByRole('button')).toHaveLength(0);
});

test('plegado: el botón dice cuántos hay y se actualiza al quitar', async () => {
  const { medplum, patient, turno } = await escenario();
  for (const titulo of ['uno.pdf', 'dos.pdf']) {
    await medplum.createResource(
      armarAdjuntoTurno(patient, turno, {
        contentType: 'application/pdf',
        url: `https://example.com/binary/${titulo}`,
        title: titulo,
      })
    );
  }
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <AdjuntosDelTurnoPlegables appointment={turno} patient={patient} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
  const boton = await screen.findByRole('button', { name: 'Adjuntar estudios (2)' });
  expect(boton).toHaveAttribute('aria-controls');
  await act(async () => fireEvent.click(boton));
  await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Quitar uno.pdf' })));
  await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Sí, quitarlo' })));
  expect(await screen.findByRole('button', { name: 'Adjuntar estudios (1)' })).toHaveAttribute('aria-expanded', 'true');
});

describe('el foco del teclado, después de cada acción', () => {
  test('quitar: el diálogo dice que al profesional deja de aparecerle; al cancelar vuelve al «Quitar», al quitar va al título', async () => {
    const e = await escenario();
    await adjuntoConUrl(e, 'uno.pdf');
    await adjuntoConUrl(e, 'dos.pdf');
    const zona = await mostrar(e.medplum, <AdjuntosDelTurno appointment={e.turno} />);
    const quitarUno = await within(zona).findByRole('button', { name: 'Quitar uno.pdf' });

    await act(async () => fireEvent.click(quitarUno));
    let dialogo = await screen.findByRole('dialog', { name: '¿Quitar este estudio de la consulta?' });
    // El dashboard lee solo lo vigente, al abrir la ficha, y no la relee sola: si ya la tiene
    // abierta, lo sigue viendo hasta que la vuelve a abrir. El archivo no se borra.
    expect(
      within(dialogo).getByText(
        /deja de estar entre los estudios de esta consulta\. Si el profesional ya tiene abierta tu ficha, lo va a seguir viendo hasta que la vuelva a abrir\. El archivo no se borra/
      )
    ).toBeInTheDocument();
    // Un PDF puede ser la copia de uno ya enviado: el envío original sigue a la vista.
    expect(
      within(dialogo).getByText(/Si lo sumaste con «Elegir de los que ya mandaste», el PDF que mandaste antes/)
    ).toBeInTheDocument();
    expect(within(dialogo).getByRole('link', { name: 'Mensajes' })).toHaveAttribute('href', '/Communication');
    await act(async () => fireEvent.click(within(dialogo).getByRole('button', { name: 'No, dejarlo' })));
    expect(document.activeElement).toBe(within(zona).getByRole('button', { name: 'Quitar uno.pdf' }));

    await act(async () => fireEvent.click(within(zona).getByRole('button', { name: 'Quitar uno.pdf' })));
    dialogo = await screen.findByRole('dialog', { name: '¿Quitar este estudio de la consulta?' });
    await act(async () => fireEvent.click(within(dialogo).getByRole('button', { name: 'Sí, quitarlo' })));
    expect(await within(zona).findByText('Quitamos «uno.pdf» de esta consulta.')).toBeInTheDocument();
    // Su botón ya no existe: el foco no queda en <body>, va al título de la sección.
    expect(document.activeElement).toBe(within(zona).getByRole('heading', { name: 'Estudios para esta consulta' }));
  });

  test('subir: el foco vuelve a «Subir un PDF o una foto», salga bien o mal', async () => {
    const { medplum, turno } = await escenario();
    const zona = await mostrar(medplum, <AdjuntosDelTurno appointment={turno} />);
    const subir = await within(zona).findByRole('button', { name: 'Subir un PDF o una foto' });

    await act(async () => elegirArchivo(zona, pdf('orden.pdf')));
    expect(await within(zona).findByText('Listo: «orden.pdf» quedó adjunto a esta consulta.')).toBeInTheDocument();
    expect(document.activeElement).toBe(subir);

    subir.blur();
    await act(async () => elegirArchivo(zona, new File(['hola'], 'notas.jpg', { type: 'image/jpeg' })));
    expect(await within(zona).findByRole('alert')).toHaveTextContent(MENSAJE_TIPO_NO_ADMITIDO);
    expect(document.activeElement).toBe(subir);
  });

  test('adjuntar uno ya enviado: su fila desaparece y el foco va a «Elegir de los que ya mandaste»', async () => {
    const { medplum, patient, turno } = await escenario();
    await enviarLaboratorioPdf(medplum, patient, pdf('hemograma.pdf'));
    const zona = await mostrar(medplum, <AdjuntosDelTurno appointment={turno} />);
    const elegir = await within(zona).findByRole('button', { name: 'Elegir de los que ya mandaste' });
    await act(async () => fireEvent.click(elegir));
    await act(async () => fireEvent.click(await within(zona).findByRole('button', { name: 'Adjuntar hemograma.pdf' })));
    expect(await within(zona).findByText('Listo: «hemograma.pdf» quedó adjunto a esta consulta.')).toBeInTheDocument();
    expect(document.activeElement).toBe(elegir);
  });
});

test('mientras se sube un archivo no se puede quitar otro: «Quitar» se deshabilita y el diálogo, si ya estaba abierto, lo dice', async () => {
  const e = await escenario();
  await adjuntoConUrl(e, 'eco.pdf');
  const actualizar = vi.spyOn(e.medplum, 'updateResource');
  const zona = await mostrar(e.medplum, <AdjuntosDelTurno appointment={e.turno} />);
  await act(async () => fireEvent.click(await within(zona).findByRole('button', { name: 'Quitar eco.pdf' })));
  const dialogo = await screen.findByRole('dialog', { name: '¿Quitar este estudio de la consulta?' });

  // Con el diálogo abierto arranca una subida lenta (p. ej. la elegida justo antes).
  const lenta = subidaLenta(e.medplum);
  await act(async () => elegirArchivo(zona, pdf('nuevo.pdf')));
  await act(async () => fireEvent.click(within(dialogo).getByRole('button', { name: 'Sí, quitarlo' })));
  expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
    'Esperá a que termine de adjuntarse el otro estudio y probá de nuevo.'
  );
  expect(actualizar).not.toHaveBeenCalled();

  await act(async () => fireEvent.click(within(dialogo).getByRole('button', { name: 'No, dejarlo' })));
  expect(within(zona).getByRole('button', { name: 'Quitar eco.pdf' })).toBeDisabled();

  await act(async () => lenta.soltar());
  expect(await within(zona).findByText('Listo: «nuevo.pdf» quedó adjunto a esta consulta.')).toBeInTheDocument();
  expect(within(zona).getByRole('button', { name: 'Quitar eco.pdf' })).toBeEnabled();
  expect(await cargarAdjuntosDelTurno(e.medplum, e.turno.id)).toHaveLength(2);
});

describe('plegado', () => {
  async function mostrarPlegable(e: Escenario, contexto?: string): Promise<HTMLElement> {
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={e.medplum}>
            <MantineProvider>
              <AdjuntosDelTurnoPlegables appointment={e.turno} patient={e.patient} contexto={contexto} />
            </MantineProvider>
          </MedplumProvider>
        </MemoryRouter>
      );
    });
    return screen.findByRole('button', { name: /^Adjuntar estudios/ });
  }

  test('si se pliega en medio de una subida, la subida sigue: el contador sube y el aviso queda junto al botón', async () => {
    const e = await escenario();
    const boton = await mostrarPlegable(e);
    await act(async () => fireEvent.click(boton));
    const zona = await screen.findByRole('region', { name: 'Estudios para esta consulta' });
    await within(zona).findByRole('button', { name: 'Subir un PDF o una foto' });

    const lenta = subidaLenta(e.medplum);
    await act(async () => elegirArchivo(zona, pdf('orden.pdf')));
    await act(async () => fireEvent.click(boton));
    expect(boton).toHaveAttribute('aria-expanded', 'false');
    // Plegado, lo que está pasando se ve junto al botón.
    expect(screen.getByRole('status')).toHaveTextContent('Subiendo «orden.pdf»…');

    await act(async () => lenta.soltar());
    expect(await screen.findByRole('button', { name: 'Adjuntar estudios (1)' })).toBe(boton);
    expect(screen.getByRole('status')).toHaveTextContent('Listo: «orden.pdf» quedó adjunto a esta consulta.');
    expect(await cargarAdjuntosDelTurno(e.medplum, e.turno.id)).toHaveLength(1);

    // Al abrir de nuevo, es la misma sección (con su resultado), no una nueva.
    await act(async () => fireEvent.click(boton));
    const otraVez = await screen.findByRole('region', { name: 'Estudios para esta consulta' });
    expect(otraVez).toBe(zona);
    expect(within(otraVez).getByRole('link', { name: /orden\.pdf/ })).toBeInTheDocument();
  });

  test('si la subida falla con la sección plegada, el error aparece junto al botón', async () => {
    const e = await escenario();
    const boton = await mostrarPlegable(e);
    await act(async () => fireEvent.click(boton));
    const zona = await screen.findByRole('region', { name: 'Estudios para esta consulta' });
    await within(zona).findByRole('button', { name: 'Subir un PDF o una foto' });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let fallar = (): void => undefined;
    const espera = new Promise<void>((r) => {
      fallar = r;
    });
    vi.spyOn(e.medplum, 'createAttachment').mockImplementation(async () => {
      await espera;
      throw new Error('Failed to fetch');
    });

    await act(async () => elegirArchivo(zona, pdf('orden.pdf')));
    await act(async () => fireEvent.click(boton));
    await act(async () => fallar());
    expect(await screen.findByRole('alert')).toHaveTextContent(/No pudimos adjuntar el estudio/);
    expect(boton).toHaveAttribute('aria-expanded', 'false');
  });

  test('un «Listo» de antes de plegar no se repite junto al botón', async () => {
    const e = await escenario();
    const boton = await mostrarPlegable(e);
    await act(async () => fireEvent.click(boton));
    const zona = await screen.findByRole('region', { name: 'Estudios para esta consulta' });
    await within(zona).findByRole('button', { name: 'Subir un PDF o una foto' });
    await act(async () => elegirArchivo(zona, pdf('orden.pdf')));
    expect(await within(zona).findByText('Listo: «orden.pdf» quedó adjunto a esta consulta.')).toBeInTheDocument();
    await act(async () => fireEvent.click(boton));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  test('con el contexto, el botón dice de qué turno es', async () => {
    const e = await escenario();
    const boton = await mostrarPlegable(e, 'Consulta de Cardiología, 14 de octubre de 2026 a las 15:00');
    expect(boton).toHaveAccessibleName('Adjuntar estudios');
    expect(boton).toHaveAccessibleDescription('Consulta de Cardiología, 14 de octubre de 2026 a las 15:00');
  });
});
