// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import type {
  Appointment,
  DiagnosticReport,
  DocumentReference,
  Extension,
  Observation,
  Patient,
  QuestionnaireResponse,
  RiskAssessment,
  ServiceRequest,
  Task,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { indexarDefinicionesFhir } from '../../fhir/__fixtures__/glp1';
import { EXT_AGENDA, V3_ACT_CODE } from '../../fhir/agenda';
import type { PlanBienestar } from '../../fhir/bienestar';
import { CONSENT_TYPE_CODE, CONSENT_TYPE_SYSTEM, CONSENT_VERSION_SYSTEM } from '../../fhir/consentimiento';
import { CATEGORIA_LABORATORIO, DOCUMENTO_CATEGORY_SYSTEM } from '../../fhir/estudios';
import { SOM_SERVICE_CODE, SOM_SERVICE_SYSTEM, TAREA_FIRMA_INFORME } from '../../fhir/som';
import { VERSION_CONSENTIMIENTO } from '../health-record/InformedConsent.data';
import { INTAKE_QUESTIONNAIRE_URL } from '../intake.questionnaire';
import type { DatosHomeE, ProximoTurno } from './tipos';
import type { CargasHomeE, EntradaHomeE, ResultadosHomeE } from './useDatosHomeE';
import {
  armarDatosHomeE,
  cargasHomeE,
  estadioCkmHome,
  estadoConsentimiento,
  estudiosEnviadosCompartidos,
  estudioVigente,
  informeFirmado,
  laboratorioHome,
  notaEstadioCkm,
  preventEstimado,
  preventFirmado,
  proximoTurnoDe,
  ultimaConsultaDe,
  segundaOpinionHome,
  useDatosHomeE,
} from './useDatosHomeE';

const HOY = '2026-10-10';
const ESPERA = { timeout: 5000 };

function envoltorio(medplum: MockClient): (props: { children: ReactNode }) => JSX.Element {
  return function Envoltorio({ children }: { children: ReactNode }): JSX.Element {
    return <MedplumProvider medplum={medplum}>{children}</MedplumProvider>;
  };
}

async function datosDe(medplum: MockClient): Promise<DatosHomeE> {
  const { result } = renderHook(() => useDatosHomeE(), { wrapper: envoltorio(medplum) });
  await waitFor(() => expect(result.current.cargando).toBe(false), ESPERA);
  return result.current;
}

async function paciente(medplum: MockClient): Promise<Patient> {
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Ana', 'María'], family: 'García' }],
    gender: 'female',
    birthDate: '1975-03-15',
  });
  medplum.setProfile(patient);
  return patient;
}

function consentimiento(patient: Patient, version?: string): DocumentReference {
  return {
    resourceType: 'DocumentReference',
    status: 'current',
    type: { coding: [{ system: CONSENT_TYPE_SYSTEM, code: CONSENT_TYPE_CODE }] },
    subject: { reference: `Patient/${patient.id}` },
    date: '2026-09-20T12:00:00.000Z',
    ...(version ? { identifier: [{ system: CONSENT_VERSION_SYSTEM, value: version }] } : {}),
    content: [{ attachment: { contentType: 'text/plain', data: 'ZmlybWFkbw==' } }],
  };
}

/** La modalidad del turno, como la marca Recepción (v3-ActCode `VR` / `AMB`). */
const POR_VIDEOLLAMADA: Extension = { url: EXT_AGENDA.modalidad, valueCoding: { system: V3_ACT_CODE, code: 'VR' } };
const EN_EL_CENTRO: Extension = { url: EXT_AGENDA.modalidad, valueCoding: { system: V3_ACT_CODE, code: 'AMB' } };

/** Un turno de 30 minutos de la paciente, reservado. */
function turno(patient: Patient, start: string, cambios: Partial<Appointment> = {}): Appointment {
  return {
    resourceType: 'Appointment',
    status: 'booked',
    start,
    end: new Date(Date.parse(start) + 30 * 60_000).toISOString(),
    participant: [{ actor: { reference: `Patient/${patient.id}` }, status: 'accepted' }],
    ...cambios,
  };
}

function solicitudSOM(patient: Patient, status: ServiceRequest['status']): ServiceRequest {
  return {
    resourceType: 'ServiceRequest',
    status,
    intent: 'order',
    subject: { reference: `Patient/${patient.id}` },
    code: { coding: [{ system: SOM_SERVICE_SYSTEM, code: SOM_SERVICE_CODE }] },
    authoredOn: '2026-10-01T13:00:00.000Z',
  };
}

