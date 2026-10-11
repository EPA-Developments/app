// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// La ruta en U del hero de la Home D («Salidas y llegadas»): de tu app a tu equipo y de vuelta
// a vos, con el consentimiento como control en el medio. Funciones puras: dicen en qué estación
// está cada cosa a partir de DatosHomeE, sin inventar estados que el backend no registra ni
// revisiones médicas que no hubo. El nombre del servicio entra por parámetro (MARCA.producto).
//
// Las reglas, en este orden:
//  1. Un perfil que no es Patient: todo por recorrer, sin acción.
//  2. Consentimiento sin firmar: el control se cierra (candado) y lo que sigue queda por recorrer.
//  3. Segunda Opinión vigente: en análisis (agentes de IA y equipo médico juntos: no hay un
//     estado intermedio registrado), completada (vuelve el informe) u otro estado.
//  4. Sin Segunda Opinión, el último PDF de laboratorio: en proceso o demorado.
//  5. Datos que ya volvieron (PDF leído o hábitos cargados): si nadie del equipo los revisó, el
//     dibujo lo muestra (la estación del equipo queda por recorrer) y propone la teleconsulta,
//     avisando qué tiene costo. Una consulta cuenta como revisión solo si fue después del
//     laboratorio: con solo hábitos no hay fecha con qué compararla.
//  6. Sin datos: la ruta empieza en tu app.
// Con el consentimiento desactualizado, el control queda activo (hay una versión nueva) y la
// línea sigue según lo demás; mientras se consulta, no se cierra nada.
import { RUTA_ENVIAR_ESTUDIOS } from '../../components/AccionesRapidas';
import { RUTA_CONSENTIMIENTO } from '../../components/AvisoConsentimiento';
import {
  devolucionDada,
  NOTA_COSTO_TELECONSULTA,
  pidioSegundaOpinion,
  puedeOfrecerTeleconsulta,
  subioDatos,
} from './caminos';
import { fechaCorta } from './formato';
import { RUTA_MI_SEGUNDA_OPINION, RUTA_MIS_TURNOS, RUTA_RESERVAR_TELECONSULTA, RUTA_TABLERO_LE8 } from './rutas';
import type {
  ClaveEstacion,
  DatosHomeE,
  EstacionRuta,
  EstadoConsentimiento,
  EstadoEstacion,
  RutaHomeD,
  SegundaOpinionHome,
} from './tipos';
import { NOTA_PDF_DEMORADO } from './useDatosHomeE';

/** Los resultados de laboratorio en la historia clínica (el detalle es `/{id del informe}`). */
const RUTA_RESULTADOS_LABORATORIO = '/health-record/lab-results';

export interface OpcionesRuta {
  /** El servicio que pide la persona (MARCA.producto). */
  readonly producto: string;
}

/** Las 8 estaciones, en orden: la ida (de tu app a tu equipo) y la vuelta (de tus resultados a vos). */
export const ORDEN_ESTACIONES: readonly ClaveEstacion[] = [
  'app',
  'historia',
  'consentimiento',
  'ia',
  'equipo',
  'informe',
  'avisos',
  'vos',
];

/** Cuántas estaciones tiene la ida; las demás son la vuelta. */
export const ESTACIONES_DE_IDA = 5;

const NOMBRE: Readonly<Record<Exclude<ClaveEstacion, 'informe'>, string>> = {
  app: 'Tu app',
  historia: 'Tu historia clínica',
  consentimiento: 'Consentimiento',
  ia: 'Agentes de IA',
  equipo: 'Equipo médico',
  avisos: 'Novedades',
  vos: 'Vos',
};

/** El texto del recuadro del control, según el estado del consentimiento. */
export const TEXTO_CONTROL: Readonly<Record<EstadoConsentimiento, string>> = {
  firmado: 'Control de consentimiento: firmado. Sin tu firma, tus datos clínicos no pasan por nuestros agentes de IA.',
  falta: 'Control de consentimiento: falta tu firma. Sin ella, tus datos clínicos no pasan por nuestros agentes de IA.',
  desactualizado: 'Control de consentimiento: hay una versión nueva para firmar.',
  cargando: 'Control de consentimiento: lo estamos consultando.',
};

/** El control para un perfil que no es Patient: no le pide su firma a nadie. */
export const TEXTO_CONTROL_NEUTRO =
  'Control de consentimiento: sin firma, los datos clínicos no pasan por nuestros agentes de IA.';

export const EXPLICACION_EN_ANALISIS =
  'Nuestros agentes de IA y nuestro equipo médico trabajan juntos en tu caso. Te avisamos en Novedades cuando esté listo.';
