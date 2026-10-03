import type {
  Questionnaire,
  QuestionnaireItem,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
} from '@medplum/fhirtypes';
import { BASE_CANONICA, coincide } from '../contrato/pb100d.js';
import { ultimaRespuesta } from '../le8/desdeFhir.js';
import type { Condicion } from '../model/catalogo.js';

/**
 * Instrumentos que carga el equipo (firmados como instrumentos del plan: STOP-BANG,
 * PHQ-2/GAD-2, PSS-4, AHC-HRSN; más el registro de potenciadores de la Tabla 9 y la
 * reconciliación de medicación de la Tabla 12). Cada uno es un `Questionnaire` con URL
 * y versión fijas; la respuesta guarda `questionnaire = url|version` (decisión firmada:
 * "versión del instrumento guardada en cada respuesta"). De la última respuesta de cada
 * instrumento se derivan condiciones del catálogo (`condicionesDesdeInstrumentos`).
 *
 * Los textos son adaptaciones al español rioplatense de los instrumentos originales,
 * sin tocar constructos ni puntajes; antes de usarlos con pacientes hay que cotejarlos
 * con las versiones validadas en español (tarea operativa, `docs/catalogo-pb100d`).
 */
export type ClaveInstrumento = 'stopBang' | 'psicologico' | 'ahcHrsn' | 'potenciadores' | 'reconciliacion';

/** Sufijos (bajo cualquier base aceptada) con que el día 0 y los detectores reconocen cada instrumento. */
export const INSTRUMENTOS_EQUIPO: Record<ClaveInstrumento, string> = {
  stopBang: 'Questionnaire/pb100d-stop-bang-v1',
  psicologico: 'Questionnaire/pb100d-phq2-gad2-pss4-v1',
  ahcHrsn: 'Questionnaire/pb100d-ahc-hrsn-v1',
  potenciadores: 'Questionnaire/pb100d-potenciadores-v1',
  reconciliacion: 'Questionnaire/pb100d-reconciliacion-medicacion-v1',
};

export const SYSTEM_INSTRUMENTOS = 'https://epa-bienestar.ar/fhir/CodeSystem/pb100d-instrumentos';

export interface OpcionInstrumento {
  code: string;
  display: string;
  valor?: number;
}

export interface PreguntaInstrumento {
  linkId: string;
  text: string;
  tipo: 'choice' | 'integer';
  opciones?: readonly OpcionInstrumento[];
  multiple?: boolean;
  /** linkId del grupo en que se muestra. */
  grupo?: string;
  /** Puntaje invertido (PSS-4: ítems 2 y 3). */
  invertida?: boolean;
}

export interface InstrumentoDef {
  clave: ClaveInstrumento;
  sufijo: string;
  url: string;
  version: string;
  nombre: string;
  titulo: string;
  descripcion: string;
  fuente: string;
  grupos?: readonly { linkId: string; text: string }[];
  preguntas: readonly PreguntaInstrumento[];
}

export interface ResultadoInstrumento {
  clave: ClaveInstrumento;
  /** Puntaje principal, si el instrumento tiene uno. */
  puntaje?: number;
  /** El resultado en palabras cortas ("4 de 8: riesgo intermedio"). */
  detalle: string;
  /** Condiciones del catálogo que se derivan de la respuesta. */
  condiciones: Condicion[];
  positivo: boolean;
}

