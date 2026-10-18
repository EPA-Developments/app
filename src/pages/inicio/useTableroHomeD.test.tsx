// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import type {
  Bundle,
  Communication,
  DiagnosticReport,
  DocumentReference,
  Observation,
  Patient,
  QuestionnaireResponse,
  ServiceRequest,
  Task,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import type { MockSubscriptionManager } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { indexarDefinicionesFhir } from '../../fhir/__fixtures__/glp1';
import { CATEGORIA_OBSERVACION_SYSTEM } from '../../fhir/biomarkers';
import { CATEGORIA_LABORATORIO, DOCUMENTO_CATEGORY_SYSTEM } from '../../fhir/estudios';
import { criteriaNotificaciones, NOTIFICACION_SYSTEM } from '../../fhir/notificaciones';
import { SOM_SERVICE_CODE, SOM_SERVICE_SYSTEM, TAREA_FIRMA_INFORME } from '../../fhir/som';
import { LE8_QUESTIONNAIRES } from '../../le8';
import { MARCA } from '../../marca';
import type { FilaTablero, TableroHomeD } from './tipos';
import {
  claveVisita,
  ESPERA_TIEMPO_REAL_MS,
  guardarVisita,
  leerUltimaVisita,
  useTableroHomeD,
} from './useTableroHomeD';

const ESPERA = { timeout: 5000 };

function envoltorio(medplum: MockClient): (props: { children: ReactNode }) => JSX.Element {
  return function Envoltorio({ children }: { children: ReactNode }): JSX.Element {
    return <MedplumProvider medplum={medplum}>{children}</MedplumProvider>;
  };
}

/** Monta el hook y espera a que termine la primera carga. */
async function montar(medplum: MockClient): Promise<{ readonly result: { readonly current: TableroHomeD } }> {
  const hook = renderHook(() => useTableroHomeD(), { wrapper: envoltorio(medplum) });
  await waitFor(() => expect(hook.result.current.cargando).toBe(false), ESPERA);
  return hook;
}

/** Jorge, un paciente ficticio. */
async function paciente(medplum: MockClient): Promise<Patient> {
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Jorge'], family: 'Pérez' }],
    gender: 'male',
    birthDate: '1962-05-20',
  });
  medplum.setProfile(patient);
  return patient;
}

function referencia(patient: Patient): { reference: string } {
  return { reference: `Patient/${patient.id}` };
}

/** Lo que tiene Jorge: un PDF ya leído por el agente, un pedido en análisis, un cuestionario y su presión. */
async function cargarDatosDeJorge(medplum: MockClient, patient: Patient): Promise<Record<string, string>> {
  const informe = await medplum.createResource<DiagnosticReport>({
    resourceType: 'DiagnosticReport',
    status: 'final',
    code: { text: 'Laboratorio' },
    subject: referencia(patient),
    issued: '2026-10-03T12:05:00.000Z',
    result: [{ reference: 'Observation/a' }, { reference: 'Observation/b' }],
  });
  const documento = await medplum.createResource<DocumentReference>({
    resourceType: 'DocumentReference',
    status: 'current',
    subject: referencia(patient),
    date: '2026-10-03T12:00:00.000Z',
    category: [{ coding: [{ system: DOCUMENTO_CATEGORY_SYSTEM, code: CATEGORIA_LABORATORIO }] }],
    content: [{ attachment: { contentType: 'application/pdf', title: 'laboratorio.pdf' } }],
    context: { related: [{ reference: `DiagnosticReport/${informe.id}` }] },
  });
  const pedido = await medplum.createResource<ServiceRequest>({
    resourceType: 'ServiceRequest',
    status: 'active',
    intent: 'order',
    subject: referencia(patient),
    code: { coding: [{ system: SOM_SERVICE_SYSTEM, code: SOM_SERVICE_CODE }] },
    authoredOn: '2026-09-28T13:00:00.000Z',
  });
  const cuestionario = await medplum.createResource<QuestionnaireResponse>({
    resourceType: 'QuestionnaireResponse',
    status: 'completed',
    questionnaire: LE8_QUESTIONNAIRES[0].url,
    subject: referencia(patient),
    authored: '2026-09-25T14:00:00.000Z',
  });
  const presion = await medplum.createResource<Observation>({
    resourceType: 'Observation',
    status: 'preliminary',
    code: { coding: [{ system: 'http://loinc.org', code: '85354-9' }] },
    subject: referencia(patient),
    effectiveDateTime: '2026-10-03T22:00:00.000Z',
  });
  return {
    informe: informe.id as string,
    documento: documento.id as string,
    pedido: pedido.id as string,
    cuestionario: cuestionario.id as string,
    presion: presion.id as string,
  };
}

