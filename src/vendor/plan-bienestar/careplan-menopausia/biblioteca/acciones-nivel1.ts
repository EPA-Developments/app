import { BIBLIOTECA_C_BIS } from './acciones-c-bis.js';

/**
 * Anexo C — Biblioteca de Acciones, Nivel 1 (biblioteca CERRADA).
 *
 * 40 acciones atómicas, cuantitativas y graduables para el Plan Bienestar
 * 100 Días. Población original: mujeres en peri/menopausia con resistencia a la
 * insulina, con o sin tratamiento GLP-1. El Anexo C bis (`acciones-c-bis.ts`)
 * suma 40 acciones neutras para adultos de 30 a 79 años por estadío CKM.
 *
 * POR QUÉ ESTE ARCHIVO EXISTE
 * ---------------------------
 * La IA **no redacta acciones**: elige códigos de esta biblioteca y escribe el
 * "por qué" personalizado. El médico aprueba. Esta separación es una decisión
 * clínica del proyecto, no un detalle de implementación:
 *
 *   - lo que la paciente puede recibir     -> esta biblioteca (revisada por el médico)
 *   - qué se le indica a ella en concreto  -> la IA propone, el médico publica
 *   - dosis / inicio / suspensión de GLP-1 -> NUNCA la IA (ver `mencionaDosificacionGlp1`)
 *
 * Cualquier código fuera de esta lista se rechaza antes de tocar FHIR
 * (`validarSeleccion`). Un modelo que alucina un código no llega a la paciente.
 *
 * SIN DEPENDENCIAS EXTERNAS A PROPÓSITO
 * -------------------------------------
 * Esta carpeta no importa nada de afuera. Es la fuente de verdad del monorepo y
 * se copia tal cual a los repos que la consumen (dashboard genera y revisa; el
 * portal muestra). Dos archivos (Anexo C y C bis) = un solo paso de
 * sincronización, y los textos que ve la persona no pueden divergir de los
 * códigos que elige la IA.
 *
 * CÓMO SE ACTIVA UNA ACCIÓN
 * -------------------------
 * `activadaPor` es "alguna de": señales del cuestionario baseline, flags
 * clínicos, el estadío CKM validado (`estadio:2`) o condiciones del catálogo
 * firmado que registra el equipo (`condicion:hta`). `requiere` es "todas": una
 * acción de seguridad con SGLT2i sólo aparece con SGLT2i; las de piso pélvico y
 * sofocos sólo con menopausia registrada. Un perfil sin estadío ni condiciones
 * es el perfil original del Anexo C (mujer en menopausia) y se trata como tal.
 *
 * Fuente: "ANEXO C: Biblioteca de Acciones Borrador - Nivel 1", Plan Bienestar
 * 100 Días. Marcos: Transtheoretical Model (etapas de cambio) y autoeficacia.
 */

// ---------------------------------------------------------------------------
// Vocabulario
// ---------------------------------------------------------------------------

/** Los pilares en que se agrupan las acciones: 4 del Anexo C y 4 del C bis. */
export type Pilar =
  | 'nutricion-glp1'
  | 'osteomuscular-movimiento'
  | 'sueno-termorregulacion'
  | 'conducta-adherencia'
  | 'presion-corazon'
  | 'medicacion-seguridad'
  | 'tabaco-alcohol'
  | 'medicion-registro';

export const PILARES: Record<Pilar, { nombre: string; emoji: string }> = {
  'nutricion-glp1': { nombre: 'Nutrición, digestión y tolerancia', emoji: '🥗' },
  'osteomuscular-movimiento': { nombre: 'Huesos, piso pélvico y movimiento', emoji: '🦴' },
  'sueno-termorregulacion': { nombre: 'Sueño, sofocos y descanso', emoji: '🌙' },
  'conducta-adherencia': { nombre: 'Organización y sostén', emoji: '🧭' },
  'presion-corazon': { nombre: 'Presión, corazón y señales de alarma', emoji: '🫀' },
  'medicacion-seguridad': { nombre: 'Remedios y días de enfermedad', emoji: '💊' },
  'tabaco-alcohol': { nombre: 'Tabaco y alcohol', emoji: '🚭' },
  'medicion-registro': { nombre: 'Medir y registrar', emoji: '📏' },
};

/** Anexo del que sale cada acción: el C original o el C bis ampliado. */
export type Anexo = 'C' | 'C-bis';

/** Estadío CKM validado por el médico, como lo escribe el catálogo. */
export type EstadioBiblioteca = '0' | '1' | '2' | '3' | '4';

/**
 * Señales que derivan del catálogo firmado, no del cuestionario: el estadío
 * validado (`estadio:2`) y las condiciones registradas por el equipo
 * (`condicion:hta`, `condicion:toma-sglt2i`, `condicion:menopausia`). Los códigos
 * de condición son los de `CONDICIONES` del catálogo; un test lo verifica.
 */
export type SenalCatalogo = `condicion:${string}` | `estadio:${EstadioBiblioteca}`;

/**
 * Señales que **habilitan** acciones.
 *
 * Casi todas se auto-reportan en el cuestionario baseline: sirven para elegir
 * entre acciones seguras, nunca para levantar una contraindicación. Para eso
 * están los `Flag`.
 *
 * Es un array y no sólo un tipo porque hace falta recorrerlas en tiempo de
 * ejecución: el cuestionario baseline tiene un test que verifica que produce
 * todas, así una señal nueva en la biblioteca no queda sin pregunta que la active.
 */
