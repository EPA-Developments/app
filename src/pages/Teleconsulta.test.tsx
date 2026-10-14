// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Teleconsulta en el portal, con el modelo y los bots de SOM: en "Mis turnos" las
// teleconsultas (v3-ActCode `VR`) traen Entrar, Pagar la seña y Cancelar (R-14, primero se
// muestra qué pasa); los presenciales siguen de solo lectura; la videollamada vive en
// /teleconsulta/:appointmentId. Solo se ejecutan bots `som-teleconsulta-*`.
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Appointment, DocumentReference, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { RUTA_ENVIAR_ESTUDIOS } from '../components/AccionesRapidas';
import { buscarBotSOM } from '../fhir/bots';
import {
  adjuntarArchivo,
  adjuntarDeMisEstudios,
  armarAdjuntoTurno,
  CATEGORIA_ADJUNTO_TURNO,
} from '../fhir/adjuntosTurno';
import { EXT_AGENDA, V3_ACT_CODE } from '../fhir/agenda';
import { CONSENT_TYPE_CODE, CONSENT_TYPE_SYSTEM } from '../fhir/consentimiento';
import { CATEGORIA_LABORATORIO, DOCUMENTO_CATEGORY_SYSTEM, enviarLaboratorioPdf } from '../fhir/estudios';
import { indexarDefinicionesFhir } from '../fhir/__fixtures__/glp1';
import { estadoDeLaEspera, MINUTOS_PARA_ENTRAR_IGUAL, puedeEntrarIgual } from '../fhir/teleconsulta';
import { GetCare } from './GetCarePage';
import { TeleconsultaPage } from './TeleconsultaPage';

