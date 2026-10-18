// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import type { DiagnosticReport, Patient, ServiceRequest, Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { indexarDefinicionesFhir } from './__fixtures__/glp1';
import { cargarConsultasPlan } from './agenda';
import {
  ESTADO_SOM,
  MENSAJE_SIN_CONSENTIMIENTO,
  TAREA_FIRMA_INFORME,
  cargarInformeSOM,
  cargarTareasFirma,
  crearSolicitudSOM,
  esTareaFirma,
  estadoSolicitudSOM,
  etiquetaSolicitudSOM,
  firmanteDelInforme,
} from './som';
import { cargarMisSolicitudes } from './solicitudes';

test('crearSolicitudSOM no envía nada si el paciente no firmó el consentimiento', async () => {
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({ resourceType: 'Patient', name: [{ family: 'Test' }] });
  const createSpy = vi.spyOn(medplum, 'createResource');
  const executeSpy = vi.spyOn(medplum, 'executeBot');

  const r = await crearSolicitudSOM(medplum, patient, { motivo: 'Control', origin: 'self' }, []);

  expect(r).toEqual({ ok: false, mensaje: MENSAJE_SIN_CONSENTIMIENTO });
  expect(createSpy).not.toHaveBeenCalled();
  expect(executeSpy).not.toHaveBeenCalled();
});

// ─── Firma del informe por el cardiólogo (R-24) ──────────────────────────────────────
// Pacientes sintéticas, sin nombre.

const TIPO_TAREA = 'https://segundaopinionmedica.org/fhir/CodeSystem/task-tipo';

function solicitud(id: string, status: ServiceRequest['status']): ServiceRequest {
  return { resourceType: 'ServiceRequest', id, status, intent: 'order', subject: { reference: 'Patient/p1' } };
}

function tareaFirma(srId: string, status: Task['status'], extra: Partial<Task> = {}): Task {
  return {
    resourceType: 'Task',
    id: `firma-${srId}`,
    status,
    intent: 'order',
    code: { coding: [{ system: TIPO_TAREA, code: TAREA_FIRMA_INFORME }] },
    for: { reference: 'Patient/p1' },
    basedOn: [{ reference: `ServiceRequest/${srId}` }],
    focus: { reference: 'DiagnosticReport/borrador' },
    ...extra,
  };
}

describe('estadoSolicitudSOM', () => {
  test('AC-1: activa con su tarea de firma pedida o tomada, en revisión por el cardiólogo', () => {
    for (const status of ['requested', 'in-progress'] as const) {
      const sr = solicitud('sr1', 'active');
      expect(estadoSolicitudSOM(sr, [tareaFirma('sr1', status)])).toBe('en-revision');
      expect(etiquetaSolicitudSOM(sr, [tareaFirma('sr1', status)]).label).toBe('En revisión por el cardiólogo');
    }
  });

  test('AC-2: activa sin tarea de firma, en análisis como hoy', () => {
    const sr = solicitud('sr1', 'active');
    expect(estadoSolicitudSOM(sr, [])).toBe('en-analisis');
    expect(etiquetaSolicitudSOM(sr, [])).toEqual(ESTADO_SOM.active);
  });

  test('la tarea de firma de otra solicitud no la cambia', () => {
    expect(estadoSolicitudSOM(solicitud('sr1', 'active'), [tareaFirma('sr2', 'requested')])).toBe('en-analisis');
  });

  test('AC-9: una tarea intent=plan de la paciente con el código de la firma no cambia el estado', () => {
    const suya = tareaFirma('sr1', 'requested', { intent: 'plan' });
    expect(estadoSolicitudSOM(solicitud('sr1', 'active'), [suya])).toBe('en-analisis');
    expect(esTareaFirma(suya)).toBe(false);
  });

  test('una tarea con otro código o cargada por error no cuenta', () => {
    const otroCodigo = tareaFirma('sr1', 'requested', { code: { coding: [{ system: TIPO_TAREA, code: 'otra' }] } });
    const conError = tareaFirma('sr1', 'entered-in-error');
    expect(estadoSolicitudSOM(solicitud('sr1', 'active'), [otroCodigo, conError])).toBe('en-analisis');
  });

  test('una firma cortada antes de completar la orden sigue en revisión', () => {
    expect(estadoSolicitudSOM(solicitud('sr1', 'active'), [tareaFirma('sr1', 'completed')])).toBe('en-revision');
  });

  test('AC-3: completada, con o sin tarea de firma', () => {
    expect(estadoSolicitudSOM(solicitud('sr1', 'completed'), [tareaFirma('sr1', 'completed')])).toBe('completada');
    expect(estadoSolicitudSOM(solicitud('sr1', 'completed'), [])).toBe('completada');
    expect(etiquetaSolicitudSOM(solicitud('sr1', 'completed'), [])).toEqual(ESTADO_SOM.completed);
  });

  test('cancelada y otros estados', () => {
    expect(estadoSolicitudSOM(solicitud('sr1', 'revoked'), [])).toBe('cancelada');
    expect(estadoSolicitudSOM(solicitud('sr1', 'entered-in-error'), [])).toBe('cancelada');
    expect(estadoSolicitudSOM(solicitud('sr1', 'on-hold'), [tareaFirma('sr1', 'requested')])).toBe('otro');
  });
});

