// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// El tablero «Salidas y llegadas de tus datos» de la Home D: lo que mandó la persona
// (salidas) y lo que vuelve a ella (llegadas), con el estado real de cada recurso.
//
// La sección, su H2 y su bajada los arma la vista (HomeEstiloD); este componente recibe el id
// de ese H2 (`idTitulo`) y nombra con él la lista de filas (`aria-labelledby`). Así la vista
// decide el orden de la página y el tablero se prueba solo, puro en props.
//
//  - Pestañas «Todo · Salidas · Llegadas» (SegmentedControl de Mantine: un radiogroup).
//  - Escritorio (≥ 62em): columnas FECHA · QUÉ · RUTA · ESTADO, 6 filas y «Ver todo (N)».
//    Celular: filas de dos líneas (fecha y estado arriba; qué y ruta abajo), 4 filas.
//  - Paletas (split-flap) SOLO en las filas nuevas desde la última visita, una sola vez, con
//    el texto completo para lectores de pantalla (cada letra es `aria-hidden`).
//    `prefers-reduced-motion` las deja quietas.
//  - Lo que llega en tiempo real se anuncia en una región `aria-live` («Llegó: …»).
// Solo tokens `var(--d-…)` de HomeEstiloD.module.css (TableroSalidasLlegadas.module.css).
import { SegmentedControl } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconAlertCircle,
  IconArrowDownLeft,
  IconArrowUpRight,
  IconChevronRight,
  IconClock,
  IconInfoCircle,
} from '@tabler/icons-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Link } from 'react-router';
import { RUTA_ENVIAR_ESTUDIOS } from '../../components/AccionesRapidas';
import { RUTA_DATOS_DE_SALUD } from '../../fhir/datosDeSalud';
import { hoyArgentina } from '../../fhir/glp1';
import { fechaDelTablero } from './tablero';
import classes from './TableroSalidasLlegadas.module.css';
import type { FilaTablero, TableroHomeD } from './tipos';

/** Filas visibles antes de «Ver todo»: 6 en escritorio, 4 en el celular. */
export const FILAS_ESCRITORIO = 6;
export const FILAS_CELULAR = 4;

/** Cada paleta gira 70ms, 4 vueltas (280ms); la fila entera, como mucho en 900ms. */
export const PALETA_MS = 70;
export const VUELTAS_PALETA = 4;
export const MAX_PALETAS_MS = 900;
const PASO_MAXIMO_MS = 28;

/**
 * Cuánto se escalona cada carácter (ms) para que la última paleta de la fila termine dentro
 * de MAX_PALETAS_MS: (n − 1) · paso + PALETA_MS · VUELTAS_PALETA ≤ MAX_PALETAS_MS.
 */
export function pasoPaletas(caracteres: number): number {
  if (caracteres <= 1) {
    return 0;
  }
  return Math.min(PASO_MAXIMO_MS, Math.floor((MAX_PALETAS_MS - PALETA_MS * VUELTAS_PALETA) / (caracteres - 1)));
}

type Pestania = 'todo' | 'salidas' | 'llegadas';

const PESTANIAS: { value: Pestania; label: string }[] = [
  { value: 'todo', label: 'Todo' },
  { value: 'salidas', label: 'Salidas' },
  { value: 'llegadas', label: 'Llegadas' },
];

const PESTANIA_VACIA: Record<Exclude<Pestania, 'todo'>, string> = {
  salidas: 'No hay salidas todavía.',
  llegadas: 'No hay llegadas todavía.',
};

export const TEXTO_INCOMPLETO = 'No pudimos traer todo tu recorrido. Probá de nuevo en un rato.';

function clases(...nombres: (string | false | undefined)[]): string {
  return nombres.filter(Boolean).join(' ');
}

export interface TableroSalidasLlegadasProps {
  /** Lo que devuelve `useTableroHomeD()`. */
  readonly tablero: TableroHomeD;
  /** Id del H2 de la sección (lo pone la vista): nombra la lista de filas. */
  readonly idTitulo: string;
  /** Hoy en Argentina, AAAA-MM-DD (para mostrar el año solo si no es el de hoy); por defecto, hoy. */
  readonly hoy?: string;
}