const SI_NO: readonly OpcionInstrumento[] = [
  { code: 'si', display: 'Sí', valor: 1 },
  { code: 'no', display: 'No', valor: 0 },
];
const FRECUENCIA_2_SEMANAS: readonly OpcionInstrumento[] = [
  { code: 'f0', display: 'Nunca', valor: 0 },
  { code: 'f1', display: 'Varios días', valor: 1 },
  { code: 'f2', display: 'Más de la mitad de los días', valor: 2 },
  { code: 'f3', display: 'Casi todos los días', valor: 3 },
];
const FRECUENCIA_PSS: readonly OpcionInstrumento[] = [
  { code: 'p0', display: 'Nunca', valor: 0 },
  { code: 'p1', display: 'Casi nunca', valor: 1 },
  { code: 'p2', display: 'A veces', valor: 2 },
  { code: 'p3', display: 'Con bastante frecuencia', valor: 3 },
  { code: 'p4', display: 'Muy a menudo', valor: 4 },
];
const HUNGER_VITAL_SIGN: readonly OpcionInstrumento[] = [
  { code: 'nunca', display: 'Nunca fue cierto', valor: 0 },
  { code: 'a-veces', display: 'A veces fue cierto', valor: 1 },
  { code: 'frecuente', display: 'Con frecuencia fue cierto', valor: 2 },
];
const SEGURIDAD: readonly OpcionInstrumento[] = [
  { code: 's1', display: 'Nunca', valor: 1 },
  { code: 's2', display: 'Rara vez', valor: 2 },
  { code: 's3', display: 'A veces', valor: 3 },
  { code: 's4', display: 'Con bastante frecuencia', valor: 4 },
  { code: 's5', display: 'Con mucha frecuencia', valor: 5 },
];

/** Opciones de potenciadores (Tabla 9) y la condición del catálogo específica que además activan. */
const POTENCIADORES: readonly (OpcionInstrumento & { condicion?: Condicion })[] = [
  { code: 'inflamatoria', display: 'Enfermedad inflamatoria crónica o autoinmune (artritis reumatoide, psoriasis, lupus, enfermedad inflamatoria intestinal)' },
  { code: 'vih', display: 'VIH' },
  { code: 'apnea', display: 'Apnea obstructiva del sueño', condicion: 'apnea-sospecha' },
  { code: 'depresion', display: 'Depresión o ansiedad' },
  { code: 'masld', display: 'Hígado graso (MASLD)' },
  { code: 'erc', display: 'Enfermedad renal crónica', condicion: 'erc' },
  { code: 'sudasiatica', display: 'Ascendencia sudasiática' },
  { code: 'familiar', display: 'Historia familiar de enfermedad cardiovascular prematura (varón antes de los 55, mujer antes de los 65)' },
  { code: 'menopausia-precoz', display: 'Menopausia precoz (antes de los 40)', condicion: 'menopausia' },
  { code: 'apo', display: 'Resultado adverso del embarazo (preeclampsia, parto prematuro)', condicion: 'apo-reciente' },
  { code: 'dmg', display: 'Diabetes gestacional', condicion: 'dmg-previa' },
  { code: 'pcr', display: 'PCR ultrasensible ≥ 2 mg/L' },
  { code: 'lpa', display: 'Lp(a) ≥ 125 nmol/L' },
  { code: 'apob', display: 'ApoB ≥ 130 mg/dL' },
  { code: 'itb', display: 'Índice tobillo-brazo < 0,9', condicion: 'itb-bajo' },
  { code: 'ninguno', display: 'Ninguno' },
];

/** Clases de medicación de la reconciliación (Tabla 12) y la condición que activan. */
const CLASES_MEDICACION: readonly (OpcionInstrumento & { condicion?: Condicion })[] = [
  { code: 'glp1', display: 'Agonista del receptor GLP-1', condicion: 'toma-glp1' },
  { code: 'sglt2i', display: 'Inhibidor SGLT2', condicion: 'toma-sglt2i' },
  { code: 'rasi', display: 'IECA, ARA2 o ARNI', condicion: 'toma-rasi-mra' },
  { code: 'mra', display: 'Antagonista mineralocorticoide (espironolactona, eplerenona, finerenona)', condicion: 'toma-rasi-mra' },
  { code: 'estatina', display: 'Estatina u otro hipolipemiante', condicion: 'toma-estatina' },
  { code: 'antitrombotico', display: 'Antiagregante o anticoagulante', condicion: 'toma-antitrombotico' },
  { code: 'antihipertensivo', display: 'Otro antihipertensivo', condicion: 'toma-antihipertensivo' },
  { code: 'obesidad', display: 'Fármaco para la obesidad (no GLP-1)', condicion: 'farmaco-obesidad' },
  { code: 'insulina', display: 'Insulina o sulfonilurea', condicion: 'riesgo-hipoglucemia' },
  { code: 'ninguna', display: 'No toma medicación' },
];