// Los bots viven en recepcionistas: acá importa qué bot se pide y con qué.
vi.mock('../fhir/bots', () => ({
  buscarBotSOM: vi.fn(async (_medplum: unknown, nombre: string) => ({
    resourceType: 'Bot',
    id: `bot-${nombre}`,
    name: nombre,
  })),
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

async function renderEn(
  medplum: MockClient,
  ruta: string,
  redirigir?: (url: string) => void,
  refrescoEsperaMs?: number
): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[ruta]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/get-care" element={<GetCare />} />
              <Route
                path="/teleconsulta/:appointmentId"
                element={<TeleconsultaPage redirigir={redirigir} refrescoEsperaMs={refrescoEsperaMs} />}
              />
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
  test('la teleconsulta confirmada trae Entrar y Cancelar; la tentativa, Pagar; la presencial, solo sus estudios', async () => {
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

    // El presencial no tiene acciones de teleconsulta: solo adjuntar estudios (plegado).
    const enElCentro = screen.getByTestId(`turno-${presencial.id}`);
    expect(
      within(enElCentro)
        .getAllByRole('button')
        .map((b) => b.textContent)
    ).toEqual(['Adjuntar estudios']);
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
        mensaje:
          'Faltan más de 24 horas: la seña no se pierde. Recepción te contacta para devolverla o usarla en otro turno.',
      })
      .mockResolvedValueOnce({
        ok: true,
        cancelado: true,
        mensaje: 'Cancelamos tu teleconsulta. Recepción te contacta.',
      });
    await renderEn(medplum, '/get-care');

    const tarjeta = await screen.findByTestId(`turno-${confirmada.id}`);
    await act(async () => {
      fireEvent.click(within(tarjeta).getByRole('button', { name: 'Cancelar' }));
    });
    expect(await screen.findByText(/la seña no se pierde/)).toBeInTheDocument();
    expect(bot).toHaveBeenLastCalledWith('bot-som-teleconsulta-cancelar', {
      appointmentId: confirmada.id,
      confirmar: false,
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar el turno' }));
    });
    expect(bot).toHaveBeenLastCalledWith('bot-som-teleconsulta-cancelar', {
      appointmentId: confirmada.id,
      confirmar: true,
    });
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

  test('si el médico ya entró, la sala del Jitsi de SOM se abre directo', async () => {
    const { medplum, confirmada } = await escenario();
    await medplum.updateResource<Appointment>({ ...confirmada, status: 'checked-in' });
    vi.spyOn(medplum, 'executeBot').mockResolvedValue({ ok: true, url: JITSI });
    await renderEn(medplum, `/teleconsulta/${confirmada.id}`);

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Entrar a la videollamada' }));
    });
    expect(await screen.findByTitle('Videollamada')).toHaveAttribute('src', JITSI);
    expect(screen.getByRole('link', { name: /Abrir la videollamada en otra pestaña/ })).toHaveAttribute('href', JITSI);
    expect(screen.queryByText('Ya estás en la sala de espera')).not.toBeInTheDocument();
    // El «Iniciar sesión» del Jitsi es para el médico: arriba de la sala se le dice que no lo toque.
    expect(screen.getByText(/no toques «Iniciar sesión»: ese botón es para tu médico/)).toBeInTheDocument();
  });

  test('la fecha del turno sale en castellano y en hora de Argentina, no en la del navegador', async () => {
    const { medplum, confirmada } = await escenario();
    await medplum.updateResource<Appointment>({ ...confirmada, start: '2026-10-13T22:30:00Z' });
    await renderEn(medplum, `/teleconsulta/${confirmada.id}`);
    expect(await screen.findByText(/martes 13 de octubre de 2026, 19:30/)).toBeInTheDocument();
    expect(screen.queryByText(/10\/13\/2026|PM/)).not.toBeInTheDocument();
  });

  test('sin la seña ofrece pagarla y redirige a Mercado Pago', async () => {
    const { medplum, tentativa } = await escenario();
    vi.spyOn(medplum, 'executeBot')
      .mockResolvedValueOnce({
        ok: false,
        pagar: true,
        mensaje: 'Tu turno todavía no está confirmado: pagá la seña para confirmarlo.',
      })
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

// La paciente entra como invitada y el médico modera: si ella abre la sala antes, el
// Jitsi le muestra «Esperando al anfitrión» con un botón de iniciar sesión, que parece
// pedirle un usuario. Espera en el portal hasta que el turno pasa a checked-in (el médico
// entró desde el dashboard).
describe('La espera hasta que entra el médico', () => {
  test('qué dice el turno sobre la espera', () => {
    expect(estadoDeLaEspera({ status: 'booked' })).toBe('esperando');
    expect(estadoDeLaEspera({ status: 'arrived' })).toBe('esperando');
    expect(estadoDeLaEspera({ status: 'checked-in' })).toBe('medico-en-sala');
    expect(estadoDeLaEspera({ status: 'fulfilled' })).toBe('terminada');
    expect(estadoDeLaEspera({ status: 'cancelled' })).toBe('cancelada');
  });

  test(`entrar igual se ofrece desde ${MINUTOS_PARA_ENTRAR_IGUAL} minutos después del inicio`, () => {
    const start = '2026-10-01T15:00:00Z';
    expect(puedeEntrarIgual({ start }, new Date('2026-10-01T15:04:59Z'))).toBe(false);
    expect(puedeEntrarIgual({ start }, new Date('2026-10-01T15:05:00Z'))).toBe(true);
    expect(puedeEntrarIgual({}, new Date())).toBe(false);
  });

  test('espera en el portal, sin el Jitsi, y la sala se abre sola cuando entra el médico', async () => {
    const { medplum, confirmada } = await escenario();
    vi.spyOn(medplum, 'executeBot').mockResolvedValue({ ok: true, url: JITSI });
    await renderEn(medplum, `/teleconsulta/${confirmada.id}`, undefined, 20);

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Entrar a la videollamada' }));
    });
    expect(await screen.findByText('Ya estás en la sala de espera')).toBeInTheDocument();
    expect(screen.getByText(/Tu médico todavía no entró/)).toBeInTheDocument();
    expect(screen.queryByTitle('Videollamada')).not.toBeInTheDocument();
    // Faltan días para el turno: no se le ofrece entrar igual.
    expect(screen.queryByRole('button', { name: 'Entrar igual a la sala' })).not.toBeInTheDocument();

    // El médico entra desde el dashboard: el turno pasa a checked-in.
    await act(async () => {
      await medplum.updateResource<Appointment>({ ...confirmada, status: 'checked-in' });
    });
    expect(await screen.findByTitle('Videollamada', {}, { timeout: 2000 })).toHaveAttribute('src', JITSI);
  });

  test('si el médico no aparece, pasados unos minutos del inicio puede entrar igual', async () => {
    const { medplum, confirmada } = await escenario();
    const inicio = new Date(Date.now() - (MINUTOS_PARA_ENTRAR_IGUAL + 1) * 60_000);
    const empezado = await medplum.updateResource<Appointment>({
      ...confirmada,
      start: inicio.toISOString(),
      end: new Date(inicio.getTime() + 30 * 60_000).toISOString(),
    });
    vi.spyOn(medplum, 'executeBot').mockResolvedValue({ ok: true, url: JITSI });
    await renderEn(medplum, `/teleconsulta/${empezado.id}`);

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Entrar a la videollamada' }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Entrar igual a la sala' }));
    });
    expect(await screen.findByTitle('Videollamada')).toHaveAttribute('src', JITSI);
  });

  test('si la consulta se cierra mientras espera, lo dice', async () => {
    const { medplum, confirmada } = await escenario();
    vi.spyOn(medplum, 'executeBot').mockResolvedValue({ ok: true, url: JITSI });
    await renderEn(medplum, `/teleconsulta/${confirmada.id}`, undefined, 20);

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Entrar a la videollamada' }));
    });
    await act(async () => {
      await medplum.updateResource<Appointment>({ ...confirmada, status: 'fulfilled' });
    });
    expect(await screen.findByText('Esta consulta ya terminó.', {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.queryByTitle('Videollamada')).not.toBeInTheDocument();
  });
});

