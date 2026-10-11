// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Home estilo E («Vos en el centro»), la de las mujeres de 45 a 55 años (estilo.ts): la rosa
// de sus 8 hábitos en el centro de un escenario azul, rodeada por el anillo punteado de
// nuestros agentes de IA y el anillo sólido de su equipo médico. Debajo, la zona clara: los
// tres caminos que le ofrecemos (el Plan Bienestar · 100 días, la Segunda Opinión y la
// teleconsulta con su equipo médico, ver caminos.ts), sus tres lecturas (LE8, CKM y PREVENT),
// el Plan Bienestar, su equipo y sus accesos.
//
// Regla del negocio: quien sube datos recibe una devolución. Todo lo que un agente de IA
// calculó o leyó sin revisión médica (el laboratorio, el PREVENT estimado) lleva al lado la
// propuesta de revisarlo con su equipo en una teleconsulta (o el turno que ya tiene).
//
// `HomeEstiloE` carga los datos UNA vez (useDatosHomeE) y `VistaHomeE` los muestra: es
// presentacional y se prueba con datos de ejemplo. Es un solo árbol responsive: el orden del
// DOM es el del celular y desde 62em el escenario pasa a 3 columnas por CSS, sin secciones
// duplicadas por breakpoint (duplicarían las consultas). Todos los accesos son links reales.
import { categoriaLe8, LE8_DOMINIO_LABEL, LE8_DOMINIOS } from '@epa/careplan-menopausia';
import { Anchor, Skeleton, UnstyledButton } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { ResourceAvatar, ResourceName } from '@medplum/react';
import {
  IconActivity,
  IconArrowRight,
  IconArrowsExchange,
  IconBuildingHospital,
  IconCalendarCheck,
  IconCalendarEvent,
  IconCheck,
  IconChevronDown,
  IconClipboardHeart,
  IconClipboardText,
  IconDropletHeart,
  IconFileCertificate,
  IconFileUpload,
  IconHeartbeat,
  IconListCheck,
  IconMessage,
  IconShieldCheck,
  IconSignature,
  IconStack2,
  IconStarFilled,
  IconStethoscope,
  IconTestPipe,
  IconVideo,
  IconWallet,
} from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Link, useSearchParams } from 'react-router';
import { RUTA_ENVIAR_ESTUDIOS } from '../../components/AccionesRapidas';
import { RUTA_CONSENTIMIENTO } from '../../components/AvisoConsentimiento';
import { SeguimientoGlp1Card } from '../../components/SeguimientoGlp1Card';
import type { HitoBienestar, PlanBienestar } from '../../fhir/bienestar';
import type { RefProfesional } from '../../fhir/equipo';
import { esCentro } from '../../fhir/equipo';
import { MARCA } from '../../marca';
import { RUTA_SALUD } from '../health-record/Salud.data';
import { caminosDe, fechaHoraTurno, pidioSegundaOpinion, puedeOfrecerTeleconsulta } from './caminos';
import { conSigno, fechaConDia, fechaCorta, mayuscula, minuscula, plural } from './formato';
import classes from './HomeEstiloE.module.css';
import { paraHoy } from './paraHoy';
import { preventDe } from './prevent';
import type { AccionPrevent, ModeloPrevent } from './prevent';
import { dominioConMasMargen, puntajeDe } from './rosa';
import { RosaLe8 } from './RosaLe8';
import {
  RUTA_MI_SEGUNDA_OPINION,
  RUTA_PLAN_BIENESTAR,
  RUTA_RESERVAR_TELECONSULTA,
  RUTA_SOLICITAR_SEGUNDA_OPINION,
  RUTA_TABLERO_LE8,
} from './rutas';
import type {
  AnillosRosa,
  Camino,
  ClaveCamino,
  DatosHomeE,
  EstadioCkmHome,
  LaboratorioHome,
  Le8Domain,
  ModoColorPetalos,
  NodoEquipo,
  ProximoTurno,
  PuntajeDominio,
  SegundaOpinionHome,
} from './tipos';
import { useDatosHomeE } from './useDatosHomeE';

const RUTA_CUESTIONARIOS = '/health-record/cuestionarios';
const RUTA_BIOMARCADORES = '/health-record/biomarkers';
const RUTA_RESULTADOS = '/health-record/lab-results';
const RUTA_CKM = '/ckm';
const RUTA_MENSAJES = '/Communication';
const RUTA_NUEVO_MENSAJE = '/Communication/nuevo';
const RUTA_EQUIPO = '/account/equipo';
const RUTA_MEMBRESIA = '/membership';

/** Ids de los títulos (aria-labelledby). La Home se monta una sola vez por página. */
const ID = {
  titulo: 'home-e-titulo',
  paraHoy: 'home-e-para-hoy',
  cambio: 'home-e-cambio',
  laboratorio: 'home-e-laboratorio',
  segundaOpinion: 'home-e-segunda-opinion',
  caminos: 'home-e-caminos',
  lecturas: 'home-e-lecturas',
  le8: 'home-e-le8',
  ckm: 'home-e-ckm',
  prevent: 'home-e-prevent',
  plan: 'home-e-plan',
  equipo: 'home-e-equipo',
  accesos: 'home-e-accesos',
} as const;

// ─── Fuentes ─────────────────────────────────────────────────────────────────────────

const ID_FUENTES = 'fuentes-home-e';

/** Bricolage Grotesque (títulos y cifras) y Figtree (el texto): solo las usa la Home E. */
export const URL_FUENTES_HOME_E =
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700' +
  '&family=Figtree:wght@400;500;600&display=swap';

/**
 * Agrega a `<head>` el `<link>` de las fuentes de la Home E, una sola vez (aunque la Home se
 * monte de nuevo). Mientras llegan, el CSS cae en 'Segoe UI' / system-ui.
 */
export function useFuentesHomeE(): void {
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
    hoja.href = URL_FUENTES_HOME_E;
    document.head.append(preconexion, hoja);
  }, []);
}

// ─── Contenedor ──────────────────────────────────────────────────────────────────────

/** `?petalos=tinta|dominio|banda` fuerza el modo de color de la rosa (para que el equipo pruebe). */
export function modoColorDe(valor: string | null | undefined): ModoColorPetalos | undefined {
  const v = valor?.trim().toLowerCase();
  return v === 'tinta' || v === 'dominio' || v === 'banda' ? v : undefined;
}

/** La Home E de la paciente logueada: carga sus datos una vez y se los pasa a la vista. */
export function HomeEstiloE(): JSX.Element {
  const datos = useDatosHomeE();
  const [searchParams] = useSearchParams();
  useFuentesHomeE();
  return <VistaHomeE datos={datos} modoColor={modoColorDe(searchParams.get('petalos'))} />;
}

// ─── Textos (los formatos de fechas y números están en formato.ts) ───────────────────

function clases(...nombres: (string | false | undefined)[]): string {
  return nombres.filter(Boolean).join(' ');
}

/** Los 8 hábitos sin puntaje (una paciente sin LE8 todavía, o un perfil que no es paciente). */
const SIN_DOMINIOS: readonly PuntajeDominio[] = LE8_DOMINIOS.map((dominio) => ({ dominio }));