function def(d: Omit<InstrumentoDef, 'url' | 'sufijo'>): InstrumentoDef {
  const sufijo = INSTRUMENTOS_EQUIPO[d.clave];
  return Object.freeze({ ...d, sufijo, url: `${BASE_CANONICA}/${sufijo}` });
}

export const INSTRUMENTOS: Readonly<Record<ClaveInstrumento, InstrumentoDef>> = Object.freeze({
  stopBang: def({
    clave: 'stopBang',
    version: '1.0',
    nombre: 'PB100DStopBang',
    titulo: 'STOP-Bang (apnea obstructiva del sueño)',
    descripcion: 'Ocho preguntas de sí o no. 0 a 2: riesgo bajo; 3 a 4: intermedio; 5 o más: alto. Con 3 o más se registra la sospecha de apnea.',
    fuente: 'Chung F et al., Anesthesiology 2008 y Br J Anaesth 2012; Guía CKM 2026, Sección 7.3 (COR 2a, LOE C-LD)',
    preguntas: [
      { linkId: 'sb-s', text: '¿Ronca fuerte (más fuerte que hablando, o tan fuerte que se escucha a través de una puerta cerrada)?', tipo: 'choice', opciones: SI_NO },
      { linkId: 'sb-t', text: '¿Se siente cansado/a, fatigado/a o con sueño durante el día con frecuencia?', tipo: 'choice', opciones: SI_NO },
      { linkId: 'sb-o', text: '¿Alguien observó que deja de respirar mientras duerme?', tipo: 'choice', opciones: SI_NO },
      { linkId: 'sb-p', text: '¿Tiene o recibe tratamiento por presión arterial alta?', tipo: 'choice', opciones: SI_NO },
      { linkId: 'sb-b', text: '¿Su índice de masa corporal es mayor de 35 kg/m²?', tipo: 'choice', opciones: SI_NO },
      { linkId: 'sb-a', text: '¿Tiene más de 50 años?', tipo: 'choice', opciones: SI_NO },
      { linkId: 'sb-n', text: '¿La circunferencia de su cuello es mayor de 40 cm?', tipo: 'choice', opciones: SI_NO },
      { linkId: 'sb-g', text: '¿Es de sexo masculino?', tipo: 'choice', opciones: SI_NO },
    ],
  }),
  psicologico: def({
    clave: 'psicologico',
    version: '1.0',
    nombre: 'PB100DPhq2Gad2Pss4',
    titulo: 'PHQ-2, GAD-2 y PSS-4 (estrés y salud psicológica)',
    descripcion: 'PHQ-2 y GAD-2: 0 a 6 cada uno, positivo con 3 o más. PSS-4: 0 a 16, a mayor puntaje más estrés percibido (sin punto de corte validado; se informa).',
    fuente: 'Kroenke K et al., Med Care 2003 (PHQ-2) y Ann Intern Med 2007 (GAD-2); Cohen S, 1988 (PSS-4); Guía CKM 2026, Sección 5.1 y Tabla 9',
    grupos: [
      { linkId: 'phq', text: 'En las últimas 2 semanas, ¿con qué frecuencia le molestó alguno de estos problemas?' },
      { linkId: 'gad', text: 'En las últimas 2 semanas, ¿con qué frecuencia le molestó alguno de estos problemas?' },
      { linkId: 'pss', text: 'En el último mes, ¿con qué frecuencia…' },
    ],
    preguntas: [
      { linkId: 'phq-1', grupo: 'phq', text: 'Poco interés o placer en hacer cosas', tipo: 'choice', opciones: FRECUENCIA_2_SEMANAS },
      { linkId: 'phq-2', grupo: 'phq', text: 'Sentirse decaído/a, deprimido/a o sin esperanzas', tipo: 'choice', opciones: FRECUENCIA_2_SEMANAS },
      { linkId: 'gad-1', grupo: 'gad', text: 'Sentirse nervioso/a, ansioso/a o al límite', tipo: 'choice', opciones: FRECUENCIA_2_SEMANAS },
      { linkId: 'gad-2', grupo: 'gad', text: 'No poder dejar de preocuparse o controlar la preocupación', tipo: 'choice', opciones: FRECUENCIA_2_SEMANAS },
      { linkId: 'pss-1', grupo: 'pss', text: '…sintió que no podía controlar las cosas importantes de su vida?', tipo: 'choice', opciones: FRECUENCIA_PSS },
      { linkId: 'pss-2', grupo: 'pss', text: '…se sintió seguro/a de su capacidad para manejar sus problemas personales?', tipo: 'choice', opciones: FRECUENCIA_PSS, invertida: true },
      { linkId: 'pss-3', grupo: 'pss', text: '…sintió que las cosas le iban bien?', tipo: 'choice', opciones: FRECUENCIA_PSS, invertida: true },
      { linkId: 'pss-4', grupo: 'pss', text: '…sintió que las dificultades se acumulaban tanto que no podía superarlas?', tipo: 'choice', opciones: FRECUENCIA_PSS },
    ],
  }),
  ahcHrsn: def({
    clave: 'ahcHrsn',
    version: '1.0',
    nombre: 'PB100DAhcHrsn',
    titulo: 'AHC-HRSN (necesidades sociales relacionadas con la salud)',
    descripcion: 'Preguntas centrales: vivienda, alimentación, transporte, servicios y seguridad. Cualquier dominio positivo registra necesidades sociales (seguridad: suma de 11 o más).',
    fuente: 'CMS Accountable Health Communities HRSN Screening Tool (preguntas centrales); Guía CKM 2026, Sección 3.2 (COR 1)',
    grupos: [
      { linkId: 'vivienda', text: 'Vivienda' },
      { linkId: 'comida', text: 'Alimentación (últimos 12 meses)' },
      { linkId: 'otros', text: 'Transporte y servicios (últimos 12 meses)' },
      { linkId: 'seguridad', text: 'Seguridad: ¿con qué frecuencia alguien, incluida su familia y sus amistades…' },
    ],
    preguntas: [
      {
        linkId: 'vivienda-1',
        grupo: 'vivienda',
        text: '¿Cuál es su situación de vivienda hoy?',
        tipo: 'choice',
        opciones: [
          { code: 'estable', display: 'Tengo un lugar fijo donde vivir' },
          { code: 'riesgo', display: 'Tengo dónde vivir hoy, pero me preocupa perderlo' },
          { code: 'sin-lugar', display: 'No tengo un lugar fijo donde vivir' },
        ],
      },
      {
        linkId: 'vivienda-2',
        grupo: 'vivienda',
        text: 'Piense en el lugar donde vive. ¿Tiene problemas con alguno de los siguientes?',
        tipo: 'choice',
        multiple: true,
        opciones: [
          { code: 'plagas', display: 'Plagas (cucarachas, ratones)' },
          { code: 'moho', display: 'Moho o humedad' },
          { code: 'plomo', display: 'Pintura o cañerías con plomo' },
          { code: 'calefaccion', display: 'Sin calefacción' },
          { code: 'horno', display: 'Horno o cocina que no funciona' },
          { code: 'humo', display: 'Detectores de humo que faltan o no funcionan' },
          { code: 'agua', display: 'Sin agua corriente' },
          { code: 'ninguno', display: 'Ninguno' },
        ],
      },
      { linkId: 'comida-1', grupo: 'comida', text: 'Le preocupó que la comida se acabara antes de tener dinero para comprar más.', tipo: 'choice', opciones: HUNGER_VITAL_SIGN },
      { linkId: 'comida-2', grupo: 'comida', text: 'La comida que compró no alcanzó y no tuvo dinero para comprar más.', tipo: 'choice', opciones: HUNGER_VITAL_SIGN },
      { linkId: 'transporte', grupo: 'otros', text: '¿La falta de transporte confiable le impidió ir a consultas médicas, al trabajo o conseguir lo necesario para la vida diaria?', tipo: 'choice', opciones: SI_NO },
      { linkId: 'servicios', grupo: 'otros', text: '¿La compañía de electricidad, gas o agua amenazó con cortarle el servicio?', tipo: 'choice', opciones: SI_NO },
      { linkId: 'seguridad-1', grupo: 'seguridad', text: '…la o lo daña físicamente?', tipo: 'choice', opciones: SEGURIDAD },
      { linkId: 'seguridad-2', grupo: 'seguridad', text: '…la o lo insulta o le habla mal?', tipo: 'choice', opciones: SEGURIDAD },
      { linkId: 'seguridad-3', grupo: 'seguridad', text: '…la o lo amenaza con hacerle daño?', tipo: 'choice', opciones: SEGURIDAD },
      { linkId: 'seguridad-4', grupo: 'seguridad', text: '…le grita o la o lo maldice?', tipo: 'choice', opciones: SEGURIDAD },
    ],
  }),
  potenciadores: def({
    clave: 'potenciadores',
    version: '1.0',
    nombre: 'PB100DPotenciadores',
    titulo: 'Potenciadores de riesgo (Tabla 9, Guía CKM 2026)',
    descripcion: 'Marcar los que tenga la persona. Cualquiera registra la condición «potenciadores»; algunos activan además su condición específica (apnea, menopausia precoz, diabetes gestacional, resultado adverso del embarazo, índice tobillo-brazo bajo, ERC).',
    fuente: 'Guía CKM 2026, Tabla 9 (COR 2a)',
    preguntas: [{ linkId: 'pot', text: 'Potenciadores presentes', tipo: 'choice', multiple: true, opciones: POTENCIADORES }],
  }),
  reconciliacion: def({
    clave: 'reconciliacion',
    version: '1.0',
    nombre: 'PB100DReconciliacionMedicacion',
    titulo: 'Reconciliación de medicación y suplementos (Tabla 12)',
    descripcion: 'Las clases que toma hoy (activan sus condiciones del catálogo), la cantidad total de fármacos (5 o más: polifarmacia) y el automonitoreo de glucemia.',
    fuente: 'Guía CKM 2026, Tabla 12',
    preguntas: [
      { linkId: 'clases', text: 'Clases de medicación que toma hoy', tipo: 'choice', multiple: true, opciones: CLASES_MEDICACION },
      { linkId: 'cantidad', text: 'Cantidad total de fármacos que toma (incluidos los de venta libre y los suplementos)', tipo: 'integer' },
      { linkId: 'automonitoreo', text: '¿Usa glucómetro o sensor para medirse la glucemia?', tipo: 'choice', opciones: SI_NO },
    ],
  }),
});

