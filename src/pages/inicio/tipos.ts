// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Tipos compartidos de la Home por estilos (ver docs/home-propuestas.md).
//
// La Home tiene dos estilos según la persona: el E («Vos en el centro»: la rosa de los 8
// hábitos rodeada por los anillos de los agentes de IA y del equipo médico) para mujeres de 45
// a 55 años, y el D («Salidas y llegadas»: el tablero de lo que mandó y lo que le vuelve, y la
// ruta de ida y vuelta de sus datos) para el resto. Los dos usan los mismos datos (DatosHomeE).
import type { CategoriaLe8, Le8Domain, PuntajeDominio, ResultadoLe8 } from '@epa/careplan-menopausia';
import type { EquipoDeSalud } from '../../fhir/equipo';
import type { PlanBienestar } from '../../fhir/bienestar';
import type { EstadoSolicitudSOM } from '../../fhir/som';
import type { ModeloHgraph } from './hgraph';

/** Estilo de la Home: E («Vos en el centro») o D («Salidas y llegadas»). */
export type EstiloHome = 'E' | 'D';

/** Estado del consentimiento informado de la paciente. */
export type EstadoConsentimiento = 'cargando' | 'falta' | 'desactualizado' | 'firmado';

/**
 * Estadio CKM (0-4) del equipo, nunca una estimación del portal (src/fhir/ckmEquipo.ts): el de
 * la serie que calcula el sistema del equipo (el que ve el médico en la ficha) o, sin serie, el
 * que validó un médico.
 */
export interface EstadioCkmHome {
  readonly estadio: 0 | 1 | 2 | 3 | 4;
  readonly origen: 'serie' | 'validado';
  /** Fecha clínica de la evaluación (o de la validación). */
  readonly fecha?: string;
  /** La serie lo marca provisorio cuando falta algún dato («al menos este estadio»). */
  readonly provisorio: boolean;
}

/** La Segunda Opinión más reciente de la paciente (ServiceRequest de SOM). */
export interface SegundaOpinionHome {
  readonly id: string;
  /**
   * `estadoSolicitudSOM` de src/fhir/som.ts: `active` sin tarea de firma = en análisis (la IA
   * prepara el informe); `active` con su tarea de firma = en revisión (el borrador espera al
   * cardiólogo, R-24); `completed` = el informe está para ver (desde R-24 lo completa la firma
   * del cardiólogo; los de antes, el bot que lo prepara con IA: completada NO quiere decir
   * firmada, eso lo dice `firmada`); `revoked` o `entered-in-error` = cancelada (se le vuelve a
   * ofrecer pedirla); el resto (en pausa, borrador…), «otro».
   */
  readonly estado: EstadoSolicitudSOM;
  /**
   * true solo si el DiagnosticReport del informe está `final` y tiene un `resultsInterpreter`
   * Practitioner: la única marca de firma médica que hay. Sin ella, la Home nunca dice «firmado».
   */
  readonly firmada: boolean;
  /** Etiqueta para la paciente (`etiquetaSolicitudSOM` de src/fhir/som.ts). */
  readonly etiqueta: string;
  /** Fecha del pedido (ServiceRequest.authoredOn). */
  readonly pedida?: string;
  /** Última actualización (meta.lastUpdated): sirve para saber si el informe es reciente. */
  readonly actualizada?: string;
}

/** El último PDF de laboratorio que mandó la paciente y qué hizo el agente con él. */
export interface LaboratorioHome {
  /**
   * `en-proceso` hasta que el bot `som-procesar-laboratorio` suma su DiagnosticReport;
   * `demorado` si pasó más de un día sin resultado (el bot no pudo leerlo y le escribe a la
   * paciente por Mensajes: no queda «leyendo» para siempre).
   */
  readonly estado: 'en-proceso' | 'demorado' | 'procesado';
  /** Fecha del documento (DocumentReference.date). */
  readonly fecha?: string;
  /** Cantidad de valores que leyó el agente (DiagnosticReport.result.length). */
  readonly valores?: number;
  readonly informeId?: string;
  /** true solo si el DiagnosticReport está `final` y tiene `resultsInterpreter` (lo revisó un médico). */
  readonly revisionMedica: boolean;
}

/**
 * PREVENT del informe de la Segunda Opinión (el RiskAssessment que calcula el bot; probabilidades
 * 0-1). Es «firmado» solo si la Segunda Opinión está `firmada`.
 */