export function TableroSalidasLlegadas({ tablero, idTitulo, hoy }: TableroSalidasLlegadasProps): JSX.Element {
  // Se lee al primer render (no hay SSR): en escritorio se ven 6 filas desde el principio.
  const escritorio = useMediaQuery('(min-width: 62em)', undefined, { getInitialValueInEffect: false });
  const [pestania, setPestania] = useState<Pestania>('todo');
  const [todo, setTodo] = useState(false);
  const lista = useRef<HTMLOListElement>(null);
  const anuncio = useAnuncioDeLlegadas(tablero);
  const dia = hoy ?? hoyArgentina();

  const filtradas = tablero.filas.filter(
    (f) => pestania === 'todo' || (pestania === 'salidas' ? f.sentido === 'salida' : f.sentido === 'llegada')
  );
  const limite = escritorio ? FILAS_ESCRITORIO : FILAS_CELULAR;
  const visibles = todo ? filtradas : filtradas.slice(0, limite);
  const animar = usePaletasUnaVez(visibles.filter((f) => tablero.nuevas.has(f.id)).map((f) => f.id));

  // Despliega en el lugar y lleva el foco a la primera fila que apareció.
  const verTodo = (): void => {
    const desde = visibles.length;
    flushSync(() => setTodo(true));
    const item = lista.current?.children[desde] as HTMLElement | undefined;
    (item?.querySelector<HTMLElement>('a') ?? item)?.focus();
  };

  let contenido: ReactNode;
  if (tablero.cargando) {
    contenido = <Esqueleto />;
  } else if (tablero.filas.length === 0) {
    // Si algo falló, no se afirma que no mandó nada.
    contenido = tablero.incompleto ? <AvisoIncompleto /> : <Vacio />;
  } else {
    contenido = (
      <>
        <div className={classes.barra}>
          <SegmentedControl
            aria-label="Mostrar en el tablero"
            data={PESTANIAS}
            value={pestania}
            onChange={(v) => setPestania(v as Pestania)}
            withItemsBorders={false}
            fullWidth
            classNames={{
              root: classes.segmento,
              indicator: classes.segmentoIndicador,
              control: classes.segmentoControl,
              input: classes.segmentoEntrada,
              label: classes.segmentoEtiqueta,
            }}
          />
        </div>
        <div className={classes.panel}>
          <div className={classes.encabezados} aria-hidden="true">
            <span />
            <span>Fecha</span>
            <span>Qué</span>
            <span>Ruta</span>
            <span>Estado</span>
            <span />
          </div>
          {visibles.length === 0 ? (
            <p className={classes.vacioPestania}>{PESTANIA_VACIA[pestania as Exclude<Pestania, 'todo'>]}</p>
          ) : (
            <ol ref={lista} className={classes.lista} aria-labelledby={idTitulo}>
              {visibles.map((fila) => (
                <li key={fila.id} className={classes.item} tabIndex={-1}>
                  <Fila fila={fila} hoy={dia} nueva={tablero.nuevas.has(fila.id)} animar={animar(fila.id)} />
                </li>
              ))}
            </ol>
          )}
          {visibles.length < filtradas.length && (
            <button type="button" className={classes.verTodo} onClick={verTodo}>
              Ver todo ({filtradas.length})
            </button>
          )}
        </div>
        {tablero.incompleto && <AvisoIncompleto />}
        {tablero.filas.some((f) => f.recurso === 'DocumentReference') && (
          // Vale para los PDFs (el bot le escribe si no pudo leerlo); de la Segunda Opinión no se afirma.
          <p className={classes.pie}>
            <IconClock size={20} stroke={1.75} aria-hidden="true" />
            <span>
              Si un PDF de laboratorio se demora, el tablero lo marca como <strong>Demorado</strong>; si no pudimos
              leerlo, te escribimos por Mensajes.
            </span>
          </p>
        )}
      </>
    );
  }

  return (
    <div className={classes.tablero}>
      <div className={classes.soloLectores} aria-live="polite">
        {anuncio}
      </div>
      {contenido}
    </div>
  );
}

// ─── Una fila ────────────────────────────────────────────────────────────────────────

