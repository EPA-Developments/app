// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// El modelo de la tarjeta PREVENT (el riesgo cardiovascular de la AHA), compartido por las Homes
// E y D: cada una lo dibuja con su estilo, pero las reglas son las mismas y viven acá.
//
// De dónde sale el riesgo (ProcedenciaPrevent), en este orden:
//  1. `firmado`: el del informe de la Segunda Opinión, con la firma médica registrada
//     (`segundaOpinion.firmada`: DiagnosticReport `final` + `resultsInterpreter` Practitioner);
//  2. `informe-ia`: el del informe sin esa firma: lo calculó el bot que prepara el informe con IA,
//     y nunca se dice «firmado»;
//  3. `estimado`: la estimación con los datos de la persona, sin revisión médica;
//  4. `sin-datos`: no alcanzan los datos; se dice qué falta.
//
// Con número (las tres primeras), siempre la leyenda de calibración (LEYENDA_CALIBRACION_PREVENT):
// PREVENT salió de cohortes de Estados Unidos y no está verificado en la Argentina.
//
// Y qué hacer con eso (la regla del negocio: quien sube datos recibe una devolución). Un cálculo
// automático se revisa con un médico: en una teleconsulta con un profesional de nuestro equipo
// (o en el turno que ya tiene) y con la Segunda Opinión, que trae el riesgo en su informe. No se
// promete ningún plazo. Funciones puras: el nombre del servicio entra por parámetro
// (MARCA.producto), como en caminos.ts.
import { bandaAscvd } from '@epa/careplan-menopausia';
import type { PreventBanda } from '@epa/careplan-menopausia';
import { RUTA_ENVIAR_ESTUDIOS } from '../../components/AccionesRapidas';
import { LEYENDA_CALIBRACION_PREVENT } from '../../components/PreventScore';
import { RUTA_DATOS_DE_SALUD } from '../../fhir/datosDeSalud';
import { fechaHoraTurno, pidioSegundaOpinion, puedeOfrecerTeleconsulta, segundaOpinionEnCurso } from './caminos';
import { fechaCorta, porcentaje } from './formato';
import { RUTA_MI_SEGUNDA_OPINION, RUTA_RESERVAR_TELECONSULTA, RUTA_SOLICITAR_SEGUNDA_OPINION } from './rutas';
import type { DatosHomeE, PreventFirmado, ProximoTurno } from './tipos';

export type { PreventBanda };

export interface OpcionesPrevent {
  /** El servicio que pide la persona (MARCA.producto). */
  readonly producto: string;
}

/** De dónde sale el riesgo que muestra la tarjeta (ver el encabezado del archivo). */
export type ProcedenciaPrevent = 'firmado' | 'informe-ia' | 'estimado' | 'sin-datos';

/** Los tres riesgos de PREVENT, con las claves de PreventFirmado. */
export type ClaveRiesgoPrevent = 'ascvd10' | 'hf10' | 'total30';

/** Uno de los tres riesgos, listo para mostrar. */
export interface RiesgoPrevent {
  readonly clave: ClaveRiesgoPrevent;
  /** «ASCVD a 10 años». */
  readonly nombre: string;
  /** «Infarto o ACV». */
  readonly detalle: string;
  /** Probabilidad 0-1. Undefined si el cálculo no la trae: se muestra «Sin dato». */
  readonly valor?: number;
  /** El valor como porcentaje con coma: «4,2%». */
  readonly porcentaje?: string;
  /** La banda de la AHA: solo para ASCVD a 10 años con valor. */
  readonly banda?: PreventBanda;
  /** La banda en palabras («Riesgo bajo»): nunca se muestra solo el color. */
  readonly textoBanda?: string;
}

/**
 * Una acción de la tarjeta, en el orden en que se muestra:
 * - `boton`: el botón primario (a lo sumo uno por tarjeta);
 * - `link`: un link; `principal` marca el link principal cuando no hay botón (E le pone flecha);
 * - `nota`: una aclaración sin link;
 * - `turno`: el turno que ya tiene reservado, con la frase completa.
 */
export type AccionPrevent =
  | { readonly tipo: 'boton'; readonly texto: string; readonly href: string }
  | { readonly tipo: 'link'; readonly texto: string; readonly href: string; readonly principal: boolean }
  | { readonly tipo: 'nota'; readonly texto: string }
  | { readonly tipo: 'turno'; readonly texto: string; readonly turno: ProximoTurno };

/** El recuadro que acompaña a un cálculo automático: «Es un cálculo automático» y su texto. */
export interface RecuadroPrevent {
  readonly titulo: string;
  readonly texto: string;
}

