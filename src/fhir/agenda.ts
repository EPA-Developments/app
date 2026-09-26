// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Agenda por profesional y reserva desde el portal (contrato con `recepcionistas`,
// reglas R-22 y R-23): el catálogo de consultas (ActivityDefinition), los profesionales
// que atienden cada una (PractitionerRole), sus horarios libres (Slot, de 30 min, con la
// modalidad en que se reservan) y la reserva (bot `som-reservar-portal`). El portal NO
// escribe la agenda: lee y ejecuta el bot, que aplica todas las reglas del lado del
// servidor. Todo sale de FHIR: nada de listas de consultas ni profesionales a mano.
import type { MedplumClient } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type {
  ActivityDefinition,
  Appointment,
  Coding,
  Consent,
  Extension,
  Patient,
  PractitionerRole,
  Slot,
  Task,
} from '@medplum/fhirtypes';
import { buscarBotSOM } from './bots';

export const SOM_FHIR = 'https://segundaopinionmedica.org/fhir';
export const SYSTEM_SERVICIO = `${SOM_FHIR}/CodeSystem/servicio`;
export const SYSTEM_GRUPO_ESPECIALIDAD = `${SOM_FHIR}/CodeSystem/grupo-especialidad`;
export const SYSTEM_MEDICO = `${SOM_FHIR}/CodeSystem/medico`;
export const SYSTEM_TASK_TIPO = `${SOM_FHIR}/CodeSystem/task-tipo`;
export const SYSTEM_CONSENTIMIENTO = `${SOM_FHIR}/CodeSystem/consentimiento`;
export const V3_ACT_CODE = 'http://terminology.hl7.org/CodeSystem/v3-ActCode';

export const EXT_AGENDA = {
  precioArs: `${SOM_FHIR}/StructureDefinition/precio-ars`,
  valorReferenciaArs: `${SOM_FHIR}/StructureDefinition/valor-referencia-ars`,
  modalidad: `${SOM_FHIR}/StructureDefinition/modalidad`,
  profesional: `${SOM_FHIR}/StructureDefinition/profesional`,
  teleconsultaUrl: `${SOM_FHIR}/StructureDefinition/teleconsulta-url`,
  reservaExpira: `${SOM_FHIR}/StructureDefinition/reserva-expira`,
  linkPagoSena: `${SOM_FHIR}/StructureDefinition/link-pago-sena`,
  origenReserva: `${SOM_FHIR}/StructureDefinition/origen-reserva`,
} as const;

/** Código de catálogo de la consulta del Plan Bienestar 100 Días® (incluida en el plan). */
export const CODIGO_CONSULTA_PLAN = 'CONSULTA_PB100D';
/** Task.code de las consultas programadas del plan que la paciente tiene por agendar. */
export const TAREA_CONSULTA_PLAN = 'agendar-consulta-pb100d';
/** Consent.policyRule del consentimiento de teleconsulta (uno por paciente). */
export const CONSENTIMIENTO_TELECONSULTA = 'teleconsulta';
const BOT_RESERVAR = 'som-reservar-portal';
/** Hasta cuántos días adelante se muestran horarios (la agenda se publica 45 días). */
export const DIAS_AGENDA = 45;
export const TZ = 'America/Argentina/Buenos_Aires';

export type Modalidad = 'presencial' | 'teleconsulta';
/** Orden de la pantalla: la videollamada primero (es el camino más usado). */
export const MODALIDADES: Modalidad[] = ['teleconsulta', 'presencial'];
export const ETIQUETA_MODALIDAD: Record<Modalidad, string> = {
  teleconsulta: 'Por videollamada',
  presencial: 'En el centro',
};

const CODIGO_MODALIDAD: Record<string, Modalidad> = { AMB: 'presencial', VR: 'teleconsulta' };

function modalidadDeCoding(c: Coding | undefined): Modalidad | undefined {
  return c?.system === V3_ACT_CODE && c.code ? CODIGO_MODALIDAD[c.code] : undefined;
}