export interface PreventFirmado {
  readonly ascvd10?: number;
  readonly hf10?: number;
  readonly total30?: number;
  /** Fecha del informe (DiagnosticReport.issued o RiskAssessment.occurrenceDateTime). */
  readonly fecha?: string;
}

/**
 * PREVENT estimado en el portal con los datos de la paciente (la fórmula de la AHA, sin
 * revisión médica): el mismo cálculo que mostraba la Home clásica; hoy lo muestran E y D con el
 * modelo de prevent.ts. Probabilidades 0-1, como el firmado.
 */
export interface PreventEstimado extends PreventFirmado {
  /** Datos que faltan o que limitan la estimación (en español, del vendor). */
  readonly faltantes: readonly string[];
}

/** La última consulta que ya pasó (para saber si la devolución de sus datos ya se dio). */
export interface UltimaConsulta {
  /** Appointment.start (ISO). */
  readonly inicio: string;
}

/** El próximo turno de la paciente (Appointment futuro, no cancelado ni realizado). */
export interface ProximoTurno {
  readonly id: string;
  /** Appointment.start (ISO). */
  readonly inicio: string;
  readonly teleconsulta: boolean;
}

/**
 * Los tres caminos que la Home le ofrece a la paciente, en este orden: 1) el Plan Bienestar ·
 * 100 días, 2) la Segunda Opinión y 3) la teleconsulta para revisar sus resultados con el
 * equipo médico (quien sube datos tiene que saber que le vamos a dar una devolución).
 */
export type ClaveCamino = 'plan' | 'segunda-opinion' | 'teleconsulta';

export interface Camino {
  readonly clave: ClaveCamino;
  /** 1, 2 o 3. */
  readonly numero: number;
  readonly titulo: string;
  readonly descripcion: string;
  /** Dónde está la paciente en ese camino («Día 63 de 100», «En análisis»…), si ya entró. */
  readonly estado?: string;
  readonly cta: string;
  readonly href: string;
  /** Uno solo (o ninguno) va como «Recomendado para vos». */
  readonly recomendado: boolean;
  /** Una aclaración corta debajo del botón (p. ej. qué tiene costo). */
  readonly nota?: string;
}

/** Todo lo que muestra la Home E, cargado una sola vez y pasado por props. */
export interface DatosHomeE {
  /** true mientras falta alguna carga; cada sección decide qué mostrar mientras tanto. */
  readonly cargando: boolean;
  /** true si el perfil es una paciente (con un Practitioner la Home no tiene datos que mostrar). */
  readonly esPaciente: boolean;
  /** Primer nombre de la paciente, si lo hay. */
  readonly nombre?: string;
  /** Hoy en Argentina, AAAA-MM-DD. */
  readonly hoy: string;
  /** Puntaje LE8 de hoy (siempre 8 dominios si hay paciente; total undefined sin datos). */
  readonly le8?: ResultadoLe8;
  /** Puntaje LE8 del día 0 del plan, si hay plan con fecha de inicio. */
  readonly le8Inicial?: ResultadoLe8;
  /** Plan Bienestar · 100 días; undefined si no está inscripta. */
  readonly plan?: PlanBienestar;
  /** El estadio CKM del equipo; undefined si el equipo todavía no registró uno. */
  readonly ckm?: EstadioCkmHome;
  /** «Tus valores» (hgraph.ts); undefined mientras carga o si no se pudieron leer. */
  readonly hgraph?: ModeloHgraph;
  readonly segundaOpinion?: SegundaOpinionHome;
  readonly laboratorio?: LaboratorioHome;
  readonly equipo?: EquipoDeSalud;
  readonly consentimiento: EstadoConsentimiento;
  /** Fecha de firma del consentimiento (DocumentReference.date). */
  readonly fechaConsentimiento?: string;
  readonly ingresoPendiente: boolean;
  readonly novedadesSinLeer: number;
  /** Solo si la Segunda Opinión está completada y su informe trae el RiskAssessment. */
  readonly prevent?: PreventFirmado;
  /** La estimación con sus datos (sin revisión médica); undefined si no alcanzan los datos. */
  readonly preventEstimado?: PreventEstimado;
  /** Qué falta para estimar PREVENT cuando no hay estimación. */
  readonly preventFaltantes?: readonly string[];
  /** El próximo turno, si tiene uno reservado. */
  readonly proximoTurno?: ProximoTurno;
  /** La última consulta que ya pasó, si hay. */
  readonly ultimaConsulta?: UltimaConsulta;
}