/** Todo lo que muestra la tarjeta PREVENT, sin estilo. */
export interface ModeloPrevent {
  readonly procedencia: ProcedenciaPrevent;
  /** «PREVENT · AHA 2023». */
  readonly etiqueta: string;
  /** «Tu riesgo cardiovascular». */
  readonly titulo: string;
  /**
   * El rótulo de lo que no tiene firma médica: «Del informe de tu {producto} · preparado con IA»
   * o «Estimado con tus datos · sin revisión médica». Undefined en `firmado` (lo dice el texto) y
   * en `sin-datos`.
   */
  readonly chip?: string;
  /** El comienzo en negrita del texto, si lo hay: «Todavía no podemos estimar tu riesgo.» (sin datos). */
  readonly destacado?: string;
  /** De dónde sale y cómo leerlo (en `sin-datos`, qué falta). Va después de `destacado`. */
  readonly texto: string;
  /** La leyenda de calibración: con todo número (firmado, del informe o estimado); no en `sin-datos`. */
  readonly calibracion?: string;
  /** Fecha del informe («5 de octubre»), solo en `firmado` e `informe-ia`, si el informe la trae. */
  readonly fecha?: string;
  /** Los tres riesgos, en orden; vacío en `sin-datos`. */
  readonly riesgos: readonly RiesgoPrevent[];
  /** Los datos que faltan: para afinar la estimación (`estimado`) o para calcularla (`sin-datos`). */
  readonly faltantes: readonly string[];
  /** «Para afinarlo nos falta: …», solo en `estimado` con faltantes. */
  readonly notaFaltantes?: string;
  /** Solo en `estimado`: el cálculo automático se revisa con un médico. */
  readonly recuadro?: RecuadroPrevent;
  /** Qué hacer con el riesgo, en orden (ver accionesDe). */
  readonly acciones: readonly AccionPrevent[];
}

export const ETIQUETA_PREVENT = 'PREVENT · AHA 2023';
export const TITULO_PREVENT = 'Tu riesgo cardiovascular';

/** Los tres riesgos, en el orden en que se muestran. */
export const RIESGOS_PREVENT: readonly {
  readonly clave: ClaveRiesgoPrevent;
  readonly nombre: string;
  readonly detalle: string;
}[] = [
  { clave: 'ascvd10', nombre: 'ASCVD a 10 años', detalle: 'Infarto o ACV' },
  { clave: 'hf10', nombre: 'IC a 10 años', detalle: 'Insuficiencia cardíaca' },
  { clave: 'total30', nombre: 'ECV total a 30 años', detalle: 'Enfermedad cardiovascular total' },
];

/** Las bandas de ASCVD a 10 años, en palabras. */
export const TEXTO_BANDA_PREVENT: Readonly<Record<PreventBanda, string>> = {
  bajo: 'Riesgo bajo',
  limite: 'Riesgo límite',
  intermedio: 'Riesgo intermedio',
  alto: 'Riesgo alto',
};

/**
 * De dónde sale el riesgo. «Firmado» solo con la firma médica registrada; si no, el del informe
 * es el cálculo del informe preparado con IA.
 */
export function procedenciaPrevent(datos: DatosHomeE): ProcedenciaPrevent {
  if (datos.prevent) {
    return datos.segundaOpinion?.firmada ? 'firmado' : 'informe-ia';
  }
  return datos.preventEstimado ? 'estimado' : 'sin-datos';
}

function riesgosDe(valores: PreventFirmado): RiesgoPrevent[] {
  return RIESGOS_PREVENT.map(({ clave, nombre, detalle }) => {
    const valor = valores[clave];
    if (typeof valor !== 'number' || !Number.isFinite(valor)) {
      return { clave, nombre, detalle };
    }
    // bandaAscvd recibe el porcentaje (0-100); el riesgo viene como probabilidad (0-1).
    const banda = clave === 'ascvd10' ? bandaAscvd(valor * 100) : undefined;
    return {
      clave,
      nombre,
      detalle,
      valor,
      porcentaje: porcentaje(valor),
      banda,
      textoBanda: banda ? TEXTO_BANDA_PREVENT[banda] : undefined,
    };
  });
}

/**
 * Qué hacer con el PREVENT, según de dónde sale:
 * - del informe (firmado o preparado con IA): ver el informe y, si se le puede ofrecer,
 *   revisarlo en una teleconsulta;
 * - estimado: es un cálculo automático, que se revisa con un médico: en el turno que ya tiene,
 *   en una teleconsulta (o en otra, si ya tuvo una después de sus datos) y con la Segunda
 *   Opinión, que trae el riesgo en su informe (pedirla, o verla si ya la pidió);
 * - sin datos: mandar el laboratorio en PDF o cargar sus datos.
 * Con la Segunda Opinión en curso (en análisis o en revisión por el cardiólogo) no se empuja la
 * teleconsulta: la devolución llega con su informe (puedeOfrecerTeleconsulta, en caminos.ts).
 */
