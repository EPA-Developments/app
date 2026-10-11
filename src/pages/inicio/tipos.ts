// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Tipos compartidos de la Home por estilos (ver docs/home-propuestas.md).
//
// La Home tiene dos estilos según la paciente: el E («Vos en el centro»: la rosa de los 8
// hábitos rodeada por los anillos de los agentes de IA y del equipo médico) para mujeres de 45
// a 55 años, y el D («Salidas y llegadas») para el resto. Mientras el D no esté construido,
// el resto ve la Home clásica.
import type { CategoriaLe8, Le8Domain, PuntajeDominio, ResultadoLe8 } from '@epa/careplan-menopausia';
import type { EquipoDeSalud } from '../../fhir/equipo';
import type { PlanBienestar } from '../../fhir/bienestar';

/** Estilo de la Home: E («Vos en el centro») o D («Salidas y llegadas»). */
export type EstiloHome = 'E' | 'D';

/** Estado del consentimiento informado de la paciente. */
export type EstadoConsentimiento = 'cargando' | 'falta' | 'desactualizado' | 'firmado';

/** Estadio CKM (0-4) y de dónde sale: el del plan (lo registró el equipo) o el estimado con sus datos. */
export interface EstadioCkmHome {
  readonly estadio: 0 | 1 | 2 | 3 | 4;
  readonly origen: 'plan' | 'estimado';
}

/** La Segunda Opinión más reciente de la paciente (ServiceRequest de SOM). */
export interface SegundaOpinionHome {
  readonly id: string;
  /**
   * `active` = en análisis; `completed` = el informe está listo (lo completa el bot que lo
   * prepara con IA: completada NO quiere decir firmada); `revoked` o `entered-in-error` =
   * cancelada (se le vuelve a ofrecer pedirla); el resto (en pausa, borrador…), «otro».
   */
  readonly estado: 'en-analisis' | 'completada' | 'cancelada' | 'otro';
  /**
   * true solo si el DiagnosticReport del informe está `final` y tiene un `resultsInterpreter`
   * Practitioner: la única marca de firma médica que hay. Sin ella, la Home nunca dice «firmado».
   */
  readonly firmada: boolean;
  /** Etiqueta para la paciente (ESTADO_SOM de src/fhir/som.ts). */
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
 * revisión médica): lo que muestra hoy la Home clásica. Probabilidades 0-1, como el firmado.
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
  readonly ckm?: EstadioCkmHome;
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
  /** Tramo encendido de la Segunda Opinión: IA + equipo juntos (en análisis) o informe listo. */
  readonly segundaOpinion?: 'en-analisis' | 'completada';
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