function Fila({
  fila,
  hoy,
  nueva,
  animar,
}: {
  readonly fila: FilaTablero;
  readonly hoy: string;
  readonly nueva: boolean;
  readonly animar: boolean;
}): JSX.Element {
  const fecha = fechaDelTablero(fila.fecha, hoy);
  const paso = pasoPaletas(fecha.corta.length + fila.estado.length);
  const contenido = (
    <>
      <span className={classes.sentido} data-sentido={fila.sentido} aria-hidden="true">
        {fila.sentido === 'salida' ? (
          <IconArrowUpRight size={18} stroke={2} />
        ) : (
          <IconArrowDownLeft size={18} stroke={2} />
        )}
      </span>
      <span className={classes.soloLectores}>{fila.sentido === 'salida' ? 'Salida. ' : 'Llegada. '}</span>
      <span className={classes.fecha} data-sin-fecha={fila.fecha ? undefined : true}>
        <span aria-hidden="true">
          {nueva ? <Paletas texto={fecha.corta} desde={0} paso={paso} animar={animar} /> : fecha.corta}
        </span>
        {fecha.anio && (
          <span className={classes.anio} aria-hidden="true">
            {fecha.anio}
          </span>
        )}
        <span className={classes.soloLectores}>{fecha.larga}. </span>
      </span>
      <span className={classes.cuerpo}>
        <span className={classes.que}>{fila.que}</span>
        <span className={classes.soloLectores}>. </span>
        <Ruta texto={fila.ruta} />
        <span className={classes.soloLectores}>. </span>
        {fila.nota && (
          <span className={classes.nota}>
            <IconInfoCircle size={18} stroke={1.75} aria-hidden="true" />
            <span>{fila.nota}</span>
          </span>
        )}
      </span>
      <span className={classes.estado}>
        <span className={classes.soloLectores}>Estado: </span>
        {nueva ? (
          <>
            <span className={classes.estadoTexto} data-tono={fila.tono} aria-hidden="true">
              <Paletas texto={fila.estado} desde={fecha.corta.length} paso={paso} animar={animar} />
            </span>
            <span className={classes.soloLectores}>{fila.estado}. </span>
            <span className={classes.nuevo}>
              <span className={classes.punto} aria-hidden="true" />
              Nuevo
            </span>
          </>
        ) : (
          <span className={classes.estadoTexto} data-tono={fila.tono}>
            {fila.estado}
          </span>
        )}
      </span>
      {fila.href && <IconChevronRight className={classes.chevron} size={22} stroke={2} aria-hidden="true" />}
    </>
  );
  const atributos = {
    className: classes.fila,
    'data-nueva': nueva || undefined,
    'data-con-nota': fila.nota ? true : undefined,
  };
  // Sin un destino real, la fila no es un link (no se inventa uno).
  return fila.href ? (
    <Link to={fila.href} {...atributos}>
      {contenido}
    </Link>
  ) : (
    <div {...atributos}>{contenido}</div>
  );
}

/** «Tu app → Agente de laboratorio»: la flecha se ve; a los lectores se les dice «hacia». */
function Ruta({ texto }: { readonly texto: string }): JSX.Element {
  const partes = texto.split(' → ');
  return (
    <span className={classes.ruta}>
      {partes.map((parte, i) => (
        <Fragment key={`${i}-${parte}`}>
          {i > 0 && (
            <>
              <span aria-hidden="true"> → </span>
              <span className={classes.soloLectores}> hacia </span>
            </>
          )}
          {parte}
        </Fragment>
      ))}
    </span>
  );
}

/**
 * Las letras de paleta: un carácter por paleta, agrupadas por palabra (cortan entre palabras).
 * `desde` es la posición del primer carácter en la fila (la fecha va antes que el estado), para
 * escalonar el giro. Todo `aria-hidden` desde afuera: el texto completo va aparte.
 */
function Paletas({
  texto,
  desde,
  paso,
  animar,
}: {
  readonly texto: string;
  readonly desde: number;
  readonly paso: number;
  readonly animar: boolean;
}): JSX.Element {
  const palabras = texto.split(' ');
  const inicios = palabras.map((_, i) => desde + palabras.slice(0, i).reduce((n, p) => n + [...p].length + 1, 0));
  return (
    <span className={clases(classes.paletas, animar && classes.animar)} data-paletas="">
      {palabras.map((palabra, i) => {
        const letras = [...palabra, ...(i < palabras.length - 1 ? [' '] : [])];
        return (
          <span key={`${i}-${palabra}`} className={classes.palabra}>
            {letras.map((letra, k) => (
              <span
                // Las letras de una palabra no se reordenan: la posición es su identidad.
                key={k}
                className={classes.letra}
                style={animar ? { animationDelay: `${((inicios[i] ?? 0) + k) * paso}ms` } : undefined}
              >
                {letra === ' ' ? ' ' : letra}
              </span>
            ))}
          </span>
        );
      })}
    </span>
  );
}