export const CLAVES_INSTRUMENTO: readonly ClaveInstrumento[] = Object.freeze(['stopBang', 'psicologico', 'ahcHrsn', 'potenciadores', 'reconciliacion']);

/** `Questionnaire.url|version`, lo que guarda cada respuesta. */
export function referenciaInstrumento(clave: ClaveInstrumento): string {
  const d = INSTRUMENTOS[clave];
  return `${d.url}|${d.version}`;
}

function itemDePregunta(p: PreguntaInstrumento): QuestionnaireItem {
  const item: QuestionnaireItem = { linkId: p.linkId, text: p.text, type: p.tipo };
  if (p.tipo === 'choice') {
    item.answerOption = (p.opciones ?? []).map((o) => ({ valueCoding: { system: SYSTEM_INSTRUMENTOS, code: o.code, display: o.display } }));
    if (p.multiple) item.repeats = true;
  }
  return item;
}

/** El `Questionnaire` FHIR de un instrumento, listo para subir o para renderizar. */
export function buildQuestionnaireInstrumento(clave: ClaveInstrumento): Questionnaire {
  const d = INSTRUMENTOS[clave];
  const items: QuestionnaireItem[] = d.grupos
    ? d.grupos.map((g) => ({
        linkId: g.linkId,
        text: g.text,
        type: 'group' as const,
        item: d.preguntas.filter((p) => p.grupo === g.linkId).map(itemDePregunta),
      }))
    : d.preguntas.map(itemDePregunta);
  return {
    resourceType: 'Questionnaire',
    url: d.url,
    version: d.version,
    name: d.nombre,
    title: d.titulo,
    status: 'active',
    subjectType: ['Patient'],
    description: `${d.descripcion} Fuente: ${d.fuente}.`,
    item: items,
  };
}

