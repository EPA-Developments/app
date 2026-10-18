// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Mi Segunda Opinión con la firma del informe por el cardiólogo (R-24): en revisión no se ve
// nada del informe, firmado dice quién lo firmó y los informes viejos se ven como siempre.
// Pacientes sintéticas, sin nombre; el servidor está simulado por tipo de recurso.
import { MantineProvider } from '@mantine/core';
import type {
  DiagnosticReport,
  DocumentReference,
  Practitioner,
  Resource,
  RiskAssessment,
  ServiceRequest,
  Task,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { SOM_SECTIONS_EXT, TAREA_FIRMA_INFORME } from '../fhir/som';
import { MiSegundaOpinion, TEXTO_EN_REVISION } from './MiSegundaOpinion';

const TIPO_TAREA = 'https://segundaopinionmedica.org/fhir/CodeSystem/task-tipo';

function solicitud(id: string, status: ServiceRequest['status']): ServiceRequest {
  return {
    resourceType: 'ServiceRequest',
    id,
    status,
    intent: 'order',
    subject: { reference: 'Patient/p1' },
    authoredOn: '2026-10-10T13:00:00Z',
    reasonCode: [{ text: `Motivo ${id}` }],
  };
}

function tareaFirma(srId: string, status: Task['status'], intent: Task['intent'] = 'order'): Task {
  return {
    resourceType: 'Task',
    id: `firma-${srId}-${intent}`,
    status,
    intent,
    code: { coding: [{ system: TIPO_TAREA, code: TAREA_FIRMA_INFORME }] },
    for: { reference: 'Patient/p1' },
    basedOn: [{ reference: `ServiceRequest/${srId}` }],
  };
}

function informe(srId: string, firmado: boolean): DiagnosticReport {
  return {
    resourceType: 'DiagnosticReport',
    id: `informe-${srId}`,
    status: 'final',
    code: { coding: [{ system: 'http://loinc.org', code: '11488-4' }] },
    basedOn: [{ reference: `ServiceRequest/${srId}` }],
    ...(firmado ? { resultsInterpreter: [{ reference: 'Practitioner/cardio' }] } : {}),
    extension: [
      { url: SOM_SECTIONS_EXT, extension: [{ url: 'executive-summary', valueString: 'Resumen de prueba.' }] },
    ],
  };
}

const PDF: DocumentReference = {
  resourceType: 'DocumentReference',
  id: 'pdf',
  status: 'current',
  content: [{ attachment: { contentType: 'application/pdf', url: 'https://example.org/informe.pdf' } }],
};

const RIESGO: RiskAssessment = {
  resourceType: 'RiskAssessment',
  id: 'riesgo',
  status: 'preliminary',
  subject: { reference: 'Patient/p1' },
  basedOn: { reference: 'ServiceRequest/sr1' },
  prediction: [{ outcome: { text: 'ASCVD 10 años' }, probabilityDecimal: 0.05 }],
};

const CARDIOLOGA: Practitioner = {
  resourceType: 'Practitioner',
  id: 'cardio',
  name: [{ prefix: ['Dra.'], given: ['Cardióloga'], family: 'De Prueba' }],
};

interface Servidor {
  readonly solicitudes: ServiceRequest[];
  readonly tareas?: Task[] | 'falla';
  readonly informes?: DiagnosticReport[];
  readonly practitioner?: Practitioner;
}

function simular(servidor: Servidor): { medplum: MockClient; buscados: string[] } {
  const medplum = new MockClient();
  const buscados: string[] = [];
  const porTipo: Record<string, () => Resource[]> = {
    ServiceRequest: () => servidor.solicitudes,
    Task: () => {
      if (servidor.tareas === 'falla') {
        throw new Error('Sin permiso');
      }
      return servidor.tareas ?? [];
    },
    DiagnosticReport: () => servidor.informes ?? [],
    DocumentReference: () => [PDF],
    RiskAssessment: () => [RIESGO],
  };
  vi.spyOn(medplum, 'searchResources').mockImplementation((async (tipo: string) => {
    buscados.push(tipo);
    return porTipo[tipo]?.() ?? [];
  }) as never);
  vi.spyOn(medplum, 'readReference').mockImplementation((async () => {
    if (!servidor.practitioner) {
      throw new Error('No encontrado');
    }
    return servidor.practitioner;
  }) as never);
  return { medplum, buscados };
}

function renderizar(medplum: MockClient, ruta = '/mi-segunda-opinion'): void {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <MiSegundaOpinion />
        </MantineProvider>
      </MedplumProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

test('AC-1: activa con la tarea de firma pendiente, en revisión y sin nada del informe', async () => {
  const { medplum, buscados } = simular({
    solicitudes: [solicitud('sr1', 'active')],
    tareas: [tareaFirma('sr1', 'in-progress')],
  });
  renderizar(medplum, '/mi-segunda-opinion?solicitud=sr1');

  expect(await screen.findByText('En revisión por el cardiólogo')).toBeInTheDocument();
  expect(screen.getByText(TEXTO_EN_REVISION)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Ver informe' })).not.toBeInTheDocument();
  expect(screen.queryByText('Score PREVENT (AHA 2023)')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Descargar PDF' })).not.toBeInTheDocument();
  // Ni se busca: el informe, el PDF y el PREVENT de una solicitud activa no se leen.
  expect(buscados).not.toContain('DiagnosticReport');
  expect(buscados).not.toContain('RiskAssessment');
  expect(buscados.filter((t) => t === 'Task')).toHaveLength(1);
});

test('AC-2: activa sin tarea de firma, «En análisis» como hoy', async () => {
  const { medplum } = simular({ solicitudes: [solicitud('sr1', 'active')], tareas: [] });
  renderizar(medplum);

  expect(await screen.findByText('En análisis')).toBeInTheDocument();
  expect(screen.queryByText(TEXTO_EN_REVISION)).not.toBeInTheDocument();
});

test('AC-9: una tarea intent=plan de la paciente con el código de la firma no la pasa a revisión', async () => {
  const { medplum } = simular({
    solicitudes: [solicitud('sr1', 'active')],
    tareas: [tareaFirma('sr1', 'requested', 'plan')],
  });
  renderizar(medplum);

  expect(await screen.findByText('En análisis')).toBeInTheDocument();
  expect(screen.queryByText('En revisión por el cardiólogo')).not.toBeInTheDocument();
});

test('si las tareas de firma no se pueden leer, la lista se ve igual («En análisis»)', async () => {
  const { medplum } = simular({ solicitudes: [solicitud('sr1', 'active')], tareas: 'falla' });
  renderizar(medplum);

  expect(await screen.findByText('En análisis')).toBeInTheDocument();
});

test('AC-3: completada, el informe con PREVENT, PDF y «Firmado por …»', async () => {
  const { medplum } = simular({
    solicitudes: [solicitud('sr1', 'completed')],
    tareas: [tareaFirma('sr1', 'completed')],
    informes: [informe('sr1', true)],
    practitioner: CARDIOLOGA,
  });
  renderizar(medplum);

  const tarjeta = (await screen.findByText('Motivo sr1')).closest('div.mantine-Card-root') as HTMLElement;
  expect(within(tarjeta).getByText('Completada')).toBeInTheDocument();
  fireEvent.click(within(tarjeta).getByRole('button', { name: 'Ver informe' }));

  expect(await screen.findByText('Firmado por Dra. Cardióloga De Prueba')).toBeInTheDocument();
  expect(screen.getByText('Resumen de prueba.')).toBeInTheDocument();
  expect(screen.getByText('Score PREVENT (AHA 2023)')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeInTheDocument();
});

test('firmado sin poder leer el nombre: «Firmado por el cardiólogo»', async () => {
  const { medplum } = simular({
    solicitudes: [solicitud('sr1', 'completed')],
    informes: [informe('sr1', true)],
  });
  renderizar(medplum, '/mi-segunda-opinion?solicitud=sr1');

  expect(await screen.findByText('Firmado por el cardiólogo')).toBeInTheDocument();
});

test('AC-4: un informe viejo (final sin resultsInterpreter) se ve como siempre, sin «Firmado por»', async () => {
  const { medplum } = simular({
    solicitudes: [solicitud('sr1', 'completed')],
    informes: [informe('sr1', false)],
  });
  renderizar(medplum, '/mi-segunda-opinion?solicitud=sr1');

  expect(await screen.findByText('Resumen de prueba.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeInTheDocument();
  expect(screen.queryByText(/^Firmado por/)).not.toBeInTheDocument();
});

test('AC-5: ?solicitud=<id> abre el informe de esa solicitud', async () => {
  const { medplum } = simular({
    solicitudes: [solicitud('sr2', 'completed'), solicitud('sr1', 'completed')],
    informes: [informe('sr1', true)],
    practitioner: CARDIOLOGA,
  });
  const buscar = vi.mocked(medplum.searchResources);
  const invalidar = vi.spyOn(medplum, 'invalidateSearches');
  renderizar(medplum, '/mi-segunda-opinion?solicitud=sr1');

  expect(await screen.findByText('Firmado por Dra. Cardióloga De Prueba')).toBeInTheDocument();
  expect(buscar).toHaveBeenCalledWith('DiagnosticReport', expect.stringContaining('based-on=ServiceRequest/sr1&'));
  // Lo que la Home dejó en la caché puede ser de antes de la firma.
  expect(invalidar).toHaveBeenCalledWith('ServiceRequest');
  expect(invalidar).toHaveBeenCalledWith('Task');
});

test('el informe de una solicitud que llega tarde no pisa el de la que se pidió después', async () => {
  const { medplum } = simular({
    solicitudes: [solicitud('sr2', 'completed'), solicitud('sr1', 'completed')],
    practitioner: CARDIOLOGA,
  });
  let soltarSr1: (() => void) | undefined;
  vi.mocked(medplum.searchResources).mockImplementation((async (tipo: string, q: string) => {
    if (tipo === 'ServiceRequest') {
      return [solicitud('sr2', 'completed'), solicitud('sr1', 'completed')];
    }
    if (tipo === 'DiagnosticReport' && q.includes('ServiceRequest/sr1')) {
      await new Promise<void>((soltar) => {
        soltarSr1 = soltar;
      });
      return [{ ...informe('sr1', false), extension: [] }];
    }
    if (tipo === 'DiagnosticReport') {
      return [informe('sr2', true)];
    }
    return [];
  }) as never);
  renderizar(medplum);

  const botones = await screen.findAllByRole('button', { name: 'Ver informe' });
  fireEvent.click(botones[1]); // sr1: queda esperando
  fireEvent.click(botones[0]); // sr2
  expect(await screen.findByText('Resumen de prueba.')).toBeInTheDocument();
  soltarSr1?.();
  await new Promise((r) => setTimeout(r, 0));
  expect(screen.getByText('Resumen de prueba.')).toBeInTheDocument();
  expect(screen.getByText('Firmado por Dra. Cardióloga De Prueba')).toBeInTheDocument();
});