export const SENALES = [
  // Etapa de cambio (Transtheoretical Model)
  'etapa:contemplacion',
  'etapa:preparacion',
  'etapa:accion',
  // Autoeficacia
  'autoeficacia:baja',
  'autoeficacia:media',
  'autoeficacia:fisica-baja',
  // Digestivo / tolerancia
  'barrera:nauseas',
  'barrera:nauseas-leves',
  'barrera:estrenimiento',
  'barrera:reflujo',
  'barrera:saciedad-precoz',
  'barrera:inapetencia',
  'barrera:ingesta-rapida',
  'barrera:perdida-muscular',
  // Piso pélvico y movimiento
  'barrera:incontinencia-leve',
  'barrera:temor-caidas',
  'barrera:dolor-articular',
  'barrera:sedentarismo',
  // Sueño y termorregulación
  'barrera:sofocos-nocturnos',
  'barrera:sofocos-conciliacion',
  'barrera:despertares-precoces',
  'barrera:pantallas-nocturnas',
  'barrera:fatiga-matutina',
  'barrera:ansiedad-nocturna',
  'barrera:alcohol-picante',
  'barrera:horarios-irregulares',
  // Conducta y adherencia
  'barrera:falta-de-tiempo',
  'barrera:imprevistos',
  'barrera:ingesta-emocional',
  'barrera:olvidos',
  'barrera:frustracion-peso',
  'barrera:ingesta-impulsiva',
  'clinico:estres-elevado',
  // Clínico: no sale del cuestionario
  'clinico:resistencia-insulina',
  // Preferencias
  'preferencia:alta-proteina',
  'preferencia:remedios-naturales',
  'preferencia:apoyo-social',
] as const;

export type Senal = (typeof SENALES)[number];

/**
 * Señales que **no** se preguntan: derivan de datos clínicos.
 *
 * La resistencia a la insulina sale del laboratorio (HOMA-IR, triglicéridos,
 * HDL, HbA1c), no de lo que la paciente perciba. El cuestionario no tiene por
 * qué cubrirlas, y el test de cobertura las excluye.
 */
export const SENALES_CLINICAS: readonly Senal[] = Object.freeze(['clinico:resistencia-insulina']);

/**
 * Hallazgos **clínicos** que contraindican o fuerzan acciones.
 *
 * A diferencia de las `Senal`, un `Flag` lo carga el equipo tratante (no la
 * paciente): decide seguridad, no preferencia.
 */
export type Flag = 'flag:caidas-recientes' | 'flag:densitometria-alterada' | 'flag:incontinencia-frecuente';

/** Todo lo que puede habilitar o exigir una acción. */
export type Activador = Senal | Flag | SenalCatalogo;

export type CodigoAccion =
  // Anexo C
  | 'N01' | 'N02' | 'N03' | 'N04' | 'N05' | 'N06' | 'N07' | 'N08' | 'N09' | 'N10'
  | 'A01' | 'A02' | 'A03' | 'A04' | 'A05' | 'A06' | 'A07' | 'A08' | 'A09' | 'A10'
  | 'S01' | 'S02' | 'S03' | 'S04' | 'S05' | 'S06' | 'S07' | 'S08' | 'S09' | 'S10'
  | 'C01' | 'C02' | 'C03' | 'C04' | 'C05' | 'C06' | 'C07' | 'C08' | 'C09' | 'C10'
  // Anexo C bis
  | 'N11' | 'N12' | 'N13' | 'N14' | 'N15' | 'N16' | 'N17'
  | 'A11' | 'A12' | 'A13' | 'A14' | 'A15' | 'A16' | 'A17'
  | 'S11' | 'S12'
  | 'C11' | 'C12' | 'C13' | 'C14' | 'C15'
  | 'P01' | 'P02' | 'P03' | 'P04' | 'P05' | 'P06'
  | 'M01' | 'M02' | 'M03' | 'M04' | 'M05' | 'M06' | 'M07' | 'M08'
  | 'T01' | 'T02' | 'T03'
  | 'R01' | 'R02';

/** A quién deriva una acción que no es autogestionable. */
export type DerivacionAccion =
  | 'kinesiologia-pelviperineal'
  | 'kinesiologia'
  | 'rehabilitacion-cardiovascular'
  | 'cesacion-tabaquica'
  | 'nutricion';

export interface Accion {
  codigo: CodigoAccion;
  anexo: Anexo;
  pilar: Pilar;
  /** Nombre corto. Lo ve la persona. */
  nombre: string;
  /** Qué hace, en concreto y cuantificado. Lo ve la persona. */
  practica: string;
  /** Racional clínico y fisiológico. Lo lee el equipo, no la persona. */
  racional: string;
  /** Señales, flags, estadío o condiciones que la habilitan (alguna de). Vacío = disponible para todas. */
  activadaPor: Activador[];
  /** Activadores que deben estar todos presentes, además de `activadaPor`. */
  requiere?: Activador[];
  /** Flags que la contraindican. Gana siempre sobre `activadaPor`. */
  contraindicadaPor?: Flag[];
  /** Sólo tiene sentido bajo tratamiento GLP-1 activo. */
  requiereGlp1?: boolean;
  /** Deriva a un profesional: no es autogestionable. */
  derivaA?: DerivacionAccion;
  /** Genera un registro que el equipo lee en el seguimiento (check-ins). */
  generaRegistro?: boolean;
  /** Ítems del catálogo firmado (`E2-HTA-01`) que esta acción operacionaliza. */
  items?: string[];
}