// «Estudios para esta consulta»: la persona adjunta estudios al turno para que el profesional
// los vea antes. El vínculo vive en el documento (`context.related`). El dashboard trae solo lo
// vigente de la persona y no filtra por categoría (docs/adjuntos-turno.md).
describe('Estudios adjuntos al turno', () => {
  async function firmarConsentimiento(medplum: MockClient): Promise<WithId<Patient>> {
    const patient = medplum.getProfile() as WithId<Patient>;
    await medplum.createResource<DocumentReference>({
      resourceType: 'DocumentReference',
      status: 'current',
      type: { coding: [{ system: CONSENT_TYPE_SYSTEM, code: CONSENT_TYPE_CODE }] },
      subject: { reference: `Patient/${patient.id}` },
      date: new Date().toISOString(),
      content: [{ attachment: { contentType: 'text/plain', data: 'ZmlybWFkbw==' } }],
    });
    return patient;
  }

  function pdf(nombre: string): File {
    return new File([new TextEncoder().encode('%PDF-1.7\n%estudio')], nombre, { type: 'application/pdf' });
  }

  function foto(nombre: string): File {
    return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16])], nombre, { type: 'image/jpeg' });
  }

  function elegirArchivo(seccion: HTMLElement, file: File): void {
    const input = seccion.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
  }

  // Las dos búsquedas de la ficha previa del dashboard, con sus mismos filtros (`subject` y
  // `status=current`; docs/adjuntos-turno.md). Es lo que el profesional ve al abrir (o volver a
  // abrir) la ficha previa: el dashboard no la relee sola mientras está abierta.

  /** «Adjuntó a este turno»: lo vigente de la persona que apunta al turno. */
  async function loQueTraeElDashboard(medplum: MockClient, appointmentId: string): Promise<DocumentReference[]> {
    const patient = medplum.getProfile() as WithId<Patient>;
    return [
      ...(await medplum.searchResources(
        'DocumentReference',
        { related: `Appointment/${appointmentId}`, subject: `Patient/${patient.id}`, status: 'current' },
        { cache: 'no-cache' }
      )),
    ];
  }

  /**
   * «Su historia de documentos», con los mismos filtros: lo vigente de la persona. No aplica
   * lo que el dashboard hace después (sacar lo del turno, una fila por archivo, las 12 primeras).
   */
  async function laHistoriaQueTraeElDashboard(medplum: MockClient): Promise<DocumentReference[]> {
    const patient = medplum.getProfile() as WithId<Patient>;
    return [
      ...(await medplum.searchResources(
        'DocumentReference',
        { subject: `Patient/${patient.id}`, status: 'current' },
        { cache: 'no-cache' }
      )),
    ];
  }

  const seccion = (): Promise<HTMLElement> => screen.findByRole('region', { name: 'Estudios para esta consulta' });

  test('en la sala: adjuntar un PDF crea el documento con context.related al turno y categoría adjunto-turno', async () => {
    const { medplum, confirmada } = await escenario();
    const patient = await firmarConsentimiento(medplum);
    await renderEn(medplum, `/teleconsulta/${confirmada.id}`);

    const zona = await seccion();
    expect(within(zona).getByRole('heading', { level: 3, name: 'Estudios para esta consulta' })).toBeInTheDocument();
    expect(within(zona).getByText(/No lo lee nuestra IA ni se suma a tus biomarcadores/)).toBeInTheDocument();
    expect(within(zona).getByRole('link', { name: 'Enviar estudios en PDF' })).toHaveAttribute(
      'href',
      RUTA_ENVIAR_ESTUDIOS
    );
    expect(await within(zona).findByText('Todavía no adjuntaste estudios a esta consulta.')).toBeInTheDocument();

    await within(zona).findByRole('button', { name: 'Subir un PDF o una foto' });
    await act(async () => elegirArchivo(zona, pdf('eco-doppler.pdf')));
    expect(
      await within(zona).findByText('Listo: «eco-doppler.pdf» quedó adjunto a esta consulta.')
    ).toBeInTheDocument();

    const link = within(zona).getByRole('link', { name: /eco-doppler\.pdf/ });
    expect(link).toHaveAttribute('href', expect.stringMatching(/^https:\/\//));
    expect(link).toHaveAttribute('target', '_blank');

    const docs = await loQueTraeElDashboard(medplum, confirmada.id);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      status: 'current',
      subject: { reference: `Patient/${patient.id}` },
      category: [{ coding: [{ system: DOCUMENTO_CATEGORY_SYSTEM, code: CATEGORIA_ADJUNTO_TURNO }] }],
      context: { related: [{ reference: `Appointment/${confirmada.id}` }] },
      content: [{ attachment: { contentType: 'application/pdf', title: 'eco-doppler.pdf' } }],
    });
  });

  test('elegir uno de los PDFs ya enviados crea una copia que apunta al mismo archivo, sin tocar el original', async () => {
    const { medplum, confirmada } = await escenario();
    const patient = await firmarConsentimiento(medplum);
    const original = (await enviarLaboratorioPdf(medplum, patient, pdf('hemograma.pdf')))
      .documento as WithId<DocumentReference>;
    await renderEn(medplum, `/teleconsulta/${confirmada.id}`);

    const zona = await seccion();
    const elegir = await within(zona).findByRole('button', { name: 'Elegir de los que ya mandaste' });
    expect(elegir).toHaveAttribute('aria-expanded', 'false');
    await act(async () => fireEvent.click(elegir));
    expect(elegir).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(elegir.getAttribute('aria-controls') as string)).toBeVisible();

    await act(async () => fireEvent.click(await within(zona).findByRole('button', { name: 'Adjuntar hemograma.pdf' })));
    expect(await within(zona).findByText('Listo: «hemograma.pdf» quedó adjunto a esta consulta.')).toBeInTheDocument();
    // Ya adjunto, deja de ofrecerse.
    expect(within(zona).queryByRole('button', { name: 'Adjuntar hemograma.pdf' })).not.toBeInTheDocument();
    expect(within(zona).getByText('Los estudios que mandaste ya están adjuntos a esta consulta.')).toBeInTheDocument();

    const docs = await loQueTraeElDashboard(medplum, confirmada.id);
    expect(docs).toHaveLength(1);
    expect(docs[0].id).not.toBe(original.id);
    expect(docs[0].category?.[0].coding?.[0].code).toBe(CATEGORIA_ADJUNTO_TURNO);
    expect(docs[0].content[0].attachment).toMatchObject({
      url: original.content[0].attachment.url,
      contentType: 'application/pdf',
      title: 'hemograma.pdf',
    });

    // El original (lo que procesa el bot de laboratorio) no cambió.
    const releido = await medplum.readResource('DocumentReference', original.id);
    expect(releido.meta?.versionId).toBe(original.meta?.versionId);
    expect(releido.context).toBeUndefined();
    expect(releido.category?.[0].coding?.[0].code).toBe(CATEGORIA_LABORATORIO);
  });

  test('quitar lo saca de context.related y lo pasa a entered-in-error: deja de aparecer al abrir la ficha', async () => {
    const { medplum, confirmada } = await escenario();
    const patient = await firmarConsentimiento(medplum);
    const { documento } = await adjuntarArchivo(medplum, patient, confirmada, pdf('orden-vieja.pdf'));
    await renderEn(medplum, `/teleconsulta/${confirmada.id}`);

    const zona = await seccion();
    await act(async () => fireEvent.click(await within(zona).findByRole('button', { name: 'Quitar orden-vieja.pdf' })));
    const dialogo = await screen.findByRole('dialog', { name: '¿Quitar este estudio de la consulta?' });
    // El dashboard lee solo lo vigente: al profesional deja de aparecerle (docs/adjuntos-turno.md).
    expect(
      within(dialogo).getByText(/lo va a seguir viendo hasta que la vuelva a abrir\. El archivo no se borra/)
    ).toBeInTheDocument();
    await act(async () => fireEvent.click(within(dialogo).getByRole('button', { name: 'Sí, quitarlo' })));

    expect(await within(zona).findByText('Todavía no adjuntaste estudios a esta consulta.')).toBeInTheDocument();
    expect(within(zona).getByText('Quitamos «orden-vieja.pdf» de esta consulta.')).toBeInTheDocument();
    const quitado = await medplum.readResource('DocumentReference', documento?.id as string);
    expect(quitado.status).toBe('entered-in-error');
    expect(quitado.context?.related).toBeUndefined();
    expect(await loQueTraeElDashboard(medplum, confirmada.id)).toHaveLength(0);
    // Tampoco en su historia de documentos: ahí queda solo el consentimiento.
    expect((await laHistoriaQueTraeElDashboard(medplum)).map((d) => d.id)).not.toContain(documento?.id);
  });

  test('quitar la copia de un estudio ya enviado: sale del turno, pero el original sigue a la vista del profesional', async () => {
    const { medplum, confirmada } = await escenario();
    const patient = await firmarConsentimiento(medplum);
    const original = (await enviarLaboratorioPdf(medplum, patient, pdf('hemograma.pdf')))
      .documento as WithId<DocumentReference>;
    const { documento: copia } = await adjuntarDeMisEstudios(medplum, patient, confirmada, original);
    await renderEn(medplum, `/teleconsulta/${confirmada.id}`);

    const zona = await seccion();
    await act(async () => fireEvent.click(await within(zona).findByRole('button', { name: 'Quitar hemograma.pdf' })));
    const dialogo = await screen.findByRole('dialog', { name: '¿Quitar este estudio de la consulta?' });
    // El diálogo avisa que el envío original sigue: es lo que el profesional va a seguir viendo.
    expect(
      within(dialogo).getByText(/Si lo sumaste con «Elegir de los que ya mandaste», el PDF que mandaste antes/)
    ).toBeInTheDocument();
    await act(async () => fireEvent.click(within(dialogo).getByRole('button', { name: 'Sí, quitarlo' })));
    expect(await within(zona).findByText('Quitamos «hemograma.pdf» de esta consulta.')).toBeInTheDocument();

    expect(await loQueTraeElDashboard(medplum, confirmada.id)).toHaveLength(0);
    const historia = (await laHistoriaQueTraeElDashboard(medplum)).map((d) => d.id);
    expect(historia).not.toContain(copia?.id);
    expect(historia).toContain(original.id);
  });

  test('con la videollamada abierta, los estudios quedan plegados para no estorbar', async () => {
    const { medplum, confirmada } = await escenario();
    await firmarConsentimiento(medplum);
    await medplum.updateResource<Appointment>({ ...confirmada, status: 'checked-in' });
    vi.spyOn(medplum, 'executeBot').mockResolvedValue({ ok: true, url: JITSI });
    await renderEn(medplum, `/teleconsulta/${confirmada.id}`);

    expect(await seccion()).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Entrar a la videollamada' }));
    });
    expect(await screen.findByTitle('Videollamada')).toBeInTheDocument();
    const plegado = screen.getByRole('button', { name: 'Adjuntar estudios' });
    expect(plegado).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: 'Estudios para esta consulta' })).not.toBeInTheDocument();
    await act(async () => fireEvent.click(plegado));
    expect(await seccion()).toBeInTheDocument();
  });

  test('un turno pasado no ofrece adjuntar: muestra lo que se adjuntó, sin quitar', async () => {
    const { medplum, confirmada } = await escenario();
    const patient = await firmarConsentimiento(medplum);
    await medplum.createResource(
      armarAdjuntoTurno(patient, confirmada, {
        contentType: 'image/png',
        url: 'https://example.com/binary/b1',
        title: 'ecg.png',
      })
    );
    const inicio = new Date(Date.now() - 2 * DIA);
    await medplum.updateResource<Appointment>({
      ...confirmada,
      status: 'fulfilled',
      start: inicio.toISOString(),
      end: new Date(inicio.getTime() + 30 * 60_000).toISOString(),
    });
    await renderEn(medplum, `/teleconsulta/${confirmada.id}`);

    const zona = await seccion();
    expect(within(zona).getByText('Este turno ya pasó: no se pueden sumar más estudios.')).toBeInTheDocument();
    expect(await within(zona).findByRole('link', { name: /ecg\.png/ })).toBeInTheDocument();
    expect(within(zona).queryAllByRole('button')).toHaveLength(0);
    expect(zona.querySelector('input[type="file"]')).toBeNull();
  });

  test('sin consentimiento informado, pide firmarlo con un link y no ofrece subir', async () => {
    const { medplum, confirmada } = await escenario();
    await renderEn(medplum, `/teleconsulta/${confirmada.id}`);
    const zona = await seccion();
    expect(await within(zona).findByRole('link', { name: 'Firmar el consentimiento' })).toHaveAttribute(
      'href',
      '/health-record/consent'
    );
    expect(within(zona).queryByRole('button', { name: 'Subir un PDF o una foto' })).not.toBeInTheDocument();
  });

  test('en Mis turnos: plegado en los próximos (las dos modalidades), con la cantidad; los pasados no ofrecen adjuntar', async () => {
    const { medplum, presencial, confirmada } = await escenario();
    const patient = await firmarConsentimiento(medplum);
    await adjuntarArchivo(medplum, patient, confirmada, pdf('perfil-lipidico.pdf'));
    const hace = new Date(Date.now() - 7 * DIA);
    const pasado = await medplum.createResource<Appointment>({
      resourceType: 'Appointment',
      status: 'fulfilled',
      description: 'Consulta de Clínica',
      start: hace.toISOString(),
      end: new Date(hace.getTime() + 30 * 60_000).toISOString(),
      participant: [{ actor: { reference: `Patient/${patient.id}` }, status: 'accepted' }],
    });
    await renderEn(medplum, '/get-care');

    const tele = await screen.findByTestId(`turno-${confirmada.id}`);
    expect(await within(tele).findByRole('button', { name: 'Adjuntar estudios (1)' })).toBeInTheDocument();
    expect(within(await screen.findByTestId(`turno-${pasado.id}`)).queryByRole('button')).not.toBeInTheDocument();

    const tarjeta = screen.getByTestId(`turno-${presencial.id}`);
    const boton = within(tarjeta).getByRole('button', { name: 'Adjuntar estudios' });
    expect(boton).toHaveAttribute('aria-expanded', 'false');
    const panel = document.getElementById(boton.getAttribute('aria-controls') as string) as HTMLElement;
    expect(panel).not.toBeVisible();
    await act(async () => fireEvent.click(boton));
    expect(boton).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toBeVisible();

    const zona = await within(tarjeta).findByRole('region', { name: /^Estudios para esta consulta/ });
    // Con varios turnos en pantalla, el botón y la sección dicen de cuál son.
    expect(boton).toHaveAccessibleDescription(/^Consulta de Cardiología, \d+ de \w+ de \d{4} a las \d{2}:\d{2}$/);
    expect(zona).toHaveAccessibleName(/Consulta de Cardiología/);
    // En el centro el dashboard los muestra solo desde la agenda del día: se promete menos y se
    // piden igual.
    expect(within(zona).getByText(/los puede ver el día de la consulta\. Llevalos igual/)).toBeInTheDocument();
    expect(within(zona).queryByText(/lo ve el profesional que te atiende/)).not.toBeInTheDocument();
    await within(zona).findByRole('button', { name: 'Subir un PDF o una foto' });
    await act(async () => elegirArchivo(zona, foto('orden-de-estudio.jpg')));
    expect(await within(tarjeta).findByRole('button', { name: 'Adjuntar estudios (1)' })).toBeInTheDocument();

    const docs = await loQueTraeElDashboard(medplum, presencial.id);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      category: [{ coding: [{ code: CATEGORIA_ADJUNTO_TURNO }] }],
      context: { related: [{ reference: `Appointment/${presencial.id}` }] },
      content: [{ attachment: { contentType: 'image/jpeg', title: 'orden-de-estudio.jpg' } }],
    });
    // Lo adjunto a un turno no aparece en el otro.
    expect(await loQueTraeElDashboard(medplum, confirmada.id)).toHaveLength(1);
  });

  test('en Mis turnos: elegir uno ya enviado crea la copia sin tocar el original, y no la duplica aunque toque dos veces', async () => {
    const { medplum, presencial } = await escenario();
    const patient = await firmarConsentimiento(medplum);
    const original = (await enviarLaboratorioPdf(medplum, patient, pdf('hemograma.pdf')))
      .documento as WithId<DocumentReference>;
    await renderEn(medplum, '/get-care');

    const tarjeta = await screen.findByTestId(`turno-${presencial.id}`);
    await act(async () => fireEvent.click(within(tarjeta).getByRole('button', { name: 'Adjuntar estudios' })));
    const zona = await within(tarjeta).findByRole('region', { name: /^Estudios para esta consulta/ });
    await act(async () =>
      fireEvent.click(await within(zona).findByRole('button', { name: 'Elegir de los que ya mandaste' }))
    );
    const adjuntar = await within(zona).findByRole('button', { name: 'Adjuntar hemograma.pdf' });
    // Dos toques seguidos (antes de que la pantalla llegue a deshabilitar el botón).
    await act(async () => {
      fireEvent.click(adjuntar);
      fireEvent.click(adjuntar);
    });
    expect(await within(zona).findByText('Listo: «hemograma.pdf» quedó adjunto a esta consulta.')).toBeInTheDocument();
    expect(await within(tarjeta).findByRole('button', { name: 'Adjuntar estudios (1)' })).toBeInTheDocument();
    expect(within(zona).getByText('Los estudios que mandaste ya están adjuntos a esta consulta.')).toBeInTheDocument();

    const docs = await loQueTraeElDashboard(medplum, presencial.id);
    expect(docs).toHaveLength(1);
    expect(docs[0].id).not.toBe(original.id);
    expect(docs[0]).toMatchObject({
      status: 'current',
      category: [{ coding: [{ code: CATEGORIA_ADJUNTO_TURNO }] }],
      context: { related: [{ reference: `Appointment/${presencial.id}` }] },
      content: [{ attachment: { url: original.content[0].attachment.url, title: 'hemograma.pdf' } }],
    });

    // El original (lo que procesa el bot de laboratorio) sigue igual.
    const releido = await medplum.readResource('DocumentReference', original.id);
    expect(releido.meta?.versionId).toBe(original.meta?.versionId);
    expect(releido.status).toBe('current');
    expect(releido.context).toBeUndefined();
    expect(releido.category?.[0].coding?.[0].code).toBe(CATEGORIA_LABORATORIO);
  });

  test('en Mis turnos: quitar lo saca de context.related, lo pasa a entered-in-error y baja el contador', async () => {
    const { medplum, confirmada } = await escenario();
    const patient = await firmarConsentimiento(medplum);
    const quitar = (await adjuntarArchivo(medplum, patient, confirmada, pdf('orden-vieja.pdf')))
      .documento as WithId<DocumentReference>;
    const queda = (await adjuntarArchivo(medplum, patient, confirmada, foto('ecg.jpg')))
      .documento as WithId<DocumentReference>;
    await renderEn(medplum, '/get-care');

    const tarjeta = await screen.findByTestId(`turno-${confirmada.id}`);
    const boton = await within(tarjeta).findByRole('button', { name: 'Adjuntar estudios (2)' });
    await act(async () => fireEvent.click(boton));
    const zona = await within(tarjeta).findByRole('region', { name: /^Estudios para esta consulta/ });
    await act(async () => fireEvent.click(await within(zona).findByRole('button', { name: 'Quitar orden-vieja.pdf' })));
    const dialogo = await screen.findByRole('dialog', { name: '¿Quitar este estudio de la consulta?' });
    await act(async () => fireEvent.click(within(dialogo).getByRole('button', { name: 'Sí, quitarlo' })));

    expect(await within(zona).findByText('Quitamos «orden-vieja.pdf» de esta consulta.')).toBeInTheDocument();
    expect(within(zona).queryByRole('button', { name: 'Quitar orden-vieja.pdf' })).not.toBeInTheDocument();
    expect(within(zona).getByRole('button', { name: 'Quitar ecg.jpg' })).toBeInTheDocument();
    expect(within(tarjeta).getByRole('button', { name: 'Adjuntar estudios (1)' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );

    const quitado = await medplum.readResource('DocumentReference', quitar.id);
    expect(quitado.status).toBe('entered-in-error');
    expect(quitado.context?.related).toBeUndefined();
    expect((await loQueTraeElDashboard(medplum, confirmada.id)).map((d) => d.id)).toEqual([queda.id]);

    // Se vuelve a plegar: el panel queda oculto y el botón lo dice.
    const plegar = within(tarjeta).getByRole('button', { name: 'Adjuntar estudios (1)' });
    await act(async () => fireEvent.click(plegar));
    expect(plegar).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(plegar.getAttribute('aria-controls') as string)).not.toBeVisible();
  });

  test('si la sala se abre sola en medio de una subida, la subida sigue y su resultado se ve', async () => {
    const { medplum, confirmada } = await escenario();
    await firmarConsentimiento(medplum);
    vi.spyOn(medplum, 'executeBot').mockResolvedValue({ ok: true, url: JITSI });
    await renderEn(medplum, `/teleconsulta/${confirmada.id}`, undefined, 20);
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Entrar a la videollamada' }));
    });
    expect(await screen.findByText('Ya estás en la sala de espera')).toBeInTheDocument();

    // Una subida lenta, en la sala de espera.
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
    const zona = await seccion();
    await within(zona).findByRole('button', { name: 'Subir un PDF o una foto' });
    await act(async () => elegirArchivo(zona, pdf('eco-doppler.pdf')));

    // Entra el médico: la videollamada se abre y los estudios se pliegan…
    await act(async () => {
      await medplum.updateResource<Appointment>({ ...confirmada, status: 'checked-in' });
    });
    expect(await screen.findByTitle('Videollamada', {}, { timeout: 2000 })).toBeInTheDocument();
    const plegado = screen.getByRole('button', { name: /^Adjuntar estudios/ });
    expect(plegado).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('status')).toHaveTextContent('Subiendo «eco-doppler.pdf»…');

    // …pero la subida no se pierde: termina, el contador sube y el «Listo» se ve junto al botón.
    await act(async () => soltar());
    expect(await screen.findByRole('button', { name: 'Adjuntar estudios (1)' })).toBe(plegado);
    expect(screen.getByRole('status')).toHaveTextContent('Listo: «eco-doppler.pdf» quedó adjunto a esta consulta.');
    expect(await loQueTraeElDashboard(medplum, confirmada.id)).toHaveLength(1);
  });

  test('en Mis turnos: una reserva vencida sin la seña no ofrece adjuntar', async () => {
    const { medplum, tentativa } = await escenario();
    await firmarConsentimiento(medplum);
    await medplum.updateResource<Appointment>({
      ...tentativa,
      extension: [
        ...(tentativa.extension ?? []),
        { url: EXT_AGENDA.reservaExpira, valueDateTime: new Date(Date.now() - 3_600_000).toISOString() },
      ],
    });
    await renderEn(medplum, '/get-care');

    const tarjeta = await screen.findByTestId(`turno-${tentativa.id}`);
    expect(within(tarjeta).getByText('Venció la reserva')).toBeInTheDocument();
    expect(within(tarjeta).queryByRole('button', { name: /^Adjuntar estudios/ })).not.toBeInTheDocument();
  });
});

// El módulo de teleconsulta de otro proyecto (src/vendor/teleconsulta) se retiró: que no vuelva,
// tampoco dentro de otra copia vendorizada.
test('el portal no usa el módulo ni los bots de teleconsulta de otro proyecto', () => {
  const fuentes = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], {
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
