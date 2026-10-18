// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// SOM (Segunda Opinión) — capa FHIR del portal del paciente.
//
// Mismo modelo de "solicitud" que los turnos (`src/fhir/solicitudes.ts`): el paciente
// escribe SOLO lo que su AccessPolicy le permite (QuestionnaireResponse con sus
// respuestas y DocumentReference con sus estudios, ambos en su compartimento) y luego
// EJECUTA el bot `som-solicitar`, que es quien crea la orden clínica `ServiceRequest`
// (status `active`). Esa orden dispara el bot `bot-som-report`, que redacta el informe
// (`DiagnosticReport` `preliminary`, un borrador de la IA) y el score (`RiskAssessment`), y
// deja una `Task` de firma para el equipo. Recién cuando un cardiólogo lo firma (R-24 de
// Recepción) el informe pasa a `final`, nace el PDF y la orden pasa a `completed`. Mientras
// tanto la paciente ve «En revisión por el cardiólogo» (`estadoSolicitudSOM`). El portal
// nunca escribe la orden, la tarea ni el informe: solo los lee.
//
// Si el bot todavía no está desplegado en el server, `crearSolicitudSOM` no escribe
// nada y devuelve un mensaje amable (igual que `crearSolicitud`).
import type { MedplumClient } from '@medplum/core';
import { createReference, getReferenceString } from '@medplum/core';
import type {
  DiagnosticReport,
  DocumentReference,
  Patient,
  Practitioner,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  Reference,
  RiskAssessment,
  ServiceRequest,
  Task,
} from '@medplum/fhirtypes';
import { MARCA } from '../marca';
import { buscarBotSOM } from './bots';
import { buscarConsentimiento } from './consentimiento';

export const MENSAJE_SIN_CONSENTIMIENTO =
  `Antes de pedir tu ${MARCA.producto} necesitamos que firmes el consentimiento informado.`;

/** Sistemas de códigos propios de SOM (deben coincidir con el modelo FHIR en Medplum). */
export const SOM_SYSTEM = 'https://segundaopinionmedica.org/fhir/CodeSystem';
export const SOM_SERVICE_SYSTEM = `${SOM_SYSTEM}/som-services`;
export const SOM_SERVICE_CODE = 'som-cardiology';
export const SOM_CATEGORY_SYSTEM = `${SOM_SYSTEM}/som-categories`;
/** URL canónica del cuestionario de ingreso SOM (compartida con la app clínica / el bot). */
export const SOM_INTAKE_URL = 'https://segundaopinionmedica.org/Questionnaire/som-intake';
/** Único bot que el paciente ejecuta para pedir una segunda opinión (whitelisteado en la AccessPolicy). */
export const BOT_SOM_SOLICITAR = 'som-solicitar';

/** Extensiones canónicas SOM (deben coincidir con lo que escribe el bot). */
export const SOM_ORIGIN_EXT = 'https://segundaopinionmedica.org/fhir/StructureDefinition/som-origin';
export const SOM_SECTIONS_EXT = 'https://segundaopinionmedica.org/fhir/StructureDefinition/som-sections';

/** Origen de la solicitud: el propio paciente o derivada por un colega. */
export type OrigenSOM = 'self' | 'referral';

/** Un estudio adjunto, ya codificado en base64 para inlinear en el DocumentReference. */
export interface ArchivoSOM {
  nombre: string;
  contentType: string;
  /** Contenido en base64 (sin el prefijo `data:`). */
  data: string;
}

/** Datos del formulario de solicitud. */
export interface NuevaSolicitudSOM {
  motivo: string;
  /** Antecedentes cardiovasculares marcados (etiquetas legibles). */
  antecedentes?: string[];
  /** Antecedentes en texto libre. */
  antecedentesTexto?: string;
  /** Medicación actual en texto libre. */
  medicacion?: string;
  /** Descripción de estudios/laboratorio en texto libre. */
  estudiosTexto?: string;
  origin: OrigenSOM;
}

export interface ResultadoSOM {
  ok: boolean;
  mensaje?: string;
  serviceRequestId?: string;
}

/** Informe completo asociado a una orden SOM (lo que el paciente lee del resultado). */
export interface InformeSOM {
  report?: DiagnosticReport;
  /** DocumentReference con el PDF del informe. */
  pdf?: DocumentReference;
  /** Score PREVENT calculado por el bot. */
  risk?: RiskAssessment;
}

