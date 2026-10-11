// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// La ruta en U del hero de la Home D: de tu app a tu equipo y de vuelta a vos, con el
// consentimiento como control en el medio. Recibe el modelo ya armado (`rutaDe`, ruta.ts) y lo
// dibuja; arma la tarjeta entera, con su título (h2 por defecto: va debajo del H1 de la puerta).
//
//  - Desde 48em: la U horizontal. La ida arriba, de izquierda a derecha (los rótulos alternan
//    arriba y abajo de la línea para que entren en la columna del hero a 62em), dobla por la
//    derecha y la vuelta va abajo, de derecha a izquierda. Entre 48em y 62em el hero va apilado
//    y la tarjeta ocupa todo el ancho: la horizontal entra holgada (la vertical dejaba dos
//    tercios de la tarjeta vacíos en una tablet). Celular: la U vertical; la ida baja por la
//    izquierda y la vuelta sube por la derecha.
//  - El dibujo es decorativo (`aria-hidden`): las líneas son SVG y los nombres y detalles de cada
//    estación, HTML en una grilla (nada de `<text>` de SVG posicionado, que a 390px desborda).
//    Para lectores de pantalla va una lista ordenada, visualmente oculta, con cada estación y su
//    estado, y debajo del dibujo todo lo demás en texto: el tramo activo, la explicación, el
//    control y la acción.
//  - Recorrido: línea sólida y punto lleno; activa: halo (o la cápsula que une a los agentes de
//    IA con el equipo médico cuando trabajan juntos); por recorrer: punteado y punto hueco;
//    cerrada: el candado, y la línea se corta ahí.
//  - Movimiento: el tramo recorrido se traza al entrar (900ms, una vez por sesión: queda
//    anotado en sessionStorage) y, solo mientras `ruta.enCurso`, un pulso de luz recorre una vez
//    la línea hasta donde llegaron tus datos (500ms por media línea: como mucho 4s). No va en
//    loop: un movimiento que dura más de 5s y no se puede pausar no cumple WCAG 2.2.2.
//    `prefers-reduced-motion` apaga los dos (RutaIdaVuelta.module.css).
// Solo tokens `var(--d-…)` de HomeEstiloD.module.css.
import { useMediaQuery } from '@mantine/hooks';
import { IconArrowRight, IconLock, IconLockCheck, IconLockExclamation, IconUser } from '@tabler/icons-react';
import type { TablerIcon } from '@tabler/icons-react';
import { useEffect, useId, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import { Link } from 'react-router';
import { dibujoDe, ESTACIONES_DE_IDA, ORDEN_ESTACIONES } from './ruta';
import type { MitadTramo, TramosEstacion } from './ruta';
import classes from './RutaIdaVuelta.module.css';
import type { EstacionRuta, EstadoConsentimiento, EstadoEstacion, RutaHomeD } from './tipos';

/** sessionStorage: la ruta ya se trazó en esta sesión (el trazo de entrada va una sola vez). */
export const CLAVE_RUTA_TRAZADA = 'home-d-ruta-trazada';
/** Desde dónde la U es horizontal (48em: tablet y escritorio; ver arriba). */
export const DESDE_HORIZONTAL = '(min-width: 48em)';
/** Lo que dura el trazo de entrada, entero (se reparte entre las piezas recorridas). */
export const TRAZO_MS = 900;
/** Lo que tarda el pulso en cruzar cada media línea (una sola pasada: como mucho 8 × 500ms = 4s). */
export const PULSO_POR_TRAMO_MS = 500;

/** El estado de cada estación, dicho para la lista que leen los lectores de pantalla. */
export const ESTADO_LEIBLE: Readonly<Record<EstadoEstacion, string>> = {
  recorrida: 'recorrida',
  activa: 'activa ahora',
  'por-recorrer': 'por recorrer',
  cerrada: 'cerrada',
};

/** «Tu app: recorrida», «Consentimiento, firmado el 8 de agosto: recorrida». */
export function textoEstacion(estacion: EstacionRuta): string {
  const detalle = estacion.detalle ? `, ${estacion.detalle}` : '';
  return `${estacion.nombre}${detalle}: ${ESTADO_LEIBLE[estacion.estado]}`;
}

/** ¿La ruta ya se trazó en esta sesión? Sin sessionStorage (bloqueado), se traza. */
export function rutaYaTrazada(): boolean {
  try {
    return window.sessionStorage.getItem(CLAVE_RUTA_TRAZADA) === '1';
  } catch {
    return false;
  }
}

function anotarRutaTrazada(): void {
  try {
    window.sessionStorage.setItem(CLAVE_RUTA_TRAZADA, '1');
  } catch {
    // Sin sessionStorage no hay cómo recordarlo: la próxima vez se vuelve a trazar.
  }
}

/**
 * Por dónde parte un nombre de una sola palabra larga si no entra en su columna (celular angosto
 * con la letra grande o más espaciado): por una sílaba, con guion, y no en cualquier letra. Va
 * con guiones blandos (U+00AD), que no se ven si la palabra entra. Solo los nombres de una
 * palabra: en una frase («Tus resultados») el navegador llenaría el renglón cortando la palabra
 * en vez de pasarla entera al siguiente. Solo en el dibujo (decorativo): la lista que leen los
 * lectores de pantalla lleva el texto tal cual.
 */
const CORTES: Readonly<Record<string, string>> = {
  Consentimiento: 'Consenti\u00admiento',
  Novedades: 'Nove\u00addades',
};

/** El nombre con su corte por sílaba (CORTES), si es una de esas palabras largas. */
export function conCortes(nombre: string): string {
  return CORTES[nombre] ?? nombre;
}

/** El texto del control, con su primera oración destacada («Control de consentimiento: firmado.»). */
function partesControl(texto: string): { readonly fuerte: string; readonly resto?: string } {
  const corte = texto.indexOf('. ');
  return corte < 0 ? { fuerte: texto } : { fuerte: texto.slice(0, corte + 1), resto: texto.slice(corte + 2) };
}

const ICONO_CONTROL: Readonly<Record<EstadoConsentimiento, TablerIcon>> = {
  firmado: IconLockCheck,
  falta: IconLock,
  desactualizado: IconLockExclamation,
  cargando: IconLock,
};

type Eje = 'x' | 'y';
type Hacia = 'derecha' | 'izquierda' | 'abajo' | 'arriba';

/** El retraso y la duración del trazo de entrada de una pieza (la `orden`-ésima de las recorridas). */
function estiloTrazo(orden: number | undefined, pasoTrazo: number): CSSProperties | undefined {
  return orden === undefined
    ? undefined
    : { animationDuration: `${pasoTrazo}ms`, animationDelay: `${orden * pasoTrazo}ms` };
}

/** De dónde a dónde (en % de la pieza, en el sentido de la marcha) va una media línea. */
function extremos(lado: 'entrada' | 'salida', vuelta: boolean): readonly [string, string] {
  const inicio = vuelta ? '100' : '0';
  const fin = vuelta ? '0' : '100';
  return lado === 'entrada' ? [inicio, '50'] : ['50', fin];
}

interface PropsMitad {
  readonly pieza: MitadTramo;
  readonly lado: 'entrada' | 'salida';
  readonly eje: Eje;
  /** La vuelta se recorre al revés: de derecha a izquierda, o de abajo hacia arriba. */
  readonly vuelta: boolean;
  readonly trazar: boolean;
  readonly pasoTrazo: number;
}

/** Media línea de una pieza de vía, en % de la pieza (el SVG no tiene viewBox: no se deforma). */
function Mitad({ pieza, lado, eje, vuelta, trazar, pasoTrazo }: PropsMitad): JSX.Element | null {
  if (pieza.estado === 'cortado') {
    return null;
  }
  const [desde, hasta] = extremos(lado, vuelta).map((v) => `${v}%`);
  const coordenadas =
    eje === 'x' ? { x1: desde, x2: hasta, y1: '50%', y2: '50%' } : { x1: '50%', x2: '50%', y1: desde, y2: hasta };
  let hacia: Hacia;
  if (eje === 'x') {
    hacia = vuelta ? 'izquierda' : 'derecha';
  } else {
    hacia = vuelta ? 'arriba' : 'abajo';
  }
  const seTraza = trazar && pieza.orden !== undefined;
  return (
    <line
      {...coordenadas}
      className={seTraza ? `${classes.linea} ${classes.trazando}` : classes.linea}
      data-estado={pieza.estado}
      data-hacia={hacia}
      style={seTraza ? estiloTrazo(pieza.orden, pasoTrazo) : undefined}
    />
  );
}

/** El pulso de luz sobre una media línea recorrida (solo con `enCurso`). */
function Pulso({ pieza, lado, eje, vuelta }: Omit<PropsMitad, 'trazar' | 'pasoTrazo'>): JSX.Element | null {
  if (pieza.pulso === undefined) {
    return null;
  }
  const [desde, hasta] = extremos(lado, vuelta);
  return (
    <span
      className={classes.pulso}
      data-eje={eje}
      data-recorrido={`${desde}-${hasta}`}
      style={{ animationDelay: `${pieza.pulso * PULSO_POR_TRAMO_MS}ms` }}
    />
  );
}

/** El punto de la estación (el control y Vos tienen el suyo, en HTML). */
function Nodo({ estado, enCapsula }: { readonly estado: EstadoEstacion; readonly enCapsula: boolean }): JSX.Element {
  const radio = estado === 'activa' ? 7.5 : 6;
  return (
    <>
      {estado === 'activa' && !enCapsula && <circle cx="50%" cy="50%" r={13} className={classes.halo} />}
      <circle cx="50%" cy="50%" r={radio} className={classes.nodo} data-estado={estado} />
    </>
  );
}

interface PropsEstacion {
  readonly estacion: EstacionRuta;
  readonly tramos: TramosEstacion;
  readonly eje: Eje;
  readonly consentimiento: EstadoConsentimiento;
  readonly trazar: boolean;
  readonly pasoTrazo: number;
}

/** Una estación: su rótulo y su pieza de vía, cada uno en su celda de la grilla. */
function Estacion({ estacion, tramos, eje, consentimiento, trazar, pasoTrazo }: PropsEstacion): JSX.Element {
  const indice = ORDEN_ESTACIONES.indexOf(estacion.clave);
  const vuelta = indice >= ESTACIONES_DE_IDA;
  const tramo = vuelta ? 'vuelta' : 'ida';
  // En la U horizontal los rótulos de la ida alternan arriba y abajo de la línea.
  const lado = !vuelta && indice % 2 === 1 ? 'abajo' : 'arriba';
  const { clave, estado } = estacion;
  const IconoControl = ICONO_CONTROL[consentimiento];
  const mitad = { eje, vuelta, trazar, pasoTrazo };
  return (
    <>
      <span className={classes.rotulo} data-clave={clave} data-tramo={tramo} data-lado={lado}>
        {/* El corte por sílaba, solo en la U vertical (columnas angostas); en la horizontal el
            rótulo tiene el ancho de dos estaciones y el nombre va entero. */}
        <span className={classes.nombre}>{eje === 'y' ? conCortes(estacion.nombre) : estacion.nombre}</span>
        {estacion.detalle && (
          <span className={clave === 'historia' ? classes.chip : classes.detalle}>{estacion.detalle}</span>
        )}
      </span>
      <span className={classes.via} data-clave={clave} data-tramo={tramo}>
        {tramos.capsula && <span className={classes.capsula} data-extremo={tramos.capsula} />}
        <svg className={classes.trazo} focusable="false">
          {tramos.entrada && <Mitad pieza={tramos.entrada} lado="entrada" {...mitad} />}
          {tramos.salida && <Mitad pieza={tramos.salida} lado="salida" {...mitad} />}
          {clave !== 'consentimiento' && clave !== 'vos' && (
            <Nodo estado={estado} enCapsula={tramos.capsula !== undefined} />
          )}
        </svg>
        {tramos.entrada && <Pulso pieza={tramos.entrada} lado="entrada" eje={eje} vuelta={vuelta} />}
        {tramos.salida && <Pulso pieza={tramos.salida} lado="salida" eje={eje} vuelta={vuelta} />}
        {clave === 'consentimiento' && (
          <span className={classes.candado} data-estado={estado}>
            <IconoControl size={18} stroke={2} />
          </span>
        )}
        {clave === 'vos' && (
          <span className={classes.vos} data-estado={estado}>
            <IconUser size={18} stroke={2} />
          </span>
        )}
      </span>
    </>
  );
}

/** El rótulo del tramo activo: el estado en mono («EN ANÁLISIS») y el resto en texto normal. */
function EtiquetaActiva({ texto }: { readonly texto: string }): JSX.Element {
  const [estado, ...resto] = texto.split(' · ');
  return (
    <p className={classes.etiqueta}>
      <span className={classes.estadoActivo}>{estado}</span>
      {resto.length > 0 && <span> {resto.join(' · ')}</span>}
    </p>
  );
}

export interface RutaIdaVueltaProps {
  readonly ruta: RutaHomeD;
  /** Nivel del título de la tarjeta: h2 por defecto (va en el hero, debajo del H1 de la puerta). */
  readonly nivelTitulo?: 2 | 3;
}

/** La tarjeta «Tus datos, ida y vuelta» (o «Tu {producto}, ida y vuelta») con la U. */
export function RutaIdaVuelta({ ruta, nivelTitulo = 2 }: RutaIdaVueltaProps): JSX.Element {
  const idTitulo = useId();
  const idNotaAccion = useId();
  const horizontal = useMediaQuery(DESDE_HORIZONTAL, undefined, { getInitialValueInEffect: false });
  // Se decide una vez al montar: si la ruta ya se trazó en esta sesión, aparece quieta.
  const [trazar] = useState(() => !rutaYaTrazada());
  useEffect(() => {
    anotarRutaTrazada();
  }, []);

  const dibujo = dibujoDe(ruta);
  const eje: Eje = horizontal ? 'x' : 'y';
  const pasoTrazo = dibujo.trazos > 0 ? Math.round(TRAZO_MS / dibujo.trazos) : TRAZO_MS;
  const Titulo = nivelTitulo === 3 ? 'h3' : 'h2';
  const control = partesControl(ruta.control.texto);
  const IconoControl = ICONO_CONTROL[ruta.control.estado];
  const giroSeTraza = trazar && dibujo.giro.orden !== undefined;

  return (
    <section className={classes.tarjeta} aria-labelledby={idTitulo}>
      <div className={classes.encabezado}>
        <Titulo id={idTitulo} className={classes.titulo}>
          {ruta.titulo}
        </Titulo>
        {ruta.subtitulo && <p className={classes.subtitulo}>{ruta.subtitulo}</p>}
      </div>

      <div className={classes.dibujo} data-orientacion={horizontal ? 'horizontal' : 'vertical'} aria-hidden="true">
        {ruta.estaciones.map((estacion) => (
          <Estacion
            key={estacion.clave}
            estacion={estacion}
            tramos={dibujo.tramos[estacion.clave]}
            eje={eje}
            consentimiento={ruta.control.estado}
            trazar={trazar}
            pasoTrazo={pasoTrazo}
          />
        ))}
        {dibujo.giro.estado !== 'cortado' && (
          <span
            className={giroSeTraza ? `${classes.giro} ${classes.trazando}` : classes.giro}
            data-estado={dibujo.giro.estado}
            style={giroSeTraza ? estiloTrazo(dibujo.giro.orden, pasoTrazo) : undefined}
          />
        )}
      </div>

      <ol className={classes.oculto} aria-label="Estaciones de la ruta, de ida y de vuelta">
        {ruta.estaciones.map((estacion) => (
          <li key={estacion.clave}>{textoEstacion(estacion)}</li>
        ))}
      </ol>

      <ul className={classes.leyenda} aria-label="Referencias del dibujo">
        <li>
          <svg className={classes.muestra} width="28" height="8" aria-hidden="true" focusable="false">
            <line x1="2" x2="26" y1="4" y2="4" className={classes.linea} data-estado="recorrido" />
          </svg>
          Recorrido
        </li>
        <li>
          <svg className={classes.muestra} width="28" height="8" aria-hidden="true" focusable="false">
            <line x1="2" x2="26" y1="4" y2="4" className={classes.linea} data-estado="por-recorrer" />
          </svg>
          Por recorrer
        </li>
      </ul>

      {ruta.etiquetaActiva && <EtiquetaActiva texto={ruta.etiquetaActiva} />}
      <p className={classes.explicacion}>{ruta.explicacion}</p>
      <p className={classes.control} data-estado={ruta.control.estado}>
        <IconoControl className={classes.iconoControl} size={22} stroke={1.75} aria-hidden="true" />
        <span>
          <strong>{control.fuerte}</strong>
          {control.resto && ` ${control.resto}`}
        </span>
      </p>
      {ruta.accion && (
        <div className={classes.pie}>
          <Link
            to={ruta.accion.href}
            className={classes.accion}
            aria-describedby={ruta.accion.nota ? idNotaAccion : undefined}
          >
            {ruta.accion.texto}
            <IconArrowRight size={18} stroke={2} aria-hidden="true" />
          </Link>
          {/* Qué tiene costo (la teleconsulta): junto a la acción, no dos secciones más abajo. */}
          {ruta.accion.nota && (
            <p id={idNotaAccion} className={classes.notaAccion}>
              {ruta.accion.nota}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
