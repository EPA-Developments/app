/**
 * La escalera del Plan Bienestar 100 Días.
 *
 * NOMENCLATURA (decisión del proyecto)
 * ------------------------------------
 *   nivel   -> el escalón clínico. Vive en los recursos FHIR.
 *   versión -> la revisión de la PlanDefinition (contenido del nivel).
 *
 * O sea: una paciente está en el **nivel 2**, servido por la **versión 3** de la
 * PlanDefinition de ese nivel. En marketing la escalera puede llamarse "PB100D
 * V1, V2…"; en el modelo de datos no, para que "versión" signifique una sola cosa.
 *
 * Cada nivel es un ciclo completo de 100 días. Al día 100 se evalúa y recién ahí
 * se propone el siguiente. Nadie salta escalones.
 */

export type NivelId = 1 | 2 | 3 | 4;

/**
 * Puertas de seguridad que hay que franquear para *entrar* a un nivel.
 *
 * `null` significa **sin definir**, y sin definir el nivel no se habilita.
 * No son un detalle administrativo: los niveles 3 y 4 mandan a una mujer en
 * menopausia a correr 21 K o a un triatlón. Qué apto, qué ergometría y qué
 * evaluación de piso pélvico se exigen antes es una decisión clínica del médico
 * responsable, no algo que este código pueda inventar por defecto.
 */
export interface PuertasDeSeguridad {
  /** Estudios/certificaciones exigidos antes de habilitar el nivel. */
  requisitos: string[];
  /** Vigencia máxima del apto, en días. */
  vigenciaAptoDias: number;
  /** Quién firma la habilitación. */
  firma: string;
}

export interface Nivel {
  id: NivelId;
  clave: string;
  /** Nombre clínico del escalón. */
  nombre: string;
  /** Cómo se lo nombra en marketing. */
  aliasComercial: string;
  /** A quién apunta y con qué motor de cambio. */
  foco: string;
  /** Tipos de objetivo del escalón. Los VALORES los fija el médico por paciente. */
  ejemplosDeObjetivo: string[];
  /** `null` = puertas sin definir; el nivel no se puede habilitar. */
  puertasDeSeguridad: PuertasDeSeguridad | null;
}

/**
 * Los cuatro escalones.
 *
 * Foco en la mujer en toda la escalera. Nivel 1 es el único con biblioteca de
 * acciones publicada (Anexo C); los siguientes se abren a medida que se definen
 * su contenido y, para 3 y 4, sus puertas de seguridad.
 */
export const NIVELES: readonly Nivel[] = Object.freeze([
  {
    id: 1,
    clave: 'metabolico',
    nombre: 'Metabólico',
    aliasComercial: 'PB100D V1',
    foco:
      'Mujer en peri/menopausia con resistencia a la insulina. Estabilización metabólica y tolerancia, ' +
      'con GLP-1 como opción premium acompañada por nutrición.',
    ejemplosDeObjetivo: [
      'Descenso de peso pactado con la paciente',
      'Reducción de circunferencia abdominal',
      'Mejora de parámetros de resistencia a la insulina',
    ],
    // Nivel de entrada: la puerta es la consulta inicial con el cardiólogo,
    // que ya es precondición del circuito comercial.
    puertasDeSeguridad: {
      requisitos: ['Consulta inicial con cardiólogo', 'Cuestionario baseline completo'],
      vigenciaAptoDias: 365,
      firma: 'Cardiología',
    },
  },
  {
    id: 2,
    clave: 'habitos',
    nombre: 'Optimización por hábitos',
    aliasComercial: 'PB100D V2',
    foco:
      'Consolidar la mejora del nivel 1 sosteniéndola con hábitos, sin GLP-1 como motor. ' +
      'El fármaco puede haberse suspendido: la conducta es lo que sostiene el resultado.',
    ejemplosDeObjetivo: [
      'Sostener el peso alcanzado sin fármaco',
      'Descenso adicional pactado con la paciente',
      'Mejora adicional del perfil de insulinorresistencia',
    ],
    puertasDeSeguridad: {
      requisitos: ['Nivel 1 completado y evaluado al día 100'],
      vigenciaAptoDias: 365,
      firma: 'Cardiología',
    },
  },
  {
    id: 3,
    clave: 'deporte',
    nombre: 'Deporte con objetivo',
    aliasComercial: 'PB100D V3',
    foco: 'Entrenamiento estructurado hacia una meta deportiva concreta y alcanzable.',
    ejemplosDeObjetivo: ['Correr 10 K', 'Bicicleta 40-60 km'],
    // PENDIENTE DE DEFINICIÓN MÉDICA. Preguntas abiertas:
    //  - ¿Apto físico vigente, ergometría, o ambos? ¿Con qué vigencia?
    //  - ¿Regla de piso pélvico antes de habilitar carrera?
    puertasDeSeguridad: null,
  },
  {
    id: 4,
    clave: 'alto-rendimiento',
    nombre: 'Alto rendimiento',
    aliasComercial: 'PB100D V4',
    foco: 'Preparación para competencia de fondo, con carga y riesgo de sobreentrenamiento reales.',
    ejemplosDeObjetivo: [
      'Running 21 K',
      'Triatlón short u olímpico',
      'Natación en aguas abiertas',
      'Bicicleta 100 km',
    ],
    // PENDIENTE DE DEFINICIÓN MÉDICA. Preguntas abiertas:
    //  - ¿Qué estudios exige la entrada (ergometría máxima, ecocardiograma, laboratorio)?
    //  - ¿Cómo se tamiza RED-S (deficiencia energética relativa en el deporte)?
    //  - Regla de piso pélvico, igual que el nivel 3.
    puertasDeSeguridad: null,
  },
]);

export function buscarNivel(id: NivelId): Nivel | undefined {
  return NIVELES.find((n) => n.id === id);
}

export interface EstadoNivel {
  habilitado: boolean;
  /** Por qué no, cuando `habilitado` es false. */
  motivo?: string;
  requisitosPendientes?: string[];
}

/**
 * ¿Se puede generar un plan de este nivel para esta paciente?
 *
 * Un nivel sin puertas definidas **nunca** se habilita: es la traducción en
 * código de "todavía no lo definí". Prefiere bloquear a suponer.
 */
export function estadoNivel(id: NivelId, requisitosCumplidos: readonly string[] = []): EstadoNivel {
  const nivel = buscarNivel(id);
  if (!nivel) {
    return { habilitado: false, motivo: `El nivel ${id} no existe.` };
  }
  if (nivel.puertasDeSeguridad === null) {
    return {
      habilitado: false,
      motivo:
        `El nivel ${id} ("${nivel.nombre}") todavía no tiene puertas de seguridad definidas. ` +
        'Las define el médico responsable antes de poder habilitarse.',
    };
  }
  const cumplidos = new Set(requisitosCumplidos);
  const pendientes = nivel.puertasDeSeguridad.requisitos.filter((r) => !cumplidos.has(r));
  if (pendientes.length > 0) {
    return {
      habilitado: false,
      motivo: `Faltan requisitos para el nivel ${id}.`,
      requisitosPendientes: pendientes,
    };
  }
  return { habilitado: true };
}

/** Los niveles que hoy se pueden generar. */
export function nivelesHabilitables(): Nivel[] {
  return NIVELES.filter((n) => n.puertasDeSeguridad !== null);
}