export const EXPLICACION_SIN_REVISION =
  'Un agente de IA leyó tus datos y te los devolvió. Falta una estación: revisarlos con un profesional de nuestro equipo.';
/**
 * Solo hábitos (cuestionarios, presión, peso): el puntaje lo calcula el portal con una fórmula,
 * no lo lee un agente de IA. No se dice que «un agente leyó» lo que nadie leyó.
 */
export const EXPLICACION_HABITOS_SIN_REVISION =
  'Tus datos volvieron a vos como puntajes calculados automáticamente. Falta una estación: revisarlos con un profesional de nuestro equipo.';
/**
 * Solo hábitos y una consulta que ya pasó: no hay fecha de los datos con qué compararla, así que
 * no se afirma que esa consulta los revisó (ni que no): se deja a mano otra teleconsulta.
 */
export const EXPLICACION_HABITOS_OTRA_CONSULTA =
  'Tus datos volvieron a vos como puntajes calculados automáticamente. Si querés revisarlos con un profesional de nuestro equipo, podés reservar otra teleconsulta.';
export const EXPLICACION_PDF_EN_PROCESO =
  'Un agente de IA está leyendo tu PDF para pasar los valores a tus biomarcadores.';
/** La misma frase que la Home E (NOTA_PDF_DEMORADO): el bot le escribe por Mensajes si no pudo leer el PDF. */
export const EXPLICACION_PDF_DEMORADO = `Tu PDF se está demorando. ${NOTA_PDF_DEMORADO}`;
export const EXPLICACION_SIN_DATOS = 'Cuando mandes tu laboratorio o tus datos, vas a ver acá su recorrido.';
export const EXPLICACION_NO_PACIENTE = 'Esta ruta muestra el recorrido de los datos de cada paciente.';

type Estados = Partial<Record<ClaveEstacion, EstadoEstacion>>;
type Detalles = Partial<Record<ClaveEstacion, string>>;

/** Lo que cambia de un caso a otro (lo que no se dice, queda por recorrer y sin detalle propio). */
interface Recorrido {
  readonly estados: Estados;
  readonly detalles?: Detalles;
  readonly etiquetaActiva?: string;
  readonly enCurso?: boolean;
  readonly explicacion: string;
  readonly accion?: RutaHomeD['accion'];
}

/** Las claves dadas, todas con el mismo estado. */
function todas(claves: readonly ClaveEstacion[], estado: EstadoEstacion): Estados {
  return Object.fromEntries(claves.map((clave) => [clave, estado]));
}

const HASTA_EL_CONTROL: readonly ClaveEstacion[] = ['app', 'historia', 'consentimiento'];

/** «firmado el 8 de agosto», «falta tu firma» o «hay una versión nueva» (también lo usa «También en tu portal»). */
export function detalleConsentimiento(datos: DatosHomeE): string | undefined {
  switch (datos.consentimiento) {
    case 'firmado': {
      const fecha = fechaCorta(datos.fechaConsentimiento, datos.hoy);
      return fecha ? `firmado el ${fecha}` : 'firmado';
    }
    case 'falta':
      return 'falta tu firma';
    case 'desactualizado':
      return 'hay una versión nueva';
    default:
      return undefined;
  }
}

/** Consentimiento sin firmar: lo que mandó llega a su historia clínica y se detiene en el control. */
function sinFirma(datos: DatosHomeE): Recorrido {
  const hayDatos = subioDatos(datos) || datos.laboratorio !== undefined || pidioSegundaOpinion(datos);
  return {
    estados: { ...(hayDatos ? todas(['app', 'historia'], 'recorrida') : { app: 'activa' }), consentimiento: 'cerrada' },
    detalles: hayDatos ? undefined : { app: 'tu ruta empieza acá' },
    explicacion: hayDatos
      ? 'Tus datos llegaron a tu historia clínica y se detienen en el control hasta que firmes tu consentimiento.'
      : 'Tu ruta se detiene en el control hasta que firmes tu consentimiento.',
    accion: { texto: 'Firmar mi consentimiento', href: RUTA_CONSENTIMIENTO },
  };
}