function novedad(patient: Patient, code: string, extra: Partial<Communication> = {}): Communication {
  return {
    resourceType: 'Communication',
    status: 'in-progress',
    subject: referencia(patient),
    recipient: [referencia(patient)],
    sent: new Date().toISOString(),
    category: [{ coding: [{ system: NOTIFICACION_SYSTEM, code }] }],
    payload: [{ contentString: 'Texto de prueba.' }],
    ...extra,
  };
}

beforeAll(() => {
  indexarDefinicionesFhir();
});

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('useTableroHomeD con el MockClient', () => {
  test('con un profesional: sin tablero y sin consultar nada', async () => {
    const medplum = new MockClient(); // el perfil por defecto es un Practitioner
    const buscar = vi.spyOn(medplum, 'searchResources');
    const { result } = await montar(medplum);
    expect(result.current).toEqual({ cargando: false, filas: [], nuevas: new Set(), incompleto: false });
    expect(buscar).not.toHaveBeenCalled();
  });

  test('un paciente sin nada mandado: tablero vacío y completo', async () => {
    const medplum = new MockClient();
    await paciente(medplum);
    const { result } = await montar(medplum);
    expect(result.current).toMatchObject({ cargando: false, filas: [], incompleto: false });
  });

  test('las cinco fuentes, en orden, con su estado real; en la primera visita nada es nuevo', async () => {
    const medplum = new MockClient();
    const patient = await paciente(medplum);
    const ids = await cargarDatosDeJorge(medplum, patient);
    await medplum.createResource(novedad(patient, 'pago-recibido', { sent: '2026-10-08T12:00:00.000Z' }));
    // El aviso de «resultados listos» del mismo informe no se repite: ya es una fila.
    await medplum.createResource(
      novedad(patient, 'resultados-listos', { about: [{ reference: `DiagnosticReport/${ids.informe}` }] })
    );

    const { result } = await montar(medplum);
    const { filas, nuevas, incompleto } = result.current;
    expect(incompleto).toBe(false);
    expect(filas.map((f) => [f.id, f.que, f.estado])).toEqual([
      [expect.stringMatching(/^Communication\//), 'Pago recibido', 'Sin leer'],
      [`Observation/${ids.presion}`, 'Presión', 'Registrado'],
      [`DiagnosticReport/${ids.informe}`, 'Resultados de laboratorio', 'Listo: 2 valores'],
      [`DocumentReference/${ids.documento}`, 'PDF de laboratorio', 'Procesado'],
      [`ServiceRequest/${ids.pedido}`, `Pedido de ${MARCA.producto}`, 'En análisis'],
      [`QuestionnaireResponse/${ids.cuestionario}`, 'Cuestionario de calidad del sueño', 'Sumado a tu LE8'],
      [`ServiceRequest/${ids.pedido}#llegada`, `Informe de ${MARCA.producto}`, 'En camino'],
    ]);
    // Primera visita en este dispositivo: ninguna es nueva, y queda guardada la de ahora.
    expect(nuevas.size).toBe(0);
    const guardada = leerUltimaVisita(`Patient/${patient.id}`);
    expect(guardada).toBeDefined();
    expect(Date.now() - Date.parse(guardada as string)).toBeLessThan(60_000);
  });

  test('con una visita anterior: lo que cambió después es nuevo (lo viejo y lo que no llegó, no)', async () => {
    const medplum = new MockClient();
    const patient = await paciente(medplum);
    const ref = `Patient/${patient.id}`;
    guardarVisita(ref, new Date(Date.now() - 60_000).toISOString());
    const ids = await cargarDatosDeJorge(medplum, patient);
    // Una novedad que llegó antes de la visita (cuenta cuándo llegó, no cuándo se tocó).
    await medplum.createResource(novedad(patient, 'recordatorio', { sent: '2026-01-05T12:00:00.000Z' }));

    const { result } = await montar(medplum);
    const { filas, nuevas } = result.current;
    expect(nuevas.has(`DocumentReference/${ids.documento}`)).toBe(true);
    expect(nuevas.has(`DiagnosticReport/${ids.informe}`)).toBe(true);
    expect(nuevas.has(`Observation/${ids.presion}`)).toBe(true);
    expect(nuevas.has(`ServiceRequest/${ids.pedido}#llegada`)).toBe(false);
    const recordatorio = filas.find((f) => f.que === 'Recordatorio');
    expect(recordatorio && nuevas.has(recordatorio.id)).toBe(false);
    // La visita de ahora queda guardada para la próxima, pero las nuevas de esta sesión siguen.
    expect(Date.parse(leerUltimaVisita(ref) as string)).toBeGreaterThan(Date.now() - 30_000);
    expect(result.current.nuevas.size).toBe(nuevas.size);
  });

  test('si el almacenamiento falla (modo privado), el tablero se ve igual, sin nuevas', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const medplum = new MockClient();
    const patient = await paciente(medplum);
    await cargarDatosDeJorge(medplum, patient);
    const { result } = await montar(medplum);
    expect(result.current.filas.length).toBeGreaterThan(0);
    expect(result.current.nuevas.size).toBe(0);
    expect(leerUltimaVisita(`Patient/${patient.id}`)).toBeUndefined();
  });

  test('si una consulta falla: el resto se muestra, queda incompleto y la visita se guarda igual', async () => {
    const medplum = new MockClient();
    const patient = await paciente(medplum);
    const ids = await cargarDatosDeJorge(medplum, patient);
    const original = medplum.searchResources.bind(medplum);
    vi.spyOn(medplum, 'searchResources').mockImplementation(((tipo: string, ...resto: unknown[]) =>
      tipo === 'Observation'
        ? Promise.reject(new Error('sin conexión'))
        : (original as (...a: unknown[]) => unknown)(tipo, ...resto)) as never);

    const { result } = await montar(medplum);
    expect(result.current.incompleto).toBe(true);
    expect(result.current.filas.some((f) => f.recurso === 'Observation')).toBe(false);
    expect(result.current.filas.map((f) => f.id)).toContain(`DocumentReference/${ids.documento}`);
    // Si una consulta fallara siempre (permisos), la visita tiene que avanzar igual.
    expect(window.localStorage.getItem(claveVisita(`Patient/${patient.id}`))).not.toBeNull();
  });

  test('con MEDPLUM_TIEMPO_REAL, una novedad que llega entra al tablero como nueva', async () => {
    vi.stubEnv('MEDPLUM_TIEMPO_REAL', 'true');
    const medplum = new MockClient();
    const patient = await paciente(medplum);
    await cargarDatosDeJorge(medplum, patient);
    const hook = await montar(medplum);
    const antes = hook.result.current.filas.length;
    expect(hook.result.current.nuevas.size).toBe(0);

    const nueva = await medplum.createResource(novedad(patient, 'mensaje-nuevo'));
    const evento: Bundle = { resourceType: 'Bundle', type: 'history', entry: [{ resource: nueva }] };
    await act(async () => {
      (medplum.getSubscriptionManager() as MockSubscriptionManager).emitEventForCriteria(
        criteriaNotificaciones(`Patient/${patient.id}`),
        { type: 'message', payload: evento }
      );
    });
    await waitFor(() => expect(hook.result.current.filas).toHaveLength(antes + 1), ESPERA);
    const [primera] = hook.result.current.filas;
    expect(primera).toMatchObject({ id: `Communication/${nueva.id}`, que: 'Mensaje nuevo', sentido: 'llegada' });
    expect(hook.result.current.nuevas.has(`Communication/${nueva.id}`)).toBe(true);
    // Mientras recarga no vuelve al skeleton.
    expect(hook.result.current.cargando).toBe(false);
  });

  test('en tiempo real, la Segunda Opinión que se completó no queda vieja por la caché de búsquedas', async () => {
    vi.stubEnv('MEDPLUM_TIEMPO_REAL', 'true');
    const medplum = new MockClient();
    const patient = await paciente(medplum);
    const { pedido } = await cargarDatosDeJorge(medplum, patient);
    const hook = await montar(medplum);
    const llegada = (): FilaTablero | undefined =>
      hook.result.current.filas.find((f) => f.que === `Informe de ${MARCA.producto}`);
    expect(llegada()?.estado).toBe('En camino');

    // El bot completa la orden y arma el informe del lado del servidor (no por este cliente,
    // así que su caché no se entera) y avisa con una novedad.
    const orden = await medplum.readResource('ServiceRequest', pedido as string);
    await medplum.repo.updateResource<ServiceRequest>({ ...orden, status: 'completed' });
    const informe = await medplum.repo.createResource<DiagnosticReport>({
      resourceType: 'DiagnosticReport',
      status: 'final',
      code: { text: 'Informe' },
      subject: referencia(patient),
      basedOn: [{ reference: `ServiceRequest/${pedido}` }],
      issued: new Date().toISOString(),
    });
    const aviso = await medplum.createResource(
      novedad(patient, 'documento-nuevo', { about: [{ reference: `ServiceRequest/${pedido}` }] })
    );
    const evento: Bundle = { resourceType: 'Bundle', type: 'history', entry: [{ resource: aviso }] };
    await act(async () => {
      (medplum.getSubscriptionManager() as MockSubscriptionManager).emitEventForCriteria(
        criteriaNotificaciones(`Patient/${patient.id}`),
        { type: 'message', payload: evento }
      );
    });
    // «Listo» (sin la firma médica registrada, nunca «Firmado») y nuevo.
    await waitFor(
      () => expect(llegada()).toMatchObject({ id: `DiagnosticReport/${informe.id}`, estado: 'Listo' }),
      ESPERA
    );
    expect(hook.result.current.nuevas.has(`DiagnosticReport/${informe.id}`)).toBe(true);
    expect(hook.result.current.filas.find((f) => f.id === `ServiceRequest/${pedido}`)?.estado).toBe('Completada');
  });

  test('en tiempo real, la tarea de firma que dejó el bot no queda vieja por la caché de búsquedas', async () => {
    vi.stubEnv('MEDPLUM_TIEMPO_REAL', 'true');
    const medplum = new MockClient();
    const patient = await paciente(medplum);
    const { pedido } = await cargarDatosDeJorge(medplum, patient);
    const hook = await montar(medplum);
    const llegada = (): FilaTablero | undefined =>
      hook.result.current.filas.find((f) => f.que === `Informe de ${MARCA.producto}`);
    expect(llegada()?.estado).toBe('En camino');

    // El bot deja la tarea de firma del lado del servidor (la caché de este cliente no se entera)
    // y otra novedad cualquiera dispara la recarga.
    await medplum.repo.createResource<Task>({
      resourceType: 'Task',
      status: 'requested',
      intent: 'order',
      code: {
        coding: [{ system: 'https://segundaopinionmedica.org/fhir/CodeSystem/task-tipo', code: TAREA_FIRMA_INFORME }],
      },
      for: referencia(patient),
      basedOn: [{ reference: `ServiceRequest/${pedido}` }],
    });
    const aviso = await medplum.createResource(novedad(patient, 'general'));
    const evento: Bundle = { resourceType: 'Bundle', type: 'history', entry: [{ resource: aviso }] };
    await act(async () => {
      (medplum.getSubscriptionManager() as MockSubscriptionManager).emitEventForCriteria(
        criteriaNotificaciones(`Patient/${patient.id}`),
        { type: 'message', payload: evento }
      );
    });
    await waitFor(() => expect(llegada()?.estado).toBe('En revisión por el cardiólogo'), ESPERA);
  });
});

describe('useTableroHomeD: lecturas honestas y livianas', () => {
  test('los informes de todos los PDFs procesados llegan en una sola búsqueda (sin leerlos de a uno)', async () => {
    const medplum = new MockClient();
    const patient = await paciente(medplum);
    const ids: string[] = [];
    for (const dia of [1, 2, 3, 4]) {
      const informe = await medplum.createResource<DiagnosticReport>({
        resourceType: 'DiagnosticReport',
        status: 'final',
        code: { text: 'Laboratorio' },
        subject: referencia(patient),
        result: [{ reference: 'Observation/a' }],
        // El más viejo (el 4.º), revisado por un médico.
        ...(dia === 1 ? { resultsInterpreter: [{ reference: 'Practitioner/m1' }] } : {}),
      });
      ids.push(informe.id as string);
      await medplum.createResource<DocumentReference>({
        resourceType: 'DocumentReference',
        status: 'current',
        subject: referencia(patient),
        date: `2026-10-0${dia}T12:00:00.000Z`,
        category: [{ coding: [{ system: DOCUMENTO_CATEGORY_SYSTEM, code: CATEGORIA_LABORATORIO }] }],
        content: [{ attachment: { contentType: 'application/pdf' } }],
        context: { related: [{ reference: `DiagnosticReport/${informe.id}` }] },
      });
    }
    const buscar = vi.spyOn(medplum, 'searchResources');
    const leer = vi.spyOn(medplum, 'readResource');
    const { result } = await montar(medplum);
    expect(buscar.mock.calls.filter(([tipo]) => tipo === 'DiagnosticReport')).toHaveLength(1);
    expect(leer.mock.calls.filter(([tipo]) => tipo === 'DiagnosticReport')).toHaveLength(0);
    const viejo = result.current.filas.find((f) => f.id === `DiagnosticReport/${ids[0]}`);
    // El 4.º PDF también trae su informe: revisado, sin la nota de «todavía no lo revisó un médico».
    expect(viejo).toMatchObject({ estado: 'Listo: 1 valor', tono: 'listo' });
    expect(viejo?.nota).toBeUndefined();
  });

  test('si no se pueden leer los informes: las llegadas no afirman nada de la revisión y el tablero avisa', async () => {
    const medplum = new MockClient();
    const patient = await paciente(medplum);
    const ids = await cargarDatosDeJorge(medplum, patient);
    const original = medplum.searchResources.bind(medplum);
    vi.spyOn(medplum, 'searchResources').mockImplementation(((tipo: string, ...resto: unknown[]) =>
      tipo === 'DiagnosticReport'
        ? Promise.reject(new Error('sin conexión'))
        : (original as (...a: unknown[]) => unknown)(tipo, ...resto)) as never);
    const { result } = await montar(medplum);
    expect(result.current.incompleto).toBe(true);
    const llegada = result.current.filas.find((f) => f.id === `DiagnosticReport/${ids.informe}`);
    expect(llegada).toMatchObject({ estado: 'Listo', tono: 'neutro' });
    expect(llegada?.nota).toBeUndefined();
  });

  test('si no se puede leer el informe de la Segunda Opinión completada: «Listo» neutro, sin afirmar la firma', async () => {
    const medplum = new MockClient();
    const patient = await paciente(medplum);
    const { pedido } = await cargarDatosDeJorge(medplum, patient);
    const orden = await medplum.readResource('ServiceRequest', pedido as string);
    await medplum.updateResource<ServiceRequest>({ ...orden, status: 'completed' });
    const original = medplum.searchResources.bind(medplum);
    vi.spyOn(medplum, 'searchResources').mockImplementation(((tipo: string, ...resto: unknown[]) =>
      tipo === 'DiagnosticReport' && String(resto[0]).startsWith('based-on=')
        ? Promise.reject(new Error('sin permiso'))
        : (original as (...a: unknown[]) => unknown)(tipo, ...resto)) as never);
    const { result } = await montar(medplum);
    const llegada = result.current.filas.find((f) => f.que === `Informe de ${MARCA.producto}`);
    expect(llegada).toMatchObject({ estado: 'Listo', tono: 'neutro' });
    expect(llegada?.nota).toBeUndefined();
    expect(result.current.incompleto).toBe(true);
  });

  test('AC-8: con la tarea de firma pendiente, «En revisión por el cardiólogo», con una sola búsqueda', async () => {
    const medplum = new MockClient();
    const patient = await paciente(medplum);
    const { pedido } = await cargarDatosDeJorge(medplum, patient);
    await medplum.createResource<Task>({
      resourceType: 'Task',
      status: 'in-progress',
      intent: 'order',
      code: {
        coding: [{ system: 'https://segundaopinionmedica.org/fhir/CodeSystem/task-tipo', code: TAREA_FIRMA_INFORME }],
      },
      for: referencia(patient),
      basedOn: [{ reference: `ServiceRequest/${pedido}` }],
    });
    const buscar = vi.spyOn(medplum, 'searchResources');
    const { result } = await montar(medplum);
    const salida = result.current.filas.find((f) => f.id === `ServiceRequest/${pedido}`);
    const llegada = result.current.filas.find((f) => f.que === `Informe de ${MARCA.producto}`);
    expect(salida?.estado).toBe('En revisión por el cardiólogo');
    expect(llegada).toMatchObject({ estado: 'En revisión por el cardiólogo', tono: 'en-curso' });
    expect(result.current.incompleto).toBe(false);
    const deFirma = buscar.mock.calls.filter(([tipo, q]) => tipo === 'Task' && String(q).includes(TAREA_FIRMA_INFORME));
    expect(deFirma).toHaveLength(1);
  });

  test('un pedido viejo activo no tapa el informe del más nuevo, completado', async () => {
    const medplum = new MockClient();
    const patient = await paciente(medplum);
    await cargarDatosDeJorge(medplum, patient); // su pedido, activo, del 28/9
    const nuevo = await medplum.createResource<ServiceRequest>({
      resourceType: 'ServiceRequest',
      status: 'completed',
      intent: 'order',
      subject: referencia(patient),
      code: { coding: [{ system: SOM_SERVICE_SYSTEM, code: SOM_SERVICE_CODE }] },
      authoredOn: '2026-10-05T13:00:00.000Z',
    });
    await medplum.createResource<DiagnosticReport>({
      resourceType: 'DiagnosticReport',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '11488-4' }] },
      subject: referencia(patient),
      basedOn: [{ reference: `ServiceRequest/${nuevo.id}` }],
      issued: '2026-10-06T13:00:00.000Z',
      resultsInterpreter: [{ reference: 'Practitioner/cardio' }],
    });
    const { result } = await montar(medplum);
    const llegada = result.current.filas.find((f) => f.que === `Informe de ${MARCA.producto}`);
    expect(llegada).toMatchObject({ estado: 'Firmado', tono: 'listo' });
    expect(result.current.incompleto).toBe(false);
  });

  test('el laboratorio cargado a mano es una salida; lo que leyó el bot de un PDF, no', async () => {
    const medplum = new MockClient();
    const patient = await paciente(medplum);
    const laboratorio = (cambios: Partial<Observation>): Observation => ({
      resourceType: 'Observation',
      status: 'preliminary',
      category: [{ coding: [{ system: CATEGORIA_OBSERVACION_SYSTEM, code: 'laboratory' }] }],
      code: { coding: [{ system: 'http://loinc.org', code: '2093-3' }] },
      subject: referencia(patient),
      effectiveDateTime: '2026-09-15',
      valueQuantity: { value: 190, unit: 'mg/dL' },
      ...cambios,
    });
    const manual = await medplum.createResource(laboratorio({}));
    await medplum.createResource(
      laboratorio({ status: 'final', derivedFrom: [{ reference: 'DocumentReference/d1' }] })
    );
    const { result } = await montar(medplum);
    expect(result.current.filas).toEqual([
      expect.objectContaining({
        id: `Observation/${manual.id}`,
        que: 'Laboratorio cargado a mano',
        href: '/health-record/biomarkers',
      }),
    ]);
  });

  test('en tiempo real, varios avisos seguidos («Leer todas») son una sola recarga', async () => {
    vi.stubEnv('MEDPLUM_TIEMPO_REAL', 'true');
    const medplum = new MockClient();
    const patient = await paciente(medplum);
    await cargarDatosDeJorge(medplum, patient);
    const hook = await montar(medplum);
    const buscar = vi.spyOn(medplum, 'searchResources');
    const novedades = (): number => buscar.mock.calls.filter(([tipo]) => tipo === 'Communication').length;
    const nueva = await medplum.createResource(novedad(patient, 'mensaje-nuevo'));
    const evento: Bundle = { resourceType: 'Bundle', type: 'history', entry: [{ resource: nueva }] };
    // Llegan de a uno (cada PATCH de «Leer todas» dispara su aviso), con un respiro entre uno y otro.
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        (medplum.getSubscriptionManager() as MockSubscriptionManager).emitEventForCriteria(
          criteriaNotificaciones(`Patient/${patient.id}`),
          { type: 'message', payload: evento }
        );
      });
      await act(() => new Promise((r) => setTimeout(r, 40)));
    }
    await waitFor(
      () => expect(hook.result.current.filas.some((f) => f.id === `Communication/${nueva.id}`)).toBe(true),
      {
        timeout: ESPERA_TIEMPO_REAL_MS + 4000,
      }
    );
    // Una sola recarga, aunque llegaron seis avisos.
    await new Promise((r) => setTimeout(r, ESPERA_TIEMPO_REAL_MS + 200));
    expect(novedades()).toBe(1);
  });
});

describe('la última visita en este dispositivo', () => {
  test('se guarda por paciente, con try/catch', () => {
    expect(claveVisita('Patient/p1')).toBe('home-d-visita:Patient/p1');
    expect(leerUltimaVisita('Patient/p1')).toBeUndefined();
    guardarVisita('Patient/p1', '2026-10-10T15:00:00.000Z');
    expect(leerUltimaVisita('Patient/p1')).toBe('2026-10-10T15:00:00.000Z');
    expect(leerUltimaVisita('Patient/p2')).toBeUndefined();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('lleno');
    });
    expect(() => guardarVisita('Patient/p1', 'otra')).not.toThrow();
  });
});
