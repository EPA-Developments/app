// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import type {
  DiagnosticReport,
  DocumentReference,
  Patient,
  QuestionnaireResponse,
  ServiceRequest,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { indexarDefinicionesFhir } from '../../fhir/__fixtures__/glp1';
import type { PlanBienestar } from '../../fhir/bienestar';
import { CONSENT_TYPE_CODE, CONSENT_TYPE_SYSTEM, CONSENT_VERSION_SYSTEM } from '../../fhir/consentimiento';
import { SOM_SERVICE_CODE, SOM_SERVICE_SYSTEM } from '../../fhir/som';
import { VERSION_CONSENTIMIENTO } from '../health-record/InformedConsent.data';
import { INTAKE_QUESTIONNAIRE_URL } from '../intake.questionnaire';
import type { DatosHomeE } from './tipos';
import type { CargasHomeE, EntradaHomeE, ResultadosHomeE } from './useDatosHomeE';
import {
  armarDatosHomeE,
  cargasHomeE,
  estadioCkmHome,
  estadoConsentimiento,
  laboratorioHome,
  preventFirmado,
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

  test('con el consentimiento de una versión anterior: desactualizado', async () => {
    const medplum = new MockClient();
    const patient = await paciente(medplum);
    await medplum.createResource(consentimiento(patient, '2020-01'));
    expect((await datosDe(medplum)).consentimiento).toBe('desactualizado');
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
    ckm: { cargando: false },
    cargas: CARGAS,
    ...cambios,
  };
}

describe('armarDatosHomeE', () => {
  test('cargando hasta que terminan el efecto y los dos hooks del vendor', () => {
    expect(armarDatosHomeE(entrada()).cargando).toBe(false);
    expect(armarDatosHomeE(entrada({ cargas: undefined })).cargando).toBe(true);
    expect(armarDatosHomeE(entrada({ tablero: { cargando: true } })).cargando).toBe(true);
    expect(armarDatosHomeE(entrada({ ckm: { cargando: true } })).cargando).toBe(true);
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

  test('el estadio CKM del plan gana sobre el estimado', () => {
    const resultado = { stage: 1 as const, criterios: [], faltantes: [], datosSuficientes: true };
    const ckm = { cargando: false, resultado };
    const conPlan = entrada({ tablero: { cargando: false, estadio: '3' }, ckm });
    expect(armarDatosHomeE(conPlan).ckm).toEqual({ estadio: 3, origen: 'plan' });
    expect(armarDatosHomeE(entrada({ ckm })).ckm).toEqual({ estadio: 1, origen: 'estimado' });
    // Mientras el tablero no dijo si el plan trae estadio, no se adelanta el estimado.
    expect(armarDatosHomeE(entrada({ tablero: { cargando: true }, ckm })).ckm).toBeUndefined();
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
    });
    expect(segundaOpinionHome({ ...sr, status: 'active' })?.estado).toBe('en-analisis');
    expect(segundaOpinionHome({ ...sr, status: 'on-hold' })).toMatchObject({ estado: 'otro', etiqueta: 'En pausa' });
    expect(segundaOpinionHome(undefined)).toBeUndefined();
  });

  test('preventFirmado: solo si trae al menos un valor', () => {
    expect(preventFirmado({})).toBeUndefined();
    expect(preventFirmado({ ascvd10: Number.NaN })).toBeUndefined();
    expect(preventFirmado({ hf10: 0.031 })).toEqual({ ascvd10: undefined, hf10: 0.031, total30: undefined });
  });

  test('estadioCkmHome: el del plan o el estimado', () => {
    expect(estadioCkmHome('0', 2)).toEqual({ estadio: 0, origen: 'plan' });
    expect(estadioCkmHome(undefined, 4)).toEqual({ estadio: 4, origen: 'estimado' });
    expect(estadioCkmHome(undefined, undefined)).toBeUndefined();
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
      expect(laboratorioHome(pdf)).toEqual({
        estado: 'en-proceso',
        fecha: '2026-10-03T12:00:00.000Z',
        revisionMedica: false,
      });
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