/** Cómo se nombra cada hábito al empezar una frase. */
const HABITO_EN_FRASE: Readonly<Record<Le8Domain, { readonly nombre: string }>> = {
  dieta: { nombre: 'La alimentación' },
  'actividad-fisica': { nombre: 'La actividad física' },
  nicotina: { nombre: 'La nicotina' },
  sueno: { nombre: 'El sueño' },
  imc: { nombre: 'El peso' },
  lipidos: { nombre: 'El colesterol' },
  glucemia: { nombre: 'La glucemia' },
  'presion-arterial': { nombre: 'La presión arterial' },
};

/** De dónde sale el puntaje de cada hábito (la tabla equivalente). */
const FUENTE_HABITO: Readonly<Record<Le8Domain, string>> = {
  dieta: 'Cuestionario de alimentación',
  'actividad-fisica': 'Cuestionario de actividad',
  nicotina: 'Cuestionario de tabaco',
  sueno: 'Cuestionario de sueño',
  imc: 'Tu peso y tu altura',
  lipidos: 'Laboratorio',
  glucemia: 'Laboratorio',
  'presion-arterial': 'Tus signos vitales',
};

/** Las etapas CKM, de 0 a 4, como las lee la paciente. */
const ETAPAS_CKM: readonly string[] = [
  'Zona saludable',
  'Primeras señales',
  'Factores de riesgo activos',
  'Señales tempranas en el corazón o riñón',
  'Cuidado activo',
];

/**
 * El hábito con más margen: el de menor puntaje, solo si hay al menos 2 con dato (con uno solo no
 * hay con qué comparar) y si está por debajo de la banda alta (80).
 */
function habitoConMasMargen(le8: DatosHomeE['le8']): Le8Domain | undefined {
  if (!le8 || le8.conDato < 2) {
    return undefined;
  }
  const dominio = dominioConMasMargen(le8.dominios);
  const puntaje = le8.dominios.find((d) => d.dominio === dominio)?.puntaje;
  return dominio && puntaje !== undefined && puntaje < 80 ? dominio : undefined;
}

/** La frase debajo de la rosa: el hábito con más margen (el de menor puntaje con dato). */
function fraseRosa(datos: DatosHomeE): string {
  const le8 = datos.le8;
  const dominio = habitoConMasMargen(le8);
  if (!le8 || le8.conDato < 2) {
    return 'Tu forma todavía no está completa. Respondé tus cuestionarios de hábitos y la vas a ver crecer.';
  }
  if (!dominio) {
    return le8?.completo
      ? 'Tus 8 hábitos están en buena forma. Mirá cómo sostenerlos.'
      : 'Tus hábitos con dato están en buena forma. Completá los que faltan para ver tu forma entera.';
  }
  const { nombre } = HABITO_EN_FRASE[dominio];
  const despues = datos.plan
    ? 'En tu plan tenés pasos para mejorar ese puntaje.'
    : 'Mirá qué podés hacer en tus 8 hábitos.';
  return `${nombre} es tu hábito con más margen. ${despues}`;
}

/** Qué muestran los anillos de la rosa, según lo que trajo la carga. */
function anillosDe(datos: DatosHomeE): AnillosRosa {
  const { laboratorio, segundaOpinion, equipo, plan } = datos;
  const estadoSom =
    segundaOpinion?.estado === 'en-analisis' || segundaOpinion?.estado === 'completada'
      ? segundaOpinion.estado
      : undefined;
  const nodos: NodoEquipo[] = [];
  if (equipo?.cabecera) {
    nodos.push('cabecera');
  }
  if (plan || (equipo?.equipoPlan.length ?? 0) > 0) {
    nodos.push('plan');
  }
  if (estadoSom || (equipo?.segundaOpinion.length ?? 0) > 0) {
    nodos.push('segunda-opinion');
  }
  return {
    iaEnProceso: laboratorio?.estado === 'en-proceso' || estadoSom === 'en-analisis',
    laboratorioLeido: laboratorio?.estado === 'procesado',
    segundaOpinion: estadoSom,
    segundaOpinionFirmada: segundaOpinion?.firmada ?? false,
    equipo: nodos,
  };
}

// ─── Íconos chicos de los anillos (punteado = IA, sólido = equipo) ──────────────────

function IconoPunteado({ tamano = 24 }: { readonly tamano?: number }): JSX.Element {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="#99c8ff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="0 4.19"
      />
      <circle cx="12" cy="12" r="4.5" fill="#99c8ff" />
    </svg>
  );
}

function IconoSolido(): JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="none" stroke="#ffffff" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.5" fill="#ffffff" />
    </svg>
  );
}

function Flecha({ tamano = 20 }: { readonly tamano?: number }): JSX.Element {
  return <IconArrowRight size={tamano} stroke={2} aria-hidden="true" />;
}

// ─── Vista ───────────────────────────────────────────────────────────────────────────

export interface VistaHomeEProps {
  readonly datos: DatosHomeE;
  /** Modo de color de los pétalos; por defecto, el de COLORES_PETALOS (rosa.ts). */
  readonly modoColor?: ModoColorPetalos;
}

/** La Home E con los datos ya cargados (presentacional). */
export function VistaHomeE({ datos, modoColor }: VistaHomeEProps): JSX.Element {
  return (
    <div className={classes.home} aria-busy={datos.cargando || undefined}>
      {/* ESCENARIO: vos en el centro, con tus dos anillos. */}
      <section aria-labelledby={ID.titulo} className={classes.escenario}>
        <div className={classes.escenarioGrilla}>
          <div className={classes.columnaSaludo}>
            <Saludo datos={datos} />
            {datos.ckm && (
              <p className={classes.chipEtapa}>
                <IconStack2 size={18} stroke={1.75} aria-hidden="true" />
                Tu etapa CKM: {datos.ckm.estadio}
                {datos.ckm.origen === 'estimado' ? ' (estimada)' : ''}
              </p>
            )}
            <TarjetaParaHoy datos={datos} />
          </div>
          <FiguraRosa datos={datos} modoColor={modoColor} />
          <LoQueCambio datos={datos} />
        </div>
      </section>

      {/* ZONA CLARA */}
      <div className={classes.zonaClara}>
        <TresCaminos datos={datos} />
        <TusTresLecturas datos={datos} />
        <SeccionPlan datos={datos} />
        <TuEquipo datos={datos} />
        <TusAccesos datos={datos} />
      </div>
    </div>
  );
}

// ─── Escenario ───────────────────────────────────────────────────────────────────────

function Saludo({ datos }: { readonly datos: DatosHomeE }): JSX.Element {
  const { nombre } = datos;
  return (
    <div className={classes.saludo}>
      <p className={classes.overlineOscuro}>Salud 3.0 · datos y prevención</p>
      <p className={classes.hola}>{`${nombre ? `Hola, ${nombre}` : 'Hola'} · ${fechaConDia(datos.hoy)}`}</p>
      <h1 id={ID.titulo} className={classes.titulo}>
        {nombre ? `${nombre}, estás en el centro.` : 'Estás en el centro.'}
      </h1>
      <p className={classes.bajadaOscura}>
        Alrededor tuyo trabajan dos anillos: nuestros agentes de IA, que leen y ordenan tus datos, y tu equipo médico,
        que revisa, decide y firma.
      </p>
    </div>
  );
}