/** La tarea de firma del informe (la crea el backend); `intent: 'plan'` es la que puede dar de alta la paciente. */
function tareaFirma(patient: Patient, sr: ServiceRequest, intent: Task['intent'] = 'order'): Task {
  return {
    resourceType: 'Task',
    status: 'requested',
    intent,
    code: {
      coding: [{ system: 'https://segundaopinionmedica.org/fhir/CodeSystem/task-tipo', code: TAREA_FIRMA_INFORME }],
    },
    for: { reference: `Patient/${patient.id}` },
    basedOn: [{ reference: `ServiceRequest/${sr.id}` }],
  };
}

describe('useDatosHomeE con el MockClient', () => {
  beforeAll(() => {
    indexarDefinicionesFhir();
  });

  test('con un profesional: sin datos de paciente, y sin consultar nada', async () => {
    const medplum = new MockClient(); // el perfil por defecto es un Practitioner
    const buscar = vi.spyOn(medplum, 'searchResources');
    const datos = await datosDe(medplum);
    expect(datos).toEqual({
      cargando: false,
      esPaciente: false,
      hoy: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      consentimiento: 'firmado',
      ingresoPendiente: false,
      novedadesSinLeer: 0,
    });
    expect(buscar).not.toHaveBeenCalled();
  });

  test('una paciente sin nada cargado: le falta el consentimiento y el ingreso', async () => {
    const medplum = new MockClient();
    await paciente(medplum);
    const datos = await datosDe(medplum);
    expect(datos).toMatchObject({
      cargando: false,
      esPaciente: true,
      nombre: 'Ana',
      consentimiento: 'falta',
      ingresoPendiente: true,
      novedadesSinLeer: 0,
    });
    expect(datos.fechaConsentimiento).toBeUndefined();
    expect(datos.plan).toBeUndefined();
    expect(datos.segundaOpinion).toBeUndefined();
    expect(datos.laboratorio).toBeUndefined();
    expect(datos.prevent).toBeUndefined();
    expect(datos.proximoTurno).toBeUndefined();
    // La rosa tiene sus 8 pétalos, todos sin dato.
    expect(datos.le8?.dominios).toHaveLength(8);
    expect(datos.le8?.total).toBeUndefined();
  });

  test('con el consentimiento firmado y una Segunda Opinión en análisis', async () => {
    const medplum = new MockClient();
    const patient = await paciente(medplum);
    await medplum.createResource(consentimiento(patient, VERSION_CONSENTIMIENTO));
    await medplum.createResource(solicitudSOM(patient, 'active'));
    await medplum.createResource<QuestionnaireResponse>({
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      questionnaire: INTAKE_QUESTIONNAIRE_URL,
      subject: { reference: `Patient/${patient.id}` },
      authored: '2026-09-21T13:00:00.000Z',
    });
    const datos = await datosDe(medplum);
    expect(datos.consentimiento).toBe('firmado');
    expect(datos.fechaConsentimiento).toBe('2026-09-20T12:00:00.000Z');
    expect(datos.ingresoPendiente).toBe(false);
    expect(datos.segundaOpinion).toMatchObject({
      estado: 'en-analisis',
      etiqueta: 'En análisis',
      pedida: '2026-10-01T13:00:00.000Z',
    });
    expect(datos.prevent).toBeUndefined();
  });

  test('AC-8: activa con su tarea de firma pendiente, en revisión por el cardiólogo y sin PREVENT', async () => {
    const medplum = new MockClient();
    const patient = await paciente(medplum);
    const sr = await medplum.createResource(solicitudSOM(patient, 'active'));
    await medplum.createResource(tareaFirma(patient, sr));
    // El RiskAssessment nace con el borrador: la API lo deja leer, pero la Home no lo muestra.
    await medplum.createResource<RiskAssessment>({
      resourceType: 'RiskAssessment',
      status: 'preliminary',
      subject: { reference: `Patient/${patient.id}` },
      basedOn: { reference: `ServiceRequest/${sr.id}` },
      prediction: [{ outcome: { text: 'ASCVD 10 años' }, probabilityDecimal: 0.08 }],
    });
    const buscar = vi.spyOn(medplum, 'searchResources');
    const datos = await datosDe(medplum);
    expect(datos.segundaOpinion).toMatchObject({ estado: 'en-revision', etiqueta: 'En revisión por el cardiólogo' });
    expect(datos.prevent).toBeUndefined();
    // Una sola búsqueda de la tarea de firma, y ninguna del informe ni del PREVENT.
    const deFirma = buscar.mock.calls.filter(([tipo, q]) => tipo === 'Task' && String(q).includes(TAREA_FIRMA_INFORME));
    expect(deFirma).toHaveLength(1);
    expect(buscar.mock.calls.filter(([tipo]) => tipo === 'RiskAssessment' || tipo === 'DiagnosticReport')).toEqual([]);
  });

  test('AC-9: una tarea intent=plan de la paciente con el código de la firma no la pasa a revisión', async () => {
    const medplum = new MockClient();
    const patient = await paciente(medplum);
    const sr = await medplum.createResource(solicitudSOM(patient, 'active'));
    await medplum.createResource(tareaFirma(patient, sr, 'plan'));
    const datos = await datosDe(medplum);
    expect(datos.segundaOpinion).toMatchObject({ estado: 'en-analisis', etiqueta: 'En análisis' });
  });

  test('con una teleconsulta reservada en unos días: es su próximo turno (el cancelado no cuenta)', async () => {
    const medplum = new MockClient();
    const patient = await paciente(medplum);
    const enDosDias = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    enDosDias.setUTCMinutes(0, 0, 0);
    const enTresDias = new Date(enDosDias.getTime() + 24 * 60 * 60 * 1000);
    await medplum.createResource(turno(patient, enDosDias.toISOString(), { status: 'cancelled' }));
    const reservado = await medplum.createResource(
      turno(patient, enTresDias.toISOString(), { extension: [POR_VIDEOLLAMADA] })
    );
    const datos = await datosDe(medplum);
    expect(datos.proximoTurno).toEqual({ id: reservado.id, inicio: enTresDias.toISOString(), teleconsulta: true });
  });

  test('con el consentimiento de una versión anterior: desactualizado', async () => {
    const medplum = new MockClient();
    const patient = await paciente(medplum);
    await medplum.createResource(consentimiento(patient, '2020-01'));
    expect((await datosDe(medplum)).consentimiento).toBe('desactualizado');
  });

  test('un PDF cargado por error no es su último laboratorio (el tablero tampoco lo muestra)', async () => {
    const medplum = new MockClient();
    const patient = await paciente(medplum);
    const pdf = (date: string, cambios: Partial<DocumentReference> = {}): DocumentReference => ({
      resourceType: 'DocumentReference',
      status: 'current',
      subject: { reference: `Patient/${patient.id}` },
      date,
      category: [{ coding: [{ system: DOCUMENTO_CATEGORY_SYSTEM, code: CATEGORIA_LABORATORIO }] }],
      content: [{ attachment: { contentType: 'application/pdf' } }],
      ...cambios,
    });
    const informe = await medplum.createResource<DiagnosticReport>({
      resourceType: 'DiagnosticReport',
      status: 'final',
      code: { text: 'Laboratorio' },
      subject: { reference: `Patient/${patient.id}` },
      result: [{ reference: 'Observation/a' }],
    });
    await medplum.createResource(
      pdf('2026-10-01T12:00:00.000Z', { context: { related: [{ reference: `DiagnosticReport/${informe.id}` }] } })
    );
    // El más nuevo, sin procesar y marcado por error: no queda «en proceso» ni «demorado».
    await medplum.createResource(pdf(new Date().toISOString(), { status: 'entered-in-error' }));
    const { laboratorio } = await datosDe(medplum);
    expect(laboratorio).toMatchObject({ estado: 'procesado', informeId: informe.id, valores: 1 });
  });

  test('los PDFs se piden una sola vez si otra carga ya los está pidiendo (sin respuestas viejas)', async () => {
    const medplum = new MockClient();
    const patient = await paciente(medplum);
    const buscar = vi.spyOn(medplum, 'searchResources');
    const [a, b] = await Promise.all([
      estudiosEnviadosCompartidos(medplum, patient),
      estudiosEnviadosCompartidos(medplum, patient),
    ]);
    expect(a).toBe(b);
    const pdfs = (): number => buscar.mock.calls.filter(([tipo]) => tipo === 'DocumentReference').length;
    expect(pdfs()).toBe(1);
    // Terminada la consulta, la siguiente vuelve a pedir (nunca devuelve una respuesta vieja).
    await estudiosEnviadosCompartidos(medplum, patient);
    expect(pdfs()).toBe(2);
  });

  test('si una consulta falla, la Home sigue sin ese dato', async () => {
    const medplum = new MockClient();
    const patient = await paciente(medplum);
    await medplum.createResource(solicitudSOM(patient, 'active'));
    const searchOne = vi.spyOn(medplum, 'searchOne').mockRejectedValue(new Error('sin conexión'));
    const datos = await datosDe(medplum);
    expect(searchOne).toHaveBeenCalled();
    // No se sabe si firmó: ni se le pide firmar ni se afirma que firmó.
    expect(datos.consentimiento).toBe('cargando');
    expect(datos.segundaOpinion?.estado).toBe('en-analisis');
  });
});

