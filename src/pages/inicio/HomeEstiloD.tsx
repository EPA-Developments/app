// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Home estilo D («Salidas y llegadas»): la ve todo el que no ve el E (estilo.ts): hombres,
// mujeres fuera de 45-55 y quien no cargó sexo o fecha de nacimiento. Por eso sus textos son
// neutros. Un lounge nocturno y calmo (con un modo claro equivalente) donde los datos de la
// persona viajan de verdad, en este orden:
//  1. la puerta: un solo próximo paso (paraHoy → puertaDe), la tira de pase del Plan
//     Bienestar y, al lado, la ruta de ida y vuelta de sus datos (rutaDe → RutaIdaVuelta);
//  2. el tablero «Salidas y llegadas de tus datos» (useTableroHomeD → TableroSalidasLlegadas);
//  3. los tres caminos (caminosDe), los mismos que la Home E;
//  4. sus tres instrumentos: LE8, CKM y PREVENT (el modelo compartido de prevent.ts);
//  5. el seguimiento GLP-1 (solo si está en el programa);
//  6. sus servicios y el resto del portal;
//  7. el cierre: quién la acompaña y qué pasa con sus datos.
//
// `HomeEstiloD` carga los datos UNA vez (useDatosHomeE, useTableroHomeD), resuelve el tema y
// las fuentes; `VistaHomeD` es pura en props (se prueba y se captura con datos de ejemplo). Es
// un solo árbol responsive (el orden del DOM es el del celular). Todos los accesos son links
// reales. Los tokens --d-* viven en HomeEstiloD.module.css, sobre la raíz (`data-tema`).
import { categoriaLe8, LE8_DOMINIO_LABEL } from '@epa/careplan-menopausia';
import type { PreventBanda } from '@epa/careplan-menopausia';
import { SegmentedControl } from '@mantine/core';
import {
  IconArrowDown,
  IconArrowRight,
  IconCalendarEvent,
  IconClipboardHeart,
  IconFileCertificate,
  IconFileUpload,
  IconMessage,
  IconMoon,
  IconStarFilled,
  IconSun,
  IconVideo,
} from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';
import { useCallback, useEffect, useId, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { RUTA_ENVIAR_ESTUDIOS } from '../../components/AccionesRapidas';
import { SeguimientoGlp1Card } from '../../components/SeguimientoGlp1Card';
import type { PlanBienestar } from '../../fhir/bienestar';
import { RUTA_CONSENTIMIENTO } from '../../fhir/consentimiento';
import { MARCA } from '../../marca';
import { RUTA_SALUD } from '../health-record/Salud.data';
import { caminosDe, NOTA_COSTO_TELECONSULTA, pidioSegundaOpinion, subioDatos } from './caminos';
import { conSigno, fechaAbreviada, fechaConDia, fechaCorta, mayuscula, plural } from './formato';
import classes from './HomeEstiloD.module.css';
import { paraHoy } from './paraHoy';
import { preventDe } from './prevent';
import type { AccionPrevent, ModeloPrevent, ProcedenciaPrevent } from './prevent';
import { puertaDe } from './puerta';
import { dominioConMasMargen, puntajeDe } from './rosa';
import { detalleConsentimiento, rutaDe } from './ruta';
import { RutaIdaVuelta } from './RutaIdaVuelta';
import {
  RUTA_MI_SEGUNDA_OPINION,
  RUTA_PLAN_BIENESTAR,
  RUTA_RESERVAR_TELECONSULTA,
  RUTA_SOLICITAR_SEGUNDA_OPINION,
  RUTA_TABLERO_LE8,
} from './rutas';
import { TableroSalidasLlegadas } from './TableroSalidasLlegadas';
import type { CategoriaLe8, ClaveCamino, DatosHomeE, EstadioCkmHome, Camino, TableroHomeD, TemaHomeD } from './tipos';
import { HGraphPaciente, TEXTO_VALORES_SIN_LEER } from './HGraphPaciente';
import { hgraphVisible } from './hgraph';
import { ETAPAS_CKM, notaEstadioCkm, TEXTO_SIN_ESTADIO, useDatosHomeE } from './useDatosHomeE';
import { useTableroHomeD } from './useTableroHomeD';

const RUTA_RESERVAR_TURNO = '/get-care';
const RUTA_MENSAJES = '/Communication';
const RUTA_BIOMARCADORES = '/health-record/biomarkers';
const RUTA_CUESTIONARIOS = '/health-record/cuestionarios';
const RUTA_CKM = '/ckm';
const RUTA_EQUIPO = '/account/equipo';
const RUTA_MEMBRESIA = '/membership';

/** Ids de los títulos (aria-labelledby) y del ancla del tablero. La Home se monta una vez por página. */
export const ID_HOME_D = {
  titulo: 'home-d-titulo',
  /** El ancla de «Ver salidas y llegadas». */
  seccionTablero: 'salidas-y-llegadas',
  tablero: 'home-d-tablero',
  valores: 'home-d-valores',
  caminos: 'home-d-caminos',
  instrumentos: 'home-d-instrumentos',
  le8: 'home-d-le8',
  ckm: 'home-d-ckm',
  prevent: 'home-d-prevent',
  servicios: 'home-d-servicios',
} as const;
const ID = ID_HOME_D;

// ─── Fuentes ─────────────────────────────────────────────────────────────────────────

const ID_FUENTES = 'fuentes-home-d';

/** Schibsted Grotesk (todo) e IBM Plex Mono 500 (el tablero, la tira de pase y overlines cortos). */
export const URL_FUENTES_HOME_D =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500' +
  '&family=Schibsted+Grotesk:wght@400;500;600;700&display=swap';

/**
 * Agrega a `<head>` el `<link>` de las fuentes de la Home D, una sola vez (aunque la Home se
 * monte de nuevo). Mientras llegan, el CSS cae en Helvetica / system-ui y en la mono del sistema.
 */
export function useFuentesHomeD(): void {
  useEffect(() => {
    if (document.getElementById(ID_FUENTES)) {
      return;
    }
    const preconexion = document.createElement('link');
    preconexion.rel = 'preconnect';
    preconexion.href = 'https://fonts.gstatic.com';
    preconexion.crossOrigin = 'anonymous';
    const hoja = document.createElement('link');
    hoja.id = ID_FUENTES;
    hoja.rel = 'stylesheet';
    hoja.href = URL_FUENTES_HOME_D;
    document.head.append(preconexion, hoja);
  }, []);
}

// ─── Tema ────────────────────────────────────────────────────────────────────────────

/** Dónde se guarda el tema elegido, en este dispositivo. */
export const CLAVE_TEMA_HOME_D = 'home-d-tema';

/** «claro» u «oscuro» (de la URL o de lo guardado); cualquier otro valor, undefined. */
export function temaDe(valor: string | null | undefined): TemaHomeD | undefined {
  const v = valor?.trim().toLowerCase();
  return v === 'claro' || v === 'oscuro' ? v : undefined;
}

/** El tema guardado; undefined si no hay o si el almacenamiento no está disponible. */
export function leerTemaGuardado(): TemaHomeD | undefined {
  try {
    return temaDe(window.localStorage.getItem(CLAVE_TEMA_HOME_D));
  } catch {
    return undefined; // modo privado o almacenamiento bloqueado: el oscuro de siempre
  }
}

/** Guarda el tema; si no se puede, vale solo para esta visita (no pasa nada más). */
export function guardarTema(tema: TemaHomeD): void {
  try {
    window.localStorage.setItem(CLAVE_TEMA_HOME_D, tema);
  } catch {
    // sin almacenamiento: el cambio vale mientras dure la página
  }
}

/**
 * El tema de la Home D: el que elija la persona con el botón (y se guarda); si no eligió en
 * esta visita, el de `?tema=claro|oscuro` (para que el equipo pruebe: lo fuerza sin guardarlo);
 * si no, el guardado; si no, el oscuro (el diseño aprobado).
 */
export function useTemaHomeD(): readonly [TemaHomeD, (tema: TemaHomeD) => void] {
  const [searchParams] = useSearchParams();
  const forzado = temaDe(searchParams.get('tema'));
  const [guardado] = useState(leerTemaGuardado);
  const [elegido, setElegido] = useState<TemaHomeD>();
  const cambiar = useCallback((tema: TemaHomeD) => {
    setElegido(tema);
    guardarTema(tema);
  }, []);
  return [elegido ?? forzado ?? guardado ?? 'oscuro', cambiar];
}

// ─── Contenedor ──────────────────────────────────────────────────────────────────────

/** La Home D de la persona logueada: carga sus datos y su tablero una vez y se los pasa a la vista. */
export function HomeEstiloD(): JSX.Element {
  const datos = useDatosHomeE();
  const tablero = useTableroHomeD();
  const [tema, cambiarTema] = useTemaHomeD();
  useFuentesHomeD();
  const [searchParams] = useSearchParams();
  return (
    <VistaHomeD
      datos={datos}
      tablero={tablero}
      tema={tema}
      alCambiarTema={cambiarTema}
      mostrarHgraph={hgraphVisible(searchParams.get('hgraph'))}
    />
  );
}

// ─── Textos y formatos propios de D (los compartidos están en formato.ts) ───────────

function clases(...nombres: (string | false | undefined)[]): string {
  return nombres.filter(Boolean).join(' ');
}

/** «del Dr. …» o «de la Dra. …»: MARCA.dirigidoPor ya trae el artículo («el Dr. …»). */
export function conDireccionDe(dirigidoPor: string): string {
  const quien = dirigidoPor.trim();
  const articulo = /^el\s+/i.exec(quien);
  return articulo ? `del ${quien.slice(articulo[0].length)}` : `de ${quien}`;
}

/** Tono de un chip (siempre con su texto). */
type Tono = 'ok' | 'atencion' | 'demorado' | 'acento' | 'nuevo' | 'neutro';

const TONO_LE8: Readonly<Record<CategoriaLe8, Tono>> = { alta: 'ok', moderada: 'atencion', baja: 'demorado' };

const TONO_BANDA_PREVENT: Readonly<Record<PreventBanda, Tono>> = {
  bajo: 'ok',
  limite: 'atencion',
  intermedio: 'atencion',
  alto: 'demorado',
};

/**
 * El rótulo corto de la tarjeta PREVENT, según de dónde sale el riesgo (prevent.ts). «Firmado»
 * solo en `firmado` (firma médica registrada); el informe sin esa firma es «preparado con IA».
 */
const ROTULO_PREVENT: Readonly<Record<ProcedenciaPrevent, { readonly texto: string; readonly tono: Tono }>> = {
  firmado: { texto: 'Firmado', tono: 'ok' },
  'informe-ia': { texto: 'Preparado con IA', tono: 'atencion' },
  estimado: { texto: 'Estimado', tono: 'atencion' },
  'sin-datos': { texto: 'Sin datos', tono: 'neutro' },
};

function redondo(puntaje: number | undefined): number | undefined {
  return puntaje === undefined ? undefined : Math.round(Math.min(100, Math.max(0, puntaje)));
}

/** El hábito con menor puntaje, solo si hay al menos 2 con dato (con uno no hay con qué comparar). */
function habitoMasBajo(le8: DatosHomeE['le8']): { readonly nombre: string; readonly puntaje: number } | undefined {
  if (!le8 || le8.conDato < 2) {
    return undefined;
  }
  const dominio = dominioConMasMargen(le8.dominios);
  const puntaje = dominio ? redondo(puntajeDe(le8.dominios, dominio)) : undefined;
  return dominio && puntaje !== undefined ? { nombre: LE8_DOMINIO_LABEL[dominio], puntaje } : undefined;
}

function Flecha({ tamano = 20 }: { readonly tamano?: number }): JSX.Element {
  return <IconArrowRight size={tamano} stroke={2} aria-hidden="true" />;
}

function Chip({ tono, children }: { readonly tono: Tono; readonly children: ReactNode }): JSX.Element {
  return (
    <span className={classes.chip} data-tono={tono}>
      <span aria-hidden="true" className={classes.chipPunto} />
      {children}
    </span>
  );
}

function Hueso({ className, alto }: { readonly className?: string; readonly alto?: number }): JSX.Element {
  return <span aria-hidden="true" className={clases(classes.hueso, className)} style={alto ? { height: alto } : {}} />;
}

// ─── Vista ───────────────────────────────────────────────────────────────────────────

export interface VistaHomeDProps {
  readonly datos: DatosHomeE;
  /** Lo que devuelve useTableroHomeD(). */
  readonly tablero: TableroHomeD;
  readonly tema: TemaHomeD;
  /** Sin él, no se muestra el selector de tema (p. ej. en el visor de capturas). */
  readonly alCambiarTema?: (tema: TemaHomeD) => void;
  /** «Tus valores» (el hGraph): hasta que se publique, sólo con `?hgraph=si` (hgraph.ts). */
  readonly mostrarHgraph?: boolean;
}

/**
 * La Home D con los datos ya cargados (pura en props). Con un perfil que no es Patient, una
 * Home mínima y neutra: la puerta, la ruta sin datos de nadie, los servicios y el cierre (sin
 * pedir firmas ni datos).
 */
export function VistaHomeD({
  datos,
  tablero,
  tema,
  alCambiarTema,
  mostrarHgraph = false,
}: VistaHomeDProps): JSX.Element {
  return (
    <div className={classes.raiz} data-tema={tema} aria-busy={datos.cargando || undefined}>
      <Puerta datos={datos} tema={tema} alCambiarTema={alCambiarTema} />
      {datos.esPaciente && (
        <>
          {mostrarHgraph && <SeccionValores datos={datos} tema={tema} />}
          <SeccionTablero datos={datos} tablero={tablero} />
          <TresCaminos datos={datos} />
          <TusTresInstrumentos datos={datos} />
          {/* Se autogestiona: si no está en el programa GLP-1, no ocupa lugar (:empty). */}
          <div className={clases(classes.contenedor, classes.glp1)}>
            <SeguimientoGlp1Card />
          </div>
        </>
      )}
      <TusServicios datos={datos} />
      <Cierre datos={datos} />
    </div>
  );
}

// ─── 1. Puerta ───────────────────────────────────────────────────────────────────────

/** Las dos opciones del tema, con su ícono: se elige una, y la elegida se ve marcada. */
const OPCIONES_TEMA: readonly { readonly value: TemaHomeD; readonly texto: string; readonly icono: Icon }[] = [
  { value: 'oscuro', texto: 'Oscuro', icono: IconMoon },
  { value: 'claro', texto: 'Claro', icono: IconSun },
];

function SelectorTema({
  tema,
  alCambiar,
}: {
  readonly tema: TemaHomeD;
  readonly alCambiar: (tema: TemaHomeD) => void;
}): JSX.Element {
  // Dos opciones a la vista (un radiogroup): siempre se sabe en qué tema estás y cuál es el otro.
  return (
    <SegmentedControl
      aria-label="Tema de la página"
      data={OPCIONES_TEMA.map(({ value, texto, icono: Icono }) => ({
        value,
        label: (
          <span className={classes.temaOpcion}>
            <Icono size={18} stroke={1.75} aria-hidden="true" />
            {texto}
          </span>
        ),
      }))}
      value={tema}
      onChange={(valor) => alCambiar(valor === 'claro' ? 'claro' : 'oscuro')}
      withItemsBorders={false}
      classNames={{
        root: classes.tema,
        indicator: classes.temaIndicador,
        input: classes.temaEntrada,
        label: classes.temaEtiqueta,
      }}
    />
  );
}

function Puerta({
  datos,
  tema,
  alCambiarTema,
}: {
  readonly datos: DatosHomeE;
  readonly tema: TemaHomeD;
  readonly alCambiarTema?: (tema: TemaHomeD) => void;
}): JSX.Element {
  return (
    <section aria-labelledby={ID.titulo} className={classes.puerta}>
      <div className={clases(classes.contenedor, classes.puertaInterior)}>
        {alCambiarTema && (
          <div className={classes.barraTema}>
            <SelectorTema tema={tema} alCambiar={alCambiarTema} />
          </div>
        )}
        <div className={classes.puertaGrilla}>
          {datos.cargando ? <PuertaCargando /> : <PuertaTexto datos={datos} />}
          <div className={classes.puertaRuta}>
            {datos.cargando ? (
              <Hueso className={classes.huesoRuta} />
            ) : (
              <RutaIdaVuelta ruta={rutaDe(datos, { producto: MARCA.producto })} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Mientras carga: el título existe (para la estructura) y el resto son huesos del mismo tamaño. */
function PuertaCargando(): JSX.Element {
  return (
    <div className={classes.puertaTexto}>
      <div className={classes.puertaCabecera}>
        <h1 id={ID.titulo} className={classes.oculto}>
          Inicio
        </h1>
        <Hueso alto={22} />
        <Hueso alto={112} />
        <Hueso alto={56} />
      </div>
      <Hueso alto={56} />
      <Hueso alto={88} />
    </div>
  );
}

function PuertaTexto({ datos }: { readonly datos: DatosHomeE }): JSX.Element {
  const puerta = puertaDe(datos, paraHoy(datos, { producto: MARCA.producto }));
  const idNota = useId();
  return (
    <div className={classes.puertaTexto}>
      <div className={classes.puertaCabecera}>
        <p className={classes.overline}>
          <span aria-hidden="true" className={classes.punto} />
          {puerta.overline}
        </p>
        <h1 id={ID.titulo} className={classes.titulo}>
          {puerta.titulo}
        </h1>
        <p className={classes.bajada}>{puerta.bajada}</p>
      </div>
      <div className={classes.puertaAcciones}>
        <Link
          to={puerta.paso.href}
          className={clases(classes.boton, classes.botonPuerta)}
          aria-describedby={puerta.nota ? idNota : undefined}
        >
          {puerta.paso.cta}
          <Flecha />
        </Link>
        {/* Qué tiene costo (la teleconsulta), justo debajo del botón. */}
        {puerta.nota && (
          <p id={idNota} className={clases(classes.nota, classes.notaPuerta)}>
            {puerta.nota}
          </p>
        )}
        {datos.esPaciente && (
          // Un ancla dentro de la página: <a href="#…"> nativo (el navegador baja hasta el tablero).
          <a href={`#${ID.seccionTablero}`} className={clases(classes.link, classes.linkAncla)}>
            Ver salidas y llegadas
            <IconArrowDown size={18} stroke={2} aria-hidden="true" />
          </a>
        )}
      </div>
      {datos.esPaciente &&
        (datos.plan ? (
          <TiraDePase plan={datos.plan} />
        ) : (
          <p className={classes.sinPlan}>
            <span>Plan Bienestar · 100 días — todavía no empezaste</span>
            <Link to={RUTA_PLAN_BIENESTAR} className={classes.link}>
              Empezar mi Plan Bienestar
            </Link>
          </p>
        ))}
    </div>
  );
}

/**
 * La tira tipo pase, en mono y con los campos reales del plan: programa, día (con su barrita),
 * racha y próximo hito. Las etiquetas van en minúscula en el DOM (la pantalla las pasa a
 * mayúsculas) para que un lector de pantalla no las deletree.
 */
function TiraDePase({ plan }: { readonly plan: PlanBienestar }): JSX.Element {
  const dia = Math.min(plan.dia, plan.totalDias);
  const faltan = Math.max(0, plan.totalDias - plan.dia);
  const avance = plan.terminado ? 100 : Math.round((dia / Math.max(1, plan.totalDias)) * 100);
  const cumplidos = plan.hitos.filter((h) => h.cumplido).length;
  const pendiente = plan.hitos.find((h) => !h.cumplido);
  return (
    <dl className={classes.tira}>
      <div className={classes.tiraCampo}>
        <dt className={classes.tiraEtiqueta}>Programa</dt>
        <dd className={classes.tiraValor}>Plan Bienestar</dd>
        <dd className={classes.tiraDetalle}>{plan.totalDias} días</dd>
      </div>
      <div className={classes.tiraCampo}>
        <dt className={classes.tiraEtiqueta}>Día</dt>
        <dd className={classes.tiraValor}>
          <span aria-hidden="true">
            {plan.terminado ? plan.totalDias : dia}/{plan.totalDias}
          </span>
          <span className={classes.oculto}>
            {plan.terminado ? plan.totalDias : dia} de {plan.totalDias}
          </span>
        </dd>
        <dd className={classes.tiraDetalle}>
          <span aria-hidden="true" className={classes.tiraBarra}>
            <span style={{ width: `${avance}%` }} />
          </span>
          {plan.terminado ? `Completaste los ${plan.totalDias} días` : `faltan ${faltan}`}
        </dd>
      </div>
      <div className={classes.tiraCampo}>
        {plan.rachaActual > 0 ? (
          <>
            <dt className={classes.tiraEtiqueta}>Racha</dt>
            <dd className={classes.tiraValor}>{plural(plan.rachaActual, 'semana', 'semanas')}</dd>
          </>
        ) : (
          <>
            <dt className={classes.tiraEtiqueta}>Semanas activas</dt>
            <dd className={classes.tiraValor}>{plan.semanasActivas}</dd>
          </>
        )}
      </div>
      {plan.hitos.length > 0 && (
        <div className={classes.tiraCampo}>
          <dt className={classes.tiraEtiqueta}>{pendiente ? 'Próximo hito' : 'Hitos'}</dt>
          <dd className={classes.tiraValor}>{pendiente ? pendiente.label : 'Completos'}</dd>
          <dd className={classes.tiraDetalle}>
            {cumplidos} de {plural(plan.hitos.length, 'hito', 'hitos')}
          </dd>
        </div>
      )}
    </dl>
  );
}

// ─── 2. Tablero ──────────────────────────────────────────────────────────────────────

function SeccionTablero({
  datos,
  tablero,
}: {
  readonly datos: DatosHomeE;
  readonly tablero: TableroHomeD;
}): JSX.Element {
  return (
    <section
      id={ID.seccionTablero}
      aria-labelledby={ID.tablero}
      className={clases(classes.seccion, classes.seccionTablero)}
    >
      <div className={classes.contenedor}>
        <div className={classes.encabezado}>
          <p className={classes.overlineMono}>
            <span aria-hidden="true">Hoy · {fechaAbreviada(datos.hoy)}</span>
            <span className={classes.oculto}>Hoy es {fechaConDia(datos.hoy)}</span>
          </p>
          <h2 id={ID.tablero} className={classes.tituloSeccion}>
            Salidas y llegadas de tus datos
          </h2>
          {/* «Lo que vuelve a vos», no «lo que te devuelve tu equipo»: muchas llegadas son de IA. */}
          <p className={classes.bajadaSeccion}>Salidas: lo que mandaste. Llegadas: lo que vuelve a vos.</p>
        </div>
        {/* Con el tablero vacío, a quien ya tiene datos no se le dice que no mandó nada. */}
        <TableroSalidasLlegadas tablero={tablero} idTitulo={ID.tablero} hoy={datos.hoy} conDatos={subioDatos(datos)} />
      </div>
    </section>
  );
}

// ─── 2 bis. Tus valores ──────────────────────────────────────────────────────────────

/**
 * El hGraph con sus valores, después de la puerta: el mismo mapa que ve su equipo en la ficha
 * (hgraph.ts), con los colores del tema de la página.
 */
function SeccionValores({ datos, tema }: { readonly datos: DatosHomeE; readonly tema: TemaHomeD }): JSX.Element {
  return (
    <section aria-labelledby={ID.valores} className={classes.seccion}>
      <div className={classes.contenedor}>
        <div className={classes.encabezado}>
          <h2 id={ID.valores} className={classes.tituloSeccion}>
            Tus valores
          </h2>
          <p className={classes.bajadaSeccion}>
            Tu presión, tu peso, tu azúcar, tu colesterol y tus riñones, en el mismo mapa que mira tu equipo médico.
          </p>
        </div>
        {datos.cargando ? (
          <Hueso className={classes.huesoInstrumento} />
        ) : (
          <div className={classes.tarjeta}>
            {datos.hgraph ? (
              <HGraphPaciente modelo={datos.hgraph} tema={tema} hoy={datos.hoy} />
            ) : (
              <p className={classes.texto}>{TEXTO_VALORES_SIN_LEER}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── 3. Tres caminos ─────────────────────────────────────────────────────────────────

const ICONO_CAMINO: Readonly<Record<ClaveCamino, Icon>> = {
  plan: IconClipboardHeart,
  'segunda-opinion': IconFileCertificate,
  teleconsulta: IconVideo,
};

/**
 * Los tres caminos que le ofrecemos, en orden (caminosDe, los mismos que la Home E). A lo sumo
 * uno va como «Recomendado para vos», con su botón lleno; los otros, con botón contorno.
 * Mientras carga, no se adelanta ninguno.
 */
function TresCaminos({ datos }: { readonly datos: DatosHomeE }): JSX.Element {
  return (
    <section aria-labelledby={ID.caminos} className={classes.seccion}>
      <div className={classes.contenedor}>
        <div className={classes.encabezado}>
          <p className={classes.overlineMono}>Elegí por dónde seguir</p>
          <h2 id={ID.caminos} className={classes.tituloSeccion}>
            Tres caminos para cuidar tu corazón
          </h2>
          <p className={classes.bajadaSeccion}>En los tres te acompañamos y te damos una devolución.</p>
        </div>
        {datos.cargando ? (
          <div className={classes.caminos}>
            <Hueso className={classes.huesoCamino} />
            <Hueso className={classes.huesoCamino} />
            <Hueso className={classes.huesoCamino} />
          </div>
        ) : (
          <ol className={classes.caminos}>
            {caminosDe(datos, { producto: MARCA.producto, dirigidoPor: MARCA.dirigidoPor }).map((camino) => (
              <li key={camino.clave} className={classes.caminoItem}>
                <TarjetaCamino camino={camino} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function TarjetaCamino({ camino }: { readonly camino: Camino }): JSX.Element {
  const Icono = ICONO_CAMINO[camino.clave];
  const idTitulo = `${ID.caminos}-${camino.clave}`;
  return (
    <article
      aria-labelledby={idTitulo}
      className={clases(classes.tarjeta, classes.camino, camino.recomendado && classes.caminoRecomendado)}
    >
      {camino.recomendado && (
        <p className={classes.cinta}>
          <IconStarFilled size={14} aria-hidden="true" />
          Recomendado para vos
        </p>
      )}
      <div className={classes.caminoCabecera}>
        <p className={classes.caminoNumero}>
          <span className={classes.oculto}>Camino </span>
          {camino.numero}
        </p>
        <span aria-hidden="true" className={classes.icono}>
          <Icono size={26} stroke={1.75} />
        </span>
      </div>
      <div className={classes.caminoCuerpo}>
        <h3 id={idTitulo} className={classes.tituloTarjeta}>
          {camino.titulo}
        </h3>
        <p className={classes.texto}>{camino.descripcion}</p>
        {camino.estado && (
          <p className={classes.caminoEstado}>
            <span aria-hidden="true" />
            {camino.estado}
          </p>
        )}
      </div>
      <div className={classes.caminoAccion}>
        <Link
          to={camino.href}
          className={camino.recomendado ? classes.boton : classes.botonContorno}
          data-variante={camino.recomendado ? 'primario' : 'contorno'}
        >
          {camino.cta}
          <Flecha />
        </Link>
        {camino.nota && <p className={classes.nota}>{camino.nota}</p>}
      </div>
    </article>
  );
}

// ─── 4. Tus tres instrumentos ────────────────────────────────────────────────────────

/**
 * LE8, CKM y PREVENT. En el celular van apiladas, no en un carrusel: el carrusel esconde dos
 * de las tres detrás de un gesto que no todos descubren (el público es de 40 a 70 años), con
 * zoom se rompe el «snap», y PREVENT lleva acciones (la teleconsulta, la Segunda Opinión) que
 * no pueden quedar fuera de la vista. Apiladas se leen en orden, con el teclado y sin
 * indicadores de página que mantener.
 */
function TusTresInstrumentos({ datos }: { readonly datos: DatosHomeE }): JSX.Element {
  return (
    <section aria-labelledby={ID.instrumentos} className={classes.seccion}>
      <div className={classes.contenedor}>
        <div className={classes.encabezado}>
          <h2 id={ID.instrumentos} className={classes.tituloSeccion}>
            Tus tres instrumentos
          </h2>
          <p className={classes.bajadaSeccion}>
            Tres miradas basadas en las guías de la AHA, que se nutren de lo que mandás.
          </p>
        </div>
        {datos.cargando ? (
          <div className={classes.instrumentos}>
            <Hueso className={classes.huesoInstrumento} />
            <Hueso className={classes.huesoInstrumento} />
            <Hueso className={classes.huesoInstrumento} />
          </div>
        ) : (
          <div className={classes.instrumentos}>
            <InstrumentoLe8 datos={datos} />
            <InstrumentoCkm ckm={datos.ckm} hoy={datos.hoy} />
            <InstrumentoPrevent datos={datos} />
          </div>
        )}
      </div>
    </section>
  );
}

// El arco de los instrumentos: media circunferencia de radio 84 con centro en (100, 104).
const CENTRO = { x: 100, y: 104 } as const;
const RADIO = 84;
const LARGO_ARCO = Math.PI * RADIO;
const ARCO = `M${CENTRO.x - RADIO} ${CENTRO.y}A${RADIO} ${RADIO} 0 0 1 ${CENTRO.x + RADIO} ${CENTRO.y}`;

/** El punto del arco a `grados` (180 = izquierda, 0 = derecha) y a `radio` del centro. */
function puntoDelArco(grados: number, radio: number = RADIO): { readonly x: number; readonly y: number } {
  const angulo = (grados * Math.PI) / 180;
  const redondear = (n: number): number => Math.round(n * 100) / 100;
  return { x: redondear(CENTRO.x + radio * Math.cos(angulo)), y: redondear(CENTRO.y - radio * Math.sin(angulo)) };
}

/** Los 5 tramos del arco CKM (0 a 4), con un respiro entre uno y otro. */
const TRAMOS_CKM: readonly string[] = [0, 1, 2, 3, 4].map((n) => {
  const respiro = 1.8;
  const desde = puntoDelArco(180 - 36 * n - (n > 0 ? respiro : 0));
  const hasta = puntoDelArco(180 - 36 * (n + 1) + (n < 4 ? respiro : 0));
  return `M${desde.x} ${desde.y}A${RADIO} ${RADIO} 0 0 1 ${hasta.x} ${hasta.y}`;
});

function InstrumentoLe8({ datos }: { readonly datos: DatosHomeE }): JSX.Element {
  const { le8, le8Inicial } = datos;
  const total = redondo(le8?.total);
  const inicial = redondo(le8Inicial?.total);
  const categoria = le8?.categoria ?? (total === undefined ? undefined : categoriaLe8(total));
  const masBajo = habitoMasBajo(le8);
  const marcaDia0 =
    inicial === undefined
      ? undefined
      : { desde: puntoDelArco(180 - inicial * 1.8, 74), hasta: puntoDelArco(180 - inicial * 1.8, 94) };
  return (
    <article aria-labelledby={ID.le8} className={classes.tarjeta}>
      <div className={classes.instrumentoCabecera}>
        <div>
          <h3 id={ID.le8} className={classes.tituloTarjeta}>
            Life’s Essential 8
          </h3>
          <p className={classes.subtitulo}>Tus 8 hábitos, de 0 a 100</p>
        </div>
        {categoria && (
          <Chip tono={TONO_LE8[categoria]}>
            <span className={classes.oculto}>Banda </span>
            {mayuscula(categoria)}
          </Chip>
        )}
      </div>
      <div className={classes.cifra}>
        <svg viewBox="0 0 200 124" aria-hidden="true" focusable="false">
          <path d={ARCO} className={classes.arcoPista} />
          {total !== undefined && total > 0 && (
            <path
              d={ARCO}
              className={classes.arcoRelleno}
              strokeDasharray={`${((LARGO_ARCO * total) / 100).toFixed(2)} 400`}
            />
          )}
          {marcaDia0 && (
            <path
              d={`M${marcaDia0.desde.x} ${marcaDia0.desde.y}L${marcaDia0.hasta.x} ${marcaDia0.hasta.y}`}
              className={classes.arcoMarca}
            />
          )}
        </svg>
        <p className={classes.cifraTexto}>
          <span className={classes.cifraNumero}>{total ?? '—'}</span>
          <span className={classes.cifraUnidad}>{total === undefined ? 'todavía sin datos' : 'de 100'}</span>
        </p>
      </div>
      {(inicial !== undefined || (le8 && categoria && !le8.completo) || masBajo) && (
        <dl className={classes.datos}>
          {inicial !== undefined && (
            <div>
              <dt>Desde el día 0</dt>
              <dd>
                {total === undefined ? (
                  `día 0: ${inicial}`
                ) : (
                  <>
                    {conSigno(total - inicial)} <span className={classes.datoSecundario}>· día 0: {inicial}</span>
                  </>
                )}
              </dd>
            </div>
          )}
          {le8 && categoria && !le8.completo && (
            <div>
              <dt>Calculado</dt>
              <dd>Con {le8.conDato} de 8 hábitos</dd>
            </div>
          )}
          {masBajo && (
            <div>
              <dt>Tu hábito más bajo</dt>
              <dd>
                {masBajo.nombre} <span className={classes.datoSecundario}>· {masBajo.puntaje}</span>
              </dd>
            </div>
          )}
        </dl>
      )}
      {total === undefined && (
        <p className={classes.texto}>Respondé tus cuestionarios de hábitos y cargá tus datos para ver tu puntaje.</p>
      )}
      <Link to={RUTA_TABLERO_LE8} className={clases(classes.link, classes.linkTarjeta)}>
        Ver mis 8 hábitos
        <Flecha tamano={18} />
      </Link>
    </article>
  );
}

function InstrumentoCkm({ ckm, hoy }: { readonly ckm: EstadioCkmHome | undefined; readonly hoy: string }): JSX.Element {
  return (
    <article aria-labelledby={ID.ckm} className={classes.tarjeta}>
      <div className={classes.instrumentoCabecera}>
        <div>
          <h3 id={ID.ckm} className={classes.tituloTarjeta}>
            Salud CKM
          </h3>
          <p className={classes.subtitulo}>Corazón, riñones y metabolismo</p>
        </div>
        {ckm && <Chip tono="acento">Estadio {ckm.estadio}</Chip>}
      </div>
      <div className={classes.cifra}>
        <svg viewBox="0 0 200 124" aria-hidden="true" focusable="false">
          {TRAMOS_CKM.map((d, n) => (
            <path
              key={d}
              d={d}
              className={clases(classes.arcoSegmento, ckm?.estadio === n && classes.arcoSegmentoActual)}
            />
          ))}
        </svg>
        <span aria-hidden="true" className={classes.cifraExtremo} style={{ left: 10 }}>
          0
        </span>
        <span aria-hidden="true" className={classes.cifraExtremo} style={{ right: 10 }}>
          4
        </span>
        <p className={classes.cifraTexto}>
          <span aria-hidden="true" className={classes.cifraNumero}>
            {ckm ? ckm.estadio : '—'}
          </span>
          <span aria-hidden="true" className={classes.cifraUnidad}>
            estadio
          </span>
          <span className={classes.oculto}>
            {ckm ? `Estadio ${ckm.estadio}, en una escala de 0 a 4.` : 'Todavía sin estadio.'}
          </span>
        </p>
      </div>
      <div className={classes.lectura}>
        <p className={classes.lecturaTitulo}>{ckm ? ETAPAS_CKM[ckm.estadio] : TEXTO_SIN_ESTADIO}</p>
        {ckm && <p className={classes.texto}>{notaEstadioCkm(ckm, hoy)}</p>}
        <p className={classes.texto}>La escala de la AHA va de 0, zona saludable, a 4, cuidado activo.</p>
      </div>
      <Link to={RUTA_CKM} className={clases(classes.link, classes.linkTarjeta)}>
        Entender mi estadio CKM
        <Flecha tamano={18} />
      </Link>
    </article>
  );
}

/**
 * PREVENT, dibujado desde el modelo compartido con la Home E (prevent.ts): de dónde sale el
 * riesgo (firmado / del informe preparado con IA / estimado con sus datos / sin datos), sus
 * tres riesgos y qué hacer con eso. Acá no se decide ninguna regla: solo se dibuja.
 */
function InstrumentoPrevent({ datos }: { readonly datos: DatosHomeE }): JSX.Element {
  const modelo = preventDe(datos, { producto: MARCA.producto });
  const rotulo = ROTULO_PREVENT[modelo.procedencia];
  const ascvd = modelo.riesgos.find((r) => r.clave === 'ascvd10');
  return (
    <article aria-labelledby={ID.prevent} className={classes.tarjeta}>
      <div className={classes.instrumentoCabecera}>
        <div>
          <h3 id={ID.prevent} className={classes.tituloTarjeta}>
            {modelo.etiqueta}
          </h3>
          <p className={classes.subtitulo}>{modelo.titulo}</p>
        </div>
        <Chip tono={rotulo.tono}>{rotulo.texto}</Chip>
      </div>
      {/* La cifra repite el ASCVD a 10 años de la lista de abajo: para los lectores, la lista. */}
      <div className={classes.cifra} aria-hidden="true">
        <svg viewBox="0 0 200 124" focusable="false">
          <path d={ARCO} className={modelo.procedencia === 'firmado' ? classes.arcoPista : classes.arcoPunteado} />
        </svg>
        <p className={classes.cifraTexto}>
          <span className={clases(classes.cifraNumero, ascvd?.porcentaje && classes.cifraNumeroChico)}>
            {ascvd?.porcentaje ?? '—'}
          </span>
          <span className={classes.cifraUnidad}>{ascvd?.porcentaje ? 'ASCVD a 10 años' : 'sin estimación'}</span>
        </p>
      </div>
      <div className={classes.lectura}>
        {modelo.chip && <p className={classes.procedencia}>{modelo.chip}</p>}
        <p className={classes.texto}>
          {modelo.destacado && (
            <>
              <strong className={classes.recuadroTitulo}>{modelo.destacado}</strong>{' '}
            </>
          )}
          {modelo.texto}
        </p>
      </div>
      {modelo.riesgos.length > 0 && (
        <dl className={classes.riesgos}>
          {modelo.riesgos.map((riesgo) => (
            <div key={riesgo.clave}>
              <dt>
                <span>{riesgo.nombre}</span>
                <span>{riesgo.detalle}</span>
              </dt>
              <dd>
                {riesgo.porcentaje ? (
                  <>
                    <span className={classes.riesgoPorcentaje}>{riesgo.porcentaje}</span>
                    {riesgo.banda && riesgo.textoBanda && (
                      <Chip tono={TONO_BANDA_PREVENT[riesgo.banda]}>{riesgo.textoBanda}</Chip>
                    )}
                  </>
                ) : (
                  <span className={classes.riesgoSinDato}>Sin dato</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {modelo.notaFaltantes && <p className={classes.nota}>{modelo.notaFaltantes}</p>}
      <AccionesPrevent modelo={modelo} />
    </article>
  );
}

/** ¿La acción lleva a reservar una teleconsulta? Entonces va con la nota de lo que tiene costo. */
function reservaTeleconsulta(accion: AccionPrevent): boolean {
  return (accion.tipo === 'boton' || accion.tipo === 'link') && accion.href === RUTA_RESERVAR_TELECONSULTA;
}

/**
 * Qué hacer con el PREVENT (las reglas están en prevent.ts). Un cálculo automático lleva el
 * recuadro «Es un cálculo automático» con sus acciones adentro; el resto, las acciones solas.
 * Justo después de la acción que reserva una teleconsulta, qué tiene costo (como en la puerta,
 * la ruta y el camino 3).
 */
function AccionesPrevent({ modelo }: { readonly modelo: ModeloPrevent }): JSX.Element {
  const acciones = modelo.acciones.flatMap((accion) => [
    <AccionDePrevent key={accion.texto} accion={accion} />,
    ...(reservaTeleconsulta(accion)
      ? [
          <p key={`${accion.texto}-costo`} className={classes.nota}>
            {NOTA_COSTO_TELECONSULTA}
          </p>,
        ]
      : []),
  ]);
  if (!modelo.recuadro) {
    return <div className={classes.preventAcciones}>{acciones}</div>;
  }
  return (
    <div className={classes.preventAcciones}>
      <div className={classes.recuadro}>
        <p className={classes.recuadroTitulo}>{modelo.recuadro.titulo}</p>
        <p className={classes.nota}>{modelo.recuadro.texto}</p>
        {acciones}
      </div>
    </div>
  );
}

function AccionDePrevent({ accion }: { readonly accion: AccionPrevent }): JSX.Element {
  switch (accion.tipo) {
    case 'boton':
      return (
        <Link to={accion.href} className={classes.boton} data-variante="primario">
          {accion.texto}
          <Flecha />
        </Link>
      );
    case 'link':
      return (
        <Link to={accion.href} className={classes.link}>
          {accion.texto}
          {accion.principal && <Flecha tamano={18} />}
        </Link>
      );
    case 'nota':
      return <p className={classes.nota}>{accion.texto}</p>;
    case 'turno':
      return (
        <p className={classes.turno}>
          <IconCalendarEvent size={20} stroke={1.75} aria-hidden="true" />
          <span>{accion.texto}</span>
        </p>
      );
  }
}

// ─── 6. Tus servicios ────────────────────────────────────────────────────────────────

interface Servicio {
  readonly titulo: string;
  readonly detalle: string;
  readonly href: string;
  readonly icono: Icon;
}

/** Los 4 servicios grandes. La teleconsulta es con un profesional de nuestro equipo (no «tu equipo»). */
export const SERVICIOS_HOME_D: readonly Servicio[] = [
  {
    titulo: 'Reservar turno',
    detalle: 'Elegí la modalidad, la consulta y el horario.',
    href: RUTA_RESERVAR_TURNO,
    icono: IconCalendarEvent,
  },
  {
    titulo: 'Teleconsulta',
    detalle: 'Por videollamada, con un profesional de nuestro equipo.',
    href: RUTA_RESERVAR_TELECONSULTA,
    icono: IconVideo,
  },
  {
    titulo: 'Mensajes',
    detalle: 'Escribile a tu equipo. Cada conversación, con su motivo.',
    href: RUTA_MENSAJES,
    icono: IconMessage,
  },
  {
    titulo: 'Enviar estudios en PDF',
    detalle: 'Un agente de IA lee tu PDF y suma los valores a tus biomarcadores.',
    href: RUTA_ENVIAR_ESTUDIOS,
    icono: IconFileUpload,
  },
];

interface Acceso {
  readonly texto: string;
  readonly href: string;
  /** El estado, después del nombre («firmado el 8 de agosto»). */
  readonly estado?: string;
}

/** «También en tu portal». Con un perfil que no es Patient, sin la Segunda Opinión ni estados. */
function accesosDe(datos: DatosHomeE): readonly Acceso[] {
  const accesos: Acceso[] = [
    { texto: 'Historia clínica', href: RUTA_SALUD },
    { texto: 'Biomarcadores', href: RUTA_BIOMARCADORES },
    { texto: 'Mis 8 hábitos', href: RUTA_TABLERO_LE8 },
    { texto: 'Cuestionarios de hábitos', href: RUTA_CUESTIONARIOS },
    { texto: 'Salud CKM', href: RUTA_CKM },
  ];
  if (datos.esPaciente && !datos.cargando) {
    // El camino 2: quien ya tiene una Segunda Opinión la sigue; quien no, la pide (mientras
    // carga, todavía no se sabe cuál de los dos va).
    accesos.push(
      pidioSegundaOpinion(datos)
        ? { texto: `Mi ${MARCA.producto}`, href: RUTA_MI_SEGUNDA_OPINION }
        : { texto: `Pedir mi ${MARCA.producto}`, href: RUTA_SOLICITAR_SEGUNDA_OPINION }
    );
  }
  accesos.push(
    { texto: 'Mi equipo', href: RUTA_EQUIPO },
    { texto: 'Membresía', href: RUTA_MEMBRESIA },
    {
      texto: 'Consentimiento informado',
      href: RUTA_CONSENTIMIENTO,
      // El mismo texto que la estación «Consentimiento» de la ruta.
      estado: datos.esPaciente && !datos.cargando ? detalleConsentimiento(datos) : undefined,
    }
  );
  return accesos;
}

function TusServicios({ datos }: { readonly datos: DatosHomeE }): JSX.Element {
  // Si el próximo hito del plan se cumple con un servicio (p. ej. reservar la consulta), se marca.
  const hito = datos.cargando ? undefined : datos.plan?.hitos.find((h) => !h.cumplido);
  return (
    <section aria-labelledby={ID.servicios} className={classes.seccion}>
      <div className={classes.contenedor}>
        <div className={classes.encabezado}>
          <h2 id={ID.servicios} className={classes.tituloSeccion}>
            Tus servicios
          </h2>
        </div>
        <ul className={classes.tiles}>
          {SERVICIOS_HOME_D.map((s) => (
            <li key={s.href}>
              <Link to={s.href} className={classes.tile}>
                <span aria-hidden="true" className={classes.icono}>
                  <s.icono size={24} stroke={1.75} />
                </span>
                <span className={classes.tileTexto}>
                  <span className={classes.tileTitulo}>{s.titulo}</span>
                  <span className={classes.tileDetalle}>{s.detalle}</span>
                </span>
                {/* Después del título: el nombre del link empieza por el servicio. */}
                {hito?.href === s.href && <Chip tono="nuevo">Tu hito pendiente</Chip>}
              </Link>
            </li>
          ))}
        </ul>
        {/* Qué se paga al reservar (GetCarePage): se avisa antes, para que no sorprenda. */}
        <p className={clases(classes.nota, classes.notaServicios)}>{NOTA_COSTO_TELECONSULTA}</p>
        <nav aria-label="También en tu portal" className={classes.tambien}>
          <span aria-hidden="true">También en tu portal:</span>
          <ul className={classes.tambienLista}>
            {accesosDe(datos).map((a) => (
              <li key={a.href}>
                <Link to={a.href} className={classes.tambienLink}>
                  {a.texto}
                  {a.estado && <span className={classes.tambienEstado}>{` · ${a.estado}`}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}

// ─── 7. Cierre ───────────────────────────────────────────────────────────────────────

function Cierre({ datos }: { readonly datos: DatosHomeE }): JSX.Element {
  const firmado =
    datos.esPaciente && !datos.cargando && datos.consentimiento === 'firmado'
      ? fechaCorta(datos.fechaConsentimiento, datos.hoy)
      : undefined;
  return (
    <section aria-label="Quién te acompaña" className={classes.cierre}>
      <div className={classes.contenedor}>
        <div className={classes.cierreTextos}>
          <p>
            Equipo médico con dirección {conDireccionDe(MARCA.dirigidoPor)}. Nuestros agentes de IA asisten al equipo;
            no reemplazan la consulta médica.
          </p>
          <p>
            Sin tu consentimiento firmado, tus datos clínicos no pasan por nuestros agentes de IA.
            {firmado && ` Lo firmaste el ${firmado}.`}
          </p>
          <p>
            Tus datos viajan en FHIR R4, un estándar internacional para datos de salud, y viven en tu historia clínica
            con permisos de acceso.
          </p>
          <p>Esta página resume tus datos; no reemplaza la consulta médica.</p>
        </div>
      </div>
    </section>
  );
}
