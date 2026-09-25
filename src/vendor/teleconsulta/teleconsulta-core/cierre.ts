import type {
  Appointment,
  Binary,
  DocumentReference,
  Encounter,
  MedicationRequest,
  Patient,
  Practitioner,
  Reference,
  ServiceRequest,
  Task,
} from '@medplum/fhirtypes';
import { formatearFechaHora } from './formato.js';
import { TC, ZONA_HORARIA_DEFAULT } from './terminologia.js';

interface ContextoClinico {
  paciente: Reference<Patient>;
  profesional: Reference<Practitioner>;
  encounter?: Reference<Encounter>;
  /** ISO dateTime stamped on the resource. */
  fecha?: string;
}

export interface InformeConsultaContext extends ContextoClinico {
  turno: Reference<Appointment>;
  /** The PDF, typically created with `medplum.createPdf()`. */
  binario: Reference<Binary>;
  titulo: string;
}

/** DocumentReference of the consultation report, linked to the appointment. */
export function buildInformeConsulta(ctx: InformeConsultaContext): DocumentReference {
  const doc: DocumentReference = {
    resourceType: 'DocumentReference',
    status: 'current',
    subject: ctx.paciente,
    author: [ctx.profesional],
    category: [
      { coding: [{ system: TC.documento, code: 'informe-consulta', display: 'Informe de consulta' }] },
    ],
    description: ctx.titulo,
    context: { related: [ctx.turno] },
    content: [
      {
        attachment: {
          contentType: 'application/pdf',
          url: ctx.binario.reference,
          title: ctx.titulo,
        },
      },
    ],
  };
  if (ctx.fecha) doc.date = ctx.fecha;
  if (ctx.encounter && doc.context) doc.context.encounter = [ctx.encounter];
  return doc;
}

export type CategoriaOrden = 'laboratorio' | 'imagenes' | 'otro';

export interface OrdenEstudioContext extends ContextoClinico {
  /** Patient-readable description, e.g. "Perfil lipídico completo". */
  descripcion: string;
  categoria?: CategoriaOrden;
}

const SNOMED_CATEGORIA: Record<Exclude<CategoriaOrden, 'otro'>, { code: string; display: string }> = {
  laboratorio: { code: '108252007', display: 'Laboratory procedure' },
  imagenes: { code: '363679005', display: 'Imaging' },
};

/** ServiceRequest (order) for a lab or imaging study. */
export function buildOrdenEstudio(ctx: OrdenEstudioContext): ServiceRequest {
  const orden: ServiceRequest = {
    resourceType: 'ServiceRequest',
    status: 'active',
    intent: 'order',
    subject: ctx.paciente,
    requester: ctx.profesional,
    code: { text: ctx.descripcion },
  };
  const cat = ctx.categoria && ctx.categoria !== 'otro' ? SNOMED_CATEGORIA[ctx.categoria] : undefined;
  if (cat) orden.category = [{ coding: [{ system: 'http://snomed.info/sct', ...cat }], text: cat.display }];
  if (ctx.encounter) orden.encounter = ctx.encounter;
  if (ctx.fecha) orden.authoredOn = ctx.fecha;
  return orden;
}

export interface RecetaContext extends ContextoClinico {
  /** Medication as written by the professional, e.g. "Enalapril 10 mg". */
  medicamento: string;
  /** Free-text instructions, e.g. "1 comprimido cada 12 horas". */
  indicacion: string;
}

/** MedicationRequest (prescription) the patient portal already lists. */
export function buildReceta(ctx: RecetaContext): MedicationRequest {
  const receta: MedicationRequest = {
    resourceType: 'MedicationRequest',
    status: 'active',
    intent: 'order',
    subject: ctx.paciente,
    requester: ctx.profesional,
    medicationCodeableConcept: { text: ctx.medicamento },
    dosageInstruction: [{ text: ctx.indicacion }],
  };
  if (ctx.encounter) receta.encounter = ctx.encounter;
  if (ctx.fecha) receta.authoredOn = ctx.fecha;
  return receta;
}

export interface AgendarControlContext {
  paciente: Reference<Patient>;
  turno: Reference<Appointment> & { reference: string };
  /** e.g. "30 días". */
  plazo: string;
  modalidad: 'virtual' | 'presencial';
  /** Title the care team sees. No clinical content. */
  titulo?: string;
  servicioCodigo?: string;
  fecha?: string;
}