/** Las acciones del Anexo C se escriben sin `anexo`; se les estampa al armar la biblioteca. */
type AccionAnexoC = Omit<Accion, 'anexo'>;

// ---------------------------------------------------------------------------
// Pilar 1 — Nutrición, digestión y tolerancia GLP-1 (N01-N10)
// ---------------------------------------------------------------------------

const NUTRICION: AccionAnexoC[] = [
  {
    codigo: 'N01',
    pilar: 'nutricion-glp1',
    nombre: 'Proteína primero',
    practica:
      'Consumir la porción proteica (huevo, pollo, tofu, pescado, yogur griego) antes que los carbohidratos o ' +
      'verduras en las 3 comidas principales.',
    racional:
      'Previene la pérdida de masa magra (sarcopenia) potenciada por GLP-1 y optimiza la saciedad basándose en la ' +
      'densidad de aminoácidos.',
    activadaPor: ['preferencia:alta-proteina', 'barrera:perdida-muscular'],
  },
  {
    codigo: 'N02',
    pilar: 'nutricion-glp1',
    nombre: 'Porciones mínimas en días off',
    practica:
      'Dividir las comidas en 5-6 micro-porciones del tamaño de la palma de la mano durante los días con náuseas ' +
      'post-dosis.',
    racional:
      'Reduce el volumen e impacto del vaciamiento gástrico retrasado característico de análogos de GLP-1, ' +
      'previniendo emesis y distensión.',
    activadaPor: ['barrera:nauseas'],
    requiereGlp1: true,
  },
  {
    codigo: 'N03',
    pilar: 'nutricion-glp1',
    nombre: 'Hidratación gradual',
    practica:
      'Tomar 2,5 litros de agua al día distribuidos en pequeños sorbos cada 30 minutos (evitar grandes volúmenes ' +
      'durante las comidas).',
    racional:
      'Mantiene el volumen intravascular, previene el estreñimiento por tránsito lento y evita la plenitud gástrica ' +
      'excesiva pre-prandial.',
    activadaPor: ['barrera:estrenimiento', 'barrera:saciedad-precoz'],
  },
  {
    codigo: 'N04',
    pilar: 'nutricion-glp1',
    nombre: 'Cena temprana y ligera',
    practica:
      'Concluir la última ingesta sólida al menos 3 horas antes de acostarse, priorizando alimentos de fácil digestión.',
    racional:
      'Mitiga el reflujo gastroesofágico y la pirosis nocturna agravados por el retardo del vaciamiento gástrico de GLP-1.',
    activadaPor: ['barrera:reflujo'],
  },
  {
    codigo: 'N05',
    pilar: 'nutricion-glp1',
    nombre: 'Pausa de masticación guiada',
    practica:
      'Apoyar los cubiertos en la mesa entre cada bocado y masticar cada porción al menos 20 veces antes de tragar.',
    racional:
      'Permite la señalización vagal de saciedad a tiempo, evitando la ingesta masiva involuntaria que genera ' +
      'malestar e intolerancia a GLP-1.',
    activadaPor: ['autoeficacia:baja', 'barrera:ingesta-rapida'],
  },
  {
    codigo: 'N06',
    pilar: 'nutricion-glp1',
    nombre: 'Fibra soluble progresiva',
    practica:
      'Incorporar 1 cucharada de psyllium husk o semillas de chía hidratadas en el desayuno con abundante agua.',
    racional:
      'Regulariza el tránsito intestinal y promueve la producción de ácidos grasos de cadena corta (AGCC) ' +
      'estimulando la microbiota.',
    activadaPor: ['barrera:estrenimiento'],
  },
  {
    codigo: 'N07',
    pilar: 'nutricion-glp1',
    nombre: 'Batido proteico de rescate',
    practica:
      'Utilizar un batido de proteína de suero aislado o vegetal (20-25 g de proteína) como colación cuando haya ' +
      'inapetencia severa.',
    racional:
      'Asegura el requerimiento proteico básico (≥ 1,2 g/kg) en días de inapetencia extrema inducida por la ' +
      'titulación del fármaco.',
    activadaPor: ['barrera:inapetencia'],
    requiereGlp1: true,
  },
  {
    codigo: 'N08',
    pilar: 'nutricion-glp1',
    nombre: 'Té de jengibre post-comida',
    practica: 'Beber 100 ml de infusión de jengibre natural tibia 20 minutos después del almuerzo o la cena.',
    racional:
      'Aprovecha las propiedades procinéticas y antieméticas naturales del jengibre para aliviar la dispepsia moderada.',
    activadaPor: ['preferencia:remedios-naturales', 'barrera:nauseas-leves'],
  },
  {
    codigo: 'N09',
    pilar: 'nutricion-glp1',
    nombre: 'Plato fisiológico menopausia',
    practica:
      'Asegurar que en el almuerzo el 50 % sean vegetales de hoja o crucíferas, 25 % proteína magra y 25 % ' +
      'carbohidratos complejos.',
    racional:
      'Optimiza la densidad de micronutrientes, fitoestrógenos naturales y el control del pico glucémico postprandial.',
    activadaPor: ['etapa:preparacion', 'etapa:accion'],
  },
  {
    codigo: 'N10',
    pilar: 'nutricion-glp1',
    nombre: 'Diario de tolerancia y síntomas',
    practica:
      'Anotar durante 3 días el tipo de alimento, el grado de náusea (0-4) y el nivel de saciedad percibido en el portal.',
    racional: 'Aumenta la autoconciencia digestiva e identifica gatillantes individuales de intolerancia gastrointestinal.',
    activadaPor: ['etapa:contemplacion'],
    generaRegistro: true,
  },
];

