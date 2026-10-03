import type { Condition, Patient, Practitioner, PractitionerRole, Reference } from '@medplum/fhirtypes';
import { CATALOGOS_POR_ESTADIO } from '../content/ckm/index.js';
import { SYS, SYS_SUFIJO, coincide } from '../contrato/pb100d.js';
import { toReference } from '../fhir/codeable.js';
import type { Condicion, EstadioCkm, ItemCatalogo } from '../model/catalogo.js';
import { SYSTEM } from '../terminology/systems.js';

/**
 * Condiciones del catálogo que registra el equipo (decisión pendiente n.º 10 de
 * Recepción, resuelta así): **una `Condition` FHIR por condición**, con el código del
 * catálogo en el CodeSystem `catalogo-condicion` del contrato y la categoría
 * `condicion-catalogo`. Lo que sale de un número (IMC, presión, laboratorio, PREVENT,
 * edad) no se registra: lo deriva el sistema (`condicionesDesdeCkm`). Lo que sale de
 * un instrumento (STOP-BANG, PHQ/GAD, AHC-HRSN, potenciadores, medicación) se deriva
 * de la respuesta (`condicionesDesdeInstrumentos`), y también se puede registrar a
 * mano.
 *
 * Un **evento** (se inicia un RASi, un procedimiento, síntomas nuevos) es una
 * condición con fecha y ventana: activa los ítems de momento `evento` mientras está
 * vigente y después deja de contar sola. Las ventanas son provisorias (a confirmar
 * con el equipo médico).
 */
export type GrupoCondicion = 'contexto' | 'medicacion' | 'imagenes' | 'enfermedad' | 'clinico' | 'evento';

export const GRUPO_CONDICION_LABEL: Record<GrupoCondicion, string> = {
  contexto: 'Contexto de la persona',
  medicacion: 'Medicación en curso',
  imagenes: 'Imágenes, biomarcadores y sustratos',
  enfermedad: 'Enfermedad establecida',
  clinico: 'Estados que determina el médico',
  evento: 'Eventos (con fecha y ventana)',
};

export interface CondicionRegistrable {
  codigo: Condicion;
  label: string;
  grupo: GrupoCondicion;
  /** Evento: vale durante estos días desde su fecha. */
  ventanaDias?: number;
  /** De dónde sale también (instrumento o cuestionario), para que el equipo sepa que puede derivarse. */
  nota?: string;
}

const c = (codigo: Condicion, label: string, grupo: GrupoCondicion, extra: Partial<CondicionRegistrable> = {}): CondicionRegistrable =>
  Object.freeze({ codigo, label, grupo, ...extra });

/** Ventanas provisorias de los eventos, en días. */
export const VENTANA_EVENTO_DIAS = { medicacion: 90, procedimiento: 90, evento: 90, sintomas: 30 } as const;