// ─── La combinación, sin red ─────────────────────────────────────────────────────────

const PACIENTE: Patient = { resourceType: 'Patient', id: 'p1', name: [{ given: ['  Lucía '] }] };

const CARGAS: CargasHomeE = { consentimiento: 'firmado', ingresoPendiente: false, novedadesSinLeer: 3 };

function entrada(cambios: Partial<EntradaHomeE> = {}): EntradaHomeE {
  return {
    perfil: PACIENTE,
    hoy: HOY,
    tablero: { cargando: false },
    cargas: CARGAS,
    ...cambios,
  };
}

describe('armarDatosHomeE', () => {
  test('cargando hasta que terminan el efecto y el tablero del vendor', () => {
    expect(armarDatosHomeE(entrada()).cargando).toBe(false);
    expect(armarDatosHomeE(entrada({ cargas: undefined })).cargando).toBe(true);
    expect(armarDatosHomeE(entrada({ tablero: { cargando: true } })).cargando).toBe(true);
  });

  test('también espera al PREVENT estimado', () => {
    const prevent = { cargando: true, faltantes: [] };
    expect(armarDatosHomeE(entrada({ prevent })).cargando).toBe(true);
  });

  test('el PREVENT estimado pasa a la escala 0-1; sin resultado, quedan los faltantes', () => {
    const resultado = {
      diezAnios: { totalCvd: 9.4, ascvd: 8.1, heartFailure: 5.2 },
      treintaAnios: { totalCvd: 24, ascvd: 18, heartFailure: 11 },
      faltantes: [],
    };
    const con = armarDatosHomeE(entrada({ prevent: { cargando: false, resultado, faltantes: ['presión arterial'] } }));
    expect(con.preventEstimado?.ascvd10).toBeCloseTo(0.081);
    expect(con.preventEstimado?.hf10).toBeCloseTo(0.052);
    expect(con.preventEstimado?.total30).toBeCloseTo(0.24);
    expect(con.preventEstimado?.faltantes).toEqual(['presión arterial']);
    expect(con.preventFaltantes).toBeUndefined();
    const sin = armarDatosHomeE(entrada({ prevent: { cargando: false, faltantes: ['colesterol total y HDL'] } }));
    expect(sin.preventEstimado).toBeUndefined();
    expect(sin.preventFaltantes).toEqual(['colesterol total y HDL']);
    expect(preventEstimado(undefined, [])).toBeUndefined();
  });

  test('mientras el efecto carga, no pide firmas ni ingreso', () => {
    expect(armarDatosHomeE(entrada({ cargas: undefined }))).toMatchObject({
      consentimiento: 'cargando',
      ingresoPendiente: false,
      novedadesSinLeer: 0,
    });
  });

  test('el nombre es el primer nombre de pila, sin espacios', () => {
    expect(armarDatosHomeE(entrada()).nombre).toBe('Lucía');
    const sinNombre = entrada({ perfil: { resourceType: 'Patient', name: [{ given: [' '] }] } });
    expect(armarDatosHomeE(sinNombre).nombre).toBeUndefined();
    expect(armarDatosHomeE(entrada({ perfil: { resourceType: 'Patient' } })).nombre).toBeUndefined();
  });

  test('el estadio CKM es el del equipo; sin él, no hay estadio (nunca una estimación)', () => {
    const estadioEquipo = { estadio: 3 as const, origen: 'serie' as const, fecha: '2026-09-15', provisorio: true };
    expect(armarDatosHomeE(entrada({ cargas: { ...CARGAS, estadioEquipo } })).ckm).toEqual({
      estadio: 3,
      origen: 'serie',
      fecha: '2026-09-15',
      provisorio: true,
    });
    expect(armarDatosHomeE(entrada()).ckm).toBeUndefined();
  });

  test('«Tus valores»: el modelo sale de las lecturas, con el sexo de la paciente', () => {
    const cintura: Observation = {
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '56086-2' }] },
      effectiveDateTime: '2026-09-15',
      valueQuantity: { value: 85, unit: 'cm' },
    };
    const mujer = entrada({ perfil: { ...PACIENTE, gender: 'female' }, cargas: { ...CARGAS, lecturasCkm: [cintura] } });
    const varon = entrada({ perfil: { ...PACIENTE, gender: 'male' }, cargas: { ...CARGAS, lecturasCkm: [cintura] } });
    // 85 cm: fuera del corte de la mujer (80), dentro del del varón (94).
    expect(armarDatosHomeE(mujer).hgraph?.puntos.find((p) => p.id === 'waist')?.dato?.estado).toBe('moderate');
    expect(armarDatosHomeE(varon).hgraph?.puntos.find((p) => p.id === 'waist')?.dato?.estado).toBe('healthy');
    // Sin lecturas (falló o todavía no llegó), no hay modelo; las cargas crudas no pasan a la Home.
    const sin = armarDatosHomeE(entrada());
    expect(sin.hgraph).toBeUndefined();
    expect(armarDatosHomeE(mujer)).not.toHaveProperty('lecturasCkm');
    expect(armarDatosHomeE(mujer)).not.toHaveProperty('estadioEquipo');
  });

  test('un perfil que no es Patient: valores neutros', () => {
    expect(armarDatosHomeE(entrada({ perfil: { resourceType: 'Practitioner' } }))).toEqual({
      cargando: false,
      esPaciente: false,
      hoy: HOY,
      consentimiento: 'firmado',
      ingresoPendiente: false,
      novedadesSinLeer: 0,
    });
    expect(armarDatosHomeE(entrada({ perfil: undefined })).esPaciente).toBe(false);
  });
});