/** Modalidades marcadas con la extensión `modalidad` (v3-ActCode `AMB` / `VR`) de un recurso. */
export function modalidadesDe(r: { extension?: Extension[] }): Modalidad[] {
  const out: Modalidad[] = [];
  for (const e of r.extension ?? []) {
    const m = e.url === EXT_AGENDA.modalidad ? modalidadDeCoding(e.valueCoding) : undefined;
    if (m && !out.includes(m)) {
      out.push(m);
    }
  }
  return out;
}

/** ¿La franja admite la modalidad? Una franja sin marca (anterior a la regla) admite las dos. */
export function admiteModalidad(slot: { extension?: Extension[] }, modalidad: Modalidad): boolean {
  const marcadas = modalidadesDe(slot);
  return marcadas.length === 0 || marcadas.includes(modalidad);
}

// ───────────────────────────── catálogo ─────────────────────────────

/** Orden de los grupos de especialidad en la pantalla (contrato con recepcionistas). */
const ORDEN_GRUPOS = [
  'dbt-endocrino',
  'nutricion',
  'cardiologia',
  'cardiologia-especialidad',
  'tisioneumonologia',
  'neurologia',
  'ginecologia',
];

export interface ConsultaCatalogo {
  codigo: string;
  /** Nombre visible ("Consulta de Cardiología"). */
  nombre: string;
  /** Grupo de especialidad (código y nombre); sin grupo = no va en "Consultas por especialidad". */
  grupo?: string;
  grupoNombre?: string;
  /** Precio de lista en ARS (0 si está incluida en el plan). */
  precioARS: number;
  /** Lo que el plan presupuesta por una consulta incluida (informativo). */
  valorReferenciaARS?: number;
  /** Modalidades en que se ofrece. */
  modalidades: Modalidad[];
  /** Consulta del Plan Bienestar (incluida: sin cargo ni seña). */
  incluidaEnPlan: boolean;
}

function decimalDe(r: { extension?: Extension[] }, url: string): number | undefined {
  return r.extension?.find((e) => e.url === url)?.valueDecimal;
}

/** Traduce una ActivityDefinition del catálogo; undefined si no es una consulta de SOM. */
export function parseConsulta(ad: ActivityDefinition): ConsultaCatalogo | undefined {
  const codigo = ad.identifier?.find((i) => i.system === SYSTEM_SERVICIO)?.value;
  if (!codigo) {
    return undefined;
  }
  const topicoGrupo = ad.topic?.find((t) => t.coding?.some((c) => c.system === SYSTEM_GRUPO_ESPECIALIDAD));
  const grupoCoding = topicoGrupo?.coding?.find((c) => c.system === SYSTEM_GRUPO_ESPECIALIDAD);
  const modalidades: Modalidad[] = [];
  let incluidaEnPlan = codigo === CODIGO_CONSULTA_PLAN;
  for (const u of ad.useContext ?? []) {
    if (u.code?.code === 'workflow') {
      for (const c of u.valueCodeableConcept?.coding ?? []) {
        const m = modalidadDeCoding(c);
        if (m && !modalidades.includes(m)) {
          modalidades.push(m);
        }
      }
    } else if (u.code?.code === 'program') {
      incluidaEnPlan = true;
    }
  }
  const valorReferenciaARS = decimalDe(ad, EXT_AGENDA.valorReferenciaArs);
  return {
    codigo,
    nombre: ad.title ?? ad.name ?? codigo,
    ...(grupoCoding?.code ? { grupo: grupoCoding.code, grupoNombre: grupoCoding.display ?? topicoGrupo?.text ?? grupoCoding.code } : {}),
    precioARS: decimalDe(ad, EXT_AGENDA.precioArs) ?? 0,
    ...(valorReferenciaARS !== undefined ? { valorReferenciaARS } : {}),
    modalidades,
    incluidaEnPlan,
  };
}