/** Lee un File del navegador y lo codifica a base64 (para inlinearlo en el adjunto). */
export async function fileToArchivoSOM(file: File): Promise<ArchivoSOM> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Codificación por chunks para no desbordar el stack con archivos grandes.
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return {
    nombre: file.name,
    contentType: file.type || 'application/octet-stream',
    data: btoa(binary),
  };
}

function buildQuestionnaireResponse(patient: Patient, datos: NuevaSolicitudSOM): QuestionnaireResponse {
  const item: QuestionnaireResponseItem[] = [
    { linkId: 'motivo', text: 'Motivo de consulta', answer: [{ valueString: datos.motivo }] },
  ];
  if (datos.antecedentes?.length) {
    item.push({
      linkId: 'antecedentes',
      text: 'Antecedentes cardiovasculares',
      answer: datos.antecedentes.map((a) => ({ valueString: a })),
    });
  }
  if (datos.antecedentesTexto?.trim()) {
    item.push({
      linkId: 'antecedentes-detalle',
      text: 'Detalle de antecedentes',
      answer: [{ valueString: datos.antecedentesTexto.trim() }],
    });
  }
  if (datos.medicacion?.trim()) {
    item.push({
      linkId: 'medicacion',
      text: 'Medicación actual',
      answer: [{ valueString: datos.medicacion.trim() }],
    });
  }
  if (datos.estudiosTexto?.trim()) {
    item.push({
      linkId: 'estudios',
      text: 'Estudios / laboratorio',
      answer: [{ valueString: datos.estudiosTexto.trim() }],
    });
  }
  return {
    resourceType: 'QuestionnaireResponse',
    status: 'completed',
    questionnaire: SOM_INTAKE_URL,
    subject: createReference(patient),
    author: createReference(patient),
    authored: new Date().toISOString(),
    item,
  };
}

function buildStudyDoc(patient: Patient, archivo: ArchivoSOM): DocumentReference {
  const now = new Date().toISOString();
  return {
    resourceType: 'DocumentReference',
    status: 'current',
    type: {
      coding: [{ system: 'http://loinc.org', code: '34117-2', display: 'History and physical note' }],
      text: 'Estudio para Segunda Opinión',
    },
    category: [{ coding: [{ system: SOM_CATEGORY_SYSTEM, code: 'som-study' }], text: 'Estudio SOM' }],
    subject: createReference(patient),
    author: [createReference(patient)],
    date: now,
    description: archivo.nombre,
    content: [
      { attachment: { contentType: archivo.contentType, title: archivo.nombre, data: archivo.data, creation: now } },
    ],
  };
}

/**
 * Crea una solicitud de Segunda Opinión: escribe la QuestionnaireResponse y los
 * DocumentReference de los estudios (compartimento del paciente) y ejecuta el bot
 * `som-solicitar`, que crea la `ServiceRequest`. No escribe nada si el bot no existe.
 */
export async function crearSolicitudSOM(
  medplum: MedplumClient,
  patient: Patient,
  datos: NuevaSolicitudSOM,
  archivos: ArchivoSOM[]
): Promise<ResultadoSOM> {
  // Sin consentimiento firmado no se envía ningún dato clínico (el bot lo re-verifica).
  if (!(await buscarConsentimiento(medplum, patient))) {
    return { ok: false, mensaje: MENSAJE_SIN_CONSENTIMIENTO };
  }

  const bot = await buscarBotSOM(medplum, BOT_SOM_SOLICITAR);
  if (!bot?.id) {
    return {
      ok: false,
      mensaje:
        `La solicitud online de ${MARCA.producto} todavía no está disponible. Escribinos por Mensajes y te ayudamos a iniciarla.`,
    };
  }

  const qr = await medplum.createResource(buildQuestionnaireResponse(patient, datos));
  const docs: DocumentReference[] = [];
  for (const archivo of archivos) {
    docs.push(await medplum.createResource(buildStudyDoc(patient, archivo)));
  }

  return (await medplum.executeBot(bot.id, {
    pacienteRef: getReferenceString(patient),
    questionnaireResponseRef: getReferenceString(qr),
    documentReferences: docs.map((d) => getReferenceString(d)),
    motivo: datos.motivo,
    origin: datos.origin,
  })) as ResultadoSOM;
}