describe('cargarTareasFirma', () => {
  test('una sola búsqueda, por código e intent=order, y descarta lo que no es la firma', async () => {
    const medplum = new MockClient();
    const suya = tareaFirma('sr1', 'requested', { id: 'suya', intent: 'plan' });
    const spy = vi.spyOn(medplum, 'searchResources').mockResolvedValue([tareaFirma('sr1', 'requested'), suya] as never);

    const tareas = await cargarTareasFirma(medplum, { resourceType: 'Patient', id: 'p1' });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      'Task',
      `patient=Patient/p1&code=${TIPO_TAREA}|firma-informe-som&intent=order&_count=50`
    );
    expect(tareas.map((t) => t.id)).toEqual(['firma-sr1']);
  });
});

describe('firmanteDelInforme', () => {
  const informe: DiagnosticReport = {
    resourceType: 'DiagnosticReport',
    status: 'final',
    code: { text: 'Informe' },
    resultsInterpreter: [{ reference: 'Practitioner/cardio' }],
  };

  test('un informe final con un Practitioner en resultsInterpreter está firmado', () => {
    expect(firmanteDelInforme(informe)).toEqual({ reference: 'Practitioner/cardio' });
  });

  test('AC-4: un informe viejo (final sin resultsInterpreter) no tiene firmante', () => {
    expect(firmanteDelInforme({ ...informe, resultsInterpreter: undefined })).toBeUndefined();
  });

  test('un borrador no está firmado aunque traiga resultsInterpreter', () => {
    expect(firmanteDelInforme({ ...informe, status: 'preliminary' })).toBeUndefined();
  });
});

test('cargarInformeSOM sólo pide los informes emitidos (nunca el borrador)', async () => {
  const medplum = new MockClient();
  const spy = vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as never);

  await cargarInformeSOM(medplum, solicitud('sr1', 'completed'));

  expect(spy).toHaveBeenCalledWith(
    'DiagnosticReport',
    'based-on=ServiceRequest/sr1&status=final,amended,corrected,appended&_sort=-issued&_count=1'
  );
});

test('AC-6: la tarea de firma no aparece en ninguna lista de tareas de la paciente', async () => {
  indexarDefinicionesFhir();
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({ resourceType: 'Patient' });
  const paraElla = { for: { reference: `Patient/${patient.id}` } };
  await medplum.createResource<Task>({ ...tareaFirma('sr1', 'requested'), id: undefined, ...paraElla });
  const pedidoDeTurno = await medplum.createResource<Task>({
    resourceType: 'Task',
    status: 'requested',
    intent: 'order',
    code: { coding: [{ system: TIPO_TAREA, code: 'solicitud-turno' }] },
    ...paraElla,
  });

  // «Solicitudes» (Atención), las consultas del plan y la búsqueda de la firma.
  expect((await cargarMisSolicitudes(medplum, patient)).map((t) => t.id)).toEqual([pedidoDeTurno.id]);
  expect(await cargarConsultasPlan(medplum, patient)).toEqual([]);
  expect(await cargarTareasFirma(medplum, patient)).toHaveLength(1);
});