function conSegundaOpinion(datos: DatosHomeE, som: SegundaOpinionHome, producto: string): Recorrido {
  const verla = { texto: `Ver mi ${producto}`, href: RUTA_MI_SEGUNDA_OPINION };
  if (som.estado === 'en-analisis') {
    const desde = fechaCorta(som.pedida, datos.hoy);
    return {
      // IA y equipo encendidos JUNTOS: el backend no registra en cuál de los dos está.
      estados: { ...todas(HASTA_EL_CONTROL, 'recorrida'), ia: 'activa', equipo: 'activa' },
      etiquetaActiva: desde ? `En análisis · desde el ${desde}` : 'En análisis',
      enCurso: true,
      explicacion: EXPLICACION_EN_ANALISIS,
      accion: verla,
    };
  }
  if (som.estado === 'completada') {
    return {
      estados: { ...todas(ORDEN_ESTACIONES, 'recorrida'), vos: 'activa' },
      // «Firmado» solo con la firma médica registrada (ver SegundaOpinionHome.firmada). Sin ella,
      // la estación del equipo lo dice (el dibujo y la lista leída dicen lo mismo que el texto).
      detalles: som.firmada ? { informe: 'firmado' } : { equipo: 'sin firma registrada', informe: 'listo' },
      explicacion: som.firmada
        ? 'Tu informe volvió con firma médica.'
        : 'Tu informe está listo. Lo preparamos con IA y no tiene firma médica registrada: si te surgen dudas, revisalo con un profesional de nuestro equipo en una teleconsulta.',
      accion: { texto: 'Ver mi informe', href: RUTA_MI_SEGUNDA_OPINION },
    };
  }
  // En pausa, borrador, pendiente…: no se adivina por dónde va.
  return {
    estados: todas(HASTA_EL_CONTROL, 'recorrida'),
    explicacion: `Estado de tu pedido: ${som.etiqueta}. En tu ${producto} ves el detalle.`,
    accion: verla,
  };
}

/** Lo que vuelve a vos sin Segunda Opinión: el PDF leído por IA o el puntaje de tus hábitos. */
function datosQueVolvieron(datos: DatosHomeE): Recorrido {
  const { hoy, laboratorio: lab, proximoTurno: turno } = datos;
  const pdfLeido = lab?.estado === 'procesado';
  const verResultados = {
    texto: 'Ver mis resultados',
    href: pdfLeido
      ? lab.informeId
        ? `${RUTA_RESULTADOS_LABORATORIO}/${lab.informeId}`
        : RUTA_RESULTADOS_LABORATORIO
      : RUTA_TABLERO_LE8,
  };
  const ida = todas([...HASTA_EL_CONTROL, 'ia'], 'recorrida');
  const vuelta: Estados = { informe: 'recorrida', avisos: 'recorrida', vos: 'activa' };

  if (pdfLeido && lab.revisionMedica) {
    return {
      estados: { ...ida, equipo: 'recorrida', ...vuelta },
      detalles: { equipo: 'revisó tu laboratorio', informe: 'con revisión médica' },
      explicacion: 'Tus resultados de laboratorio volvieron con revisión médica.',
      accion: verResultados,
    };
  }

  // Volvieron sin pasar por un médico: el equipo queda por recorrer (salvo que ya haya habido
  // una consulta DESPUÉS del laboratorio; con solo hábitos no hay fecha con qué compararla).
  const informe = pdfLeido ? 'leídos por IA' : 'calculados';
  const primera = pdfLeido
    ? 'Un agente de IA leyó tus datos y te los devolvió.'
    : 'Tus datos volvieron a vos como puntajes calculados automáticamente.';
  const reservar = {
    texto: 'Reservar mi teleconsulta',
    href: RUTA_RESERVAR_TELECONSULTA,
    nota: NOTA_COSTO_TELECONSULTA,
  };
  if (pdfLeido && lab.fecha && devolucionDada(datos)) {
    const consulta = fechaCorta(datos.ultimaConsulta?.inicio, hoy);
    return {
      estados: { ...ida, equipo: 'recorrida', ...vuelta },
      detalles: { equipo: consulta ? `en tu consulta del ${consulta}` : 'en tu consulta', informe },
      explicacion: `${primera} Después tuviste una consulta con nuestro equipo${consulta ? `, el ${consulta}` : ''}.`,
      accion: verResultados,
    };
  }
  if (turno) {
    const delTurno = fechaCorta(turno.inicio, hoy);
    return {
      estados: { ...ida, ...vuelta },
      detalles: { equipo: delTurno ? `en tu turno del ${delTurno}` : 'en tu turno', informe },
      explicacion: `${primera} Falta una estación: revisarlos con un profesional de nuestro equipo en tu turno${delTurno ? ` del ${delTurno}` : ''}.`,
      accion: turno.teleconsulta
        ? { texto: 'Ver mi teleconsulta', href: `/teleconsulta/${turno.id}` }
        : { texto: 'Ver mis turnos', href: RUTA_MIS_TURNOS },
    };
  }
  if (!pdfLeido && devolucionDada(datos)) {
    return {
      estados: { ...ida, ...vuelta },
      detalles: { equipo: 'en una teleconsulta', informe },
      explicacion: EXPLICACION_HABITOS_OTRA_CONSULTA,
      accion: { ...reservar, texto: 'Reservar otra teleconsulta' },
    };
  }
  return {
    estados: { ...ida, ...vuelta },
    detalles: { equipo: 'en una teleconsulta', informe },
    explicacion: pdfLeido ? EXPLICACION_SIN_REVISION : EXPLICACION_HABITOS_SIN_REVISION,
    accion: puedeOfrecerTeleconsulta(datos) ? reservar : verResultados,
  };
}