/** Solicitudes SOM del propio paciente (las crea el bot; el paciente solo las lee). */
export async function cargarMisSolicitudesSOM(medplum: MedplumClient, patient: Patient): Promise<ServiceRequest[]> {
  return medplum.searchResources(
    'ServiceRequest',
    `subject=${getReferenceString(patient)}&code=${SOM_SERVICE_SYSTEM}|${SOM_SERVICE_CODE}&_sort=-authored&_count=50`
  );
}

/**
 * Los estados de un informe ya emitido (el borrador `preliminary` no está): los mismos que deja
 * leer la policy de la paciente (`DiagnosticReport?subject=%patient&status=…`).
 */
export const ESTADOS_INFORME_EMITIDO = 'final,amended,corrected,appended';

/** Informe + score + PDF asociados a una orden SOM completada. */
export async function cargarInformeSOM(medplum: MedplumClient, serviceRequest: ServiceRequest): Promise<InformeSOM> {
  const srRef = getReferenceString(serviceRequest);
  const subjectRef = serviceRequest.subject?.reference;

  const [reports, docs, risks] = await Promise.all([
    // Sólo los emitidos: el borrador `preliminary` de la IA no se le muestra a la paciente (la
    // policy tampoco se lo devuelve; el filtro va igual por si la policy vieja sigue puesta).
    medplum.searchResources(
      'DiagnosticReport',
      `based-on=${srRef}&status=${ESTADOS_INFORME_EMITIDO}&_sort=-issued&_count=1`
    ),
    medplum.searchResources('DocumentReference', `related=${srRef}&_count=20`),
    // RiskAssessment no tiene search param `based-on` en R4: filtramos por basedOn del lado del cliente.
    subjectRef
      ? medplum.searchResources('RiskAssessment', `subject=${subjectRef}&_sort=-_lastUpdated&_count=50`)
      : Promise.resolve([] as RiskAssessment[]),
  ]);

  const pdf = docs.find((d) => d.content?.some((c) => c.attachment?.contentType === 'application/pdf')) ?? docs[0];
  const risk = risks.find((r) => r.basedOn?.reference === srRef);

  return { report: reports[0], pdf, risk };
}

/** Valores del score PREVENT (probabilidades 0–1) que muestra el dashboard. */
export interface PreventValores {
  /** ASCVD a 10 años. */
  ascvd10?: number;
  /** Insuficiencia cardíaca a 10 años. */
  hf10?: number;
  /** ECV total a 30 años. */
  total30?: number;
}

/** Extrae las 3 probabilidades PREVENT de un RiskAssessment (por texto del outcome, con fallback por orden). */
export function extractPrevent(risk?: RiskAssessment): PreventValores {
  const preds = risk?.prediction ?? [];
  const byText = (re: RegExp): number | undefined =>
    preds.find((p) => re.test(p.outcome?.text ?? ''))?.probabilityDecimal;
  return {
    ascvd10: byText(/ascvd/i) ?? preds[0]?.probabilityDecimal,
    hf10: byText(/\b(ic|hf|insuf)/i) ?? preds[1]?.probabilityDecimal,
    total30: byText(/(30|total)/i) ?? preds[2]?.probabilityDecimal,
  };
}

/** Estado de la orden (ServiceRequest.status) → etiqueta y color para el paciente. */
export const ESTADO_SOM: Record<string, { label: string; color: string }> = {
  draft: { label: 'Borrador', color: 'gray' },
  active: { label: 'En análisis', color: 'segundaOpinion' },
  'on-hold': { label: 'En pausa', color: 'yellow' },
  completed: { label: 'Completada', color: 'green' },
  revoked: { label: 'Cancelada', color: 'red' },
  'entered-in-error': { label: 'Error', color: 'red' },
  unknown: { label: 'Pendiente', color: 'yellow' },
};

// ─── Firma del informe por el cardiólogo (R-24) ──────────────────────────────────────

/** Tipo de tarea (`Task.code`): el mismo CodeSystem que usan agenda.ts y glp1.ts. */
const TASK_TIPO_SYSTEM = `${SOM_SYSTEM}/task-tipo`;
/** La tarea del equipo para firmar el informe de una solicitud (la crea `bot-som-report`). */
export const TAREA_FIRMA_INFORME = 'firma-informe-som';

