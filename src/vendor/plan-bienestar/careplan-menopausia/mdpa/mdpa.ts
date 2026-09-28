/**
 * MDPA — Monitoreo Domiciliario de Presión Arterial.
 *
 * Una semana de MDPA antes de cada control cardiológico: la paciente mide en su
 * casa, el equipo lee el promedio. Sustituye la foto única de consultorio (sujeta
 * a efecto guardapolvo blanco) por una serie.
 *
 * PROTOCOLO DIARIO
 * ----------------
 * Sólo a la mañana. Tres monitoreos seguidos; **se descarta el primero** y se
 * promedian los dos siguientes. Ese promedio es el control del día.
 *
 * Descartar la primera toma no es una curiosidad del método: la primera lectura
 * es sistemáticamente la más alta —la persona recién se sienta, todavía no se
 * estabilizó— y contarla infla la serie entera. Por eso el registro del día es
 * el promedio de la 2.ª y la 3.ª, y las reglas de aviso miran ese valor, no las
 * tomas crudas.
 *
 * OBJETIVOS (AHA)
 *   < 130/80  objetivo clínico
 *   < 120/80  ideal
 *
 * UMBRALES DE AVISO — PROPUESTA A VALIDAR
 *   promedio de la serie ≥ 135/85    -> revisión
 *   dos o más días ≥ 140/90          -> revisión
 *   cualquier toma ≥ 180/110         -> contacto urgente
 *
 * En todos los umbrales alcanza con que **uno** de los dos componentes
 * (sistólica o diastólica) esté por encima; es la convención de las guías de
 * hipertensión, no un promedio de ambos.
 *
 * El umbral urgente es la única regla que mira **todas** las tomas, incluida la
 * descartada: una lectura de 190/115 importa aunque haya salido primera. Las
 * reglas de revisión sí trabajan sobre el valor del día, que es lo que el
 * protocolo considera medición válida.
 *
 * QUIÉN VE QUÉ
 * ------------
 * El aviso es para el equipo tratante. A la paciente se le muestra su número
 * contra su meta, en positivo (`mensajeParaPaciente`): nunca el escalón de
 * alarma, que no puede interpretar sola y sólo genera ansiedad entre controles.
 */

export interface PresionObjetivo {
  sistolica: number;
  diastolica: number;
}

/** Objetivo clínico del programa (AHA). */
export const MDPA_OBJETIVO_CLINICO: PresionObjetivo = Object.freeze({ sistolica: 130, diastolica: 80 });

/** Objetivo ideal (AHA). */
export const MDPA_OBJETIVO_IDEAL: PresionObjetivo = Object.freeze({ sistolica: 120, diastolica: 80 });

/** Promedio de la serie a partir del cual se pide revisión. */
export const MDPA_UMBRAL_PROMEDIO: PresionObjetivo = Object.freeze({ sistolica: 135, diastolica: 85 });

/** Valor del día que, repetido, pide revisión. */
export const MDPA_UMBRAL_DIA: PresionObjetivo = Object.freeze({ sistolica: 140, diastolica: 90 });

/** Cuántos días por encima de `MDPA_UMBRAL_DIA` disparan la revisión. */
export const MDPA_DIAS_ALTOS_PARA_REVISION = 2;

/** Una sola toma en este rango justifica contacto urgente. */
export const MDPA_UMBRAL_URGENTE: PresionObjetivo = Object.freeze({ sistolica: 180, diastolica: 110 });

/** Monitoreos por día, todos a la mañana. */
export const MDPA_TOMAS_POR_DIA = 3;

/** Se descarta la primera toma de cada mañana. */
export const MDPA_TOMAS_DESCARTADAS = 1;

/** Días de registro que componen una serie completa. */
export const MDPA_DIAS_DE_SERIE = 7;

export interface TomaPresion {
  /** Fecha de la toma, `YYYY-MM-DD`. */
  fecha: string;
  /** Orden dentro de la mañana, empezando en 1. */
  orden: number;
  sistolica: number;
  diastolica: number;
}

/** El control de un día: lo que queda después de descartar la primera toma. */
export interface DiaMdpa {
  fecha: string;
  /** Promedio de las tomas válidas. `undefined` si no quedó ninguna. */
  promedio?: PresionObjetivo;
  /** Tomas que entraron en el promedio. */
  tomasValidas: number;
  /** Se hicieron los 3 monitoreos del protocolo. */
  completo: boolean;
}

export type NivelAviso = 'ok' | 'revision' | 'urgente';