// ---------------------------------------------------------------------------
// Pilar 2 — Salud osteomuscular, piso pélvico y movimiento (A01-A10)
// ---------------------------------------------------------------------------

const MOVIMIENTO: AccionAnexoC[] = [
  {
    codigo: 'A01',
    pilar: 'osteomuscular-movimiento',
    nombre: 'Piso pélvico diario (Kegel)',
    practica:
      'Realizar 3 series de 10 contracciones sostenidas (5 segundos) de la musculatura perineal, sentada o acostada.',
    racional:
      'Fortalece la cincha pélvica debilitada por el descenso estrogénico; prevención directa de incontinencia ' +
      'urinaria de esfuerzo.',
    activadaPor: ['barrera:incontinencia-leve'],
    requiere: ['condicion:menopausia'],
  },
  {
    codigo: 'A02',
    pilar: 'osteomuscular-movimiento',
    nombre: 'Derivación a kinesiología pelviperineal',
    practica: 'Agendar evaluación especializada con kinesiología pelviperineal ante pérdidas involuntarias semanales.',
    racional:
      'Tratamiento de alta precisión para disfunciones de piso pélvico moderadas o severas que no responden a ' +
      'autogestión básica.',
    activadaPor: ['flag:incontinencia-frecuente'],
    requiere: ['condicion:menopausia'],
    derivaA: 'kinesiologia-pelviperineal',
  },
  {
    codigo: 'A03',
    pilar: 'osteomuscular-movimiento',
    nombre: 'Impacto suave óseo',
    practica: 'Caminata a ritmo firme (100-110 pasos/min) durante 20 minutos con calzado de buena amortiguación.',
    racional:
      'Genera estimulación piezoeléctrica en el hueso para favorecer la osteogénesis y frenar la pérdida de ' +
      'densidad mineral ósea (DMO).',
    activadaPor: ['etapa:preparacion', 'etapa:accion'],
    contraindicadaPor: ['flag:caidas-recientes', 'flag:densitometria-alterada'],
  },
  {
    codigo: 'A04',
    pilar: 'osteomuscular-movimiento',
    nombre: 'Alternativa sin impacto',
    practica: 'Reemplazar la caminata fuerte por bicicleta fija, elíptica o natación (cero impacto vertical).',
    racional:
      'Protege la integridad ósea y articular ante fragilidad osteoporótica o riesgo elevado de fracturas y caídas.',
    activadaPor: ['flag:caidas-recientes', 'flag:densitometria-alterada'],
  },
  {
    codigo: 'A05',
    pilar: 'osteomuscular-movimiento',
    nombre: 'Equilibrio unipodal primero',
    practica:
      'Sostenerse sobre un solo pie cerca de un apoyo firme (silla o pared) durante 30 segundos por lado, 2 veces al día.',
    racional:
      'Mejora la propiocepción, la coordinación neuromuscular y el balance dinámico antes de progresar a ejercicios ' +
      'de sobrecarga.',
    activadaPor: ['autoeficacia:fisica-baja', 'barrera:temor-caidas'],
  },
  {
    codigo: 'A06',
    pilar: 'osteomuscular-movimiento',
    nombre: 'Fuerza con banda elástica',
    practica: 'Realizar 2 series de 10 repeticiones de remo y sentadilla asistida con bandas de resistencia media.',
    racional:
      'Preserva la masa muscular y la salud metabólica de la unidad musculoesquelética en menopausia.',
    activadaPor: ['etapa:preparacion', 'autoeficacia:media'],
  },
  {
    codigo: 'A07',
    pilar: 'osteomuscular-movimiento',
    nombre: 'Pausas activas post-prandiales',
    practica: 'Caminar a paso suave durante 10 minutos inmediatamente después del almuerzo y de la cena.',
    racional:
      'Capta glucosa muscular mediante vías independientes de la insulina, aplanando la curva glucémica postprandial.',
    activadaPor: ['barrera:sedentarismo', 'clinico:resistencia-insulina'],
  },
  {
    codigo: 'A08',
    pilar: 'osteomuscular-movimiento',
    nombre: 'Movilidad articular matutina',
    practica:
      'Realizar 5 minutos de rotaciones suaves de tobillos, rodillas, cadera y hombros al levantarse de la cama.',
    racional:
      'Disminuye la rigidez articular matutina característica del déficit estrogénico y mejora la lubricación sinovial.',
    activadaPor: ['barrera:dolor-articular'],
  },
  {
    codigo: 'A09',
    pilar: 'osteomuscular-movimiento',
    nombre: 'Estiramiento muscular guiado',
    practica: 'Mantener estiramiento de isquiotibiales y pectorales por 20 segundos al finalizar el día de trabajo.',
    racional:
      'Reduce el tono simpático elevado, disminuye la tensión muscular acumulada y promueve la relajación.',
    activadaPor: ['clinico:estres-elevado'],
  },
  {
    codigo: 'A10',
    pilar: 'osteomuscular-movimiento',
    nombre: 'Conteo de pasos incremental',
    practica: 'Aumentar 500 pasos sobre el promedio diario de la semana anterior hasta alcanzar el objetivo asignado.',
    racional:
      'Progresión segura basada en micro-metas que evita sobrecargas articulares y favorece el apego a largo plazo.',
    activadaPor: ['autoeficacia:baja'],
  },
];