/** "Consulta de Cardiología" → "Teleconsulta de Cardiología" cuando es por videollamada. */
export function nombreSegunModalidad(nombre: string, modalidad: Modalidad): string {
  return modalidad === 'teleconsulta' ? nombre.replace(/^Consulta\b/, 'Teleconsulta') : nombre;
}

/** Las consultas del catálogo (activas), en el orden de los grupos. */
export async function cargarCatalogo(medplum: MedplumClient): Promise<ConsultaCatalogo[]> {
  const defs = await medplum.searchResources('ActivityDefinition', 'status=active&_count=100');
  const consultas = defs.map(parseConsulta).filter((c): c is ConsultaCatalogo => c !== undefined);
  const orden = (c: ConsultaCatalogo): number => {
    const i = c.grupo ? ORDEN_GRUPOS.indexOf(c.grupo) : -1;
    return i === -1 ? ORDEN_GRUPOS.length : i;
  };
  return consultas.sort((a, b) => orden(a) - orden(b) || a.nombre.localeCompare(b.nombre, 'es'));
}

/** Consultas por especialidad de una modalidad, agrupadas en el orden de la pantalla. */
export function agruparPorEspecialidad(
  catalogo: ConsultaCatalogo[],
  modalidad: Modalidad
): Array<{ grupo: string; nombre: string; consultas: ConsultaCatalogo[] }> {
  const grupos = new Map<string, { grupo: string; nombre: string; consultas: ConsultaCatalogo[] }>();
  for (const c of catalogo) {
    if (!c.grupo || c.incluidaEnPlan || !c.modalidades.includes(modalidad)) {
      continue;
    }
    const g = grupos.get(c.grupo) ?? { grupo: c.grupo, nombre: c.grupoNombre ?? c.grupo, consultas: [] };
    g.consultas.push(c);
    grupos.set(c.grupo, g);
  }
  return [...grupos.values()];
}

// ───────────────────────────── consultas del plan ─────────────────────────────

export type ClaveConsultaPlan = 'inicial' | 'mitad' | 'final';

export const TITULO_CONSULTA_PLAN: Record<ClaveConsultaPlan, string> = {
  inicial: 'Consulta inicial (día 1)',
  mitad: 'Consulta del día 50',
  final: 'Consulta final (día 100)',
};

export interface ConsultaPlan {
  taskId: string;
  clave: ClaveConsultaPlan;
  titulo: string;
  /** Ventana en que se agenda (fechas `AAAA-MM-DD`, hora de Argentina); la inicial solo tiene `desde`. */
  ventana: { desde?: string; hasta?: string };
  /** `por-agendar` (la paciente puede reservarla) o `agendada` (ya tiene turno). */
  estado: 'por-agendar' | 'agendada';
  appointmentRef?: string;
}

/** Traduce una Task `agendar-consulta-pb100d` de recepcionistas; undefined si no lo es. */
export function parseConsultaPlan(t: Task): ConsultaPlan | undefined {
  const esDelPlan = t.code?.coding?.some((c) => c.system === SYSTEM_TASK_TIPO && c.code === TAREA_CONSULTA_PLAN);
  const clave = t.input?.find((i) => i.type?.text === 'consulta')?.valueCode as ClaveConsultaPlan | undefined;
  if (!esDelPlan || !t.id || !clave || !(clave in TITULO_CONSULTA_PLAN)) {
    return undefined;
  }
  const agendada = t.status === 'completed' || t.status === 'in-progress';
  return {
    taskId: t.id,
    clave,
    titulo: TITULO_CONSULTA_PLAN[clave],
    ventana: { desde: t.restriction?.period?.start?.slice(0, 10), hasta: t.restriction?.period?.end?.slice(0, 10) },
    estado: agendada ? 'agendada' : 'por-agendar',
    appointmentRef: t.output?.find((o) => o.valueReference?.reference?.startsWith('Appointment/'))?.valueReference?.reference,
  };
}