export interface ResultadoMdpa {
  /** Control de cada día, en orden de fecha. */
  dias: DiaMdpa[];
  /** Promedio de la serie: promedio de los controles diarios. */
  promedio?: PresionObjetivo;
  /** Días con los 3 monitoreos hechos. */
  diasCompletos: number;
  /** La serie llegó a `MDPA_DIAS_DE_SERIE` días completos. */
  serieCompleta: boolean;
  totalTomas: number;
  aviso: NivelAviso;
  /** Por qué se llegó a ese aviso. Vacío cuando es `ok`. */
  motivos: string[];
  /** El promedio de la serie cumple el objetivo clínico (< 130/80). */
  enObjetivoClinico: boolean;
  /** El promedio de la serie cumple el ideal (< 120/80). */
  enObjetivoIdeal: boolean;
}

/** Alcanza o supera el umbral si **cualquiera** de sus componentes lo hace. */
function alcanza(valor: PresionObjetivo, umbral: PresionObjetivo): boolean {
  return valor.sistolica >= umbral.sistolica || valor.diastolica >= umbral.diastolica;
}

/** Está por debajo del objetivo sólo si **ambos** componentes lo están. */
function porDebajo(valor: PresionObjetivo, objetivo: PresionObjetivo): boolean {
  return valor.sistolica < objetivo.sistolica && valor.diastolica < objetivo.diastolica;
}

function promediar(valores: readonly PresionObjetivo[]): PresionObjetivo | undefined {
  if (valores.length === 0) {
    return undefined;
  }
  return {
    sistolica: Math.round(valores.reduce((s, v) => s + v.sistolica, 0) / valores.length),
    diastolica: Math.round(valores.reduce((s, v) => s + v.diastolica, 0) / valores.length),
  };
}

/**
 * Agrupa las tomas por día y calcula el control de cada uno.
 *
 * Descarta la primera toma **por orden**, no por posición en el array: así el
 * resultado no depende de cómo vengan ordenadas las tomas desde el servidor.
 */
export function controlesPorDia(tomas: readonly TomaPresion[]): DiaMdpa[] {
  const porFecha = new Map<string, TomaPresion[]>();
  for (const t of tomas) {
    const delDia = porFecha.get(t.fecha) ?? [];
    delDia.push(t);
    porFecha.set(t.fecha, delDia);
  }

  return [...porFecha.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, delDia]) => {
      const ordenadas = [...delDia].sort((a, b) => a.orden - b.orden);
      const validas = ordenadas.slice(MDPA_TOMAS_DESCARTADAS);
      return {
        fecha,
        promedio: promediar(validas),
        tomasValidas: validas.length,
        completo: ordenadas.length >= MDPA_TOMAS_POR_DIA,
      };
    });
}

/**
 * Evalúa una serie de MDPA.
 *
 * Función pura: no lee ni escribe FHIR. El bot decide qué hacer con el aviso
 * (Communication al equipo, Task de revisión); acá sólo se calcula.
 */
export function evaluarMdpa(tomas: readonly TomaPresion[]): ResultadoMdpa {
  const dias = controlesPorDia(tomas);
  const diasCompletos = dias.filter((d) => d.completo).length;
  const controles = dias.map((d) => d.promedio).filter((p): p is PresionObjetivo => p !== undefined);
  const promedio = promediar(controles);

  const base = {
    dias,
    promedio,
    diasCompletos,
    serieCompleta: diasCompletos >= MDPA_DIAS_DE_SERIE,
    totalTomas: tomas.length,
  };

  // El umbral urgente mira todas las tomas, también la descartada.
  const urgente = tomas.find((t) => alcanza(t, MDPA_UMBRAL_URGENTE));
  if (urgente) {
    return {
      ...base,
      aviso: 'urgente',
      motivos: [
        `Toma en rango de urgencia (${urgente.sistolica}/${urgente.diastolica} el ${urgente.fecha}, umbral ` +
          `${MDPA_UMBRAL_URGENTE.sistolica}/${MDPA_UMBRAL_URGENTE.diastolica}).`,
      ],
      enObjetivoClinico: false,
      enObjetivoIdeal: false,
    };
  }

  if (!promedio) {
    return { ...base, aviso: 'ok', motivos: [], enObjetivoClinico: false, enObjetivoIdeal: false };
  }

  const motivos: string[] = [];
  if (alcanza(promedio, MDPA_UMBRAL_PROMEDIO)) {
    motivos.push(
      `Promedio de la serie ${promedio.sistolica}/${promedio.diastolica} ≥ ` +
        `${MDPA_UMBRAL_PROMEDIO.sistolica}/${MDPA_UMBRAL_PROMEDIO.diastolica}.`
    );
  }
  const diasAltos = controles.filter((c) => alcanza(c, MDPA_UMBRAL_DIA)).length;
  if (diasAltos >= MDPA_DIAS_ALTOS_PARA_REVISION) {
    motivos.push(
      `${diasAltos} días con control ≥ ${MDPA_UMBRAL_DIA.sistolica}/${MDPA_UMBRAL_DIA.diastolica} ` +
        `(umbral: ${MDPA_DIAS_ALTOS_PARA_REVISION}).`
    );
  }

  return {
    ...base,
    aviso: motivos.length > 0 ? 'revision' : 'ok',
    motivos,
    enObjetivoClinico: porDebajo(promedio, MDPA_OBJETIVO_CLINICO),
    enObjetivoIdeal: porDebajo(promedio, MDPA_OBJETIVO_IDEAL),
  };
}