function sinSegundaOpinion(datos: DatosHomeE): Recorrido {
  const lab = datos.laboratorio;
  if (lab?.estado === 'en-proceso' || lab?.estado === 'demorado') {
    const demorado = lab.estado === 'demorado';
    const desde = fechaCorta(lab.fecha, datos.hoy);
    return {
      estados: { ...todas(HASTA_EL_CONTROL, 'recorrida'), ia: 'activa' },
      detalles: { ia: demorado ? 'demorado' : 'leen tu PDF' },
      etiquetaActiva: demorado ? 'Demorado' : desde ? `En proceso · desde el ${desde}` : 'En proceso',
      enCurso: !demorado,
      explicacion: demorado ? EXPLICACION_PDF_DEMORADO : EXPLICACION_PDF_EN_PROCESO,
      accion: { texto: 'Ver mis estudios enviados', href: RUTA_ENVIAR_ESTUDIOS },
    };
  }
  if (lab?.estado === 'procesado' || subioDatos(datos)) {
    return datosQueVolvieron(datos);
  }
  return {
    estados: { app: 'activa' },
    detalles: { app: 'tu ruta empieza acá' },
    explicacion: EXPLICACION_SIN_DATOS,
    accion: { texto: 'Enviar mi laboratorio en PDF', href: RUTA_ENVIAR_ESTUDIOS },
  };
}

/** La ruta de ida y vuelta de los datos de la persona. Función pura: no consulta nada. */
export function rutaDe(datos: DatosHomeE, opciones: OpcionesRuta): RutaHomeD {
  const som = pidioSegundaOpinion(datos) ? datos.segundaOpinion : undefined;
  const pedida = som ? fechaCorta(som.pedida, datos.hoy) : undefined;
  const delLaboratorio = som ? undefined : fechaCorta(datos.laboratorio?.fecha, datos.hoy);
  let subtitulo: string | undefined;
  if (pedida) {
    subtitulo = `Pedida el ${pedida}`;
  } else if (delLaboratorio) {
    subtitulo = `Laboratorio del ${delLaboratorio}`;
  }
  const titulo = som ? `Tu ${opciones.producto}, ida y vuelta` : 'Tus datos, ida y vuelta';

  let recorrido: Recorrido;
  if (!datos.esPaciente) {
    recorrido = { estados: {}, explicacion: EXPLICACION_NO_PACIENTE };
  } else if (datos.consentimiento === 'falta') {
    recorrido = sinFirma(datos);
  } else if (som) {
    recorrido = conSegundaOpinion(datos, som, opciones.producto);
  } else {
    recorrido = sinSegundaOpinion(datos);
  }

  const estados: Estados = { ...recorrido.estados };
  if (datos.esPaciente && datos.consentimiento === 'desactualizado') {
    // Hay una versión nueva: el control se enciende, pero la línea sigue según lo demás.
    estados.consentimiento = 'activa';
  }
  const detalles: Detalles = {
    historia: 'FHIR R4',
    consentimiento: datos.esPaciente ? detalleConsentimiento(datos) : undefined,
    ia: 'ordenan y calculan',
    avisos: 'y Mensajes',
    ...recorrido.detalles,
  };

  const estaciones = ORDEN_ESTACIONES.map((clave): EstacionRuta => {
    const nombre = clave === 'informe' ? (som ? 'Informe y PDF' : 'Tus resultados') : NOMBRE[clave];
    const detalle = detalles[clave];
    const estado = estados[clave] ?? 'por-recorrer';
    return detalle ? { clave, nombre, detalle, estado } : { clave, nombre, estado };
  });

  return {
    titulo,
    subtitulo,
    estaciones,
    etiquetaActiva: recorrido.etiquetaActiva,
    enCurso: recorrido.enCurso ?? false,
    explicacion: recorrido.explicacion,
    control: {
      estado: datos.consentimiento,
      texto: datos.esPaciente ? TEXTO_CONTROL[datos.consentimiento] : TEXTO_CONTROL_NEUTRO,
    },
    accion: recorrido.accion,
  };
}