export function buildQuestionnairesInstrumentos(): Questionnaire[] {
  return CLAVES_INSTRUMENTO.map(buildQuestionnaireInstrumento);
}

function* recorrer(items: QuestionnaireResponseItem[] | undefined): Generator<QuestionnaireResponseItem> {
  for (const item of items ?? []) {
    yield item;
    yield* recorrer(item.item);
  }
}

function respuestas(r: QuestionnaireResponse, linkId: string): QuestionnaireResponseItemAnswer[] {
  for (const item of recorrer(r.item)) {
    if (item.linkId === linkId) return item.answer ?? [];
  }
  return [];
}

function codigos(r: QuestionnaireResponse, linkId: string): string[] {
  return respuestas(r, linkId)
    .map((a) => a.valueCoding?.code ?? (typeof a.valueString === 'string' ? a.valueString : undefined))
    .filter((c): c is string => c !== undefined);
}

function valorDe(p: PreguntaInstrumento, r: QuestionnaireResponse): number | undefined {
  const code = codigos(r, p.linkId)[0];
  const opcion = p.opciones?.find((o) => o.code === code);
  if (!opcion || opcion.valor === undefined) return undefined;
  const maximo = Math.max(...(p.opciones ?? []).map((o) => o.valor ?? 0));
  return p.invertida ? maximo - opcion.valor : opcion.valor;
}

