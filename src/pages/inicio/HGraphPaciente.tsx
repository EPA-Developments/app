// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// «Tus valores»: el hGraph de la paciente (un eje por valor, la marca tanto más afuera cuanto
// más cerca del rango; el anillo es «en rango») y, debajo, la lista de esos mismos valores con
// su estado, su fecha y quién los cargó. La lista no es un adorno: en el celular el gráfico se
// achica y es la lista la que se lee. El SVG es una imagen (role="img") con su descripción;
// la lista es el contenido.
//
// Sirve a cualquier estilo de Home: el tema (`claro` u `oscuro`) elige los colores, y la
// tipografía se hereda. La sección (su título y su bajada) la pone cada Home. El modelo y la
// geometría salen de hgraph.ts; acá sólo se dibujan.
import type { EstadoMetricaHgraph } from '@epa/careplan-menopausia';
import type { CSSProperties, JSX } from 'react';
import { Link } from 'react-router';
import { RUTA_ENVIAR_ESTUDIOS } from '../../components/AccionesRapidas';
import { RUTA_DATOS_DE_SALUD } from '../../fhir/datosDeSalud';
import { fechaCorta } from './formato';
import {
  ALTO_HGRAPH,
  ANCHO_HGRAPH,
  anguloEje,
  caminoHgraph,
  CENTRO_X,
  CENTRO_Y,
  COLORES_HGRAPH,
  descripcionHgraph,
  marcaEstado,
  puntoHgraph,
  R_ANILLO,
  R_GUIA_MODERADO,
  R_MINIMO,
  R_ORIGEN,
  radioHgraph,
  rotuloEje,
  TEXTO_ESTADO,
  TEXTO_FALTA_VALOR,
  TEXTO_ORIGEN,
  TEXTO_VIEJO,
} from './hgraph';
import type { ModeloHgraph, PuntoHgraph, TemaHgraph } from './hgraph';
import classes from './HGraphPaciente.module.css';

/** La aclaración fija: el color compara con un rango; la lectura completa es la del equipo. */
export const NOTA_HGRAPH =
  'Los colores comparan cada valor con un rango de referencia. Tu equipo los mira junto con toda tu historia.';

/** Lo que dice la Home si las lecturas no se pudieron leer. */
export const TEXTO_VALORES_SIN_LEER = 'No pudimos leer tus valores. Probá de nuevo más tarde.';

/** Lo que se dice sin ningún dato todavía. */
export const TEXTO_SIN_VALORES = 'Con tu último laboratorio armamos tu mapa de valores.';

const ESTADOS: readonly EstadoMetricaHgraph[] = ['healthy', 'moderate', 'high'];

export interface HGraphPacienteProps {
  readonly modelo: ModeloHgraph;
  readonly tema: TemaHgraph;
  /** Hoy en Argentina, AAAA-MM-DD (para las fechas). */
  readonly hoy: string;
}

export function HGraphPaciente({ modelo, tema, hoy }: HGraphPacienteProps): JSX.Element {
  const colores = COLORES_HGRAPH[tema];
  const estilo = {
    '--hg-texto': colores.texto,
    '--hg-secundario': colores.secundario,
    '--hg-guia': colores.guia,
    '--hg-enlace': colores.enlace,
  } as CSSProperties;

  if (modelo.conDato === 0) {
    return (
      <div className={classes.hgraph} style={estilo}>
        <p className={classes.vacio}>{TEXTO_SIN_VALORES}</p>
        <Acciones />
      </div>
    );
  }

  return (
    <div className={classes.hgraph} style={estilo}>
      <div className={classes.cuerpo}>
        <Grafico modelo={modelo} tema={tema} />
        <ListaValores modelo={modelo} tema={tema} hoy={hoy} />
      </div>
      <Leyenda tema={tema} />
      <p className={classes.nota}>{NOTA_HGRAPH}</p>
      {modelo.faltan > 0 && <Acciones />}
    </div>
  );
}