describe('cargasHomeE: cada fallo, sin ese dato', () => {
  const ok = <T,>(value: T): PromiseFulfilledResult<T> => ({ status: 'fulfilled', value });
  const falla: PromiseRejectedResult = { status: 'rejected', reason: new Error('sin conexión') };
  const PLAN = { dia: 3 } as PlanBienestar;

  function resultados(cambios: Partial<ResultadosHomeE> = {}): ResultadosHomeE {
    return {
      plan: ok(PLAN),
      segundaOpinion: ok({}),
      laboratorio: ok(undefined),
      equipo: ok({ equipoPlan: [], segundaOpinion: [] }),
      novedadesSinLeer: ok(2),
      consentimiento: ok({ ...consentimiento(PACIENTE, VERSION_CONSENTIMIENTO), id: 'c1' }),
      ingreso: ok({ resourceType: 'QuestionnaireResponse', status: 'completed' }),
      ...cambios,
    };
  }

  test('con todo bien', () => {
    expect(cargasHomeE(resultados())).toMatchObject({
      plan: PLAN,
      novedadesSinLeer: 2,
      consentimiento: 'firmado',
      fechaConsentimiento: '2026-09-20T12:00:00.000Z',
      ingresoPendiente: false,
    });
  });

  test('el próximo turno, cuando la consulta salió bien', () => {
    const proximo: ProximoTurno = { id: 'appt-1', inicio: '2026-10-17T13:30:00.000Z', teleconsulta: true };
    expect(cargasHomeE(resultados({ turno: ok(proximo) }))).toMatchObject({ plan: PLAN, proximoTurno: proximo });
    expect(cargasHomeE(resultados({ turno: ok(undefined) })).proximoTurno).toBeUndefined();
  });

  test('si la consulta de turnos falla, sin turno (y el resto sigue)', () => {
    const cargas = cargasHomeE(resultados({ turno: falla }));
    expect(cargas.proximoTurno).toBeUndefined();
    expect(cargas).toMatchObject({ plan: PLAN, novedadesSinLeer: 2, consentimiento: 'firmado' });
  });

  test('sin la consulta de turnos (es opcional), sin turno', () => {
    const cargas = cargasHomeE(resultados());
    expect('turno' in resultados()).toBe(false);
    expect(cargas.proximoTurno).toBeUndefined();
    expect(cargas).toMatchObject({ plan: PLAN, consentimiento: 'firmado' });
  });

  test('sin consentimiento ni ingreso: falta firmar y completar', () => {
    const cargas = cargasHomeE(resultados({ consentimiento: ok(undefined), ingreso: ok(undefined) }));
    expect(cargas).toMatchObject({ consentimiento: 'falta', ingresoPendiente: true });
    expect(cargas.fechaConsentimiento).toBeUndefined();
  });

  test('si fallan todas, quedan los valores neutros', () => {
    expect(
      cargasHomeE({
        plan: falla,
        segundaOpinion: falla,
        laboratorio: falla,
        equipo: falla,
        novedadesSinLeer: falla,
        consentimiento: falla,
        ingreso: falla,
      })
    ).toEqual({
      plan: undefined,
      segundaOpinion: undefined,
      prevent: undefined,
      laboratorio: undefined,
      equipo: undefined,
      novedadesSinLeer: 0,
      consentimiento: 'cargando',
      fechaConsentimiento: undefined,
      ingresoPendiente: false,
    });
  });
});