function entero(r: QuestionnaireResponse, linkId: string): number | undefined {
  const a = respuestas(r, linkId)[0];
  return a?.valueInteger ?? a?.valueDecimal ?? (a?.valueQuantity?.value as number | undefined);
}

function pregunta(clave: ClaveInstrumento, linkId: string): PreguntaInstrumento {
  const p = INSTRUMENTOS[clave].preguntas.find((q) => q.linkId === linkId);
  if (!p) throw new Error(`Pregunta ${linkId} inexistente en ${clave}`);
  return p;
}

function suma(clave: ClaveInstrumento, r: QuestionnaireResponse, linkIds: string[]): number {
  return linkIds.reduce((total, id) => total + (valorDe(pregunta(clave, id), r) ?? 0), 0);
}

/** El resultado de una respuesta: puntaje, texto y condiciones del catálogo que deriva. */
export function puntuarInstrumento(clave: ClaveInstrumento, r: QuestionnaireResponse): ResultadoInstrumento {
  switch (clave) {
    case 'stopBang': {
      const n = suma(clave, r, ['sb-s', 'sb-t', 'sb-o', 'sb-p', 'sb-b', 'sb-a', 'sb-n', 'sb-g']);
      const riesgo = n >= 5 ? 'alto' : n >= 3 ? 'intermedio' : 'bajo';
      return { clave, puntaje: n, detalle: `${n} de 8: riesgo ${riesgo}`, positivo: n >= 3, condiciones: n >= 3 ? ['apnea-sospecha'] : [] };
    }
    case 'psicologico': {
      const phq = suma(clave, r, ['phq-1', 'phq-2']);
      const gad = suma(clave, r, ['gad-1', 'gad-2']);
      const pss = suma(clave, r, ['pss-1', 'pss-2', 'pss-3', 'pss-4']);
      const positivo = phq >= 3 || gad >= 3;
      return {
        clave,
        puntaje: pss,
        detalle: `PHQ-2 ${phq}/6 · GAD-2 ${gad}/6 · PSS-4 ${pss}/16${positivo ? ' · positivo' : ''}`,
        positivo,
        condiciones: positivo ? ['phq-gad-positivo'] : [],
      };
    }
    case 'ahcHrsn': {
      const dominios: string[] = [];
      const vivienda1 = codigos(r, 'vivienda-1')[0];
      const vivienda2 = codigos(r, 'vivienda-2').filter((c) => c !== 'ninguno');
      if ((vivienda1 && vivienda1 !== 'estable') || vivienda2.length > 0) dominios.push('vivienda');
      if ([...codigos(r, 'comida-1'), ...codigos(r, 'comida-2')].some((c) => c !== 'nunca')) dominios.push('alimentación');
      if (codigos(r, 'transporte')[0] === 'si') dominios.push('transporte');
      if (codigos(r, 'servicios')[0] === 'si') dominios.push('servicios');
      const seguridad = suma(clave, r, ['seguridad-1', 'seguridad-2', 'seguridad-3', 'seguridad-4']);
      if (seguridad >= 11) dominios.push('seguridad');
      const positivo = dominios.length > 0;
      return {
        clave,
        puntaje: dominios.length,
        detalle: positivo ? `Necesidades: ${dominios.join(', ')}` : 'Sin necesidades identificadas',
        positivo,
        condiciones: positivo ? ['ahc-necesidades'] : [],
      };
    }
    case 'potenciadores': {
      const marcados = codigos(r, 'pot').filter((c) => c !== 'ninguno');
      const condiciones = new Set<Condicion>();
      if (marcados.length > 0) condiciones.add('potenciadores');
      for (const code of marcados) {
        const opcion = POTENCIADORES.find((o) => o.code === code);
        if (opcion?.condicion) condiciones.add(opcion.condicion);
      }
      const nombres = marcados.map((code) => POTENCIADORES.find((o) => o.code === code)?.display.split(' (')[0] ?? code);
      return {
        clave,
        puntaje: marcados.length,
        detalle: marcados.length ? `${marcados.length}: ${nombres.join(', ')}` : 'Sin potenciadores',
        positivo: marcados.length > 0,
        condiciones: [...condiciones],
      };
    }
    case 'reconciliacion': {
      const clases = codigos(r, 'clases').filter((c) => c !== 'ninguna');
      const cantidad = entero(r, 'cantidad');
      const condiciones = new Set<Condicion>();
      for (const code of clases) {
        const opcion = CLASES_MEDICACION.find((o) => o.code === code);
        if (opcion?.condicion) condiciones.add(opcion.condicion);
      }
      if (cantidad !== undefined && cantidad >= 5) condiciones.add('polifarmacia');
      if (codigos(r, 'automonitoreo')[0] === 'si') condiciones.add('automonitoreo-glucemia');
      const partes = [`${clases.length} ${clases.length === 1 ? 'clase' : 'clases'}`];
      if (cantidad !== undefined) partes.push(`${cantidad} fármacos${cantidad >= 5 ? ' (polifarmacia)' : ''}`);
      return { clave, puntaje: cantidad, detalle: partes.join(' · '), positivo: condiciones.size > 0, condiciones: [...condiciones] };
    }
  }
}