// ─── Estados del tablero ─────────────────────────────────────────────────────────────

/** Mientras carga: 4 filas con las mismas medidas (y la barra de pestañas), sin saltos. */
function Esqueleto(): JSX.Element {
  return (
    <div aria-busy="true">
      <p className={classes.soloLectores}>Cargando tus salidas y llegadas.</p>
      <div aria-hidden="true">
        <div className={classes.barra}>
          <span className={classes.huesoPestanias} />
        </div>
        <div className={classes.panel}>
          <ol className={classes.lista}>
            {[0, 1, 2, 3].map((n) => (
              <li key={n} className={classes.esqueleto} data-esqueleto="">
                <span className={classes.huesoSentido} />
                <span className={classes.huesoFecha} />
                <span className={classes.huesoQue} />
                <span className={classes.huesoRuta} />
                <span className={classes.huesoEstado} />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

/** Nada mandado todavía: por dónde empezar. */
function Vacio(): JSX.Element {
  return (
    <div className={classes.vacio}>
      <p className={classes.vacioTexto}>Todavía no mandaste nada. Tu ruta empieza en tu celular.</p>
      <div className={classes.vacioAcciones}>
        <Link to={RUTA_ENVIAR_ESTUDIOS} className={classes.boton}>
          Enviar mi laboratorio en PDF
        </Link>
        <Link to={RUTA_DATOS_DE_SALUD} className={classes.link}>
          Cargar mis datos de salud
        </Link>
      </div>
    </div>
  );
}

function AvisoIncompleto(): JSX.Element {
  return (
    <p className={classes.incompleto}>
      <IconAlertCircle size={20} stroke={1.75} aria-hidden="true" />
      <span>{TEXTO_INCOMPLETO}</span>
    </p>
  );
}

// ─── Hooks ───────────────────────────────────────────────────────────────────────────

/**
 * «Llegó: {qué}» para las llegadas nuevas que aparecen después de la primera carga (las que
 * trae el tiempo real). La primera carga no se anuncia: la persona recién entra.
 */
function useAnuncioDeLlegadas(tablero: TableroHomeD): string {
  const previas = useRef<ReadonlySet<string>>(undefined);
  const [anuncio, setAnuncio] = useState('');
  useEffect(() => {
    if (tablero.cargando) {
      return;
    }
    const antes = previas.current;
    previas.current = new Set(tablero.filas.map((f) => f.id));
    if (!antes) {
      return;
    }
    const llegadas = tablero.filas.filter((f) => f.sentido === 'llegada' && tablero.nuevas.has(f.id) && !antes.has(f.id));
    if (llegadas.length > 0) {
      setAnuncio(llegadas.map((f) => `Llegó: ${f.que}.`).join(' '));
    }
  }, [tablero]);
  return anuncio;
}

/**
 * Las paletas giran una sola vez por fila: al aparecer una fila nueva se deja girar y, pasado
 * el tiempo del giro, queda marcada (si vuelve a montarse, por ejemplo al cambiar de pestaña,
 * ya no gira). Devuelve si una fila tiene que girar ahora.
 */
function usePaletasUnaVez(idsNuevosVisibles: readonly string[]): (id: string) => boolean {
  const giradas = useRef(new Set<string>());
  const timers = useRef(new Map<string, number>());
  const clave = idsNuevosVisibles.join('\n');
  useEffect(() => {
    for (const id of clave ? clave.split('\n') : []) {
      if (!giradas.current.has(id) && !timers.current.has(id)) {
        timers.current.set(
          id,
          window.setTimeout(() => {
            giradas.current.add(id);
            timers.current.delete(id);
          }, MAX_PALETAS_MS + 100)
        );
      }
    }
  }, [clave]);
  useEffect(() => {
    const pendientes = timers.current;
    return () => {
      pendientes.forEach((t) => window.clearTimeout(t));
      pendientes.clear();
    };
  }, []);
  return (id) => !giradas.current.has(id);
}