describe('traducciones para la Home', () => {
  test('estudioVigente: uno cargado por error (o sin id) no es un envío', () => {
    const doc: DocumentReference = { resourceType: 'DocumentReference', id: 'd1', status: 'current', content: [] };
    expect(estudioVigente(doc)).toBe(true);
    expect(estudioVigente({ ...doc, status: 'entered-in-error' })).toBe(false);
    expect(estudioVigente({ ...doc, id: undefined })).toBe(false);
  });

  test('estadoConsentimiento: falta, desactualizado o firmado', () => {
    const p: Patient = PACIENTE;
    expect(estadoConsentimiento(undefined)).toBe('falta');
    expect(estadoConsentimiento(consentimiento(p))).toBe('desactualizado'); // firmado antes de versionar
    expect(estadoConsentimiento(consentimiento(p, '2020-01'))).toBe('desactualizado');
    expect(estadoConsentimiento(consentimiento(p, VERSION_CONSENTIMIENTO))).toBe('firmado');
  });

  test('segundaOpinionHome: estado, etiqueta y fechas', () => {
    const sr: ServiceRequest = {
      ...solicitudSOM(PACIENTE, 'completed'),
      id: 's1',
      meta: { lastUpdated: '2026-10-05T10:00:00.000Z' },
    };
    expect(segundaOpinionHome(sr)).toEqual({
      id: 's1',
      estado: 'completada',
      etiqueta: 'Completada',
      pedida: '2026-10-01T13:00:00.000Z',
      actualizada: '2026-10-05T10:00:00.000Z',
      // Completada no es firmada: los informes de antes de la firma del cardiólogo (R-24)
      // completaron la orden sin ella.
      firmada: false,
    });
    expect(segundaOpinionHome({ ...sr, status: 'active' })?.estado).toBe('en-analisis');
    const firma: Task = { ...tareaFirma(PACIENTE, sr), status: 'in-progress' };
    expect(segundaOpinionHome({ ...sr, status: 'active' }, undefined, [firma])).toMatchObject({
      estado: 'en-revision',
      etiqueta: 'En revisión por el cardiólogo',
    });
    expect(segundaOpinionHome({ ...sr, status: 'on-hold' })).toMatchObject({ estado: 'otro', etiqueta: 'En pausa' });
    expect(segundaOpinionHome({ ...sr, status: 'revoked' })?.estado).toBe('cancelada');
    expect(segundaOpinionHome({ ...sr, status: 'entered-in-error' })?.estado).toBe('cancelada');
    expect(segundaOpinionHome(undefined)).toBeUndefined();
  });

  test('informeFirmado: solo final y con un resultsInterpreter Practitioner', () => {
    const informe: DiagnosticReport = { resourceType: 'DiagnosticReport', status: 'final', code: { text: 'SOM' } };
    expect(informeFirmado(undefined)).toBe(false);
    expect(informeFirmado(informe)).toBe(false);
    expect(informeFirmado({ ...informe, resultsInterpreter: [{ reference: 'Organization/o1' }] })).toBe(false);
    expect(
      informeFirmado({ ...informe, status: 'preliminary', resultsInterpreter: [{ reference: 'Practitioner/p1' }] })
    ).toBe(false);
    expect(informeFirmado({ ...informe, resultsInterpreter: [{ reference: 'Practitioner/p1' }] })).toBe(true);
    const sr: ServiceRequest = { ...solicitudSOM(PACIENTE, 'completed'), id: 's1' };
    expect(
      segundaOpinionHome(sr, { ...informe, resultsInterpreter: [{ reference: 'Practitioner/p1' }] })?.firmada
    ).toBe(true);
  });

  test('preventFirmado: con la fecha del informe, si la hay', () => {
    expect(preventFirmado({ ascvd10: 0.04 }, '2026-10-05')).toMatchObject({ ascvd10: 0.04, fecha: '2026-10-05' });
  });

  test('preventFirmado: solo si trae al menos un valor', () => {
    expect(preventFirmado({})).toBeUndefined();
    expect(preventFirmado({ ascvd10: Number.NaN })).toBeUndefined();
    expect(preventFirmado({ hf10: 0.031 })).toEqual({ ascvd10: undefined, hf10: 0.031, total30: undefined });
  });

  test('estadioCkmHome: el del equipo, o ninguno', () => {
    expect(estadioCkmHome({ estadio: 0, origen: 'validado', fecha: '2026-08-02', provisorio: false })).toEqual({
      estadio: 0,
      origen: 'validado',
      fecha: '2026-08-02',
      provisorio: false,
    });
    expect(estadioCkmHome({ estadio: 4, origen: 'serie', provisorio: false })).toEqual({
      estadio: 4,
      origen: 'serie',
      provisorio: false,
    });
    expect(estadioCkmHome(undefined)).toBeUndefined();
  });

  test('notaEstadioCkm: de dónde sale el estadio, con la fecha si la hay', () => {
    expect(notaEstadioCkm({ estadio: 2, origen: 'serie', fecha: '2026-09-15', provisorio: false }, HOY)).toBe(
      'Según tu equipo, con tus datos del 15 de septiembre.'
    );
    expect(notaEstadioCkm({ estadio: 2, origen: 'validado', fecha: '2025-12-01', provisorio: false }, HOY)).toBe(
      'La validó tu médico el 1 de diciembre de 2025.'
    );
    expect(notaEstadioCkm({ estadio: 2, origen: 'serie', provisorio: false }, HOY)).toBe('Según tu equipo.');
  });

  describe('laboratorioHome', () => {
    const pdf: DocumentReference = {
      resourceType: 'DocumentReference',
      status: 'current',
      date: '2026-10-03T12:00:00.000Z',
      content: [{ attachment: { contentType: 'application/pdf' } }],
    };
    const procesado: DocumentReference = { ...pdf, context: { related: [{ reference: 'DiagnosticReport/dr1' }] } };
    const informe: DiagnosticReport = {
      resourceType: 'DiagnosticReport',
      id: 'dr1',
      status: 'final',
      code: { text: 'Laboratorio' },
      result: [{ reference: 'Observation/o1' }, { reference: 'Observation/o2' }],
    };

    test('mientras el bot no suma su informe, en proceso', () => {
      expect(laboratorioHome(pdf, undefined, new Date('2026-10-03T12:30:00.000Z'))).toEqual({
        estado: 'en-proceso',
        fecha: '2026-10-03T12:00:00.000Z',
        revisionMedica: false,
      });
    });

    test('si pasó más de un día sin resultado, demorado (no queda «leyendo» para siempre)', () => {
      expect(laboratorioHome(pdf, undefined, new Date('2026-10-04T12:30:00.000Z')).estado).toBe('demorado');
      expect(laboratorioHome(pdf, undefined, new Date('2026-10-04T11:30:00.000Z')).estado).toBe('en-proceso');
    });

    test('procesado: cuántos valores leyó el agente, sin revisión médica todavía', () => {
      expect(laboratorioHome(procesado, informe)).toEqual({
        estado: 'procesado',
        fecha: '2026-10-03T12:00:00.000Z',
        informeId: 'dr1',
        valores: 2,
        revisionMedica: false,
      });
    });

    test('revisado por el equipo: final y con resultsInterpreter', () => {
      const revisado = { ...informe, resultsInterpreter: [{ reference: 'Practitioner/m1' }] };
      expect(laboratorioHome(procesado, revisado).revisionMedica).toBe(true);
      expect(laboratorioHome(procesado, { ...revisado, status: 'preliminary' }).revisionMedica).toBe(false);
    });

    test('si no se pudo leer el informe, procesado sin cantidad de valores', () => {
      expect(laboratorioHome(procesado)).toMatchObject({ estado: 'procesado', informeId: 'dr1', valores: undefined });
    });
  });
});