function TarjetaParaHoy({ datos }: { readonly datos: DatosHomeE }): JSX.Element {
  let contenido: JSX.Element;
  if (datos.cargando) {
    contenido = (
      <div className={classes.paraHoyTexto}>
        <Skeleton height={26} radius="sm" className={classes.skeletonEnTarjeta} />
        <Skeleton height={20} width="80%" radius="sm" className={classes.skeletonEnTarjeta} />
        <Skeleton height={48} radius={14} mt={8} className={classes.skeletonEnTarjeta} />
      </div>
    );
  } else if (!datos.esPaciente) {
    // Un profesional que fuerza ?estilo=e: la Home se ve, pero sin datos de nadie.
    contenido = (
      <div className={classes.paraHoyTexto}>
        <p className={classes.paraHoyTitulo}>Esta Home es la de una paciente</p>
        <p className={classes.detalleOscuro}>Con tu perfil no hay datos de salud para mostrar.</p>
      </div>
    );
  } else {
    const accion = paraHoy(datos, { producto: MARCA.producto });
    contenido = (
      <>
        <div className={classes.paraHoyTexto}>
          <p className={classes.paraHoyTitulo}>{accion.titulo}</p>
          <p className={classes.detalleOscuro}>{accion.detalle}</p>
        </div>
        <UnstyledButton component={Link} to={accion.href} className={classes.botonBlanco}>
          {accion.cta}
          <Flecha />
        </UnstyledButton>
      </>
    );
  }
  return (
    <section aria-labelledby={ID.paraHoy} className={classes.paraHoy}>
      <div className={classes.paraHoyCabecera}>
        <span aria-hidden="true" className={classes.paraHoyIcono}>
          <IconActivity size={18} stroke={1.75} />
        </span>
        <h2 id={ID.paraHoy} className={classes.overlineOscuro}>
          Para hoy
        </h2>
      </div>
      {contenido}
    </section>
  );
}

function FiguraRosa({ datos, modoColor }: VistaHomeEProps): JSX.Element {
  return (
    <figure className={classes.figura}>
      {datos.cargando ? (
        // Mientras carga, ni «Falta» ni pétalos vacíos: todavía no se sabe qué hay.
        <Skeleton radius={1000} className={clases(classes.rosaCargando, classes.skeletonOscuro)} />
      ) : (
        <RosaLe8
          dominios={datos.le8?.dominios ?? SIN_DOMINIOS}
          total={datos.le8?.total}
          categoria={datos.le8?.categoria}
          totalInicial={datos.le8Inicial?.total}
          anillos={anillosDe(datos)}
          modoColor={modoColor}
          nombreSegundaOpinion={MARCA.producto}
        />
      )}
      <figcaption className={classes.figcaption}>
        {datos.cargando ? (
          <Skeleton height={20} width={280} maw="100%" radius="xl" className={classes.skeletonOscuro} />
        ) : (
          <span>{fraseRosa(datos)}</span>
        )}
        <Anchor component={Link} to={RUTA_TABLERO_LE8} underline="always" className={classes.linkOscuro}>
          Ver mis 8 hábitos
          <Flecha tamano={18} />
        </Anchor>
      </figcaption>
    </figure>
  );
}

function LoQueCambio({ datos }: { readonly datos: DatosHomeE }): JSX.Element {
  const { laboratorio, segundaOpinion, novedadesSinLeer, hoy } = datos;
  let cuerpo: JSX.Element;
  if (datos.cargando) {
    cuerpo = (
      <div className={classes.novedad}>
        <Skeleton height={24} width="60%" radius="sm" className={classes.skeletonEnTarjeta} />
        <Skeleton height={20} radius="sm" className={classes.skeletonEnTarjeta} />
        <Skeleton height={20} width="85%" radius="sm" className={classes.skeletonEnTarjeta} />
      </div>
    );
  } else if (!laboratorio && !segundaOpinion) {
    cuerpo = (
      <>
        <p className={classes.notaOscura}>
          Todavía no hay novedades de tus datos. Cuando cargues algo, vas a ver acá qué hicieron con eso nuestros
          agentes y tu equipo.
        </p>
        <div className={classes.enlacesOscuros}>
          <Anchor component={Link} to={RUTA_ENVIAR_ESTUDIOS} underline="always" className={classes.linkOscuro}>
            Enviar mi laboratorio en PDF
          </Anchor>
          <Anchor
            component={Link}
            to={RUTA_SOLICITAR_SEGUNDA_OPINION}
            underline="always"
            className={classes.linkOscuro}
          >
            Pedir mi {MARCA.producto}
          </Anchor>
        </div>
      </>
    );
  } else {
    cuerpo = (
      <>
        {laboratorio && (
          <NovedadLaboratorio
            laboratorio={laboratorio}
            hoy={hoy}
            proximoTurno={datos.proximoTurno}
            ofrecerTeleconsulta={puedeOfrecerTeleconsulta(datos)}
          />
        )}
        {laboratorio && segundaOpinion && <div aria-hidden="true" className={classes.divisorOscuro} />}
        {segundaOpinion && <NovedadSegundaOpinion segundaOpinion={segundaOpinion} hoy={hoy} />}
        {segundaOpinion && (
          <UnstyledButton component={Link} to={RUTA_MI_SEGUNDA_OPINION} className={classes.botonContorno}>
            Ver mi {MARCA.producto}
          </UnstyledButton>
        )}
      </>
    );
  }
  return (
    <section aria-labelledby={ID.cambio} className={classes.cambios}>
      <h2 id={ID.cambio} className={classes.tituloOscuro}>
        Lo que cambió
      </h2>
      {cuerpo}
      {!datos.cargando && novedadesSinLeer > 0 && (
        <p className={classes.notaOscura}>
          {novedadesSinLeer === 1
            ? 'Tenés 1 novedad sin leer en la campanita.'
            : `Tenés ${novedadesSinLeer} novedades sin leer en la campanita.`}
        </p>
      )}
      <ComoSeLee />
    </section>
  );
}

/**
 * El último laboratorio. Si un agente de IA lo leyó y nadie del equipo lo revisó todavía, al
 * lado va la devolución: revisarlo en una teleconsulta, o el turno que ya tiene.
 */
