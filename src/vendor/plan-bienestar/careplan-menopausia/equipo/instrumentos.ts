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
 *
 * Los tres últimos (ECG, clase funcional y síntomas) no son escalas sino registros
 * clínicos estructurados: las evaluaciones del catálogo que no tienen un código LOINC
 * verificado (E4-EVAL-03, E4-EVAL-06, E3-EVAL-11 y E4-EVAL-11) se cargan así, con
 * opciones cerradas y sin inventar códigos. Registran el dato del control y no derivan
 * condiciones: una fibrilación auricular en el ECG o un síntoma nuevo los registra el
 * equipo como condición o como evento, porque cambian el plan (8.5 de
 * `docs/plan-bienestar-ckm-items.md`).
 */
export type ClaveInstrumento =
  | 'stopBang'
  | 'psicologico'
  | 'ahcHrsn'
  | 'potenciadores'
  | 'reconciliacion'
  | 'ecg'
  | 'claseFuncional'
  | 'sintomas'
  | 'ecografiaHepatica';

/** Sufijos (bajo cualquier base aceptada) con que el día 0 y los detectores reconocen cada instrumento. */
export const INSTRUMENTOS_EQUIPO: Record<ClaveInstrumento, string> = {
  stopBang: 'Questionnaire/pb100d-stop-bang-v1',
  psicologico: 'Questionnaire/pb100d-phq2-gad2-pss4-v1',
  ahcHrsn: 'Questionnaire/pb100d-ahc-hrsn-v1',
  potenciadores: 'Questionnaire/pb100d-potenciadores-v1',
  reconciliacion: 'Questionnaire/pb100d-reconciliacion-medicacion-v1',
  ecg: 'Questionnaire/pb100d-ecg-v1',
  claseFuncional: 'Questionnaire/pb100d-clase-funcional-v1',
  sintomas: 'Questionnaire/pb100d-sintomas-cv-v1',
  ecografiaHepatica: 'Questionnaire/pb100d-ecografia-hepatica-v1',
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
  tipo: 'choice' | 'integer' | 'date';
  opciones?: readonly OpcionInstrumento[];
  /** Varias opciones a la vez: el formulario las muestra como casillas, no como radio. */
  multiple?: boolean;
  /**
   * Obligatoria en el `Questionnaire`. El formulario de Medplum la hace cumplir en los
   * radios y los campos; en las casillas sólo la marca. Lo que llega vacío igual lo ve el
   * día 0 (`registroConDato`).
   */
  requerida?: boolean;
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

/** Ritmo del ECG. Cualquiera que no sea sinusal hace el ECG «con alteraciones». */
const RITMO_ECG: readonly OpcionInstrumento[] = [
  { code: 'sinusal', display: 'Sinusal' },
  { code: 'fa', display: 'Fibrilación o aleteo auricular' },
  { code: 'marcapasos', display: 'Ritmo de marcapasos' },
  { code: 'otro', display: 'Otro ritmo' },
];
const HALLAZGOS_ECG: readonly OpcionInstrumento[] = [
  { code: 'q', display: 'Ondas Q patológicas' },
  { code: 'hvi', display: 'Hipertrofia ventricular izquierda' },
  { code: 'bri', display: 'Bloqueo de rama izquierda' },
  { code: 'brd', display: 'Bloqueo de rama derecha' },
  { code: 'bav', display: 'Bloqueo auriculoventricular' },
  { code: 'st-t', display: 'Alteraciones del ST o de la onda T' },
  { code: 'qtc', display: 'QTc prolongado' },
  { code: 'otro', display: 'Otra alteración' },
  { code: 'ninguno', display: 'Ninguno de estos hallazgos' },
];
/** Clase funcional de la New York Heart Association; el valor es la clase. */
const CLASE_NYHA: readonly OpcionInstrumento[] = [
  { code: 'nyha-1', display: 'Clase I: sin limitación; la actividad habitual no le da cansancio, falta de aire ni palpitaciones', valor: 1 },
  { code: 'nyha-2', display: 'Clase II: limitación leve; bien en reposo, la actividad habitual le da síntomas', valor: 2 },
  { code: 'nyha-3', display: 'Clase III: limitación marcada; bien en reposo, una actividad menor que la habitual le da síntomas', valor: 3 },
  { code: 'nyha-4', display: 'Clase IV: síntomas con cualquier actividad o en reposo', valor: 4 },
];
/** Los síntomas de E3-EVAL-11 y E4-EVAL-11, en una sola lista. */
const SINTOMAS_CV: readonly OpcionInstrumento[] = [
  { code: 'angina', display: 'Angina: dolor u opresión en el pecho' },
  { code: 'disnea', display: 'Disnea: falta de aire mayor que la habitual' },
  { code: 'palpitaciones', display: 'Palpitaciones' },
  { code: 'sincope', display: 'Síncope o presíncope' },
  { code: 'claudicacion', display: 'Claudicación: dolor en las piernas al caminar que se va con el reposo' },
  { code: 'neurologico', display: 'Déficit neurológico: pérdida de fuerza, de sensibilidad, del habla o de la visión, aunque se haya ido' },
  { code: 'ninguno', display: 'Ninguno' },
];

/** Grado de esteatosis hepática que informa la ecografía abdominal (`valor` = grado; sin valor, no evaluable). */
const ESTEATOSIS_ECOGRAFIA: readonly OpcionInstrumento[] = [
  { code: 'no', display: 'Sin esteatosis', valor: 0 },
  { code: 'leve', display: 'Esteatosis leve (grado 1)', valor: 1 },
  { code: 'moderada', display: 'Esteatosis moderada (grado 2)', valor: 2 },
  { code: 'severa', display: 'Esteatosis severa (grado 3)', valor: 3 },
  { code: 'no-evaluable', display: 'No evaluable' },
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
  ecg: def({
    clave: 'ecg',
    version: '1.0',
    nombre: 'PB100DEcg',
    titulo: 'ECG de 12 derivaciones',
    descripcion:
      'Ritmo y hallazgos del ECG. Si el ECG no es de hoy (por ejemplo, uno que trae la persona), se carga su fecha: es la que cuenta para el control. Un hallazgo nuevo (por ejemplo, fibrilación auricular) se registra además como condición del catálogo.',
    fuente: 'Catálogo PB100D, estadío 4 (E4-EVAL-03: días 0 y 100, después anual o por síntomas)',
    preguntas: [
      { linkId: 'ecg-fecha', text: 'Fecha del ECG, si no es de hoy', tipo: 'date' },
      { linkId: 'ecg-ritmo', text: 'Ritmo', tipo: 'choice', opciones: RITMO_ECG, requerida: true },
      { linkId: 'ecg-hallazgos', text: 'Hallazgos', tipo: 'choice', multiple: true, opciones: HALLAZGOS_ECG, requerida: true },
    ],
  }),
  claseFuncional: def({
    clave: 'claseFuncional',
    version: '1.0',
    nombre: 'PB100DClaseFuncional',
    titulo: 'Clase funcional NYHA y marcha de 6 minutos',
    descripcion:
      'En insuficiencia cardíaca: la clase NYHA y los metros de la marcha de 6 minutos. En arteriopatía periférica: los metros hasta la claudicación. Se carga lo que se midió; la meta es la misma clase o mejor, 30 m o más en la marcha, o más metros hasta la claudicación.',
    fuente: 'Guía IC 2022; Guía CKM 2026, Tabla 40 (E4-EVAL-06 y meta E4-META-08)',
    preguntas: [
      { linkId: 'nyha', text: 'Clase funcional NYHA', tipo: 'choice', opciones: CLASE_NYHA },
      { linkId: 'marcha-6m', text: 'Marcha de 6 minutos: metros recorridos', tipo: 'integer' },
      { linkId: 'claudicacion-m', text: 'Metros caminados hasta la claudicación', tipo: 'integer' },
    ],
  }),
  sintomas: def({
    clave: 'sintomas',
    version: '1.0',
    nombre: 'PB100DSintomasCardiovasculares',
    titulo: 'Síntomas cardiovasculares',
    descripcion:
      'Los síntomas desde el último control, en cada contacto. Un síntoma nuevo o que empeoró se registra además como evento («Síntomas nuevos»): este registro no lo activa solo.',
    fuente: 'Guía CKM 2026, Sección 6 (E3-EVAL-11 y E4-EVAL-11: cada contacto)',
    preguntas: [
      { linkId: 'sintomas', text: 'Síntomas desde el último control', tipo: 'choice', multiple: true, opciones: SINTOMAS_CV, requerida: true },
      { linkId: 'sintomas-nuevos', text: '¿Alguno es nuevo o empeoró desde el último control?', tipo: 'choice', opciones: SI_NO },
    ],
  }),
  ecografiaHepatica: def({
    clave: 'ecografiaHepatica',
    version: '1.0',
    nombre: 'PB100DEcografiaHepatica',
    titulo: 'Ecografía abdominal: hígado graso',
    descripcion:
      'Si la ecografía abdominal informa esteatosis hepática (hígado graso) y su grado. Se carga la fecha del estudio: la que cuenta es la del informe. Es el criterio de grasa hepática del fenotipo metabólico de la obesidad.',
    fuente:
      'Hoja de firma médica, 30/10/2026 (F2): reemplaza la resonancia del criterio de Smith GI y Klein S, Nature Medicine 2026, Box 1',
    preguntas: [
      { linkId: 'eco-fecha', text: 'Fecha de la ecografía, si no es de hoy', tipo: 'date' },
      { linkId: 'eco-esteatosis', text: 'Esteatosis hepática (hígado graso)', tipo: 'choice', opciones: ESTEATOSIS_ECOGRAFIA, requerida: true },
    ],
  }),
});