export const CONDICIONES_REGISTRABLES: readonly CondicionRegistrable[] = Object.freeze([
  // Contexto de la persona
  c('menopausia', 'Menopausia (transición o posmenopausia)', 'contexto', { nota: 'También desde el hallazgo SNOMED de la historia' }),
  c('planifica-embarazo', 'Planifica un embarazo', 'contexto'),
  c('embarazo', 'Embarazo en curso', 'contexto'),
  c('dmg-previa', 'Diabetes gestacional previa', 'contexto', { nota: 'También desde Potenciadores' }),
  c('apo-reciente', 'Resultado adverso del embarazo reciente (preeclampsia, parto prematuro)', 'contexto', { nota: 'También desde Potenciadores' }),
  c('fuma', 'Fuma o vapea', 'contexto', { nota: 'También desde el cuestionario de tabaco del portal' }),
  c('alcohol', 'Consumo de alcohol de riesgo', 'contexto'),
  c('ancestria-asiatica', 'Ascendencia asiática (umbrales IMC ≥ 23, cintura ≥ 80/90)', 'contexto'),
  c('fragilidad', 'Fragilidad', 'contexto'),
  c('apnea-sospecha', 'Sospecha de apnea del sueño', 'contexto', { nota: 'También desde STOP-BANG (≥ 3)' }),
  c('phq-gad-positivo', 'PHQ-2 o GAD-2 positivo', 'contexto', { nota: 'También desde el instrumento PHQ-2 / GAD-2 / PSS-4' }),
  c('ahc-necesidades', 'Necesidades sociales (AHC-HRSN)', 'contexto', { nota: 'También desde el instrumento AHC-HRSN' }),
  c('potenciadores', 'Potenciadores de riesgo (Tabla 9)', 'contexto', { nota: 'También desde el registro de potenciadores' }),
  // Medicación en curso (la reconciliación también las deriva)
  c('toma-glp1', 'Toma GLP-1', 'medicacion'),
  c('toma-sglt2i', 'Toma SGLT2i', 'medicacion'),
  c('toma-rasi-mra', 'Toma IECA, ARA2, ARNI o antagonista mineralocorticoide', 'medicacion'),
  c('toma-estatina', 'Toma estatina u otro hipolipemiante', 'medicacion'),
  c('toma-antitrombotico', 'Toma antiagregante o anticoagulante', 'medicacion'),
  c('toma-antihipertensivo', 'Toma antihipertensivo', 'medicacion'),
  c('farmaco-obesidad', 'Fármaco para la obesidad (no GLP-1)', 'medicacion'),
  c('riesgo-hipoglucemia', 'Riesgo de hipoglucemia (insulina o sulfonilurea)', 'medicacion'),
  c('automonitoreo-glucemia', 'Automonitoreo de glucemia', 'medicacion'),
  c('polifarmacia', 'Polifarmacia (5 o más fármacos)', 'medicacion'),
  c('deficit-hierro', 'Déficit de hierro', 'medicacion'),
  // Imágenes, biomarcadores y sustratos
  c('aterosclerosis-subclinica', 'Aterosclerosis subclínica', 'imagenes'),
  c('cac-0', 'Calcio coronario 0', 'imagenes'),
  c('cac-100', 'Calcio coronario 100 a 999', 'imagenes'),
  c('cac-1000', 'Calcio coronario 1000 o más', 'imagenes'),
  c('cac-percentil-75', 'Calcio coronario en percentil 75 o más', 'imagenes'),
  c('itb-bajo', 'Índice tobillo-brazo bajo', 'imagenes'),
  c('pre-ic', 'Pre-insuficiencia cardíaca (ecocardiograma o biomarcadores)', 'imagenes'),
  c('sin-ecocardiograma', 'Sin ecocardiograma', 'imagenes'),
  c('biomarcadores-en-ascenso', 'Biomarcadores en ascenso (NT-proBNP, troponina)', 'imagenes'),
  c('hipertension-pulmonar', 'Hipertensión pulmonar', 'imagenes'),
  c('fib4-alto', 'FIB-4 alto', 'imagenes'),
  // Enfermedad establecida
  c('ecv', 'Enfermedad cardiovascular establecida', 'enfermedad'),
  c('coronaria', 'Enfermedad coronaria', 'enfermedad'),
  c('acv', 'ACV o AIT', 'enfermedad'),
  c('eap', 'Enfermedad arterial periférica', 'enfermedad'),
  c('ic', 'Insuficiencia cardíaca', 'enfermedad'),
  c('hfref', 'IC con FEVI reducida', 'enfermedad'),
  c('hfmref', 'IC con FEVI levemente reducida', 'enfermedad'),
  c('hfpef', 'IC con FEVI preservada', 'enfermedad'),
  c('fa', 'Fibrilación auricular', 'enfermedad'),
  c('dialisis', 'Diálisis', 'enfermedad'),
  c('candidato-trasplante', 'Candidato a trasplante', 'enfermedad'),
  // Estados que determina el médico (no cambian la estadificación estimada; sí los ítems)
  c('hta', 'Hipertensión (diagnóstico)', 'clinico', { nota: 'También desde el diagnóstico SNOMED o la medicación' }),
  c('dm2', 'Diabetes tipo 2 (diagnóstico)', 'clinico', { nota: 'También desde el diagnóstico SNOMED' }),
  c('erc', 'Enfermedad renal crónica (diagnóstico)', 'clinico', { nota: 'También desde el diagnóstico SNOMED o KDIGO' }),
  c('hta-resistente', 'HTA resistente', 'clinico'),
  c('ldl-fuera-de-meta', 'LDL fuera de meta', 'clinico'),
  c('dislipidemia-aislada', 'Dislipidemia aislada', 'clinico'),
  c('erc-muy-alto-riesgo', 'ERC de muy alto riesgo (KDIGO)', 'clinico'),
  c('hiperpotasemia', 'Hiperpotasemia', 'clinico'),
  c('sin-respuesta', 'Sin respuesta a los 100 días (Tabla 47)', 'clinico'),
  // Eventos
  c('inicia-rasi-mra', 'Inicia o sube IECA, ARA2, ARNI o antagonista mineralocorticoide', 'evento', { ventanaDias: VENTANA_EVENTO_DIAS.medicacion }),
  c('inicia-sglt2i', 'Inicia SGLT2i', 'evento', { ventanaDias: VENTANA_EVENTO_DIAS.medicacion }),
  c('inicia-hipolipemiante', 'Inicia o sube hipolipemiante', 'evento', { ventanaDias: VENTANA_EVENTO_DIAS.medicacion }),
  c('procedimiento', 'Procedimiento o internación', 'evento', { ventanaDias: VENTANA_EVENTO_DIAS.procedimiento }),
  c('evento-reciente', 'Evento cardiovascular reciente', 'evento', { ventanaDias: VENTANA_EVENTO_DIAS.evento }),
  c('sintomas-nuevos', 'Síntomas nuevos', 'evento', { ventanaDias: VENTANA_EVENTO_DIAS.sintomas }),
  c('congestion', 'Congestión', 'evento', { ventanaDias: VENTANA_EVENTO_DIAS.sintomas }),
  c('sangrado-mayor', 'Sangrado mayor', 'evento', { ventanaDias: VENTANA_EVENTO_DIAS.sintomas }),
]);