function NovedadLaboratorio({
  laboratorio,
  hoy,
  proximoTurno,
  ofrecerTeleconsulta,
}: {
  readonly laboratorio: LaboratorioHome;
  readonly hoy: string;
  readonly proximoTurno?: ProximoTurno;
  /** Sin turno, sin Segunda Opinión en análisis y sin una consulta posterior (caminos.ts). */
  readonly ofrecerTeleconsulta: boolean;
}): JSX.Element {
  const procesado = laboratorio.estado === 'procesado';
  const demorado = laboratorio.estado === 'demorado';
  const sinRevisar = procesado && !laboratorio.revisionMedica;
  let titulo = 'Procesando tu PDF';
  let nota = 'Un agente de IA está leyendo tu PDF para pasar los valores a tus biomarcadores.';
  if (procesado) {
    titulo = 'Resultados listos';
    nota = 'Un agente de IA leyó tu PDF y pasó los valores a tus biomarcadores.';
  } else if (demorado) {
    titulo = 'Tu PDF necesita una revisión';
    nota = 'Lo estamos revisando. Si no pudimos leerlo, te escribimos por Mensajes.';
  }
  const fecha = fechaCorta(laboratorio.fecha, hoy);
  const resumen = [fecha ? `Laboratorio del ${fecha}` : 'Tu laboratorio'];
  if (procesado && laboratorio.valores !== undefined) {
    resumen.push(plural(laboratorio.valores, 'valor', 'valores'));
  }
  return (
    <article aria-labelledby={ID.laboratorio} className={classes.novedad}>
      <div className={classes.novedadTitulo}>
        <IconoPunteado />
        <h3 id={ID.laboratorio}>{titulo}</h3>
      </div>
      <p className={classes.textoOscuro}>{resumen.join(' · ')}</p>
      <p className={classes.notaOscura}>{nota}</p>
      <div className={classes.novedadPie}>
        {laboratorio.revisionMedica ? (
          <p className={classes.chipSolido}>Revisado por tu equipo médico</p>
        ) : (
          <p className={classes.chipPunteado}>Sin revisión médica todavía</p>
        )}
        {procesado && laboratorio.informeId && (
          <Anchor
            component={Link}
            to={`${RUTA_RESULTADOS}/${laboratorio.informeId}`}
            underline="always"
            className={classes.linkOscuro}
          >
            Ver mis resultados
          </Anchor>
        )}
      </div>
      {sinRevisar && proximoTurno && (
        <p className={classes.turnoOscuro}>
          <IconCalendarEvent size={20} stroke={1.75} aria-hidden="true" />
          <span>Podés llevarlos a tu turno del {fechaHoraTurno(proximoTurno.inicio)}.</span>
        </p>
      )}
      {sinRevisar && ofrecerTeleconsulta && (
        <div className={classes.devolucionOscura}>
          <p className={classes.textoOscuro}>Te los explicamos: un profesional de nuestro equipo los revisa con vos.</p>
          <UnstyledButton component={Link} to={RUTA_RESERVAR_TELECONSULTA} className={classes.botonBlanco}>
            Revisarlos en una teleconsulta
            <Flecha />
          </UnstyledButton>
        </div>
      )}
      {laboratorio.estado === 'en-proceso' && ofrecerTeleconsulta && (
        <p className={classes.notaOscura}>
          Cuando estén listos, te ofrecemos revisarlos con un profesional en una teleconsulta.
        </p>
      )}
    </article>
  );
}

function NovedadSegundaOpinion({
  segundaOpinion,
  hoy,
}: {
  readonly segundaOpinion: SegundaOpinionHome;
  readonly hoy: string;
}): JSX.Element {
  const pedida = fechaCorta(segundaOpinion.pedida, hoy);
  let texto: string | undefined;
  if (segundaOpinion.estado === 'en-analisis') {
    texto =
      'La trabajan juntos nuestros agentes de IA y nuestro equipo médico; te avisamos en Novedades cuando esté lista.';
  } else if (segundaOpinion.estado === 'completada') {
    // La orden la completa el bot que prepara el informe: «firmado» solo con la firma registrada.
    texto = segundaOpinion.firmada ? 'Tu informe está firmado.' : 'Tu informe está listo.';
  }
  return (
    <article aria-labelledby={ID.segundaOpinion} className={classes.novedad}>
      <div className={classes.novedadCabecera}>
        <div className={classes.novedadTitulo}>
          <IconoSolido />
          <h3 id={ID.segundaOpinion}>Tu {MARCA.producto}</h3>
        </div>
        <span className={classes.chipBlanco}>{segundaOpinion.etiqueta}</span>
      </div>
      {pedida && <p className={classes.textoOscuro}>Pedida el {pedida}</p>}
      {texto && <p className={classes.notaOscura}>{texto}</p>}
    </article>
  );
}

function ComoSeLee(): JSX.Element {
  return (
    <div className={classes.comoSeLee}>
      <p className={classes.overlineOscuro}>Cómo se lee</p>
      <div className={classes.comoSeLeeFila}>
        <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
          <circle
            cx="14"
            cy="14"
            r="11"
            fill="none"
            stroke="#99c8ff"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="0 4.32"
          />
        </svg>
        <p>
          <strong>Punteado:</strong> todavía sin revisión médica (lo leyó un agente de IA o es un cálculo automático).
        </p>
      </div>
      <div className={classes.comoSeLeeFila}>
        <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
          <circle cx="14" cy="14" r="11" fill="none" stroke="#ffffff" strokeWidth="2" />
        </svg>
        <p>
          <strong>Sólido:</strong> lo revisa, decide y firma tu equipo médico.
        </p>
      </div>
      <div className={classes.comoSeLeeFila}>
        <IconArrowsExchange size={28} stroke={1.75} color="#99c8ff" aria-hidden="true" />
        <p>
          <strong>Ida y vuelta:</strong> tus datos salen del centro hacia los anillos; cuando tu equipo firma, la
          devolución vuelve a vos.
        </p>
      </div>
    </div>
  );
}

// ─── Zona clara: los tres caminos ────────────────────────────────────────────────────

const ICONO_CAMINO: Readonly<Record<ClaveCamino, Icon>> = {
  plan: IconClipboardHeart,
  'segunda-opinion': IconFileCertificate,
  teleconsulta: IconVideo,
};

/**
 * Lo primero de la zona clara: los tres caminos que le ofrecemos, en orden (caminosDe). A lo
 * sumo uno va como «Recomendado para vos», con su botón lleno; los otros, con botón contorno.
 * Mientras carga, no se adelanta ninguno: todavía no se sabe en cuál está.
 */
