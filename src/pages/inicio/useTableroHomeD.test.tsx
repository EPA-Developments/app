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
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import type { MockSubscriptionManager } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { indexarDefinicionesFhir } from '../../fhir/__fixtures__/glp1';
import { CATEGORIA_LABORATORIO, DOCUMENTO_CATEGORY_SYSTEM } from '../../fhir/estudios';
import { criteriaNotificaciones, NOTIFICACION_SYSTEM } from '../../fhir/notificaciones';
import { SOM_SERVICE_CODE, SOM_SERVICE_SYSTEM } from '../../fhir/som';
import { LE8_QUESTIONNAIRES } from '../../le8';
import { MARCA } from '../../marca';
import type { TableroHomeD } from './tipos';
import { claveVisita, guardarVisita, leerUltimaVisita, useTableroHomeD } from './useTableroHomeD';

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

  test('si una consulta falla: el resto se muestra, queda incompleto y no se guarda la visita', async () => {
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
    // Lo que no se pudo traer tiene que poder verse como nuevo la próxima vez.
    expect(window.localStorage.getItem(claveVisita(`Patient/${patient.id}`))).toBeNull();
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