const POR_CODIGO = new Map<Condicion, CondicionRegistrable>(CONDICIONES_REGISTRABLES.map((r) => [r.codigo, r]));

export function condicionRegistrable(codigo: Condicion): CondicionRegistrable | undefined {
  return POR_CODIGO.get(codigo);
}

/** Las registrables de un grupo, en el orden del catálogo. */
export function registrablesDe(grupo: GrupoCondicion): CondicionRegistrable[] {
  return CONDICIONES_REGISTRABLES.filter((r) => r.grupo === grupo);
}

/** Los eventos: condiciones con ventana. */
export const EVENTOS: readonly CondicionRegistrable[] = Object.freeze(CONDICIONES_REGISTRABLES.filter((r) => r.grupo === 'evento'));

export function esEvento(codigo: Condicion): boolean {
  return POR_CODIGO.get(codigo)?.grupo === 'evento';
}

/** `Condition.category` de una condición del catálogo registrada por el equipo. */
export const CATEGORIA_CONDICION_CATALOGO = {
  system: SYSTEM.epa,
  code: 'condicion-catalogo',
  display: 'Condición del catálogo PB100D',
} as const;

export interface RegistroCondicion {
  patient: Reference<Patient> | string;
  codigo: Condicion;
  /** Quién la registra (el profesional logueado). */
  registrador?: Reference<Practitioner | PractitionerRole> | string;
  /** Fecha del evento o del hallazgo (ISO). Para un evento, desde cuándo corre la ventana. */
  fecha?: string;
  comentario?: string;
  /** ISO dateTime del registro (default: ahora). */
  now?: string;
  id?: string;
}

/** La `Condition` FHIR de una condición del catálogo registrada por el equipo. */
export function buildCondicionCatalogo(r: RegistroCondicion): Condition {
  const def = POR_CODIGO.get(r.codigo);
  const now = r.now ?? new Date().toISOString();
  const condition: Condition = {
    resourceType: 'Condition',
    clinicalStatus: { coding: [{ system: SYSTEM.conditionClinical, code: 'active', display: 'Active' }] },
    verificationStatus: { coding: [{ system: SYSTEM.conditionVerStatus, code: 'confirmed', display: 'Confirmed' }] },
    category: [{ coding: [{ ...CATEGORIA_CONDICION_CATALOGO }] }],
    code: {
      coding: [{ system: SYS.catalogoCondicion, code: r.codigo, display: def?.label ?? r.codigo }],
      text: def?.label ?? r.codigo,
    },
    subject: toReference(r.patient),
    recordedDate: now,
  };
  const fecha = r.fecha ?? (def?.grupo === 'evento' ? now : undefined);
  if (fecha) condition.onsetDateTime = fecha;
  if (r.registrador) condition.recorder = toReference(r.registrador) as Reference<Practitioner>;
  if (r.comentario?.trim()) condition.note = [{ text: r.comentario.trim() }];
  if (r.id) condition.id = r.id;
  return condition;
}