export const CLAVES_INSTRUMENTO: readonly ClaveInstrumento[] = Object.freeze([
  'stopBang',
  'psicologico',
  'ahcHrsn',
  'potenciadores',
  'reconciliacion',
  'ecg',
  'claseFuncional',
  'sintomas',
  'ecografiaHepatica',
]);

/** `Questionnaire.url|version`, lo que guarda cada respuesta. */
export function referenciaInstrumento(clave: ClaveInstrumento): string {
  const d = INSTRUMENTOS[clave];
  return `${d.url}|${d.version}`;
}

/** Extensión estándar que le dice al formulario qué control usar. */
const ITEM_CONTROL_URL = 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl';

function itemDePregunta(p: PreguntaInstrumento): QuestionnaireItem {
  const item: QuestionnaireItem = { linkId: p.linkId, text: p.text, type: p.tipo };
  if (p.requerida) item.required = true;
  if (p.tipo === 'choice') {
    item.answerOption = (p.opciones ?? []).map((o) => ({ valueCoding: { system: SYSTEM_INSTRUMENTOS, code: o.code, display: o.display } }));
    if (p.multiple) {
      // `repeats` solo no alcanza: el formulario de Medplum dibuja un `choice` como radio
      // (una sola respuesta) salvo que el ítem pida casillas.
      item.repeats = true;
      item.extension = [
        { url: ITEM_CONTROL_URL, valueCodeableConcept: { coding: [{ system: 'http://hl7.org/fhir/questionnaire-item-control', code: 'check-box' }] } },
      ];
    }
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

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Una fecha completa (`AAAA-MM-DD`); lo demás (un campo borrado deja '') no es fecha. */
function fecha(r: QuestionnaireResponse, linkId: string): string | undefined {
  const valor = respuestas(r, linkId)[0]?.valueDate;
  return valor && FECHA_ISO.test(valor) ? valor : undefined;
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
    case 'ecg': {
      const ritmo = codigos(r, 'ecg-ritmo')[0];
      const respondidos = codigos(r, 'ecg-hallazgos');
      const hallazgos = respondidos.filter((c) => c !== 'ninguno');
      const nombreRitmo = RITMO_ECG.find((o) => o.code === ritmo)?.display;
      const nombres = hallazgos.map((code) => HALLAZGOS_ECG.find((o) => o.code === code)?.display ?? code);
      const alterado = (ritmo !== undefined && ritmo !== 'sinusal') || hallazgos.length > 0;
      // «Sin alteraciones» sólo si se marcó «ninguno» con ritmo sinusal: no responder no es normal,
      // y un ritmo no sinusal ya es una alteración.
      const sinHallazgos = !respondidos.includes('ninguno')
        ? 'hallazgos sin cargar'
        : ritmo === 'sinusal'
          ? 'sin alteraciones'
          : ritmo === undefined
            ? 'sin hallazgos'
            : 'sin otros hallazgos';
      const partes = [nombreRitmo ?? 'Ritmo sin cargar', nombres.length ? nombres.join(', ') : sinHallazgos];
      return { clave, puntaje: hallazgos.length, detalle: partes.join(' · '), positivo: alterado, condiciones: [] };
    }
    case 'claseFuncional': {
      const nyha = valorDe(pregunta(clave, 'nyha'), r);
      const marcha = entero(r, 'marcha-6m');
      const claudicacion = entero(r, 'claudicacion-m');
      const partes: string[] = [];
      if (nyha !== undefined) partes.push(`NYHA ${['I', 'II', 'III', 'IV'][nyha - 1]}`);
      if (marcha !== undefined) partes.push(`${marcha} m en 6 minutos`);
      if (claudicacion !== undefined) partes.push(`claudicación a los ${claudicacion} m`);
      return {
        clave,
        ...(nyha !== undefined ? { puntaje: nyha } : {}),
        detalle: partes.length ? partes.join(' · ') : 'Sin datos',
        positivo: nyha !== undefined && nyha >= 3,
        condiciones: [],
      };
    }
    case 'ecografiaHepatica': {
      const codigo = codigos(r, 'eco-esteatosis')[0];
      const grado = valorDe(pregunta(clave, 'eco-esteatosis'), r);
      const nombre = ESTEATOSIS_ECOGRAFIA.find((o) => o.code === codigo)?.display ?? 'Esteatosis sin cargar';
      return {
        clave,
        ...(grado !== undefined ? { puntaje: grado } : {}),
        detalle: nombre,
        positivo: grado !== undefined && grado >= 1,
        condiciones: [],
      };
    }
    case 'sintomas': {
      const respondidos = codigos(r, 'sintomas');
      const marcados = respondidos.filter((c) => c !== 'ninguno');
      const nombres = marcados.map((code) => SINTOMAS_CV.find((o) => o.code === code)?.display.split(':')[0] ?? code);
      const nuevos = codigos(r, 'sintomas-nuevos')[0] === 'si';
      // Un «sí, algo nuevo o peor» se muestra aunque no esté en la lista (edema, fatiga…).
      const lista = marcados.length ? nombres.join(', ') : !respondidos.length ? 'Síntomas sin cargar' : nuevos ? 'Ninguno de la lista' : 'Sin síntomas';
      const detalle = `${lista}${nuevos ? ' · alguno nuevo o peor' : ''}`;
      return { clave, puntaje: marcados.length, detalle, positivo: marcados.length > 0 || nuevos, condiciones: [] };
    }
  }
}

/**
 * Qué trae el dato en la respuesta de un registro clínico, dicho como dato y no como
 * código, para que Recepción lo evalúe igual con su propio motor (`exportar:instrumentos`
 * lo exporta como `REGISTROS_PB100D`).
 *
 * - `conDato`: basta con una de estas preguntas respondida; si dice `codigos`, con alguno
 *   de ellos. En síntomas, un «sí, algo nuevo o peor» es un dato aunque la lista quede
 *   sin marcar; un «no» solo, no.
 * - `fecha`: la pregunta con la fecha del estudio, si el registro la tiene (el ECG que
 *   trae la persona). Vale si es una fecha completa y no es posterior a la carga.
 */
export interface DatoDeRegistro {
  conDato: ReadonlyArray<{ linkId: string; codigos?: readonly string[] }>;
  fecha?: string;
}

export const DATO_DE_REGISTRO: Readonly<Partial<Record<ClaveInstrumento, DatoDeRegistro>>> = Object.freeze({
  ecg: { conDato: [{ linkId: 'ecg-ritmo' }, { linkId: 'ecg-hallazgos' }], fecha: 'ecg-fecha' },
  claseFuncional: { conDato: [{ linkId: 'nyha' }, { linkId: 'marcha-6m' }, { linkId: 'claudicacion-m' }] },
  sintomas: { conDato: [{ linkId: 'sintomas' }, { linkId: 'sintomas-nuevos', codigos: ['si'] }] },
  ecografiaHepatica: { conDato: [{ linkId: 'eco-esteatosis' }], fecha: 'eco-fecha' },
});

/** Si la pregunta tiene alguna respuesta con valor (y, si se piden códigos, con alguno de ellos). */
function respondida(r: QuestionnaireResponse, linkId: string, codigosValidos?: readonly string[]): boolean {
  return respuestas(r, linkId).some((a) => {
    if (codigosValidos) {
      const code = a.valueCoding?.code ?? a.valueString;
      return code !== undefined && codigosValidos.includes(code);
    }
    return Object.entries(a).some(([k, v]) => k.startsWith('value') && v !== undefined && v !== null && v !== '');
  });
}

/**
 * Si la respuesta de un registro clínico trae el dato. El formulario exige lo principal,
 * pero una respuesta puede llegar vacía por otro camino (la API, Recepción) y no tiene
 * que contar como cargada. Las escalas no cambian: siguen contando por existir.
 */
export function registroConDato(clave: ClaveInstrumento, r: QuestionnaireResponse): boolean {
  const dato = DATO_DE_REGISTRO[clave];
  if (!dato) return true;
  return dato.conDato.some((p) => respondida(r, p.linkId, p.codigos));
}

/**
 * La fecha clínica de la respuesta: la del estudio si se cargó (un ECG que trae la
 * persona), si no la de la carga.
 */
export function fechaDeRespuesta(r: QuestionnaireResponse): string | undefined {
  const carga = r.authored ?? r.meta?.lastUpdated;
  const clave = instrumentoDeRespuesta(r);
  const linkIdFecha = clave ? DATO_DE_REGISTRO[clave]?.fecha : undefined;
  const estudio = linkIdFecha ? fecha(r, linkIdFecha) : undefined;
  if (!estudio) return carga;
  // Un estudio no puede ser posterior a su carga: una fecha futura es un error de tipeo.
  return carga && estudio > carga.slice(0, 10) ? carga : estudio;
}

/**
 * La última respuesta de un instrumento. En los registros con fecha del estudio (el ECG) manda esa fecha: un ECG
 * viejo que se carga hoy no tapa uno más nuevo (a igual fecha, gana la carga más
 * reciente, que es la corrección). Para los demás es `ultimaRespuesta`, sin cambios.
 */
export function ultimaRespuestaInstrumento(respuestas: QuestionnaireResponse[], sufijo: string, hasta?: string): QuestionnaireResponse | undefined {
  const clave = CLAVES_INSTRUMENTO.find((c) => INSTRUMENTOS_EQUIPO[c] === sufijo);
  if (!clave || !DATO_DE_REGISTRO[clave]?.fecha) return ultimaRespuesta(respuestas, sufijo, hasta);
  let mejor: { r: QuestionnaireResponse; fecha: string; carga: string } | undefined;
  for (const r of respuestas) {
    // Los mismos filtros que `ultimaRespuesta` (estado, URL, `hasta`), de a una.
    if (!ultimaRespuesta([r], sufijo, hasta)) continue;
    const candidata = { r, fecha: (fechaDeRespuesta(r) ?? '').slice(0, 10), carga: r.authored ?? r.meta?.lastUpdated ?? '' };
    if (!mejor || candidata.fecha > mejor.fecha || (candidata.fecha === mejor.fecha && candidata.carga >= mejor.carga)) mejor = candidata;
  }
  return mejor?.r;
}

const tieneValor = (a: QuestionnaireResponseItemAnswer): boolean =>
  Object.entries(a).some(([k, v]) => k.startsWith('value') && v !== undefined && v !== null && v !== '');

function limpiarItems(items: QuestionnaireResponseItem[] | undefined): QuestionnaireResponseItem[] {
  return (items ?? []).flatMap((item) => {
    const { answer, item: hijos, ...resto } = item;
    const respuestasConValor = (answer ?? []).filter(tieneValor);
    const hijosConValor = limpiarItems(hijos);
    if (!respuestasConValor.length && !hijosConValor.length) return [];
    return [{ ...resto, ...(respuestasConValor.length ? { answer: respuestasConValor } : {}), ...(hijosConValor.length ? { item: hijosConValor } : {}) }];
  });
}

/**
 * La respuesta sin lo vacío, antes de guardarla. Una casilla que se tilda y se destilda
 * deja `answer: [{}]` y una fecha borrada `valueDate: ''`: el validador de FHIR rechaza
 * las dos cosas. Se sacan esas respuestas y los ítems que quedan sin ninguna.
 */
export function limpiarRespuesta(r: QuestionnaireResponse): QuestionnaireResponse {
  const { item, ...resto } = r;
  const items = limpiarItems(item);
  return items.length ? { ...resto, item: items } : resto;
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
  const respuesta = ultimaRespuestaInstrumento(respuestas, INSTRUMENTOS_EQUIPO[clave], hasta);
  if (!respuesta) return undefined;
  const cuando = fechaDeRespuesta(respuesta);
  return { respuesta, resultado: puntuarInstrumento(clave, respuesta), ...(cuando ? { fecha: cuando } : {}) };
}

/** Las condiciones del catálogo que derivan de la última respuesta de cada instrumento. */
export function condicionesDesdeInstrumentos(respuestas: QuestionnaireResponse[], hasta?: string): Condicion[] {
  const out = new Set<Condicion>();
  for (const clave of CLAVES_INSTRUMENTO) {
    for (const c of ultimoResultadoInstrumento(clave, respuestas, hasta)?.resultado.condiciones ?? []) out.add(c);
  }
  return [...out];
}