/** «Lo de hoy»: una sola acción, elegida por una regla fija (no la elige la IA). */
export interface ParaHoy {
  /** Identificador estable de la regla que la eligió (para tests y métricas). */
  readonly clave: string;
  readonly titulo: string;
  readonly detalle: string;
  readonly cta: string;
  readonly href: string;
}

/**
 * Cómo se pintan los pétalos de la rosa:
 * - `tinta`: todos del mismo azul (el diseño aprobado);
 * - `dominio`: cada hábito con su color;
 * - `banda`: según la banda LE8 de cada hábito (alta / moderada / baja).
 */
export type ModoColorPetalos = 'tinta' | 'dominio' | 'banda';

/** Nodos del anillo del equipo médico que se dibujan en la rosa, si existen. */
export type NodoEquipo = 'cabecera' | 'plan' | 'segunda-opinion';

/** Lo que muestran los anillos alrededor de la rosa. */
export interface AnillosRosa {
  /** El anillo de IA gira mientras hay algo en proceso (PDF en proceso o Segunda Opinión en análisis). */
  readonly iaEnProceso: boolean;
  /** Marca «Laboratorio · leído por IA» sobre el anillo de IA. */
  readonly laboratorioLeido: boolean;
  /**
   * La Segunda Opinión en la rosa: en análisis (tramo encendido: IA + equipo juntos), en revisión
   * por el cardiólogo (la IA ya terminó: sin tramo) o informe listo.
   */
  readonly segundaOpinion?: 'en-analisis' | 'en-revision' | 'completada';
  /** Si el informe tiene firma médica registrada (si no, el nodo dice «informe listo», no «firmada»). */
  readonly segundaOpinionFirmada?: boolean;
  readonly equipo: readonly NodoEquipo[];
}

export interface RosaLe8Props {
  /** Los 8 dominios, en el orden de LE8_DOMINIOS. */
  readonly dominios: readonly PuntajeDominio[];
  readonly total?: number;
  readonly categoria?: CategoriaLe8;
  /** Total LE8 del día 0, si lo hay. */
  readonly totalInicial?: number;
  readonly anillos: AnillosRosa;
  /** Por defecto, el de COLORES_PETALOS.modo (rosa.ts). */
  readonly modoColor?: ModoColorPetalos;
  /** Texto del nodo de la Segunda Opinión (MARCA.producto). */
  readonly nombreSegundaOpinion: string;
}

export type { CategoriaLe8, Le8Domain, PuntajeDominio, ResultadoLe8 };

// ─── Estilo D («Salidas y llegadas») ─────────────────────────────────────────────────
// La ve todo el que no ve el E: hombres, mujeres fuera de 45-55 y quien no cargó sexo o fecha
// de nacimiento. Por eso sus textos son neutros (nada de «bienvenida», «inscripta», «lista»).

/** Tema de la Home D: oscuro (el diseño aprobado) o su equivalente claro. */
export type TemaHomeD = 'oscuro' | 'claro';

/** Una fila del tablero es algo que mandó la persona (salida) o algo que le vuelve (llegada). */
export type SentidoFila = 'salida' | 'llegada';

/**
 * Tono del estado de una fila (siempre acompaña a un texto, nunca solo color):
 * `en-curso` (en proceso, en análisis, en camino), `listo` (procesado, registrado, listo),
 * `atencion` (sin revisión médica, para leer), `demorado` y `neutro`.
 */
export type TonoEstado = 'en-curso' | 'listo' | 'atencion' | 'demorado' | 'neutro';

/** Recurso FHIR del que sale cada fila (cada fila es un recurso real con su estado real). */
export type RecursoFila =
  | 'DocumentReference'
  | 'DiagnosticReport'
  | 'ServiceRequest'
  | 'QuestionnaireResponse'
  | 'Observation'
  | 'Communication';