/**
 * Texto para la paciente: su número contra su meta, en positivo.
 *
 * Deliberadamente no menciona el nivel de aviso ni la palabra "hipertensión".
 * Si hay algo que revisar, lo conversa con su equipo en el control; el portal
 * no da esa noticia sin un profesional al lado.
 */
export function mensajeParaPaciente(resultado: ResultadoMdpa): string {
  if (!resultado.promedio) {
    return (
      `Todavía no cargaste mediciones. Son ${MDPA_DIAS_DE_SERIE} días seguidos, a la mañana, ` +
      `con ${MDPA_TOMAS_POR_DIA} tomas cada vez.`
    );
  }
  const { sistolica, diastolica } = resultado.promedio;
  if (!resultado.serieCompleta) {
    const faltan = MDPA_DIAS_DE_SERIE - resultado.diasCompletos;
    return (
      `Tu promedio hasta ahora es ${sistolica}/${diastolica}. ` +
      `${faltan === 1 ? 'Falta 1 día' : `Faltan ${faltan} días`} para completar la semana.`
    );
  }
  if (resultado.enObjetivoIdeal) {
    return `Tu promedio de la semana es ${sistolica}/${diastolica}: estás en el rango ideal. Seguí así.`;
  }
  if (resultado.enObjetivoClinico) {
    return `Tu promedio de la semana es ${sistolica}/${diastolica}: estás en tu objetivo. Muy bien.`;
  }
  return (
    `Tu promedio de la semana es ${sistolica}/${diastolica}. ` +
    `Tu objetivo es menos de ${MDPA_OBJETIVO_CLINICO.sistolica}/${MDPA_OBJETIVO_CLINICO.diastolica}. ` +
    'Llevalo a tu control: lo vemos juntos.'
  );
}

/**
 * Los 8 pasos para medir bien la presión en casa.
 *
 * Una serie mal tomada es peor que no tener serie: parece un dato y no lo es.
 * Estos pasos son la preparación estándar de la AHA; van en la pantalla de
 * carga, antes de que la paciente empiece a medir.
 *
 * Redacción propia en voz de paciente, a validar por el médico.
 */
export interface PasoMedicion {
  orden: number;
  titulo: string;
  detalle: string;
}

export const MDPA_PASOS_MEDICION: readonly PasoMedicion[] = Object.freeze([
  {
    orden: 1,
    titulo: 'Nada de café, ejercicio ni cigarrillo antes',
    detalle: 'Dejá pasar 30 minutos desde el café, el mate, la actividad física o el cigarrillo.',
  },
  {
    orden: 2,
    titulo: 'Andá al baño primero',
    detalle: 'La vejiga llena sube la presión y te cambia el número.',
  },
  {
    orden: 3,
    titulo: 'Sentate y quedate quieta 5 minutos',
    detalle: 'En silencio, sin el teléfono ni la tele. Recién después empezás.',
  },
  {
    orden: 4,
    titulo: 'Sentada bien, con la espalda apoyada',
    detalle: 'Los pies en el piso, sin cruzar las piernas.',
  },
  {
    orden: 5,
    titulo: 'El brazo apoyado, a la altura del corazón',
    detalle: 'Sobre una mesa. Si te queda colgando o muy alto, el número sale mal.',
  },
  {
    orden: 6,
    titulo: 'El manguito sobre el brazo desnudo',
    detalle: 'Nunca sobre la ropa, y que sea del tamaño que te corresponde.',
  },
  {
    orden: 7,
    titulo: 'No hables mientras medís',
    detalle: 'Hablar durante la medición sube el resultado.',
  },
  {
    orden: 8,
    titulo: `${MDPA_TOMAS_POR_DIA} tomas seguidas, siempre a la mañana`,
    detalle:
      'Esperá un minuto entre una y otra. La primera no cuenta: el registro del día es el promedio de las ' +
      'dos siguientes, y eso lo calcula la app.',
  },
]);