/** Idempotency key of the "schedule a follow-up" notice for an appointment. */
export function claveAgendarControl(turnoReference: string): string {
  return `agendar-control-${turnoReference.replace(/^Appointment\//, '')}`;
}

/**
 * Task asking the care team to schedule a follow-up. Carries no clinical
 * content ("control en 30 días", never the diagnosis). Its identifier makes it
 * idempotent: search by it before creating.
 */
export function buildTareaAgendarControl(ctx: AgendarControlContext): Task {
  const tarea: Task = {
    resourceType: 'Task',
    status: 'requested',
    intent: 'order',
    priority: 'routine',
    code: {
      coding: [{ system: TC.taskTipo, code: 'agendar-control', display: 'Agendar control' }],
      text: ctx.titulo ?? 'Agendar control',
    },
    description: `Control en ${ctx.plazo}, ${ctx.modalidad === 'virtual' ? 'por videollamada' : 'presencial'}.`,
    identifier: [{ system: TC.identificadorTask, value: claveAgendarControl(ctx.turno.reference) }],
    for: ctx.paciente,
    focus: ctx.turno,
    input: [
      { type: { text: 'plazo' }, valueString: ctx.plazo },
      { type: { text: 'modalidad' }, valueString: ctx.modalidad },
    ],
  };
  if (ctx.servicioCodigo) {
    tarea.input?.push({ type: { text: 'servicioCodigo' }, valueString: ctx.servicioCodigo });
  }
  if (ctx.fecha) tarea.authoredOn = ctx.fecha;
  return tarea;
}

export interface DatosInforme {
  institucion: string;
  profesional: string;
  matricula?: string;
  paciente: string;
  documentoPaciente?: string;
  fecha: Date;
  motivo?: string;
  evolucion: string;
  indicaciones?: string;
  ordenes?: string[];
  recetas?: { medicamento: string; indicacion: string }[];
  zona?: string;
}

/**
 * pdfmake document definition of the consultation report, ready for
 * `medplum.createPdf({ docDefinition })`. Plain data: no pdfmake dependency.
 */
export function docDefinitionInforme(d: DatosInforme): Record<string, unknown> {
  const zona = d.zona ?? ZONA_HORARIA_DEFAULT;
  const content: unknown[] = [
    { text: d.institucion, style: 'institucion' },
    { text: 'Informe de teleconsulta', style: 'titulo' },
    {
      columns: [
        { text: [{ text: 'Paciente: ', bold: true }, d.paciente, d.documentoPaciente ? ` · DNI ${d.documentoPaciente}` : ''] },
        { text: [{ text: 'Fecha: ', bold: true }, formatearFechaHora(d.fecha, zona)], alignment: 'right' },
      ],
      margin: [0, 0, 0, 12],
    },
  ];
  if (d.motivo) content.push({ text: 'Motivo de consulta', style: 'seccion' }, { text: d.motivo });
  content.push({ text: 'Evolución', style: 'seccion' }, { text: d.evolucion });
  if (d.indicaciones) content.push({ text: 'Indicaciones', style: 'seccion' }, { text: d.indicaciones });
  if (d.ordenes?.length) content.push({ text: 'Estudios solicitados', style: 'seccion' }, { ul: d.ordenes });
  if (d.recetas?.length) {
    content.push(
      { text: 'Medicación indicada', style: 'seccion' },
      { ul: d.recetas.map((r) => `${r.medicamento} — ${r.indicacion}`) },
    );
  }
  content.push({
    text: [d.profesional, d.matricula ? ` · Matrícula ${d.matricula}` : ''].join(''),
    margin: [0, 32, 0, 0],
    alignment: 'right',
    italics: true,
  });
  return {
    info: { title: `Informe de teleconsulta ${formatearFechaHora(d.fecha, zona)}` },
    content,
    styles: {
      institucion: { fontSize: 10, color: '#666666', margin: [0, 0, 0, 4] },
      titulo: { fontSize: 18, bold: true, margin: [0, 0, 0, 12] },
      seccion: { fontSize: 12, bold: true, margin: [0, 12, 0, 4] },
    },
    defaultStyle: { fontSize: 11 },
  };
}