/** Lo que ve la paciente mientras el cardiólogo revisa el informe. */
export const ESTADO_EN_REVISION = { label: 'En revisión por el cardiólogo', color: 'segundaOpinion' } as const;

/**
 * ¿Es la tarea de firma del informe? Su código Y `intent=order`: la paciente da de alta `Task`
 * `intent=plan` con cualquier código (los pasos de su plan), y una suya con el mismo código no
 * puede cambiar el estado que ve.
 */
export function esTareaFirma(t: Task | undefined): boolean {
  return (
    t?.resourceType === 'Task' &&
    t.intent === 'order' &&
    (t.code?.coding ?? []).some((c) => c.system === TASK_TIPO_SYSTEM && c.code === TAREA_FIRMA_INFORME)
  );
}

/**
 * Las tareas de firma de la paciente, en UNA búsqueda para todas sus solicitudes (cada una se
 * cruza con la suya por `basedOn`, en `estadoSolicitudSOM`). Son del equipo: sólo se leen.
 */
export async function cargarTareasFirma(medplum: MedplumClient, patient: Patient): Promise<Task[]> {
  const tareas = await medplum.searchResources(
    'Task',
    `patient=${getReferenceString(patient)}&code=${TASK_TIPO_SYSTEM}|${TAREA_FIRMA_INFORME}&intent=order&_count=50`
  );
  return tareas.filter(esTareaFirma);
}

/** En qué está una solicitud, para la paciente. */
export type EstadoSolicitudSOM = 'en-analisis' | 'en-revision' | 'completada' | 'cancelada' | 'otro';

/**
 * El estado de una solicitud con su tarea de firma (entre `tareas`, las de la paciente):
 * - `active` sin tarea de firma: la IA está preparando el informe («En análisis»);
 * - `active` con su tarea de firma: el borrador espera al cardiólogo («En revisión por el
 *   cardiólogo»). También con la tarea ya `completed`: una firma que se cortó antes de completar
 *   la orden todavía no le entregó el informe (volver a firmar completa lo que falta);
 * - `completed`: el informe está para ver (firmado, o de antes de la firma: R-24 no los toca);
 * - `revoked` o `entered-in-error`: cancelada; el resto (en pausa, borrador…), otro.
 */
export function estadoSolicitudSOM(sr: ServiceRequest, tareas: readonly Task[]): EstadoSolicitudSOM {
  switch (sr.status) {
    case 'active':
      return tareaFirmaDe(sr, tareas) ? 'en-revision' : 'en-analisis';
    case 'completed':
      return 'completada';
    case 'revoked':
    case 'entered-in-error':
      return 'cancelada';
    default:
      return 'otro';
  }
}

/** La tarea de firma de una solicitud (por `basedOn`); una cargada por error no cuenta. */
function tareaFirmaDe(sr: ServiceRequest, tareas: readonly Task[]): Task | undefined {
  const ref = `ServiceRequest/${sr.id}`;
  return tareas.find(
    (t) => esTareaFirma(t) && t.status !== 'entered-in-error' && (t.basedOn ?? []).some((b) => b.reference === ref)
  );
}

/** Etiqueta y color de una solicitud: «En revisión por el cardiólogo» o los de su status (ESTADO_SOM). */
export function etiquetaSolicitudSOM(sr: ServiceRequest, tareas: readonly Task[]): { label: string; color: string } {
  if (estadoSolicitudSOM(sr, tareas) === 'en-revision') {
    return ESTADO_EN_REVISION;
  }
  return ESTADO_SOM[sr.status] ?? ESTADO_SOM.unknown;
}

/**
 * Quién firmó el informe: el `Practitioner` de `resultsInterpreter` de un informe `final`. Los
 * emitidos antes de la firma (R-24) no lo tienen, y se siguen mostrando igual.
 */
export function firmanteDelInforme(report: DiagnosticReport | undefined): Reference<Practitioner> | undefined {
  if (report?.status !== 'final') {
    return undefined;
  }
  // Se busca justo un Practitioner/: la referencia es de ese tipo.
  return report.resultsInterpreter?.find((r) => r.reference?.startsWith('Practitioner/') ?? false) as
    | Reference<Practitioner>
    | undefined;
}