function TresCaminos({ datos }: { readonly datos: DatosHomeE }): JSX.Element {
  return (
    <section aria-labelledby={ID.caminos} className={clases(classes.banda, classes.bandaBlanca, classes.bandaCaminos)}>
      <div className={classes.contenedor}>
        <div className={classes.encabezado}>
          <p className={classes.overline}>Elegí por dónde seguir</p>
          <h2 id={ID.caminos} className={classes.tituloSeccion}>
            Tres caminos para cuidar tu corazón
          </h2>
          <p className={classes.bajada}>En los tres, nuestro equipo médico te acompaña y te da una devolución.</p>
        </div>
        {datos.cargando ? (
          <div className={classes.caminos}>
            <Skeleton height={400} radius={20} />
            <Skeleton height={400} radius={20} />
            <Skeleton height={400} radius={20} />
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
      className={clases(classes.camino, camino.recomendado && classes.caminoRecomendado)}
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
        <span aria-hidden="true" className={classes.caminoIcono}>
          <Icono size={28} stroke={1.75} />
        </span>
      </div>
      <div className={classes.caminoCuerpo}>
        <h3 id={idTitulo} className={classes.tituloTarjeta}>
          {camino.titulo}
        </h3>
        <p className={classes.texto}>{camino.descripcion}</p>
        {camino.estado && (
          <p className={classes.caminoEstado}>
            <span aria-hidden="true" className={classes.caminoPunto} />
            {camino.estado}
          </p>
        )}
      </div>
      <div className={classes.caminoAccion}>
        <UnstyledButton
          component={Link}
          to={camino.href}
          className={camino.recomendado ? classes.boton : classes.botonContornoClaro}
        >
          {camino.cta}
          <Flecha />
        </UnstyledButton>
        {camino.nota && <p className={classes.caminoNota}>{camino.nota}</p>}
      </div>
    </article>
  );
}

// ─── Zona clara: tus tres lecturas ───────────────────────────────────────────────────

function TusTresLecturas({ datos }: { readonly datos: DatosHomeE }): JSX.Element {
  return (
    <section aria-labelledby={ID.lecturas} className={clases(classes.banda, classes.bandaLecturas)}>
      <div className={classes.contenedor}>
        <div className={classes.encabezado}>
          <p className={classes.overline}>Lo que dicen tus datos</p>
          <h2 id={ID.lecturas} className={classes.tituloSeccion}>
            Tus tres lecturas
          </h2>
          <p className={classes.bajada}>
            Tres maneras de mirar tu salud cardiovascular, calculadas con tus datos y las guías de la AHA. Son
            orientativas y no reemplazan la revisión médica.
          </p>
        </div>
        {datos.cargando ? (
          <div className={classes.lecturas}>
            <Skeleton height={440} radius={20} />
            <Skeleton height={440} radius={20} />
            <Skeleton height={440} radius={20} />
          </div>
        ) : (
          <>
            <div className={classes.lecturas}>
              <LecturaLe8 datos={datos} />
              <LecturaCkm ckm={datos.ckm} />
              <LecturaPrevent datos={datos} />
            </div>
            <TablaHabitos datos={datos} />
          </>
        )}
      </div>
    </section>
  );
}

function LecturaLe8({ datos }: { readonly datos: DatosHomeE }): JSX.Element {
  const { le8, le8Inicial, plan } = datos;
  const dominios = le8?.dominios ?? SIN_DOMINIOS;
  const total = le8?.total === undefined ? undefined : Math.round(le8.total);
  const inicial = le8Inicial?.total === undefined ? undefined : Math.round(le8Inicial.total);
  const categoria = le8?.categoria ?? (total === undefined ? undefined : categoriaLe8(total));
  const margen = habitoConMasMargen(le8);
  return (
    <article aria-labelledby={ID.le8} className={classes.tarjeta}>
      <div className={classes.tarjetaCabecera}>
        <p className={classes.etiquetaTarjeta}>Life&apos;s Essential 8</p>
        <h3 id={ID.le8} className={classes.tituloTarjeta}>
          {plan ? 'Respuesta a 100 días' : 'Tus 8 hábitos'}
        </h3>
      </div>
      <div className={classes.total}>
        <p className={classes.totalNumero}>
          <span>{total ?? '—'}</span> <span>de 100</span>
        </p>
        <p className={classes.totalBanda}>
          {categoria ? <span data-banda={categoria}>Banda {categoria}</span> : <span>Todavía sin datos</span>}
          {/* Con hábitos sin dato, el total es un promedio parcial: se dice con cuántos. */}
          {categoria && le8 && !le8.completo && <span>Con {le8.conDato} de 8 hábitos</span>}
          {total !== undefined && inicial !== undefined && (
            <span>
              {total === inicial
                ? `Igual que el día 0 (${inicial})`
                : `${conSigno(total - inicial)} desde el día 0 (${inicial})`}
            </span>
          )}
        </p>
      </div>
      <div className={classes.leyendaBarras}>
        {le8Inicial && (
          <span>
            <span aria-hidden="true" className={classes.muestraDia0} />
            Día 0
          </span>
        )}
        <span>
          <span aria-hidden="true" className={classes.muestraHoy} />
          {plan ? `Hoy, día ${Math.min(plan.dia, plan.totalDias)}` : 'Hoy'}
        </span>
        <span>Escala de 0 a 100</span>
      </div>
      <ul className={classes.barras}>
        {LE8_DOMINIOS.map((dominio) => {
          const hoy = redondo(puntajeDe(dominios, dominio));
          const dia0 = le8Inicial ? redondo(puntajeDe(le8Inicial.dominios, dominio)) : undefined;
          const esMargen = dominio === margen;
          return (
            <li key={dominio} className={clases(classes.barra, esMargen && classes.barraMargen)}>
              <span className={classes.barraNombre}>
                {LE8_DOMINIO_LABEL[dominio]}
                {esMargen && <span className={classes.masMargen}> Más margen</span>}
              </span>
              <span aria-hidden="true" className={classes.barraPistas}>
                {dia0 !== undefined && <span className={classes.barraDia0} style={{ width: `${dia0}%` }} />}
                {hoy !== undefined && <span className={classes.barraHoy} style={{ width: `${hoy}%` }} />}
              </span>
              <span className={classes.barraValores}>
                {hoy === undefined ? (
                  'Sin dato'
                ) : (
                  <>
                    {dia0 !== undefined && `${dia0} → `}
                    <strong>{hoy}</strong>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <Anchor component={Link} to={RUTA_TABLERO_LE8} underline="always" className={classes.link}>
        Ver mis 8 hábitos
        <Flecha tamano={18} />
      </Anchor>
    </article>
  );
}

function redondo(puntaje: number | undefined): number | undefined {
  return puntaje === undefined ? undefined : Math.round(Math.min(100, Math.max(0, puntaje)));
}

function LecturaCkm({ ckm }: { readonly ckm: EstadioCkmHome | undefined }): JSX.Element {
  return (
    <article aria-labelledby={ID.ckm} className={classes.tarjeta}>
      <div className={classes.tarjetaCabecera}>
        <p className={classes.etiquetaTarjeta}>Salud CKM · cardio-reno-metabólica</p>
        <h3 id={ID.ckm} className={classes.tituloTarjeta}>
          {ckm ? `Estadio ${ckm.estadio}: ${minuscula(ETAPAS_CKM[ckm.estadio])}` : 'Tu etapa CKM'}
        </h3>
      </div>
      <p className={classes.texto}>Tu corazón, tus riñones y tu metabolismo, leídos juntos en una escala de 0 a 4.</p>
      <ol className={classes.escala}>
        {ETAPAS_CKM.map((etiqueta, n) => {
          const actual = ckm?.estadio === n;
          return (
            <li key={etiqueta} className={classes.escalon} aria-current={actual ? 'step' : undefined}>
              <span aria-hidden="true" className={classes.escalonNumero}>
                {n}
              </span>
              <span className={classes.escalonTexto}>
                <span>
                  <span className={classes.oculto}>Estadio {n}: </span>
                  {etiqueta}
                </span>
                {actual && <span className={classes.tuEtapa}>Tu etapa hoy</span>}
              </span>
            </li>
          );
        })}
      </ol>
      {ckm?.origen === 'estimado' && <p className={classes.nota}>Estimado con tus datos, sin revisión médica.</p>}
      {!ckm && <p className={classes.nota}>Faltan datos para ubicar tu etapa.</p>}
      <Anchor component={Link} to={RUTA_CKM} underline="always" className={classes.link}>
        Entendé tu salud CKM
        <Flecha tamano={18} />
      </Anchor>
    </article>
  );
}

/**
 * PREVENT, dibujado desde el modelo compartido con la Home D (prevent.ts): el del informe de la
 * Segunda Opinión («firmado» solo con la firma médica registrada; si no, preparado con IA), si
 * no la estimación con sus datos, rotulada como estimación sin revisión médica, y si no
 * alcanzan los datos, qué falta. Abajo, qué hacer con eso (AccionesPrevent).
 */
function LecturaPrevent({ datos }: { readonly datos: DatosHomeE }): JSX.Element {
  const modelo = preventDe(datos, { producto: MARCA.producto });
  const firmado = modelo.procedencia === 'firmado';
  return (
    <article aria-labelledby={ID.prevent} className={classes.tarjeta}>
      <div className={classes.tarjetaCabecera}>
        <p className={classes.etiquetaTarjeta}>{modelo.etiqueta}</p>
        <h3 id={ID.prevent} className={classes.tituloTarjeta}>
          {modelo.titulo}
        </h3>
      </div>
      {modelo.chip && <p className={classes.chipEstimado}>{modelo.chip}</p>}
      <p className={classes.texto}>
        {modelo.destacado && (
          <>
            <strong>{modelo.destacado}</strong>{' '}
          </>
        )}
        {modelo.texto}
      </p>
      {modelo.riesgos.length > 0 && (
        <ul className={classes.riesgos}>
          {modelo.riesgos.map((riesgo) => (
            <li key={riesgo.clave} className={clases(classes.riesgo, firmado && classes.riesgoFirmado)}>
              <span className={classes.riesgoNombre}>
                <span>{riesgo.nombre}</span> <span>{riesgo.detalle}</span>
              </span>
              {riesgo.porcentaje ? (
                <span className={classes.riesgoValor}>
                  <span className={classes.riesgoPorcentaje}>{riesgo.porcentaje}</span>
                  {riesgo.banda && (
                    <span className={classes.riesgoBanda} data-banda={riesgo.banda}>
                      {riesgo.textoBanda}
                    </span>
                  )}
                </span>
              ) : (
                <span className={classes.riesgoPendiente}>Sin dato</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {modelo.notaFaltantes && <p className={classes.nota}>{modelo.notaFaltantes}</p>}
      <AccionesPrevent modelo={modelo} />
    </article>
  );
}

/**
 * Qué hacer con el PREVENT (las reglas están en prevent.ts). Un cálculo automático lleva el
 * recuadro «Es un cálculo automático» con sus acciones adentro; el resto, un pie con links.
 */
function AccionesPrevent({ modelo }: { readonly modelo: ModeloPrevent }): JSX.Element {
  const acciones = modelo.acciones.map((accion) => <AccionDePrevent key={accion.texto} accion={accion} />);
  if (!modelo.recuadro) {
    return <div className={classes.preventPie}>{acciones}</div>;
  }
  return (
    <div className={classes.revisalo}>
      <div className={classes.revisaloTexto}>
        <p className={classes.revisaloTitulo}>{modelo.recuadro.titulo}</p>
        <p className={classes.texto}>{modelo.recuadro.texto}</p>
      </div>
      {acciones}
    </div>
  );
}

/** Una acción de la tarjeta PREVENT en la zona clara: botón, link, nota o el turno reservado. */
function AccionDePrevent({ accion }: { readonly accion: AccionPrevent }): JSX.Element {
  switch (accion.tipo) {
    case 'boton':
      return (
        <UnstyledButton component={Link} to={accion.href} className={classes.boton}>
          {accion.texto}
          <Flecha />
        </UnstyledButton>
      );
    case 'link':
      return (
        <Anchor component={Link} to={accion.href} underline="always" className={classes.link}>
          {accion.texto}
          {accion.principal && <Flecha tamano={18} />}
        </Anchor>
      );
    case 'nota':
      return <p className={classes.nota}>{accion.texto}</p>;
    case 'turno':
      return (
        <p className={classes.turnoClaro}>
          <IconCalendarEvent size={20} stroke={1.75} aria-hidden="true" />
          <span>{accion.texto}</span>
        </p>
      );
  }
}

/**
 * La tabla equivalente a la rosa. En el celular va plegada; en escritorio (≥ 62em) abre
 * desplegada. Si la paciente la abre o la cierra, manda lo que eligió.
 */
function TablaHabitos({ datos }: { readonly datos: DatosHomeE }): JSX.Element {
  // Se lee al primer render (no hay SSR): en escritorio abre desplegada, sin un cuadro plegado antes.
  const escritorio = useMediaQuery('(min-width: 62em)', undefined, { getInitialValueInEffect: false });
  const [elegida, setElegida] = useState<boolean>();
  const abierta = elegida ?? escritorio;
  const { le8, le8Inicial } = datos;
  const dominios = le8?.dominios ?? SIN_DOMINIOS;
  const total = redondo(le8?.total);
  const inicial = redondo(le8Inicial?.total);
  let origenTotal = 'Promedio de los hábitos con dato';
  if (le8?.completo) {
    origenTotal = 'Promedio de los 8';
  } else if (le8 && le8.conDato === 1) {
    origenTotal = 'Promedio del hábito con dato';
  } else if (le8 && le8.conDato > 0) {
    origenTotal = `Promedio de los ${le8.conDato} con dato`;
  }
  return (
    <details className={classes.tabla} open={abierta} onToggle={(e) => setElegida(e.currentTarget.open)}>
      <summary className={classes.tablaResumen}>
        {abierta ? 'Tus 8 hábitos en números' : 'Ver tus 8 hábitos en números'}
        <IconChevronDown size={22} stroke={2} aria-hidden="true" />
      </summary>
      <div className={classes.tablaCuerpo}>
        <p className={classes.texto}>Lo mismo que muestra tu forma, en una tabla.</p>
        {/* Enfocable: con el teclado se puede correr la tabla de costado en pantallas chicas. */}
        <div className={classes.scrollTabla} tabIndex={0} role="region" aria-label="Tus 8 hábitos en números">
          <table>
            <thead>
              <tr>
                <th scope="col">Hábito</th>
                <th scope="col" className={classes.numero}>
                  Día 0
                </th>
                <th scope="col" className={classes.numero}>
                  Hoy
                </th>
                <th scope="col" className={classes.numero}>
                  Cambio
                </th>
                <th scope="col">Banda de hoy</th>
                <th scope="col">De dónde sale</th>
              </tr>
            </thead>
            <tbody>
              {LE8_DOMINIOS.map((dominio) => (
                <FilaTabla
                  key={dominio}
                  nombre={LE8_DOMINIO_LABEL[dominio]}
                  dia0={le8Inicial ? redondo(puntajeDe(le8Inicial.dominios, dominio)) : undefined}
                  hoy={redondo(puntajeDe(dominios, dominio))}
                  fuente={FUENTE_HABITO[dominio]}
                />
              ))}
              <FilaTabla nombre="Total LE8" dia0={inicial} hoy={total} fuente={origenTotal} esTotal />
            </tbody>
          </table>
        </div>
        <p className={classes.nota}>Bandas: alta de 80 a 100 · moderada de 50 a 79 · baja de 0 a 49.</p>
      </div>
    </details>
  );
}

function FilaTabla(props: {
  readonly nombre: string;
  readonly dia0?: number;
  readonly hoy?: number;
  readonly fuente: string;
  readonly esTotal?: boolean;
}): JSX.Element {
  const { nombre, dia0, hoy, fuente, esTotal } = props;
  const categoria = hoy === undefined ? undefined : categoriaLe8(hoy);
  return (
    <tr className={esTotal ? classes.filaTotal : undefined}>
      <th scope="row">{nombre}</th>
      <td className={clases(classes.numero, classes.secundaria)}>{dia0 ?? '—'}</td>
      <td className={clases(classes.numero, classes.celdaHoy)}>{hoy ?? 'Sin dato'}</td>
      <td className={clases(classes.numero, classes.secundaria)}>
        {hoy !== undefined && dia0 !== undefined ? conSigno(hoy - dia0) : '—'}
      </td>
      <td className={classes.celdaBanda} data-banda={categoria}>
        {categoria ? mayuscula(categoria) : '—'}
      </td>
      <td className={classes.secundaria}>{fuente}</td>
    </tr>
  );
}

// ─── Zona clara: Plan Bienestar · 100 días ───────────────────────────────────────────

function SeccionPlan({ datos }: { readonly datos: DatosHomeE }): JSX.Element {
  const { plan } = datos;
  let contenido: JSX.Element;
  if (datos.cargando) {
    contenido = (
      <>
        <p id={ID.plan} className={classes.overline}>
          Plan Bienestar · 100 días
        </p>
        <Skeleton height={240} radius={16} />
      </>
    );
  } else if (plan) {
    contenido = <PlanActivo plan={plan} />;
  } else {
    contenido = (
      <>
        <h2 id={ID.plan} className={classes.tituloAccesos}>
          Plan Bienestar · 100 días
        </h2>
        <p className={classes.texto}>
          Un programa guiado de 100 días para ordenar tu prevención cardiovascular: tus hábitos, tus datos y tus metas,
          con tu equipo médico.
        </p>
        <UnstyledButton component={Link} to={RUTA_PLAN_BIENESTAR} className={classes.boton}>
          Empezar mi Plan Bienestar
          <Flecha />
        </UnstyledButton>
        <Anchor component={Link} to={RUTA_NUEVO_MENSAJE} underline="always" className={classes.link}>
          ¿Dudas? Escribir a mi equipo
          <Flecha tamano={18} />
        </Anchor>
      </>
    );
  }
  return (
    <section
      aria-labelledby={ID.plan}
      className={clases(classes.banda, classes.bandaPlan, !datos.cargando && !plan && classes.planBreve)}
    >
      <div className={classes.contenedor}>
        {contenido}
        {/* El seguimiento GLP-1 se oculta solo si la paciente no está en el programa. */}
        <SeguimientoGlp1Card />
      </div>
    </section>
  );
}

function textoRacha(plan: PlanBienestar): string {
  if (plan.rachaActual > 0) {
    return `Racha de ${plural(plan.rachaActual, 'semana', 'semanas')}`;
  }
  return plural(plan.semanasActivas, 'semana activa', 'semanas activas');
}

function PlanActivo({ plan }: { readonly plan: PlanBienestar }): JSX.Element {
  const dia = Math.min(plan.dia, plan.totalDias);
  const faltan = Math.max(0, plan.totalDias - plan.dia);
  const cumplidos = plan.hitos.filter((h) => h.cumplido).length;
  const clasePunto = (d: number): string => {
    if (plan.terminado || d < dia) {
      return classes.puntoRecorrido;
    }
    return d === dia ? classes.puntoHoy : classes.puntoPendiente;
  };
  return (
    <>
      <div className={classes.planCabecera}>
        <div className={classes.planTitulo}>
          <p id={ID.plan} className={classes.overline}>
            Plan Bienestar · 100 días
          </p>
          <h2>
            <span>
              Día {dia} de {plan.totalDias}
            </span>{' '}
            <span className={classes.planFaltan}>{plan.terminado ? '¡Completado!' : `faltan ${faltan}`}</span>
          </h2>
        </div>
        <div className={classes.planAcciones}>
          <p className={classes.chipRacha}>
            <IconCalendarCheck size={20} stroke={1.75} aria-hidden="true" />
            {textoRacha(plan)}
          </p>
          <UnstyledButton component={Link} to={RUTA_PLAN_BIENESTAR} className={classes.boton}>
            Ver mi plan
            <Flecha />
          </UnstyledButton>
        </div>
      </div>

      {/* La tira de 100 días es decorativa: la leyenda de abajo dice lo mismo en palabras. */}
      <div className={classes.tira}>
        <div aria-hidden="true" className={classes.puntos}>
          {Array.from({ length: plan.totalDias }, (_, i) => (
            <span key={i} className={clasePunto(i + 1)} />
          ))}
        </div>
        <p className={classes.leyendaTira}>
          <span>
            <span aria-hidden="true" className={classes.puntoRecorrido} />
            Días recorridos
          </span>
          {!plan.terminado && (
            <>
              <span>
                <span aria-hidden="true" className={classes.puntoHoy} />
                Hoy, día {dia}
              </span>
              <span>
                <span aria-hidden="true" className={classes.puntoPendiente} />
                Faltan {faltan}
              </span>
            </>
          )}
        </p>
      </div>

      {plan.hitos.length > 0 && (
        <div className={classes.hitos}>
          <h3>
            Hitos · {cumplidos} de {plan.hitos.length}
          </h3>
          <ol className={classes.listaHitos}>
            {plan.hitos.map((hito, i) => (
              <Hito key={hito.id} hito={hito} numero={i + 1} />
            ))}
          </ol>
        </div>
      )}
    </>
  );
}

function Hito({ hito, numero }: { readonly hito: HitoBienestar; readonly numero: number }): JSX.Element {
  return (
    <li className={clases(classes.hito, !hito.cumplido && classes.hitoPendiente)}>
      <span aria-hidden="true" className={classes.hitoIcono}>
        {hito.cumplido ? <IconCheck size={16} stroke={2.5} /> : numero}
      </span>
      <span className={classes.hitoTexto}>
        <strong>
          {hito.label}
          <span className={classes.oculto}>{hito.cumplido ? ', hecho' : ', pendiente'}</span>
        </strong>
        <span aria-hidden={hito.cumplido || undefined}>{hito.cumplido ? 'Hecho' : hito.descripcion}</span>
      </span>
      {!hito.cumplido && (
        <Anchor
          component={Link}
          to={hito.href}
          underline="always"
          className={classes.link}
          aria-label={`Hacerlo ahora: ${hito.label}`}
        >
          Hacerlo ahora
        </Anchor>
      )}
    </li>
  );
}

// ─── Zona clara: tu equipo ───────────────────────────────────────────────────────────

interface MiembroHome {
  readonly clave: string;
  readonly referencia: RefProfesional;
  readonly rol: string;
  readonly descripcion: string;
  readonly estado?: string;
}

/** Cabecera, equipo del plan y quienes firman la Segunda Opinión, en ese orden. */
function miembrosDe(datos: DatosHomeE): MiembroHome[] {
  const { equipo, segundaOpinion } = datos;
  if (!equipo) {
    return [];
  }
  const miembros: MiembroHome[] = [];
  if (equipo.cabecera) {
    miembros.push({
      clave: `cabecera-${equipo.cabecera.reference}`,
      referencia: equipo.cabecera,
      rol: esCentro(equipo.cabecera) ? 'Tu centro' : 'Cabecera',
      descripcion: 'Conoce tu historia y sigue tus estudios.',
    });
  }
  for (const m of equipo.equipoPlan) {
    miembros.push({
      clave: `plan-${m.ref.reference}`,
      referencia: m.ref,
      rol: m.rol ?? 'Plan Bienestar',
      descripcion: 'Acompaña tus 100 días: tus hábitos y tus hitos.',
    });
  }
  for (const ref of equipo.segundaOpinion) {
    miembros.push({
      clave: `som-${ref.reference}`,
      referencia: ref,
      rol: MARCA.producto,
      descripcion: 'Analiza tu caso y prepara tu informe.',
      estado: segundaOpinion?.etiqueta,
    });
  }
  return miembros;
}

function TuEquipo({ datos }: { readonly datos: DatosHomeE }): JSX.Element {
  const miembros = miembrosDe(datos);
  let lista: JSX.Element;
  if (datos.cargando) {
    lista = <Skeleton height={120} radius={20} />;
  } else if (miembros.length === 0) {
    lista = <p className={classes.texto}>Cuando tengas un equipo asignado, lo vas a ver acá.</p>;
  } else {
    lista = (
      <ul className={classes.miembros}>
        {miembros.map((m) => (
          <li key={m.clave} className={classes.miembro}>
            {esCentro(m.referencia) ? (
              <span aria-hidden="true" className={classes.iconoCentro}>
                <IconBuildingHospital size={26} stroke={1.75} />
              </span>
            ) : (
              <ResourceAvatar value={m.referencia} size={56} radius="xl" />
            )}
            <span className={classes.miembroTexto}>
              <span className={classes.miembroRol}>
                {m.rol}
                {m.estado && <span className={classes.chipEstado}>{m.estado}</span>}
              </span>
              <span className={classes.texto}>{m.descripcion}</span>
              <span className={classes.miembroNombre}>
                <ResourceName value={m.referencia} />
              </span>
            </span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <section aria-labelledby={ID.equipo} className={classes.banda}>
      <div className={classes.contenedor}>
        <div className={classes.encabezado}>
          <p className={classes.overline}>El anillo sólido</p>
          <h2 id={ID.equipo} className={classes.tituloSeccion}>
            Tu equipo
          </h2>
          <p className={classes.bajada}>
            Tu equipo médico revisa, decide y firma. Nuestros agentes de IA lo asisten: leen y ordenan tus datos y
            preparan borradores.
          </p>
        </div>
        {lista}
        <div className={classes.equipoPie}>
          <p>
            Dirección médica: <strong>{MARCA.responsable}</strong>
          </p>
          <UnstyledButton component={Link} to={RUTA_EQUIPO} className={classes.boton}>
            Ver mi equipo de salud
            <Flecha />
          </UnstyledButton>
        </div>
      </div>
    </section>
  );
}

// ─── Zona clara: tus accesos y el pie de seguridad ───────────────────────────────────

interface Acceso {
  readonly titulo: string;
  readonly detalle: string;
  readonly href: string;
  readonly icono: Icon;
}

function detalleConsentimiento(datos: DatosHomeE): string {
  const fecha = fechaCorta(datos.fechaConsentimiento, datos.hoy);
  switch (datos.consentimiento) {
    case 'firmado':
      return fecha ? `Firmado el ${fecha}` : 'Firmado';
    case 'desactualizado':
      return 'Hay una versión nueva para firmar';
    case 'falta':
      return 'Leelo y firmalo';
    default:
      return 'Leé tu consentimiento';
  }
}

function accesosDe(datos: DatosHomeE): readonly Acceso[] {
  return [
    {
      titulo: 'Mi Plan Bienestar',
      detalle: 'Tus 100 días, paso a paso',
      href: RUTA_PLAN_BIENESTAR,
      icono: IconClipboardHeart,
    },
    { titulo: 'Mis 8 hábitos', detalle: 'Tu puntaje LE8', href: RUTA_TABLERO_LE8, icono: IconHeartbeat },
    {
      titulo: 'Cuestionarios de hábitos',
      detalle: 'Alimentación, actividad, sueño y tabaco',
      href: RUTA_CUESTIONARIOS,
      icono: IconListCheck,
    },
    { titulo: 'Salud CKM', detalle: 'Corazón, riñones y metabolismo', href: RUTA_CKM, icono: IconDropletHeart },
    { titulo: 'Biomarcadores', detalle: 'Resultados y evolución', href: RUTA_BIOMARCADORES, icono: IconTestPipe },
    {
      titulo: 'Enviar estudios en PDF',
      detalle: 'Tu laboratorio, leído por IA',
      href: RUTA_ENVIAR_ESTUDIOS,
      icono: IconFileUpload,
    },
    { titulo: 'Historia clínica', detalle: 'Estudios y registros', href: RUTA_SALUD, icono: IconClipboardText },
    // El camino 2: quien ya tiene una Segunda Opinión la sigue; quien no, la pide.
    pidioSegundaOpinion(datos)
      ? {
          titulo: `Mi ${MARCA.producto}`,
          detalle: 'Tu pedido y tu informe',
          href: RUTA_MI_SEGUNDA_OPINION,
          icono: IconStethoscope,
        }
      : {
          titulo: `Pedir mi ${MARCA.producto}`,
          detalle: 'Un informe de tu caso y tu riesgo',
          href: RUTA_SOLICITAR_SEGUNDA_OPINION,
          icono: IconStethoscope,
        },
    { titulo: 'Mensajes', detalle: 'Escribile a tu equipo', href: RUTA_MENSAJES, icono: IconMessage },
    {
      titulo: 'Reservar una teleconsulta',
      detalle: 'Con un profesional, por videollamada',
      href: RUTA_RESERVAR_TELECONSULTA,
      icono: IconVideo,
    },
    { titulo: 'Mi membresía', detalle: 'Turnos, sesiones y pagos', href: RUTA_MEMBRESIA, icono: IconWallet },
    {
      titulo: 'Consentimiento informado',
      detalle: detalleConsentimiento(datos),
      href: RUTA_CONSENTIMIENTO,
      icono: IconSignature,
    },
  ];
}

function TusAccesos({ datos }: { readonly datos: DatosHomeE }): JSX.Element {
  const firmado = fechaCorta(datos.fechaConsentimiento, datos.hoy);
  return (
    <section aria-labelledby={ID.accesos} className={clases(classes.banda, classes.bandaBlanca, classes.bandaAccesos)}>
      <div className={classes.contenedor}>
        <h2 id={ID.accesos} className={classes.tituloAccesos}>
          Tus accesos
        </h2>
        <ul className={classes.accesos}>
          {accesosDe(datos).map((a) => (
            <li key={a.href}>
              <UnstyledButton component={Link} to={a.href} className={classes.acceso}>
                <span aria-hidden="true" className={classes.accesoIcono}>
                  <a.icono size={24} stroke={1.75} />
                </span>
                <span className={classes.accesoTexto}>
                  <span>{a.titulo}</span> <span>{a.detalle}</span>
                </span>
              </UnstyledButton>
            </li>
          ))}
        </ul>

        <section aria-label="Seguridad y cuidado" className={classes.seguridad}>
          <span aria-hidden="true">
            <IconShieldCheck size={22} stroke={1.75} />
          </span>
          <div className={classes.seguridadTextos}>
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
        </section>
      </div>
    </section>
  );
}