/** ¿Es una condición del catálogo (registrada por el equipo)? */
export function esCondicionCatalogo(condition: Condition): boolean {
  const porCategoria = (condition.category ?? []).some((cat) =>
    (cat.coding ?? []).some((k) => k.system === SYSTEM.epa && k.code === CATEGORIA_CONDICION_CATALOGO.code),
  );
  return porCategoria || codigoCatalogoDe(condition) !== undefined;
}

/** El código del catálogo de la `Condition`, en cualquier namespace aceptado. */
export function codigoCatalogoDe(condition: Condition): Condicion | undefined {
  const coding = (condition.code?.coding ?? []).find((k) => coincide(k.system, SYS_SUFIJO.catalogoCondicion));
  return coding?.code as Condicion | undefined;
}

export function condicionActivaFhir(condition: Condition): boolean {
  const estado = condition.clinicalStatus?.coding?.[0]?.code;
  return estado === undefined || estado === 'active' || estado === 'recurrence' || estado === 'relapse';
}

/** La condición cerrada (ya no aplica): inactiva, con fecha de fin. */
export function cerrarCondicionCatalogo(condition: Condition, now = new Date().toISOString()): Condition {
  return {
    ...condition,
    clinicalStatus: { coding: [{ system: SYSTEM.conditionClinical, code: 'inactive', display: 'Inactive' }] },
    abatementDateTime: now,
  };
}

function sumarDias(iso: string, dias: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString();
}

export interface CondicionRegistrada {
  codigo: Condicion;
  condition: Condition;
  definicion?: CondicionRegistrable;
  /** Fecha del hallazgo o del evento. */
  fecha?: string;
  /** Un evento fuera de su ventana ya no cuenta. */
  vigente: boolean;
  /** Hasta cuándo cuenta un evento (ISO). */
  venceEl?: string;
}

/** Las condiciones del catálogo activas en la historia, con la vigencia de los eventos al día `hoy`. */
export function condicionesRegistradasDesdeFhir(conditions: Condition[], hoy: string = new Date().toISOString()): CondicionRegistrada[] {
  const limite = hoy.length === 10 ? `${hoy}T23:59:59Z` : hoy;
  return conditions
    .filter((condition) => esCondicionCatalogo(condition) && condicionActivaFhir(condition))
    .map((condition): CondicionRegistrada | undefined => {
      const codigo = codigoCatalogoDe(condition);
      if (!codigo) return undefined;
      const definicion = POR_CODIGO.get(codigo);
      const fecha = condition.onsetDateTime ?? condition.recordedDate;
      if (definicion?.ventanaDias !== undefined) {
        const desde = fecha ?? condition.meta?.lastUpdated;
        const venceEl = desde ? sumarDias(desde, definicion.ventanaDias) : undefined;
        const vigente = venceEl !== undefined && Date.parse(venceEl) >= Date.parse(limite) && Date.parse(desde ?? '') <= Date.parse(limite);
        return { codigo, condition, definicion, ...(fecha ? { fecha } : {}), vigente, ...(venceEl ? { venceEl } : {}) };
      }
      return { codigo, condition, ...(definicion ? { definicion } : {}), ...(fecha ? { fecha } : {}), vigente: true };
    })
    .filter((r): r is CondicionRegistrada => r !== undefined)
    .sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''));
}

/** Los códigos vigentes registrados por el equipo, sin duplicados. */
export function codigosRegistrados(conditions: Condition[], hoy?: string): Condicion[] {
  return [...new Set(condicionesRegistradasDesdeFhir(conditions, hoy).filter((r) => r.vigente).map((r) => r.codigo))];
}

/**
 * Los ítems del catálogo de un estadío que esta condición activa (la exigen o la
 * aceptan como alternativa), para mostrarle al equipo qué cambia al registrarla.
 */
export function itemsQueActiva(codigo: Condicion, estadio: EstadioCkm): ItemCatalogo[] {
  return CATALOGOS_POR_ESTADIO[estadio].items.filter(
    (item) => (item.condiciones ?? []).includes(codigo) || (item.algunaDe ?? []).includes(codigo),
  );
}