function Grafico({ modelo, tema }: { readonly modelo: ModeloHgraph; readonly tema: TemaHgraph }): JSX.Element {
  const colores = COLORES_HGRAPH[tema];
  const n = modelo.puntos.length;
  const contorno = caminoHgraph(modelo.puntos);
  return (
    <svg
      viewBox={`0 0 ${ANCHO_HGRAPH} ${ALTO_HGRAPH}`}
      width="100%"
      role="img"
      aria-label={descripcionHgraph(modelo)}
      className={classes.grafico}
    >
      {/* El anillo de «en rango» y la guía debajo de la cual es «para hablar con tu médico». */}
      <circle
        data-guia="en-rango"
        cx={CENTRO_X}
        cy={CENTRO_Y}
        r={R_ANILLO}
        fill="none"
        stroke={colores.estado.healthy}
        strokeOpacity={0.55}
        strokeWidth={2}
      />
      <circle
        data-guia="moderado"
        cx={CENTRO_X}
        cy={CENTRO_Y}
        r={R_GUIA_MODERADO}
        fill="none"
        stroke={colores.guia}
        strokeOpacity={0.6}
        strokeDasharray="4 5"
      />

      {modelo.puntos.map((p, i) => {
        const angulo = anguloEje(i, n);
        const desde = puntoHgraph(R_MINIMO, angulo);
        const hasta = puntoHgraph(R_ANILLO, angulo);
        return (
          <line
            key={`eje-${p.id}`}
            x1={desde.x}
            y1={desde.y}
            x2={hasta.x}
            y2={hasta.y}
            stroke={colores.guia}
            strokeOpacity={0.35}
          />
        );
      })}

      {contorno && (
        <path
          d={contorno}
          fill={colores.contorno}
          fillOpacity={0.12}
          stroke={colores.contorno}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      )}

      {modelo.puntos.map((p, i) => (
        <Marca key={`marca-${p.id}`} punto={p} i={i} n={n} tema={tema} />
      ))}

      {modelo.puntos.map((p, i) => {
        const { x, y, anclaje } = rotuloEje(i, n);
        return (
          <text key={`rotulo-${p.id}`} x={x} y={y} textAnchor={anclaje} className={classes.rotulo}>
            <tspan fill={colores.texto} fontWeight={600}>
              {p.rotulo}
            </tspan>
            <tspan x={x} dy={16} fill={colores.secundario}>
              {p.dato ? p.dato.valor : TEXTO_FALTA_VALOR}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}

function Marca(props: {
  readonly punto: PuntoHgraph;
  readonly i: number;
  readonly n: number;
  readonly tema: TemaHgraph;
}): JSX.Element | null {
  const { punto, i, n, tema } = props;
  const colores = COLORES_HGRAPH[tema];
  if (!punto.dato) {
    // Sin dato: un hueco discontinuo sobre el anillo, donde iría si estuviera en rango.
    const { x, y } = puntoHgraph(R_ANILLO, anguloEje(i, n));
    return (
      <circle
        data-falta={punto.id}
        cx={x}
        cy={y}
        r={5}
        fill={colores.fondo}
        stroke={colores.guia}
        strokeDasharray="2 2.5"
      />
    );
  }
  const { x, y } = puntoHgraph(radioHgraph(punto.dato.score), anguloEje(i, n));
  const delEquipo = punto.dato.origen === 'equipo';
  return (
    <g data-punto={punto.id} data-estado={punto.dato.estado} data-origen={punto.dato.origen}>
      {/* El anillo del origen, con el código de la rosa: punteado sin revisión, sólido del equipo. */}
      <circle
        cx={x}
        cy={y}
        r={R_ORIGEN}
        fill="none"
        stroke={colores.secundario}
        strokeWidth={1.5}
        strokeDasharray={delEquipo ? undefined : '0 3.6'}
        strokeLinecap="round"
      />
      <path
        d={marcaEstado(punto.dato.estado, x, y)}
        fill={colores.estado[punto.dato.estado]}
        stroke={colores.fondo}
        strokeWidth={1.5}
      />
    </g>
  );
}

/** Un icono chico de la marca de un estado, para la lista y la leyenda. */
function IconoEstado({
  estado,
  tema,
}: {
  readonly estado: EstadoMetricaHgraph;
  readonly tema: TemaHgraph;
}): JSX.Element {
  return (
    <svg viewBox="0 0 20 20" width={16} height={16} aria-hidden="true" className={classes.icono}>
      <path d={marcaEstado(estado, 10, 10)} fill={COLORES_HGRAPH[tema].estado[estado]} />
    </svg>
  );
}

function ListaValores(props: {
  readonly modelo: ModeloHgraph;
  readonly tema: TemaHgraph;
  readonly hoy: string;
}): JSX.Element {
  const { modelo, tema, hoy } = props;
  return (
    <ul className={classes.lista}>
      {modelo.puntos.map((p) => (
        <li key={p.id} className={classes.fila} data-valor={p.id}>
          <span className={classes.nombre}>{p.nombre}</span>
          {p.dato ? (
            <>
              <span className={classes.medida}>
                <strong>{p.dato.valor}</strong> {p.dato.unidad}
              </span>
              <span className={classes.estado}>
                <IconoEstado estado={p.dato.estado} tema={tema} />
                {p.dato.textoEstado}
              </span>
              <span className={classes.detalle}>
                {[fechaCorta(p.dato.fecha, hoy), TEXTO_ORIGEN[p.dato.origen], p.dato.viejo ? TEXTO_VIEJO : undefined]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </>
          ) : (
            <span className={classes.falta}>{TEXTO_FALTA_VALOR}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Leyenda({ tema }: { readonly tema: TemaHgraph }): JSX.Element {
  const colores = COLORES_HGRAPH[tema];
  return (
    <ul className={classes.leyenda} aria-label="Cómo se lee">
      {ESTADOS.map((estado) => (
        <li key={estado}>
          <IconoEstado estado={estado} tema={tema} />
          {TEXTO_ESTADO[estado]}
        </li>
      ))}
      <li>
        <svg viewBox="0 0 20 20" width={16} height={16} aria-hidden="true" className={classes.icono}>
          <circle
            cx={10}
            cy={10}
            r={7}
            fill="none"
            stroke={colores.secundario}
            strokeWidth={1.5}
            strokeDasharray="0 3.6"
            strokeLinecap="round"
          />
        </svg>
        Sin revisar por tu equipo
      </li>
      <li>
        <svg viewBox="0 0 20 20" width={16} height={16} aria-hidden="true" className={classes.icono}>
          <circle cx={10} cy={10} r={7} fill="none" stroke={colores.secundario} strokeWidth={1.5} />
        </svg>
        Cargado por tu equipo
      </li>
    </ul>
  );
}

function Acciones(): JSX.Element {
  return (
    <p className={classes.acciones}>
      <Link to={RUTA_ENVIAR_ESTUDIOS} className={classes.link}>
        Mandá tu laboratorio en PDF
      </Link>
      <Link to={RUTA_DATOS_DE_SALUD} className={classes.link}>
        Cargá tus datos
      </Link>
    </p>
  );
}