const ORDEN_CLAVES: ClaveConsultaPlan[] = ['inicial', 'mitad', 'final'];

/** Las tres consultas programadas del plan de la paciente (vacío si no está inscripta). */
export async function cargarConsultasPlan(medplum: MedplumClient, patient: Patient): Promise<ConsultaPlan[]> {
  const tareas = await medplum.searchResources(
    'Task',
    `patient=${getReferenceString(patient)}&code=${SYSTEM_TASK_TIPO}|${TAREA_CONSULTA_PLAN}&_count=20`
  );
  return tareas
    .map(parseConsultaPlan)
    .filter((c): c is ConsultaPlan => c !== undefined)
    .filter((c) => c.estado === 'por-agendar' || c.appointmentRef)
    .sort((a, b) => ORDEN_CLAVES.indexOf(a.clave) - ORDEN_CLAVES.indexOf(b.clave));
}

/** Día `AAAA-MM-DD` en hora de Argentina. */
export function diaArgentina(d: Date): string {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const v = (tipo: string): string => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${v('year')}-${v('month')}-${v('day')}`;
}

/** ¿Un horario cae dentro de la ventana de la consulta del plan? (por día, hora de Argentina). */
export function dentroDeVentana(inicio: Date, ventana: ConsultaPlan['ventana']): boolean {
  const dia = diaArgentina(inicio);
  return (!ventana.desde || dia >= ventana.desde) && (!ventana.hasta || dia <= ventana.hasta);
}

// ───────────────────────────── profesionales ─────────────────────────────

export interface Profesional {
  /** Código de negocio (`MED_…`), el que entiende el bot. */
  codigo: string;
  nombre: string;
  especialidad?: string;
  modalidades: Modalidad[];
  /** Consultas que atiende (códigos del catálogo). */
  servicios: string[];
}

/** Traduce un PractitionerRole de recepcionistas; undefined si no es un profesional de SOM. */
export function parseProfesional(rol: PractitionerRole): Profesional | undefined {
  const identificador = rol.identifier?.find((i) => i.system === SYSTEM_MEDICO)?.value;
  const codigo = identificador?.replace(/^ROL_/, '');
  if (!codigo || rol.active === false) {
    return undefined;
  }
  return {
    codigo,
    nombre: rol.practitioner?.display ?? codigo,
    especialidad: rol.specialty?.[0]?.text ?? rol.specialty?.[0]?.coding?.[0]?.display,
    modalidades: modalidadesDe(rol),
    servicios: (rol.code ?? []).flatMap((c) => c.coding ?? []).filter((c) => c.system === SYSTEM_SERVICIO && c.code).map((c) => c.code!),
  };
}

/** Profesionales que atienden una consulta en una modalidad. */
export async function cargarProfesionales(medplum: MedplumClient, servicioCodigo: string, modalidad: Modalidad): Promise<Profesional[]> {
  const roles = await medplum.searchResources('PractitionerRole', 'active=true&_count=100');
  return roles
    .map(parseProfesional)
    .filter((p): p is Profesional => p !== undefined)
    .filter((p) => p.servicios.includes(servicioCodigo) && (p.modalidades.length === 0 || p.modalidades.includes(modalidad)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

// ───────────────────────────── horarios ─────────────────────────────

export interface Horario {
  slotId: string;
  inicio: Date;
  fin: Date;
}

/** Horarios agrupados por día (hora de Argentina), en orden. */
export interface DiaConHorarios {
  dia: string;
  horarios: Horario[];
}

export function agruparPorDia(horarios: Horario[]): DiaConHorarios[] {
  const dias = new Map<string, Horario[]>();
  for (const h of [...horarios].sort((a, b) => a.inicio.getTime() - b.inicio.getTime())) {
    const dia = diaArgentina(h.inicio);
    dias.set(dia, [...(dias.get(dia) ?? []), h]);
  }
  return [...dias.entries()].map(([dia, hs]) => ({ dia, horarios: hs }));
}

/**
 * Horarios libres de un profesional para una modalidad, desde ahora y hasta `DIAS_AGENDA`
 * días (los que publica el cron de recepcionistas). Con `ventana`, solo los de la
 * consulta del plan que corresponda.
 */
export async function cargarHorarios(
  medplum: MedplumClient,
  profesional: Pick<Profesional, 'codigo'>,
  modalidad: Modalidad,
  opts: { ahora?: Date; ventana?: ConsultaPlan['ventana'] } = {}
): Promise<Horario[]> {
  const ahora = opts.ahora ?? new Date();
  const agenda = await medplum.searchOne('Schedule', `identifier=${SYSTEM_MEDICO}|SCH_${profesional.codigo}`);
  if (!agenda?.id) {
    return [];
  }
  const hasta = new Date(ahora.getTime() + DIAS_AGENDA * 24 * 3_600_000);
  const slots = await medplum.searchResources(
    'Slot',
    `schedule=Schedule/${agenda.id}&status=free&start=ge${ahora.toISOString()}&start=le${hasta.toISOString()}&_count=1000`
  );
  return slots
    .filter((s): s is Slot & { id: string; start: string; end: string } => Boolean(s.id && s.start && s.end))
    .filter((s) => admiteModalidad(s, modalidad))
    .map((s) => ({ slotId: s.id, inicio: new Date(s.start), fin: new Date(s.end) }))
    .filter((h) => h.inicio.getTime() > ahora.getTime())
    .filter((h) => !opts.ventana || dentroDeVentana(h.inicio, opts.ventana))
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
}

// ───────────────────────────── consentimiento de teleconsulta ─────────────────────────────

/**
 * Texto que acepta la paciente antes de su primera teleconsulta. PROVISIONAL: lo redactan
 * los médicos de SOM / legales (recepcionistas, docs/decisiones-pendientes.md).
 */
export const TEXTO_CONSENTIMIENTO_TELECONSULTA =
  'Acepto ser atendida por videollamada (teleconsulta) por los profesionales de Segunda Opinión Médica. ' +
  'Entiendo que la teleconsulta no reemplaza la atención presencial cuando el profesional la considere necesaria, ' +
  'que puede requerir estudios o una consulta en el centro, y que mis datos de salud se tratan según la Ley 25.326. ' +
  'Puedo revocar este consentimiento en cualquier momento desde Mensajes. (Texto provisional, pendiente de revisión.)';

/** ¿La paciente ya aceptó el consentimiento de teleconsulta (Consent activo y vigente)? */
export async function tieneConsentimientoTeleconsulta(medplum: MedplumClient, patient: Patient, ahora: Date = new Date()): Promise<boolean> {
  const consents = await medplum.searchResources('Consent', `patient=${getReferenceString(patient)}&status=active&_count=50`);
  return consents.some((c) => {
    const esDeTele = c.policyRule?.coding?.some((k) => k.system === SYSTEM_CONSENTIMIENTO && k.code === CONSENTIMIENTO_TELECONSULTA);
    const fin = c.provision?.period?.end;
    return Boolean(esDeTele) && (!fin || Date.parse(fin) >= ahora.getTime());
  });
}

/** El `Consent` de teleconsulta, con el shape del contrato (`construirConsentimientoTeleconsulta` de recepcionistas). */
export function construirConsentimientoTeleconsulta(patient: Patient, ahora: Date = new Date()): Consent {
  const ref = getReferenceString(patient);
  return {
    resourceType: 'Consent',
    status: 'active',
    scope: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'treatment' }] },
    category: [{ coding: [{ system: 'http://loinc.org', code: '59284-0', display: 'Patient Consent' }] }],
    patient: { reference: ref },
    performer: [{ reference: ref }],
    dateTime: ahora.toISOString(),
    policyRule: {
      coding: [{ system: SYSTEM_CONSENTIMIENTO, code: CONSENTIMIENTO_TELECONSULTA, display: 'Consentimiento de teleconsulta (telemedicina)' }],
      text: TEXTO_CONSENTIMIENTO_TELECONSULTA,
    },
    provision: { type: 'permit' },
  };
}

export async function aceptarConsentimientoTeleconsulta(medplum: MedplumClient, patient: Patient): Promise<Consent> {
  return medplum.createResource(construirConsentimientoTeleconsulta(patient));
}

// ───────────────────────────── reservar ─────────────────────────────

export interface PedidoReserva {
  servicioCodigo: string;
  slotId: string;
  modalidad: Modalidad;
  /** Consulta del plan: su tarea. */
  tareaId?: string;
}

/** Respuesta del bot `som-reservar-portal` (contrato 7 del handoff). */
export interface ResultadoReserva {
  ok: boolean;
  mensaje?: string;
  appointmentId?: string;
  estado?: 'confirmado' | 'tentativo';
  descripcion?: string;
  inicio?: string;
  fin?: string;
  modalidad?: Modalidad;
  medicoCodigo?: string;
  incluida?: boolean;
  senaARS?: number;
  linkPago?: string;
  /** Hasta cuándo queda retenido el horario (ISO) si es tentativo con link. */
  expira?: string;
  /** No se pudo generar el link de pago: Recepción contacta a la paciente. */
  sinLink?: boolean;
  advertencias?: string[];
}

export const MENSAJE_RESERVA_NO_DISPONIBLE =
  'La reserva online todavía no está disponible. Escribinos por Mensajes y coordinamos tu turno.';

/** Reserva el horario elegido ejecutando el bot de recepcionistas (no escribe la agenda). */
export async function reservarHorario(medplum: MedplumClient, patient: Patient, pedido: PedidoReserva): Promise<ResultadoReserva> {
  const bot = await buscarBotSOM(medplum, BOT_RESERVAR);
  if (!bot?.id) {
    return { ok: false, mensaje: MENSAJE_RESERVA_NO_DISPONIBLE };
  }
  return (await medplum.executeBot(bot.id, { pacienteRef: getReferenceString(patient), ...pedido })) as ResultadoReserva;
}

// ───────────────────────────── mis turnos ─────────────────────────────

export interface EstadoReservaPortal {
  /** `tentativo` (falta la seña, horario retenido) · `vencido` (se pasó la hora sin seña) · `venció` (ya cancelado por vencimiento). */
  estado: 'tentativo' | 'vencido' | 'cancelado-por-vencimiento';
  expira?: Date;
  linkPago?: string;
}

/** Estado de una reserva hecha desde el portal (R-23); undefined si el turno no lo es o ya está resuelto. */
export function estadoReservaPortal(appt: Appointment, ahora: Date = new Date()): EstadoReservaPortal | undefined {
  const expiraISO = appt.extension?.find((e) => e.url === EXT_AGENDA.reservaExpira)?.valueDateTime;
  const linkPago = appt.extension?.find((e) => e.url === EXT_AGENDA.linkPagoSena)?.valueUrl;
  if (appt.status === 'pending' && (expiraISO || linkPago)) {
    const expira = expiraISO ? new Date(expiraISO) : undefined;
    const vencido = expira !== undefined && expira.getTime() <= ahora.getTime();
    return { estado: vencido ? 'vencido' : 'tentativo', ...(expira ? { expira } : {}), ...(linkPago && !vencido ? { linkPago } : {}) };
  }
  if (appt.status === 'cancelled' && expiraISO) {
    return { estado: 'cancelado-por-vencimiento', expira: new Date(expiraISO) };
  }
  return undefined;
}

export const fmtHoraArg = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
export const fmtDiaArg = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });

/** "$150.000" */
export function pesos(n: number): string {
  return `$${Math.round(n).toLocaleString('es-AR')}`;
}