/** A qué instrumento responde una `QuestionnaireResponse` (por la URL, en cualquier base aceptada). */
export function instrumentoDeRespuesta(r: QuestionnaireResponse): ClaveInstrumento | undefined {
  const url = r.questionnaire?.split('|')[0];
  return CLAVES_INSTRUMENTO.find((clave) => coincide(url, INSTRUMENTOS_EQUIPO[clave]));
}

export interface UltimoInstrumento {
  respuesta: QuestionnaireResponse;
  resultado: ResultadoInstrumento;
  fecha?: string;
}

/** La última respuesta de un instrumento y su resultado. */
export function ultimoResultadoInstrumento(clave: ClaveInstrumento, respuestas: QuestionnaireResponse[], hasta?: string): UltimoInstrumento | undefined {
  const respuesta = ultimaRespuesta(respuestas, INSTRUMENTOS_EQUIPO[clave], hasta);
  if (!respuesta) return undefined;
  const fecha = respuesta.authored ?? respuesta.meta?.lastUpdated;
  return { respuesta, resultado: puntuarInstrumento(clave, respuesta), ...(fecha ? { fecha } : {}) };
}

/** Las condiciones del catálogo que derivan de la última respuesta de cada instrumento. */
export function condicionesDesdeInstrumentos(respuestas: QuestionnaireResponse[], hasta?: string): Condicion[] {
  const out = new Set<Condicion>();
  for (const clave of CLAVES_INSTRUMENTO) {
    for (const c of ultimoResultadoInstrumento(clave, respuestas, hasta)?.resultado.condiciones ?? []) out.add(c);
  }
  return [...out];
}