// ---------------------------------------------------------------------------
// Pilar 3 — Sueño, termorregulación y manejo de sofocos (S01-S10)
// ---------------------------------------------------------------------------

const SUENO: AccionAnexoC[] = [
  {
    codigo: 'S01',
    pilar: 'sueno-termorregulacion',
    nombre: 'Dormitorio fresco (< 19 °C)',
    practica:
      'Ajustar la temperatura de la habitación entre 17 °C y 19 °C y usar ropa de cama de algodón o lino respirable.',
    racional:
      'Facilita el descenso de la temperatura corporal central, favoreciendo la entrada al sueño profundo y ' +
      'reduciendo los sofocos nocturnos.',
    activadaPor: ['barrera:sofocos-nocturnos'],
    requiere: ['condicion:menopausia'],
  },
  {
    codigo: 'S02',
    pilar: 'sueno-termorregulacion',
    nombre: 'Corte de cafeína a las 15 h',
    practica: 'Suspender café, té negro o verde, bebidas energizantes y mate después de las 15:00.',
    racional:
      'Respeta la vida media de la cafeína (5-7 h), evitando el bloqueo de receptores de adenosina que perpetúa la ' +
      'arquitectura alterada del sueño.',
    activadaPor: ['barrera:despertares-precoces'],
  },
  {
    codigo: 'S03',
    pilar: 'sueno-termorregulacion',
    nombre: 'Apagón digital pre-sueño',
    practica:
      'Desconectar pantallas (teléfono, TV, tablet) 60 minutos antes de dormir, o activar filtro de luz azul estricto.',
    racional:
      'Previene la supresión de melatonina pineal inducida por el espectro azul, crucial para la consolidación del ' +
      'sueño en la menopausia.',
    activadaPor: ['barrera:pantallas-nocturnas'],
  },
  {
    codigo: 'S04',
    pilar: 'sueno-termorregulacion',
    nombre: 'Ducha tibia-fresca nocturna',
    practica: 'Tomar una ducha corta con agua templada a fresca 45 minutos antes de acostarse.',
    racional:
      'Promueve la vasodilatación periférica seguida de un rápido enfriamiento central que gatilla la inducción ' +
      'fisiológica del sueño.',
    activadaPor: ['barrera:sofocos-conciliacion'],
    requiere: ['condicion:menopausia'],
  },
  {
    codigo: 'S05',
    pilar: 'sueno-termorregulacion',
    nombre: 'Luz natural matutina',
    practica: 'Exponerse a la luz del sol directa 10-15 minutos dentro de la primera hora tras despertarse.',
    racional:
      'Sincroniza el marcapasos circadiano central (núcleo supraquiasmático), suprimiendo la melatonina y ' +
      'optimizando la secreción de cortisol.',
    activadaPor: ['barrera:fatiga-matutina'],
  },
  {
    codigo: 'S06',
    pilar: 'sueno-termorregulacion',
    nombre: 'Respiración 4-7-8 antiestrés',
    practica:
      'Realizar 4 ciclos de inhalación (4 s), retención (7 s) y exhalación (8 s) al meterse en la cama o tras un ' +
      'sofoco nocturno.',
    racional:
      'Estimula la actividad del nervio vago, incrementando la modulación parasimpática y disminuyendo la ' +
      'taquicardia secundaria a sofocos.',
    activadaPor: ['barrera:ansiedad-nocturna'],
  },
  {
    codigo: 'S07',
    pilar: 'sueno-termorregulacion',
    nombre: 'Protocolo de sofoco nocturno',
    practica:
      'Tener en la mesa de luz un vaso de agua helada y una toalla fría plegada para aplicar en el cuello si aparece ' +
      'un sofoco.',
    racional: 'Proporciona un abortivo térmico inmediato, reduciendo el tiempo de vigilia post-sofoco y la activación cortical.',
    activadaPor: ['barrera:sofocos-nocturnos'],
    requiere: ['condicion:menopausia'],
  },
  {
    codigo: 'S08',
    pilar: 'sueno-termorregulacion',
    nombre: 'Cena libre de alcohol y picantes',
    practica: 'Evitar ají, especias picantes y bebidas alcohólicas durante la cena.',
    racional:
      'Evita la estimulación directa de nociceptores térmicos y la vasodilatación periférica inducida por alcohol ' +
      'que precipitan sofocos nocturnos.',
    activadaPor: ['barrera:alcohol-picante'],
    requiere: ['condicion:menopausia'],
  },
  {
    codigo: 'S09',
    pilar: 'sueno-termorregulacion',
    nombre: 'Regularidad diaria de horarios',
    practica: 'Acostarse y levantarse dentro del mismo rango de 30 minutos, incluso los fines de semana.',
    racional:
      'Consolida el ritmo circadiano de temperatura corporal e insulinosensibilidad, facilitando un descanso reparador.',
    activadaPor: ['autoeficacia:baja', 'barrera:horarios-irregulares'],
  },
  {
    codigo: 'S10',
    pilar: 'sueno-termorregulacion',
    nombre: 'Diario de descanso breve',
    practica:
      'Registrar por la mañana la calidad percibida del sueño (1-5) y la cantidad aproximada de sofocos en el portal.',
    racional:
      'Aporta datos objetivos para la titulación de estrategias y la evaluación de respuesta en el seguimiento semanal.',
    activadaPor: ['etapa:contemplacion'],
    generaRegistro: true,
  },
];