describe('proximoTurnoDe: el turno que viene, como en «Mis turnos»', () => {
  // Sábado 10 de octubre, 12:00 de Argentina.
  const AHORA = new Date('2026-10-10T15:00:00.000Z');
  const conId = (id: string, a: Appointment): Appointment => ({ ...a, id });

  test('sin turnos, ninguno', () => {
    expect(proximoTurnoDe([], AHORA)).toBeUndefined();
  });

  test('elige el más cercano, aunque lleguen desordenados', () => {
    const turnos = [
      conId('lejos', turno(PACIENTE, '2026-10-20T13:00:00.000Z')),
      conId('cerca', turno(PACIENTE, '2026-10-12T13:00:00.000Z')),
      conId('medio', turno(PACIENTE, '2026-10-15T13:00:00.000Z')),
    ];
    expect(proximoTurnoDe(turnos, AHORA)).toEqual({
      id: 'cerca',
      inicio: '2026-10-12T13:00:00.000Z',
      teleconsulta: false,
    });
  });

  test('marca si es una teleconsulta (por videollamada) o no', () => {
    const video = conId('v', turno(PACIENTE, '2026-10-12T13:00:00.000Z', { extension: [POR_VIDEOLLAMADA] }));
    const centro = conId('c', turno(PACIENTE, '2026-10-12T13:00:00.000Z', { extension: [EN_EL_CENTRO] }));
    expect(proximoTurnoDe([video], AHORA)?.teleconsulta).toBe(true);
    expect(proximoTurnoDe([centro], AHORA)?.teleconsulta).toBe(false);
    // Sin marca de modalidad (anterior a la regla), no se afirma que sea por videollamada.
    expect(proximoTurnoDe([conId('s', turno(PACIENTE, '2026-10-12T13:00:00.000Z'))], AHORA)?.teleconsulta).toBe(false);
  });

  test.each(['cancelled', 'noshow', 'fulfilled', 'entered-in-error'] as const)(
    'ignora un turno %s, aunque sea el más cercano',
    (status) => {
      const turnos = [
        conId('terminado', turno(PACIENTE, '2026-10-11T13:00:00.000Z', { status })),
        conId('vigente', turno(PACIENTE, '2026-10-13T13:00:00.000Z')),
      ];
      expect(proximoTurnoDe(turnos, AHORA)?.id).toBe('vigente');
      expect(proximoTurnoDe([turnos[0] as Appointment], AHORA)).toBeUndefined();
    }
  );

  test.each(['proposed', 'pending', 'booked', 'arrived', 'checked-in'] as const)('cuenta un turno %s', (status) => {
    const turnos = [conId('t', turno(PACIENTE, '2026-10-12T13:00:00.000Z', { status }))];
    expect(proximoTurnoDe(turnos, AHORA)?.id).toBe('t');
  });

  test('ignora los que ya pasaron', () => {
    const turnos = [
      conId('ayer', turno(PACIENTE, '2026-10-09T13:00:00.000Z')),
      conId('esta-manana', turno(PACIENTE, '2026-10-10T12:00:00.000Z')),
    ];
    expect(proximoTurnoDe(turnos, AHORA)).toBeUndefined();
  });

  test('uno en curso (empezó y todavía no terminó) sigue contando', () => {
    const enCurso = conId('en-curso', turno(PACIENTE, '2026-10-10T14:45:00.000Z'));
    const despues = conId('despues', turno(PACIENTE, '2026-10-12T13:00:00.000Z'));
    expect(proximoTurnoDe([despues, enCurso], AHORA)?.id).toBe('en-curso');
  });

  test('sin hora de fin, cuenta su inicio', () => {
    const sinFin = (id: string, start: string): Appointment => ({
      ...conId(id, turno(PACIENTE, start)),
      end: undefined,
    });
    expect(proximoTurnoDe([sinFin('antes', '2026-10-10T14:45:00.000Z')], AHORA)).toBeUndefined();
    expect(proximoTurnoDe([sinFin('despues', '2026-10-10T15:30:00.000Z')], AHORA)?.id).toBe('despues');
  });

  test('ignora los que no tienen id o inicio', () => {
    const sinId = turno(PACIENTE, '2026-10-11T13:00:00.000Z');
    const sinInicio: Appointment = {
      ...conId('sin-inicio', turno(PACIENTE, '2026-10-11T13:00:00.000Z')),
      start: undefined,
    };
    const vigente = conId('vigente', turno(PACIENTE, '2026-10-14T13:00:00.000Z'));
    expect(proximoTurnoDe([sinId, sinInicio, vigente], AHORA)?.id).toBe('vigente');
  });
});