// ─── El dibujo ───────────────────────────────────────────────────────────────────────────
// Cómo se traza cada tramo de la U (lo usa RutaIdaVuelta.tsx; puro para poder probarlo).

/** `recorrido` (sólido), `por-recorrer` (punteado) o `cortado` (después del control cerrado: no hay línea). */
export type EstadoTramo = 'recorrido' | 'por-recorrer' | 'cortado';

const EN_LA_RUTA: ReadonlySet<EstadoEstacion> = new Set<EstadoEstacion>(['recorrida', 'activa']);

/** El tramo entre dos estaciones seguidas. */
export function tramoEntre(desde: EstadoEstacion, hasta: EstadoEstacion): EstadoTramo {
  if (desde === 'cerrada') {
    return 'cortado';
  }
  if (!EN_LA_RUTA.has(desde)) {
    return 'por-recorrer';
  }
  // Lo que llegó hasta el control cerrado sí recorrió ese tramo: se corta después del candado.
  return EN_LA_RUTA.has(hasta) || hasta === 'cerrada' ? 'recorrido' : 'por-recorrer';
}

/** Media línea a un lado de una estación (la que llega o la que sale). */
export interface MitadTramo {
  readonly estado: EstadoTramo;
  /** Orden en que se dibuja al entrar (solo los tramos recorridos, de 0 en adelante). */
  readonly orden?: number;
  /** Lugar en la cadena del pulso de luz: solo con `enCurso`, desde tu app hasta donde llegó. */
  readonly pulso?: number;
}

export interface TramosEstacion {
  /** La media línea que llega (no la tiene tu app). */
  readonly entrada?: MitadTramo;
  /** La media línea que sale (no la tiene Vos). */
  readonly salida?: MitadTramo;
  /** Agentes de IA y equipo médico activos juntos: una cápsula los une. */
  readonly capsula?: 'inicio' | 'fin';
}

export interface DibujoRuta {
  readonly tramos: Readonly<Record<ClaveEstacion, TramosEstacion>>;
  /** El giro de la U, entre el equipo médico y la vuelta. */
  readonly giro: MitadTramo;
  /** Cuántas piezas recorridas se dibujan al entrar (el trazo dura lo mismo con muchas o pocas). */
  readonly trazos: number;
  /** Cuántas piezas recorre el pulso (0 si no hay nada en curso). */
  readonly pulsos: number;
}

/** Las piezas de la U, en el orden en que las recorren tus datos. Función pura. */
export function dibujoDe(ruta: RutaHomeD): DibujoRuta {
  const estado = (clave: ClaveEstacion): EstadoEstacion =>
    ruta.estaciones.find((e) => e.clave === clave)?.estado ?? 'por-recorrer';
  let trazos = 0;
  let pulsos = 0;
  let cadena = ruta.enCurso;
  const mitad = (desde: ClaveEstacion, hasta: ClaveEstacion): MitadTramo => {
    const tramo = tramoEntre(estado(desde), estado(hasta));
    const recorrido = tramo === 'recorrido';
    cadena = cadena && recorrido;
    const pieza: MitadTramo = {
      estado: tramo,
      ...(recorrido ? { orden: trazos++ } : {}),
      ...(cadena ? { pulso: pulsos++ } : {}),
    };
    return pieza;
  };

  const tramos = {} as Record<ClaveEstacion, TramosEstacion>;
  let giro: MitadTramo = { estado: 'por-recorrer' };
  const juntos = estado('ia') === 'activa' && estado('equipo') === 'activa';
  ORDEN_ESTACIONES.forEach((clave, i) => {
    const anterior = ORDEN_ESTACIONES[i - 1];
    const siguiente = ORDEN_ESTACIONES[i + 1];
    if (clave === 'informe') {
      giro = mitad('equipo', 'informe');
    }
    const entrada = anterior ? mitad(anterior, clave) : undefined;
    const salida = siguiente ? mitad(clave, siguiente) : undefined;
    let capsula: TramosEstacion['capsula'];
    if (juntos && clave === 'ia') {
      capsula = 'inicio';
    } else if (juntos && clave === 'equipo') {
      capsula = 'fin';
    }
    tramos[clave] = { entrada, salida, capsula };
  });
  return { tramos, giro, trazos, pulsos };
}