// ---------------------------------------------------------------------------
// Pilar 4 — Planificación conductual, adherencia y soporte (C01-C10)
// ---------------------------------------------------------------------------

const CONDUCTA: AccionAnexoC[] = [
  {
    codigo: 'C01',
    pilar: 'conducta-adherencia',
    nombre: 'Planificación dominguera',
    practica:
      'Dedicar 15 minutos los domingos a agendar las comidas principales y los bloques de movimiento de la semana.',
    racional:
      'Reduce la fatiga de decisión diaria, transformando intenciones abstractas en compromisos estructurados en la agenda.',
    activadaPor: ['barrera:falta-de-tiempo'],
  },
  {
    codigo: 'C02',
    pilar: 'conducta-adherencia',
    nombre: 'Compromiso con aliado de salud',
    practica:
      'Compartir la meta principal de la semana con un familiar, una amiga o la comunidad del programa antes del lunes.',
    racional:
      'Utiliza la responsabilidad social externa (accountability) para reforzar la motivación intrínseca y la tasa ' +
      'de cumplimiento.',
    activadaPor: ['preferencia:apoyo-social', 'autoeficacia:baja'],
  },
  {
    codigo: 'C03',
    pilar: 'conducta-adherencia',
    nombre: 'Registro diario simplificado',
    practica: 'Completar el check-in rápido de 2 minutos en el portal al finalizar la jornada (marcar hábito cumplido).',
    racional:
      'Aprovecha el bucle de retroalimentación inmediata y la dopamina asociada al logro para consolidar el nuevo hábito.',
    activadaPor: ['etapa:accion'],
    generaRegistro: true,
  },
  {
    codigo: 'C04',
    pilar: 'conducta-adherencia',
    nombre: 'Estrategia «si… entonces»',
    practica:
      'Escribir una solución previa a una barrera anticipada (ej.: «si tengo náuseas por la dosis, entonces comeré ' +
      'una galleta de agua y tomaré té de jengibre»).',
    racional:
      'Aplica la intención de implementación (implementation intentions) para automatizar la respuesta adaptativa ' +
      'ante obstáculos.',
    activadaPor: ['barrera:imprevistos'],
  },
  {
    codigo: 'C05',
    pilar: 'conducta-adherencia',
    nombre: 'Preparación de entorno protegido',
    practica: 'Remover del hogar o congelar alimentos ultraprocesados de alta densidad calórica e intolerancia digestiva.',
    racional:
      'Modifica la arquitectura de decisiones del entorno para depender menos de la fuerza de voluntad en momentos de fatiga.',
    activadaPor: ['barrera:ingesta-emocional'],
  },
  {
    codigo: 'C06',
    pilar: 'conducta-adherencia',
    nombre: 'Anclaje de hábitos',
    practica:
      'Vincular una acción nueva a una rutina automática existente (ej.: «después de lavarme los dientes a la mañana, ' +
      'hago los 3 minutos de Kegel»).',
    racional:
      'Utiliza las redes neuronales de hábitos consolidados para reducir el esfuerzo cognitivo del nuevo comportamiento.',
    activadaPor: ['autoeficacia:baja', 'barrera:olvidos'],
  },
  {
    codigo: 'C07',
    pilar: 'conducta-adherencia',
    nombre: 'Celebración de micro-triunfos',
    practica:
      'Registrar por escrito una victoria no relacionada con la balanza (ej.: «tuve más energía», «dormí mejor») cada viernes.',
    racional:
      'Desplaza el foco exclusivo del peso corporal hacia indicadores cualitativos de salud integral, protegiendo la autoestima.',
    activadaPor: ['barrera:frustracion-peso'],
    generaRegistro: true,
  },
  {
    codigo: 'C08',
    pilar: 'conducta-adherencia',
    nombre: 'Revisión de barreras semanal',
    practica:
      'Analizar en el check-in qué acción quedó sin cumplir y elegir un nivel de dificultad menor para la semana siguiente.',
    racional:
      'Evita el efecto de «todo o nada» y ajusta la carga funcional para mantener la autoeficacia dentro de la zona óptima.',
    activadaPor: ['etapa:accion'],
    generaRegistro: true,
  },
  {
    codigo: 'C09',
    pilar: 'conducta-adherencia',
    nombre: 'Mapeo de compras saludables',
    practica: 'Ir al supermercado con una lista cerrada basada en la planificación dominguera y sin apetito (post-comida).',
    racional: 'Previene la compra impulsiva de bajo valor nutricional inducida por la exposición visual a ultraprocesados.',
    activadaPor: ['barrera:ingesta-impulsiva'],
  },
  {
    codigo: 'C10',
    pilar: 'conducta-adherencia',
    nombre: 'Recordatorio visual de metas',
    practica:
      'Colocar una nota o una pantalla de bloqueo con el «por qué» fundamental de haber iniciado el Plan Bienestar 100 Días.',
    racional:
      'Mantiene la motivación autónoma (autodeterminación) presente en momentos de duda o estancamiento percibido.',
    activadaPor: ['etapa:contemplacion', 'etapa:preparacion'],
  },
];