describe('ultimaConsultaDe: la última consulta que ya pasó', () => {
  const AHORA_UC = new Date('2026-10-10T15:00:00.000Z');
  function conIdUc(id: string, a: Appointment): Appointment {
    return { ...a, id };
  }

  test('la más reciente que ya pasó, realizada o confirmada; no las canceladas ni las futuras', () => {
    const turnos = [
      conIdUc('vieja', turno(PACIENTE, '2026-09-01T13:00:00.000Z', { status: 'fulfilled' })),
      conIdUc('reciente', turno(PACIENTE, '2026-10-05T13:00:00.000Z', { status: 'booked' })),
      conIdUc('cancelada', turno(PACIENTE, '2026-10-08T13:00:00.000Z', { status: 'cancelled' })),
      conIdUc('futura', turno(PACIENTE, '2026-10-12T13:00:00.000Z', { status: 'booked' })),
    ];
    expect(ultimaConsultaDe(turnos, AHORA_UC)).toEqual({ inicio: '2026-10-05T13:00:00.000Z' });
    expect(ultimaConsultaDe([], AHORA_UC)).toBeUndefined();
  });
});

describe('proximoTurnoDe: una reserva del portal sin la seña paga, vencida, no es un turno', () => {
  test('la reserva pendiente con la seña vencida no cuenta', () => {
    const ahora = new Date('2026-10-10T15:00:00.000Z');
    const vencida: Appointment = {
      ...turno(PACIENTE, '2026-10-12T13:00:00.000Z', { status: 'pending' }),
      id: 'vencida',
      extension: [{ url: EXT_AGENDA.reservaExpira, valueDateTime: '2026-10-10T14:00:00.000Z' }],
    };
    expect(proximoTurnoDe([vencida], ahora)).toBeUndefined();
  });
});
