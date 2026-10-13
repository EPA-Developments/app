// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Estudios adjuntos a un turno: el dashboard de los profesionales los busca con
// `DocumentReference?related=Appointment/<id>&subject=Patient/<id>&status=current`, sin filtrar
// categoría (docs/adjuntos-turno.md). Estos tests fijan qué se escribe al adjuntar, que quitar
// saca la referencia y además anula el documento (para quien lea el turno sin filtrar por
// status), y que nada de esto dispara al bot de laboratorio.
import { forbidden, OperationOutcomeError } from '@medplum/core';
import type { WithId } from '@medplum/core';
import type { Appointment, DocumentReference, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { vi } from 'vitest';
import { indexarDefinicionesFhir } from './__fixtures__/glp1';
import {
  adjuntarArchivo,
  adjuntarDeMisEstudios,
  armarAdjuntoTurno,
  cargarAdjuntosDelTurno,
  CATEGORIA_ADJUNTO_TURNO,
  claveDeArchivo,
  cuandoEsElTurno,
  esAdjuntoDeTurno,
  MENSAJE_EMBEBIDO,
  MENSAJE_SIN_BINARIO,
  MENSAJE_SIN_CONSENTIMIENTO_ADJUNTO,
  MENSAJE_TIPO_NO_ADMITIDO,
  MENSAJE_TURNO_CERRADO,
  porQueNoSeAdjunta,
  puedeAdjuntar,
  quitarAdjunto,
  sePuedeElegir,
  validarAdjunto,
} from './adjuntosTurno';
import { EXT_AGENDA } from './agenda';
import { CONSENT_TYPE_CODE, CONSENT_TYPE_SYSTEM } from './consentimiento';
import {
  cargarEstudiosEnviados,
  CATEGORIA_LABORATORIO,
  DOCUMENTO_CATEGORY_SYSTEM,
  enviarLaboratorioPdf,
  MAX_INLINE_BYTES,
} from './estudios';

const HORA = 3_600_000;

/** Un archivo con la firma que corresponde (lo que importa son los primeros bytes). */
function archivo(nombre: string, firma: number[] | string, bytes = 64, type = ''): File {
  const contenido = new Uint8Array(bytes);
  contenido.set(typeof firma === 'string' ? new TextEncoder().encode(firma) : firma);
  return new File([contenido], nombre, { type });
}
const pdf = (nombre = 'ecocardiograma.pdf', bytes = 64): File =>
  archivo(nombre, '%PDF-1.7\n', bytes, 'application/pdf');
const jpeg = (nombre = 'foto-del-informe.jpg'): File => archivo(nombre, [0xff, 0xd8, 0xff, 0xe0], 64, 'image/jpeg');
const png = (nombre = 'captura.png'): File => archivo(nombre, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Systems que no son del portal ni de una terminología estándar. */
function systemsAjenos(recurso: unknown): string[] {
  const systems = [...JSON.stringify(recurso).matchAll(/"system":"([^"]+)"/g)].map((m) => m[1]);
  return systems.filter((s) => !s.startsWith(DOCUMENTO_CATEGORY_SYSTEM.replace(/\/documento$/, '/')));
}

interface Escenario {
  medplum: MockClient;
  patient: WithId<Patient>;
  turno: WithId<Appointment>;
  otroTurno: WithId<Appointment>;
}

async function escenario(firmoConsentimiento = true): Promise<Escenario> {
  indexarDefinicionesFhir();
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({ resourceType: 'Patient', name: [{ given: ['Alex'] }] });
  medplum.setProfile(patient);
  if (firmoConsentimiento) {
    await medplum.createResource<DocumentReference>({
      resourceType: 'DocumentReference',
      status: 'current',
      type: { coding: [{ system: CONSENT_TYPE_SYSTEM, code: CONSENT_TYPE_CODE }] },
      subject: { reference: `Patient/${patient.id}` },
      date: new Date().toISOString(),
      content: [{ attachment: { contentType: 'text/plain', data: 'ZmlybWFkbw==' } }],
    });
  }
  const turno = async (horas: number): Promise<WithId<Appointment>> => {
    const inicio = new Date(Date.now() + horas * HORA);
    return medplum.createResource<Appointment>({
      resourceType: 'Appointment',
      status: 'booked',
      start: inicio.toISOString(),
      end: new Date(inicio.getTime() + 30 * 60_000).toISOString(),
      participant: [{ actor: { reference: `Patient/${patient.id}` }, status: 'accepted' }],
    });
  };
  return { medplum, patient, turno: await turno(48), otroTurno: await turno(72) };
}

/**
 * Todo lo que apunta al turno, de cualquier status: más de lo que trae el dashboard (que además
 * pide `subject` y `status=current`). Si acá queda vacío, el dashboard tampoco lo ve.
 */
async function loQueApuntaAlTurno(medplum: MockClient, appointmentId: string): Promise<DocumentReference[]> {
  return [
    ...(await medplum.searchResources(
      'DocumentReference',
      { related: `Appointment/${appointmentId}` },
      { cache: 'no-cache' }
    )),
  ];
}

describe('armarAdjuntoTurno', () => {
  const patient: Patient = { resourceType: 'Patient', id: 'p1' };
  const attachment = { contentType: 'application/pdf', url: 'Binary/b1', title: 'eco.pdf', size: 64 };

  test('apunta al turno desde el documento, con la categoría propia y la fecha del turno en Argentina', () => {
    const doc = armarAdjuntoTurno(
      patient,
      { id: 't1', start: '2026-10-20T18:00:00.000Z' },
      attachment,
      new Date('2026-10-12T12:00:00Z')
    );
    expect(doc).toEqual({
      resourceType: 'DocumentReference',
      status: 'current',
      type: { text: 'Estudio adjunto a un turno' },
      category: [
        {
          coding: [{ system: DOCUMENTO_CATEGORY_SYSTEM, code: 'adjunto-turno', display: 'Estudio adjunto a un turno' }],
        },
      ],
      subject: { reference: 'Patient/p1' },
      author: [{ reference: 'Patient/p1' }],
      date: '2026-10-12T12:00:00.000Z',
      description: 'Adjuntado para el turno del 20 de octubre de 2026 a las 15:00: eco.pdf',
      content: [{ attachment }],
      context: { related: [{ reference: 'Appointment/t1' }], period: { start: '2026-10-20T18:00:00.000Z' } },
    });
    expect(esAdjuntoDeTurno(doc)).toBe(true);
    expect(systemsAjenos(doc)).toEqual([]);
  });

  test('un turno sin fecha no lleva period', () => {
    const doc = armarAdjuntoTurno(patient, { id: 't2' }, attachment);
    expect(doc.context).toEqual({ related: [{ reference: 'Appointment/t2' }] });
    expect(doc.description).toBe('Adjuntado para el turno: eco.pdf');
  });

  test('no es la categoría de laboratorio: no dispara al bot ni se suma a los biomarcadores', () => {
    const doc = armarAdjuntoTurno(patient, { id: 't1' }, attachment);
    const codigos = doc.category?.flatMap((c) => c.coding ?? []).map((k) => k.code);
    expect(codigos).toEqual([CATEGORIA_ADJUNTO_TURNO]);
    expect(codigos).not.toContain(CATEGORIA_LABORATORIO);
  });

  test('la fecha del turno es la de Argentina, aunque el navegador esté en otra zona', () => {
    expect(cuandoEsElTurno('2026-10-21T02:30:00.000Z')).toBe('20 de octubre de 2026 a las 23:30');
  });
});

describe('puedeAdjuntar', () => {
  const ahora = new Date('2026-10-12T15:00:00.000Z');

  test('hasta que termina el turno', () => {
    expect(puedeAdjuntar({ status: 'booked', start: '2026-10-13T15:00:00Z', end: '2026-10-13T15:30:00Z' }, ahora)).toBe(
      true
    );
    // En curso: todavía sirve (p. ej. lo que el profesional pide durante la consulta).
    expect(
      puedeAdjuntar({ status: 'checked-in', start: '2026-10-12T14:45:00Z', end: '2026-10-12T15:15:00Z' }, ahora)
    ).toBe(true);
    expect(puedeAdjuntar({ status: 'booked', start: '2026-10-12T14:00:00Z', end: '2026-10-12T14:30:00Z' }, ahora)).toBe(
      false
    );
  });

  test('sin `end`, se da por terminado una hora después del inicio', () => {
    expect(puedeAdjuntar({ status: 'booked', start: '2026-10-12T14:01:00Z' }, ahora)).toBe(true);
    expect(puedeAdjuntar({ status: 'booked', start: '2026-10-12T14:00:00Z' }, ahora)).toBe(false);
  });

  test('un turno sin fecha todavía no terminó', () => {
    expect(puedeAdjuntar({ status: 'pending' }, ahora)).toBe(true);
  });

  test.each(['cancelled', 'noshow', 'entered-in-error', 'fulfilled'] as const)('no si el turno está %s', (status) => {
    expect(puedeAdjuntar({ status, start: '2026-10-20T15:00:00Z' }, ahora)).toBe(false);
  });

  test('no si venció la reserva del portal sin la seña (Recepción libera el horario)', () => {
    const reserva = (expira: string): Parameters<typeof puedeAdjuntar>[0] => ({
      status: 'pending',
      start: '2026-10-15T15:00:00Z',
      extension: [{ url: EXT_AGENDA.reservaExpira, valueDateTime: expira }],
    });
    expect(puedeAdjuntar(reserva('2026-10-12T14:00:00Z'), ahora)).toBe(false);
    expect(porQueNoSeAdjunta(reserva('2026-10-12T14:00:00Z'), ahora)).toBe('reserva-vencida');
    // Todavía con tiempo para pagar la seña: se puede.
    expect(puedeAdjuntar(reserva('2026-10-12T16:00:00Z'), ahora)).toBe(true);
  });

  test('el motivo, para lo que dice la pantalla', () => {
    expect(porQueNoSeAdjunta({ status: 'cancelled', start: '2026-10-20T15:00:00Z' }, ahora)).toBe('cancelado');
    expect(porQueNoSeAdjunta({ status: 'entered-in-error' }, ahora)).toBe('cancelado');
    expect(porQueNoSeAdjunta({ status: 'fulfilled', start: '2026-10-20T15:00:00Z' }, ahora)).toBe('terminado');
    expect(porQueNoSeAdjunta({ status: 'booked', start: '2026-10-11T15:00:00Z' }, ahora)).toBe('terminado');
    expect(porQueNoSeAdjunta({ status: 'booked', start: '2026-10-20T15:00:00Z' }, ahora)).toBeUndefined();
  });
});

describe('validarAdjunto', () => {
  test('PDF y fotos (JPEG y PNG), por la firma y no por el type ni la extensión', async () => {
    expect(await validarAdjunto(pdf())).toEqual({ ok: true, contentType: 'application/pdf' });
    expect(await validarAdjunto(jpeg())).toEqual({ ok: true, contentType: 'image/jpeg' });
    // Sin type (muchos celulares no lo informan) y con un nombre que no ayuda.
    expect(await validarAdjunto(png())).toEqual({ ok: true, contentType: 'image/png' });
    expect(await validarAdjunto(archivo('IMG_0001', [0xff, 0xd8, 0xff, 0xe1]))).toEqual({
      ok: true,
      contentType: 'image/jpeg',
    });
  });

  test('rechaza lo que no es PDF ni foto, aunque diga .jpg', async () => {
    expect(await validarAdjunto(archivo('informe.jpg', 'hola, soy un texto', 64, 'image/jpeg'))).toEqual({
      ok: false,
      mensaje: MENSAJE_TIPO_NO_ADMITIDO,
    });
    // Un GIF tampoco: el profesional los recibe en PDF o foto.
    expect(await validarAdjunto(archivo('a.gif', 'GIF89a'))).toMatchObject({ ok: false });
  });

  test('rechaza archivos vacíos y de más de 15 MB', async () => {
    expect(await validarAdjunto(new File([], 'vacio.pdf'))).toMatchObject({ ok: false, mensaje: /vacío/ });
    const grande = jpeg();
    Object.defineProperty(grande, 'size', { value: 16 * 1024 * 1024 });
    expect(await validarAdjunto(grande)).toMatchObject({ ok: false, mensaje: /15 MB/ });
  });
});

describe('adjuntarArchivo', () => {
  test('sin consentimiento informado no escribe nada', async () => {
    const { medplum, patient, turno } = await escenario(false);
    const subir = vi.spyOn(medplum, 'createAttachment');
    const crear = vi.spyOn(medplum, 'createResource');
    expect(await adjuntarArchivo(medplum, patient, turno, pdf())).toEqual({
      ok: false,
      mensaje: MENSAJE_SIN_CONSENTIMIENTO_ADJUNTO,
    });
    expect(subir).not.toHaveBeenCalled();
    expect(crear).not.toHaveBeenCalled();
  });

  test('un turno que ya pasó no recibe estudios', async () => {
    const { medplum, patient, turno } = await escenario();
    const pasado = { ...turno, start: new Date(Date.now() - 3 * HORA).toISOString(), end: undefined };
    const crear = vi.spyOn(medplum, 'createResource');
    expect(await adjuntarArchivo(medplum, patient, pasado, pdf())).toEqual({
      ok: false,
      mensaje: MENSAJE_TURNO_CERRADO,
    });
    expect(crear).not.toHaveBeenCalled();
  });

  test('un archivo que no es PDF ni foto no se sube', async () => {
    const { medplum, patient, turno } = await escenario();
    const subir = vi.spyOn(medplum, 'createAttachment');
    const r = await adjuntarArchivo(medplum, patient, turno, archivo('notas.txt', 'hola'));
    expect(r).toEqual({ ok: false, mensaje: MENSAJE_TIPO_NO_ADMITIDO });
    expect(subir).not.toHaveBeenCalled();
  });

  test('una foto: sube el Binary con su tipo y crea el documento que apunta al turno', async () => {
    const { medplum, patient, turno, otroTurno } = await escenario();
    const subir = vi.spyOn(medplum, 'createAttachment');
    const r = await adjuntarArchivo(medplum, patient, turno, jpeg('informe-eco.jpg'));

    expect(r.ok).toBe(true);
    expect(subir.mock.calls[0][0]).toMatchObject({
      contentType: 'image/jpeg',
      filename: 'informe-eco.jpg',
      securityContext: { reference: `Patient/${patient.id}` },
    });
    expect(r.documento).toMatchObject({
      status: 'current',
      subject: { reference: `Patient/${patient.id}` },
      context: { related: [{ reference: `Appointment/${turno.id}` }], period: { start: turno.start } },
      content: [{ attachment: { contentType: 'image/jpeg', title: 'informe-eco.jpg', size: 64 } }],
    });
    expect(r.documento?.content[0].attachment.url).toBeDefined();
    expect(esAdjuntoDeTurno(r.documento as DocumentReference)).toBe(true);

    // Apunta a ese turno, y a ningún otro.
    expect((await loQueApuntaAlTurno(medplum, turno.id)).map((d) => d.id)).toEqual([r.documento?.id]);
    expect(await loQueApuntaAlTurno(medplum, otroTurno.id)).toEqual([]);
    expect((await cargarAdjuntosDelTurno(medplum, turno.id)).map((d) => d.id)).toEqual([r.documento?.id]);
    // No es un laboratorio: no aparece en «Estudios enviados» (ni lo procesa el bot).
    expect(await cargarEstudiosEnviados(medplum, patient)).toHaveLength(0);
    expect(
      await medplum.searchResources('DocumentReference', {
        category: `${DOCUMENTO_CATEGORY_SYSTEM}|${CATEGORIA_LABORATORIO}`,
      })
    ).toHaveLength(0);
  });

  test('si el server no deja crear el Binary, no lo embebe (el profesional no lo podría abrir): no crea nada y dice cómo seguir', async () => {
    const { medplum, patient, turno } = await escenario();
    vi.spyOn(medplum, 'createAttachment').mockRejectedValue(new OperationOutcomeError(forbidden));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const crear = vi.spyOn(medplum, 'createResource');

    // Ni la foto chica (que «Enviar estudios» sí mandaría embebida) ni una grande.
    const chica = await adjuntarArchivo(medplum, patient, turno, png());
    const grande = await adjuntarArchivo(
      medplum,
      patient,
      turno,
      archivo('grande.jpg', [0xff, 0xd8, 0xff], MAX_INLINE_BYTES + 1)
    );
    expect(chica).toEqual({ ok: false, mensaje: MENSAJE_SIN_BINARIO });
    expect(grande).toEqual({ ok: false, mensaje: MENSAJE_SIN_BINARIO });
    expect(MENSAJE_SIN_BINARIO).toMatch(/Mensajes/);
    expect(crear).not.toHaveBeenCalled();
    expect(await cargarAdjuntosDelTurno(medplum, turno.id)).toEqual([]);
  });

  test('un error de red no se lanza: vuelve con un mensaje legible', async () => {
    const { medplum, patient, turno } = await escenario();
    vi.spyOn(medplum, 'createAttachment').mockRejectedValue(new Error('Failed to fetch'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await adjuntarArchivo(medplum, patient, turno, pdf());
    expect(r).toEqual({ ok: false, mensaje: expect.stringMatching(/No pudimos adjuntar el estudio/) });
    expect(log).toHaveBeenCalled();
    expect(await cargarAdjuntosDelTurno(medplum, turno.id)).toEqual([]);
  });
});

describe('adjuntarDeMisEstudios', () => {
  test('crea un documento nuevo que apunta al mismo archivo, sin tocar el original', async () => {
    const { medplum, patient, turno } = await escenario();
    const envio = await enviarLaboratorioPdf(medplum, patient, pdf('hemograma.pdf'));
    const original = envio.documento as WithId<DocumentReference>;
    const actualizar = vi.spyOn(medplum, 'updateResource');

    const r = await adjuntarDeMisEstudios(medplum, patient, turno, original);
    expect(r.ok).toBe(true);
    expect(r.documento?.id).not.toBe(original.id);
    const deOriginal = original.content[0].attachment;
    expect(r.documento?.content).toEqual([
      {
        attachment: {
          contentType: 'application/pdf',
          url: deOriginal.url,
          title: 'hemograma.pdf',
          size: deOriginal.size,
        },
      },
    ]);
    expect(esAdjuntoDeTurno(r.documento as DocumentReference)).toBe(true);
    expect(r.documento?.context?.related).toEqual([{ reference: `Appointment/${turno.id}` }]);

    // El original queda igual: misma versión, sin vínculo con el turno, sigue siendo laboratorio.
    expect(actualizar).not.toHaveBeenCalled();
    const releido = await medplum.readResource('DocumentReference', original.id);
    expect(releido.meta?.versionId).toBe(original.meta?.versionId);
    expect(releido.context).toBeUndefined();
    expect((await cargarEstudiosEnviados(medplum, patient)).map((d) => d.id)).toEqual([original.id]);
    expect((await loQueApuntaAlTurno(medplum, turno.id)).map((d) => d.id)).toEqual([r.documento?.id]);
  });

  test('no duplica: si ese archivo ya está adjunto y vigente, devuelve el que hay', async () => {
    const { medplum, patient, turno } = await escenario();
    const { documento } = await enviarLaboratorioPdf(medplum, patient, pdf('lipidos.pdf'));
    const primero = await adjuntarDeMisEstudios(medplum, patient, turno, documento as DocumentReference);
    const crear = vi.spyOn(medplum, 'createResource');

    const segundo = await adjuntarDeMisEstudios(medplum, patient, turno, documento as DocumentReference);
    expect(segundo).toEqual({ ok: true, documento: expect.objectContaining({ id: primero.documento?.id }) });
    expect(crear).not.toHaveBeenCalled();
    expect(await cargarAdjuntosDelTurno(medplum, turno.id)).toHaveLength(1);
  });

  test('un PDF que se mandó embebido (sin Binary) no se adjunta: el profesional vería solo el nombre', async () => {
    const { medplum, patient, turno } = await escenario();
    const subir = vi.spyOn(medplum, 'createAttachment').mockRejectedValue(new OperationOutcomeError(forbidden));
    const { documento } = await enviarLaboratorioPdf(medplum, patient, pdf('glucemia.pdf'));
    const original = documento as WithId<DocumentReference>;
    // «Enviar estudios» sí lo guardó embebido (el bot de laboratorio lo lee igual).
    expect(original.content[0].attachment.data).toBeDefined();
    expect(sePuedeElegir(original)).toBe(false);
    subir.mockRestore();
    const crear = vi.spyOn(medplum, 'createResource');

    expect(await adjuntarDeMisEstudios(medplum, patient, turno, original)).toEqual({
      ok: false,
      mensaje: MENSAJE_EMBEBIDO,
    });
    expect(crear).not.toHaveBeenCalled();
    expect(await cargarAdjuntosDelTurno(medplum, turno.id)).toEqual([]);
  });

  test('sePuedeElegir: vigente y con URL; no uno anulado ni uno embebido', () => {
    const doc = (status: DocumentReference['status'], attachment: object): DocumentReference => ({
      resourceType: 'DocumentReference',
      status,
      content: [{ attachment }],
    });
    expect(sePuedeElegir(doc('current', { url: 'https://example.com/binary/b1' }))).toBe(true);
    expect(sePuedeElegir(doc('entered-in-error', { url: 'https://example.com/binary/b1' }))).toBe(false);
    expect(sePuedeElegir(doc('current', { data: 'JVBERi0=', title: 'a.pdf' }))).toBe(false);
    expect(sePuedeElegir(doc('current', {}))).toBe(false);
  });

  test('quitado, se puede volver a adjuntar', async () => {
    const { medplum, patient, turno } = await escenario();
    const { documento } = await enviarLaboratorioPdf(medplum, patient, pdf());
    const primero = await adjuntarDeMisEstudios(medplum, patient, turno, documento as DocumentReference);
    await quitarAdjunto(medplum, primero.documento as WithId<DocumentReference>, turno.id);

    const otraVez = await adjuntarDeMisEstudios(medplum, patient, turno, documento as DocumentReference);
    expect(otraVez.documento?.id).not.toBe(primero.documento?.id);
    expect((await cargarAdjuntosDelTurno(medplum, turno.id)).map((d) => d.id)).toEqual([otraVez.documento?.id]);
  });

  test('sin consentimiento informado no escribe nada', async () => {
    const { medplum, patient, turno } = await escenario(false);
    const crear = vi.spyOn(medplum, 'createResource');
    const doc: DocumentReference = {
      resourceType: 'DocumentReference',
      status: 'current',
      content: [{ attachment: { contentType: 'application/pdf', url: 'Binary/b1', title: 'x.pdf' } }],
    };
    expect(await adjuntarDeMisEstudios(medplum, patient, turno, doc)).toEqual({
      ok: false,
      mensaje: MENSAJE_SIN_CONSENTIMIENTO_ADJUNTO,
    });
    expect(crear).not.toHaveBeenCalled();
  });
});

describe('quitarAdjunto', () => {
  test('saca el turno de context.related y lo pasa a entered-in-error: el dashboard deja de verlo', async () => {
    const { medplum, patient, turno } = await escenario();
    const { documento } = await adjuntarArchivo(medplum, patient, turno, pdf());
    const actualizar = vi.spyOn(medplum, 'updateResource');

    const r = await quitarAdjunto(medplum, documento as WithId<DocumentReference>, turno.id);
    expect(r.ok).toBe(true);
    expect(actualizar).toHaveBeenCalledTimes(1);
    const quitado = await medplum.readResource('DocumentReference', documento?.id as string);
    expect(quitado.status).toBe('entered-in-error');
    expect(quitado.context?.related).toBeUndefined();
    // La fecha del turno queda como dato del documento; el vínculo, no.
    expect(quitado.context?.period?.start).toBe(turno.start);
    expect(await loQueApuntaAlTurno(medplum, turno.id)).toEqual([]);
    expect(await cargarAdjuntosDelTurno(medplum, turno.id)).toEqual([]);
  });

  test('si el documento apuntaba a otras cosas, solo saca ese turno', async () => {
    const { medplum, patient, turno } = await escenario();
    const documento = await medplum.createResource<DocumentReference>({
      ...armarAdjuntoTurno(patient, turno, { contentType: 'application/pdf', url: 'Binary/b1', title: 'x.pdf' }),
      context: { related: [{ reference: 'Encounter/e1' }, { reference: `Appointment/${turno.id}` }] },
    });
    await quitarAdjunto(medplum, documento, turno.id);
    const quitado = await medplum.readResource('DocumentReference', documento.id);
    expect(quitado.context).toEqual({ related: [{ reference: 'Encounter/e1' }] });
  });

  test('un adjunto de otro turno no se toca', async () => {
    const { medplum, patient, turno, otroTurno } = await escenario();
    const { documento } = await adjuntarArchivo(medplum, patient, otroTurno, pdf());
    const actualizar = vi.spyOn(medplum, 'updateResource');
    const r = await quitarAdjunto(medplum, documento as WithId<DocumentReference>, turno.id);
    expect(r).toEqual({ ok: false, mensaje: 'Ese estudio no está adjunto a este turno.' });
    expect(actualizar).not.toHaveBeenCalled();
    expect(await cargarAdjuntosDelTurno(medplum, otroTurno.id)).toHaveLength(1);
  });

  test('nunca toca un documento de otra categoría', async () => {
    const { medplum, patient, turno } = await escenario();
    const { documento } = await enviarLaboratorioPdf(medplum, patient, pdf());
    const actualizar = vi.spyOn(medplum, 'updateResource');
    const r = await quitarAdjunto(medplum, documento as WithId<DocumentReference>, turno.id);
    expect(r.ok).toBe(false);
    expect(actualizar).not.toHaveBeenCalled();
  });
});

describe('cargarAdjuntosDelTurno', () => {
  test('solo los vigentes de ese turno, del más nuevo al más viejo', async () => {
    const { medplum, patient, turno, otroTurno } = await escenario();
    const crear = (dias: number, appt: WithId<Appointment>, status: DocumentReference['status'] = 'current') =>
      medplum.createResource<DocumentReference>({
        ...armarAdjuntoTurno(
          patient,
          appt,
          { contentType: 'application/pdf', url: `Binary/${dias}`, title: `${dias}.pdf` },
          new Date(Date.UTC(2026, 9, dias))
        ),
        status,
      });
    const viejo = await crear(1, turno);
    const nuevo = await crear(5, turno);
    await crear(3, turno, 'superseded');
    await crear(4, otroTurno);
    expect((await cargarAdjuntosDelTurno(medplum, turno.id)).map((d) => d.id)).toEqual([nuevo.id, viejo.id]);
  });
});

test('claveDeArchivo: el mismo Binary aunque el server firme la URL de nuevo', () => {
  expect(claveDeArchivo({ url: 'Binary/abc-1' })).toBe('Binary/abc-1');
  expect(claveDeArchivo({ url: 'https://storage.ejemplo.test/binary/abc-1/v2?Expires=1&Signature=x' })).toBe(
    'Binary/abc-1'
  );
  expect(claveDeArchivo({ url: 'https://api.ejemplo.test/fhir/R4/Binary/abc-1' })).toBe('Binary/abc-1');
  expect(claveDeArchivo({ data: 'JVBERi0=', title: 'a.pdf', size: 5 })).toBe('embebido:a.pdf:5');
  expect(claveDeArchivo({ contentType: 'application/pdf' })).toBeUndefined();
  expect(claveDeArchivo(undefined)).toBeUndefined();
});