/** Una fila del tablero «Salidas y llegadas de tus datos». */
export interface FilaTablero {
  /** Estable y único: `Tipo/id` del recurso (o `Tipo/id#llegada` si un recurso da dos filas). */
  readonly id: string;
  readonly sentido: SentidoFila;
  readonly recurso: RecursoFila;
  /** ISO del recurso (cuándo se mandó o llegó). Undefined para lo que todavía no llegó: «—». */
  readonly fecha?: string;
  /** meta.lastUpdated: si es posterior a la última visita, la fila «cambió» (Nuevo + paletas). */
  readonly actualizada?: string;
  /** Qué es, en palabras de la persona: «PDF de laboratorio», «Resultados de laboratorio». */
  readonly que: string;
  /** Origen → destino: «Tu app → Agente de laboratorio», «Llegada → Biomarcadores». */
  readonly ruta: string;
  /** Estado corto, en castellano normal (la pantalla lo pasa a mayúsculas): «Listo: 14 valores». */
  readonly estado: string;
  readonly tono: TonoEstado;
  /** Aclaración honesta debajo, si hace falta: «Estos valores los leyó un agente de IA de tu PDF…». */
  readonly nota?: string;
  /** El detalle en el portal (ruta real). Sin él, la fila no es un link (no se inventa un destino). */
  readonly href?: string;
}

/** Lo que muestra el tablero. */
export interface TableroHomeD {
  /** true hasta que terminaron todas las consultas del tablero. */
  readonly cargando: boolean;
  /** Las filas, de la más nueva a la más vieja; las que todavía no llegaron (sin fecha), al final. */
  readonly filas: readonly FilaTablero[];
  /** Ids de las filas que cambiaron desde la última visita en este dispositivo. */
  readonly nuevas: ReadonlySet<string>;
  /** true si alguna consulta falló: el tablero lo dice en vez de mostrarse completo. */
  readonly incompleto: boolean;
}

/** Estaciones de la ruta de ida y vuelta, en orden: la ida (5) y la vuelta (3). */
export type ClaveEstacion = 'app' | 'historia' | 'consentimiento' | 'ia' | 'equipo' | 'informe' | 'avisos' | 'vos';

/**
 * `recorrida` (ya pasó por ahí), `activa` (está ahí ahora), `por-recorrer` y `cerrada` (el
 * control de consentimiento sin firma: la línea se corta ahí).
 */
export type EstadoEstacion = 'recorrida' | 'activa' | 'por-recorrer' | 'cerrada';

export interface EstacionRuta {
  readonly clave: ClaveEstacion;
  /** «Tu app», «Tu historia clínica», «Agentes de IA»… */
  readonly nombre: string;
  /** Debajo del nombre: «FHIR R4», «firmado el 8 de agosto», «ordenan y calculan»… */
  readonly detalle?: string;
  readonly estado: EstadoEstacion;
}

/** La ruta en U del hero: de tu app a tu equipo y de vuelta a vos. */
export interface RutaHomeD {
  /** «Tu {producto}, ida y vuelta» o «Tus datos, ida y vuelta». */
  readonly titulo: string;
  /** «Pedida el 28 de septiembre», «Laboratorio del 3 de octubre»… */
  readonly subtitulo?: string;
  /** Las 8, en el orden de ClaveEstacion. */
  readonly estaciones: readonly EstacionRuta[];
  /** Rótulo del tramo activo («En análisis · desde el 28 de septiembre»), si hay uno. */
  readonly etiquetaActiva?: string;
  /** true mientras algo está en curso (Segunda Opinión en análisis o PDF en proceso): pulso de luz. */
  readonly enCurso: boolean;
  /** Una frase que explica qué pasa ahora, sin prometer plazos ni revisiones que no hubo. */
  readonly explicacion: string;
  /** El control de consentimiento: su estado y su texto. */
  readonly control: { readonly estado: EstadoConsentimiento; readonly texto: string };
  /**
   * El link de la tarjeta («Ver mi {producto}», «Reservar mi teleconsulta», «Firmar mi
   * consentimiento»…) y, si hace falta, una aclaración debajo (qué tiene costo la teleconsulta).
   */
  readonly accion?: { readonly texto: string; readonly href: string; readonly nota?: string };
}

/** La «puerta» del hero: un solo próximo paso. */
export interface PuertaHomeD {
  /** «Tu próximo paso». */
  readonly overline: string;
  /** El H1, con el nombre si lo hay: «Jorge, hoy te queda un paso.» (nunca sugiere una revisión que no hubo). */
  readonly titulo: string;
  /** La bajada: qué hacer y por qué, en una o dos frases. */
  readonly bajada: string;
  /** La acción (de `paraHoy`): su `cta` y su `href` son el botón principal. */
  readonly paso: ParaHoy;
  /** Una aclaración debajo del botón: qué tiene costo, si el botón lleva a reservar una teleconsulta. */
  readonly nota?: string;
}