function accionesDe(
  datos: DatosHomeE,
  procedencia: ProcedenciaPrevent,
  producto: string
): { readonly recuadro?: RecuadroPrevent; readonly acciones: readonly AccionPrevent[] } {
  const enAnalisis = segundaOpinionEnCurso(datos);
  const ofrecer = puedeOfrecerTeleconsulta(datos);
  const traeElRiesgo: AccionPrevent = { tipo: 'nota', texto: `Tu ${producto} va a traer tu riesgo en su informe.` };
  const verSegundaOpinion: AccionPrevent = {
    tipo: 'link',
    texto: `Ver mi ${producto}`,
    href: RUTA_MI_SEGUNDA_OPINION,
    principal: false,
  };
  const acciones: AccionPrevent[] = [];

  if (procedencia === 'firmado' || procedencia === 'informe-ia') {
    acciones.push({ tipo: 'link', texto: 'Ver mi informe', href: RUTA_MI_SEGUNDA_OPINION, principal: true });
    if (ofrecer) {
      acciones.push({
        tipo: 'link',
        texto: 'Revisarlo en una teleconsulta',
        href: RUTA_RESERVAR_TELECONSULTA,
        principal: false,
      });
    }
    return { acciones };
  }

  if (procedencia === 'estimado') {
    const turno = datos.proximoTurno;
    if (turno) {
      acciones.push({ tipo: 'turno', texto: `Podés llevarlo a tu turno del ${fechaHoraTurno(turno.inicio)}.`, turno });
    } else if (ofrecer) {
      acciones.push({ tipo: 'boton', texto: 'Reservar mi teleconsulta', href: RUTA_RESERVAR_TELECONSULTA });
    } else if (!enAnalisis) {
      // Ya tuvo una consulta después de sus datos: se la deja a mano, sin empujar.
      acciones.push({
        tipo: 'link',
        texto: 'Reservar otra teleconsulta',
        href: RUTA_RESERVAR_TELECONSULTA,
        principal: false,
      });
    }
    if (enAnalisis) {
      acciones.push(traeElRiesgo, verSegundaOpinion);
    } else if (pidioSegundaOpinion(datos)) {
      acciones.push(verSegundaOpinion);
    } else {
      acciones.push({
        tipo: 'link',
        texto: `Pedir mi ${producto}: un informe de tu caso y tu riesgo`,
        href: RUTA_SOLICITAR_SEGUNDA_OPINION,
        principal: false,
      });
    }
    return {
      recuadro: {
        titulo: 'Es un cálculo automático',
        texto: 'Para saber qué significa para vos y qué hacer, revisalo con un médico.',
      },
      acciones,
    };
  }

  if (enAnalisis) {
    acciones.push(traeElRiesgo);
  }
  acciones.push(
    { tipo: 'boton', texto: 'Enviar mi laboratorio en PDF', href: RUTA_ENVIAR_ESTUDIOS },
    { tipo: 'link', texto: 'Cargar mis datos de salud', href: RUTA_DATOS_DE_SALUD, principal: false }
  );
  return { acciones };
}

/** El modelo de la tarjeta PREVENT con los datos de la persona. */
export function preventDe(datos: DatosHomeE, opciones: OpcionesPrevent): ModeloPrevent {
  const { producto } = opciones;
  const procedencia = procedenciaPrevent(datos);
  const { recuadro, acciones } = accionesDe(datos, procedencia, producto);
  const comun = { procedencia, etiqueta: ETIQUETA_PREVENT, titulo: TITULO_PREVENT, recuadro, acciones };

  if (datos.prevent && (procedencia === 'firmado' || procedencia === 'informe-ia')) {
    const fecha = fechaCorta(datos.prevent.fecha, datos.hoy);
    const riesgos = riesgosDe(datos.prevent);
    if (procedencia === 'firmado') {
      return {
        ...comun,
        texto: `Del informe firmado por tu equipo médico${fecha ? ` el ${fecha}` : ''}.`,
        fecha,
        riesgos,
        faltantes: [],
        calibracion: LEYENDA_CALIBRACION_PREVENT,
      };
    }
    return {
      ...comun,
      chip: `Del informe de tu ${producto} · preparado con IA`,
      texto: `Lo calculamos con la fórmula PREVENT de la AHA para tu informe${fecha ? ` del ${fecha}` : ''}. Es orientativo: no es un diagnóstico.`,
      fecha,
      riesgos,
      faltantes: [],
      calibracion: LEYENDA_CALIBRACION_PREVENT,
    };
  }

  if (datos.preventEstimado) {
    const { faltantes } = datos.preventEstimado;
    return {
      ...comun,
      chip: 'Estimado con tus datos · sin revisión médica',
      texto: 'Lo calculamos con la fórmula PREVENT de la AHA. Es orientativo: no es un diagnóstico.',
      riesgos: riesgosDe(datos.preventEstimado),
      faltantes,
      calibracion: LEYENDA_CALIBRACION_PREVENT,
      notaFaltantes: faltantes.length > 0 ? `Para afinarlo nos falta: ${faltantes.join(', ')}.` : undefined,
    };
  }

  const faltantes = datos.preventFaltantes ?? [];
  return {
    ...comun,
    destacado: 'Todavía no podemos estimar tu riesgo.',
    texto:
      faltantes.length > 0
        ? `Para calcularlo nos falta: ${faltantes.join(', ')}.`
        : 'Nos faltan algunos datos de tu laboratorio.',
    riesgos: [],
    faltantes,
  };
}