/** Las 40 acciones del Nivel 1 (Anexo C). Biblioteca cerrada: la IA no puede salirse de acá. */
export const BIBLIOTECA_NIVEL_1: readonly Accion[] = Object.freeze(
  [...NUTRICION, ...MOVIMIENTO, ...SUENO, ...CONDUCTA].map((accion) => Object.freeze({ ...accion, anexo: 'C' as const })),
);

/** Anexo C más Anexo C bis: las 80 acciones. Es la biblioteca por defecto de la selección. */
export const BIBLIOTECA_AMPLIADA: readonly Accion[] = Object.freeze([...BIBLIOTECA_NIVEL_1, ...BIBLIOTECA_C_BIS]);

const POR_CODIGO = new Map<string, Accion>(BIBLIOTECA_AMPLIADA.map((a) => [a.codigo, a]));

export function buscarAccion(codigo: string): Accion | undefined {
  return POR_CODIGO.get(codigo);
}

/**
 * Pares mutuamente excluyentes. Emitir ambos sería una indicación contradictoria
 * o redundante.
 *
 * A03 (caminata de impacto) vs A04 (alternativa sin impacto): A04 existe
 * justamente porque A03 está contraindicada. A07 y A14 son la misma caminata
 * posprandial de 10 minutos (A07 por sedentarismo, A14 con HTA o diabetes);
 * S01 y S11 el mismo dormitorio con y sin sofocos; N10 y N15 dos diarios de
 * comida; R01 y P05 el mismo peso semanal (con pre-IC o IC va P05, que suma el
 * aviso ante síntomas de congestión). Pares aprobados en la firma del 03/10/2026.
 */
export const EXCLUSIONES_MUTUAS: readonly (readonly [CodigoAccion, CodigoAccion])[] = Object.freeze([
  ['A03', 'A04'] as const,
  ['A07', 'A14'] as const,
  ['S01', 'S11'] as const,
  ['N10', 'N15'] as const,
  ['R01', 'P05'] as const,
]);

// ---------------------------------------------------------------------------
// Selección
// ---------------------------------------------------------------------------

export interface PerfilBaseline {
  /** Señales auto-reportadas en el cuestionario baseline. */
  senales?: Senal[];
  /** Hallazgos clínicos cargados por el equipo. */
  flags?: Flag[];
  /** La persona está bajo tratamiento GLP-1 activo. */
  conGlp1?: boolean;
  /**
   * Estadío CKM validado por el médico. Sin estadío ni condiciones, el perfil se
   * trata como el de la población original del Anexo C (mujer en menopausia).
   */
  estadio?: EstadioBiblioteca;
  /** Condiciones del catálogo firmado registradas para la persona (`hta`, `toma-sglt2i`, `menopausia`, ...). */
  condiciones?: readonly string[];
}

/** El conjunto de activadores presentes en un perfil, ya normalizado. */
export function activadoresDelPerfil(perfil: PerfilBaseline): { activos: Set<string>; conGlp1: boolean; flags: Set<Flag> } {
  const flags = new Set<Flag>(perfil.flags ?? []);
  const activos = new Set<string>([...(perfil.senales ?? []), ...flags]);
  const condiciones = perfil.condiciones ?? [];
  for (const condicion of condiciones) activos.add(`condicion:${condicion}`);
  if (perfil.estadio !== undefined) activos.add(`estadio:${perfil.estadio}`);

  // Perfil sin catálogo: es la población para la que se escribió el Anexo C.
  const legado = perfil.condiciones === undefined && perfil.estadio === undefined;
  if (legado) activos.add('condicion:menopausia');

  const conGlp1 = perfil.conGlp1 ?? condiciones.includes('toma-glp1');
  if (conGlp1) activos.add('condicion:toma-glp1');
  return { activos, conGlp1, flags };
}

/**
 * Acciones que **pueden** indicarse a este perfil. No elige: acota.
 *
 * Esta función es determinística y auditable; la elección final entre las
 * disponibles la hace la IA y la aprueba el médico.
 */
export function accionesDisponibles(perfil: PerfilBaseline, biblioteca: readonly Accion[] = BIBLIOTECA_AMPLIADA): Accion[] {
  const { activos, conGlp1, flags } = activadoresDelPerfil(perfil);

  return biblioteca.filter((accion) => {
    // 1. Seguridad primero: un flag activo veta la acción sin importar nada más.
    if (accion.contraindicadaPor?.some((f) => flags.has(f))) {
      return false;
    }
    // 2. Acciones atadas al fármaco sólo si hay tratamiento activo.
    if (accion.requiereGlp1 && !conGlp1) {
      return false;
    }
    // 3. Lo que la acción exige tiene que estar todo presente.
    if (accion.requiere?.some((r) => !activos.has(r))) {
      return false;
    }
    // 4. Sin filtros declarados = disponible para todas.
    if (accion.activadaPor.length === 0) {
      return true;
    }
    return accion.activadaPor.some((s) => activos.has(s));
  });
}

export type MotivoRechazo =
  | 'codigo-desconocido'
  | 'no-disponible-para-el-perfil'
  | 'contraindicada'
  | 'requiere-glp1'
  | 'requiere-condicion'
  | 'excluyente'
  | 'duplicada';

export interface Rechazo {
  codigo: string;
  motivo: MotivoRechazo;
  detalle: string;
}

export interface ResultadoValidacion {
  aceptadas: Accion[];
  rechazadas: Rechazo[];
}

/**
 * Valida una selección de códigos (típicamente la que devolvió el LLM) contra la
 * biblioteca y el perfil.
 *
 * Es el guardarraíl que corre **antes** de escribir FHIR: un código inventado,
 * contraindicado o contradictorio se descarta acá y nunca llega a la paciente.
 * Devuelve los rechazos con su motivo para que el médico vea qué se filtró.
 */
export function validarSeleccion(
  codigos: readonly string[],
  perfil: PerfilBaseline,
  biblioteca: readonly Accion[] = BIBLIOTECA_AMPLIADA,
): ResultadoValidacion {
  const { activos, conGlp1, flags } = activadoresDelPerfil(perfil);
  const porCodigo = biblioteca === BIBLIOTECA_AMPLIADA ? POR_CODIGO : new Map(biblioteca.map((a) => [a.codigo, a]));
  const disponibles = new Set(accionesDisponibles(perfil, biblioteca).map((a) => a.codigo));
  const aceptadas: Accion[] = [];
  const rechazadas: Rechazo[] = [];
  const vistos = new Set<string>();

  for (const codigo of codigos) {
    if (vistos.has(codigo)) {
      rechazadas.push({ codigo, motivo: 'duplicada', detalle: 'La acción ya estaba en la selección.' });
      continue;
    }
    vistos.add(codigo);

    const accion = porCodigo.get(codigo);
    if (!accion) {
      rechazadas.push({
        codigo,
        motivo: 'codigo-desconocido',
        detalle: 'No existe en la biblioteca.',
      });
      continue;
    }
    const contra = accion.contraindicadaPor?.filter((f) => flags.has(f)) ?? [];
    if (contra.length > 0) {
      rechazadas.push({
        codigo,
        motivo: 'contraindicada',
        detalle: `Contraindicada por: ${contra.join(', ')}.`,
      });
      continue;
    }
    if (accion.requiereGlp1 && !conGlp1) {
      rechazadas.push({
        codigo,
        motivo: 'requiere-glp1',
        detalle: 'Sólo aplica con tratamiento GLP-1 activo.',
      });
      continue;
    }
    const faltan = accion.requiere?.filter((r) => !activos.has(r)) ?? [];
    if (faltan.length > 0) {
      rechazadas.push({
        codigo,
        motivo: 'requiere-condicion',
        detalle: `Requiere: ${faltan.join(', ')}.`,
      });
      continue;
    }
    if (!disponibles.has(accion.codigo)) {
      rechazadas.push({
        codigo,
        motivo: 'no-disponible-para-el-perfil',
        detalle: 'Ninguna señal del baseline la habilita.',
      });
      continue;
    }
    const choque = EXCLUSIONES_MUTUAS.find(
      ([a, b]) =>
        (a === accion.codigo && aceptadas.some((x) => x.codigo === b)) ||
        (b === accion.codigo && aceptadas.some((x) => x.codigo === a))
    );
    if (choque) {
      rechazadas.push({
        codigo,
        motivo: 'excluyente',
        detalle: `Incompatible con ${choque[0] === accion.codigo ? choque[1] : choque[0]}.`,
      });
      continue;
    }
    aceptadas.push(accion);
  }

  return { aceptadas, rechazadas };
}

// ---------------------------------------------------------------------------
// Guardarraíl GLP-1
// ---------------------------------------------------------------------------

/**
 * Detecta si un texto generado por IA intenta indicar dosificación de GLP-1.
 *
 * La dosis, el inicio y la suspensión del GLP-1 son del médico y del módulo de
 * medicación. Ninguna acción de esta biblioteca prescribe: si el "por qué"
 * redactado por el modelo entra en dosificación, se descarta ese texto.
 *
 * Deliberadamente conservador (prefiere un falso positivo a dejar pasar una
 * indicación): el texto rechazado se reemplaza por el racional de la biblioteca.
 */
const FARMACO_GLP1 =
  /(glp-?1|semaglutid|tirzepatid|liraglutid|dulaglutid|ozempic|wegovy|mounjaro|saxenda|trulicity|victoza)/;

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * ¿Este texto nombra un agonista de GLP-1?
 *
 * Para decidir `conGlp1` desde la medicación registrada, que es más confiable
 * que lo que la paciente recuerde haber respondido en el cuestionario.
 */
export function esGlp1(texto: string): boolean {
  return FARMACO_GLP1.test(normalizar(texto));
}

export function mencionaDosificacionGlp1(texto: string): boolean {
  const t = normalizar(texto);
  if (!FARMACO_GLP1.test(t)) {
    return false;
  }
  const dosificacion =
    /(\d+\s*(mg|mcg|ug|unidades)|dosis|titula|subi|suba|aument|baja|baje|reduc|escala|suspend|discontinu|interrump|iniciar|comenzar|arranca)/;
  return dosificacion.test(t);
}
