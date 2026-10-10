// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// La rosa de los 8 hábitos, en el centro de la Home E: la forma de la paciente (un pétalo
// por hábito de Life's Essential 8, tan largo como su puntaje), rodeada por el anillo
// punteado de nuestros agentes de IA y el anillo sólido de su equipo médico.
//
// Es una imagen (role="img"): el aria-label dice todos los puntajes y qué pasa en los
// anillos, así que los textos de adentro no se leen dos veces. La geometría y los colores
// salen de rosa.ts; acá solo se dibujan.
import { categoriaLe8, LE8_DOMINIO_LABEL, LE8_DOMINIOS } from '@epa/careplan-menopausia';
import type { CSSProperties, JSX } from 'react';
import {
  ALTO_PILDORA,
  arco,
  caminoLaboratorio,
  caminoPetalo,
  CENTRO,
  colorPetalo,
  COLORES_PETALOS,
  COLORES_ROSA,
  corrimientoPetalo,
  geometriaNodo,
  INTERLINEA_ROTULO,
  LABORATORIO,
  LADO,
  posicionRotulo,
  PUNTEADO_IA,
  puntajeDe,
  R_EQUIPO,
  R_GUIA,
  R_IA,
  R_NUCLEO,
  sectorAnular,
  TAMANO_NODO,
  TAMANO_ROTULO,
  TEXTO_FALTA,
  TEXTO_NODO,
  TRAMO_SEGUNDA_OPINION,
} from './rosa';
import classes from './RosaLe8.module.css';
import type { AnillosRosa, NodoEquipo, RosaLe8Props } from './tipos';

/** Orden de los nodos del equipo, en el dibujo y en la descripción. */
const NODOS: readonly NodoEquipo[] = ['cabecera', 'plan', 'segunda-opinion'];

/** Escalonado del crecimiento de los pétalos. */
const PASO_ANIMACION_MS = 40;

export function RosaLe8(props: RosaLe8Props): JSX.Element {
  const { dominios, total, totalInicial, anillos, nombreSegundaOpinion } = props;
  const modo = props.modoColor ?? COLORES_PETALOS.modo;
  const categoria = props.categoria ?? (total === undefined ? undefined : categoriaLe8(total));
  const enAnalisis = anillos.segundaOpinion === 'en-analisis';
  const { desde, hasta } = TRAMO_SEGUNDA_OPINION;
  // Sin «día 0», el total y la banda bajan un poco para quedar centrados en el núcleo.
  const bajada = total !== undefined && totalInicial === undefined ? 9 : 0;

  return (
    <svg
      viewBox={`0 0 ${LADO} ${LADO}`}
      width="100%"
      role="img"
      aria-label={descripcion(props)}
      className={classes.rosa}
    >
      {/* Tramo encendido de la Segunda Opinión (fondo): IA y equipo trabajan juntos. */}
      {enAnalisis && (
        <path d={sectorAnular(R_IA - 8, R_EQUIPO + 8, desde, hasta)} fill={COLORES_ROSA.equipo} fillOpacity={0.1} />
      )}

      {/* Guía de 50 puntos. */}
      <circle cx={CENTRO} cy={CENTRO} r={R_GUIA} fill="none" stroke={COLORES_ROSA.guia} strokeOpacity={0.28} />

      {/* Anillo del equipo médico: sólido (revisa, decide y firma). */}
      <circle
        data-anillo="equipo"
        cx={CENTRO}
        cy={CENTRO}
        r={R_EQUIPO}
        fill="none"
        stroke={COLORES_ROSA.equipo}
        strokeWidth={2}
      />

      {/* Anillo de los agentes de IA: punteado; gira mientras hay algo en proceso. */}
      <circle
        data-anillo="ia"
        className={anillos.iaEnProceso ? classes.gira : undefined}
        cx={CENTRO}
        cy={CENTRO}
        r={R_IA}
        fill="none"
        stroke={COLORES_ROSA.ia}
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={PUNTEADO_IA}
      />

      {/* Tramo encendido sobre los dos anillos. */}
      {enAnalisis && (
        <g data-tramo="segunda-opinion">
          <path
            d={arco(R_IA, desde, hasta)}
            fill="none"
            stroke={COLORES_ROSA.equipo}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={PUNTEADO_IA}
          />
          <path
            d={arco(R_EQUIPO, desde, hasta)}
            fill="none"
            stroke={COLORES_ROSA.equipo}
            strokeWidth={5}
            strokeLinecap="round"
          />
        </g>
      )}

      {/* El laboratorio cruzó el anillo de IA: de la punta de sus pétalos a la marca. */}
      {anillos.laboratorioLeido && (
        <path
          d={caminoLaboratorio(dominios)}
          fill="none"
          stroke={COLORES_ROSA.ia}
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray="0 5"
        />
      )}

      {/* Pétalos. La clave cambia cuando un pétalo recibe su dato, para que crezca entonces. */}
      {LE8_DOMINIOS.map((dominio, i) => {
        const puntaje = puntajeDe(dominios, dominio);
        const conDato = puntaje !== undefined;
        const { dx, dy } = corrimientoPetalo(i);
        return (
          <g
            key={`${dominio}-${conDato ? 'dato' : 'falta'}`}
            className={classes.brota}
            style={{ animationDelay: `${i * PASO_ANIMACION_MS}ms` }}
          >
            <path
              data-petalo={dominio}
              className={classes.petalo}
              style={{ '--dx': `${dx}px`, '--dy': `${dy}px` } as CSSProperties}
              d={caminoPetalo(i, puntaje)}
              fill={colorPetalo(dominio, puntaje, modo)}
              stroke={conDato ? COLORES_PETALOS.borde : COLORES_ROSA.ia}
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeDasharray={conDato ? undefined : '5 4'}
            />
          </g>
        );
      })}

      {/* Núcleo: vos, con tu total. */}
      <circle
        cx={CENTRO}
        cy={CENTRO}
        r={R_NUCLEO}
        fill={COLORES_ROSA.nucleo}
        stroke={COLORES_ROSA.secundario}
        strokeOpacity={0.5}
      />
      <text
        className={classes.total}
        x={CENTRO}
        y={total === undefined ? 282 : 266 + bajada}
        textAnchor="middle"
        fontSize={72}
        fontWeight={700}
        fill={COLORES_ROSA.texto}
      >
        {total === undefined ? '—' : Math.round(total)}
      </text>
      {total !== undefined && categoria && (
        <text
          x={CENTRO}
          y={288 + bajada}
          textAnchor="middle"
          fontSize={14}
          fontWeight={600}
          fill={COLORES_ROSA.banda[categoria]}
        >
          {categoria}
        </text>
      )}
      {totalInicial !== undefined && (
        <text x={CENTRO} y={306} textAnchor="middle" fontSize={14} fontWeight={500} fill={COLORES_ROSA.secundario}>
          día 0: {Math.round(totalInicial)}
        </text>
      )}

      {/* Rótulos de los pétalos: nombre corto y puntaje (o «Falta»). */}
      {LE8_DOMINIOS.map((dominio, i) => {
        const { x, y, textAnchor, lineas } = posicionRotulo(i);
        const puntaje = puntajeDe(dominios, dominio);
        return (
          <text
            key={dominio}
            data-rotulo={dominio}
            x={x}
            y={y}
            textAnchor={textAnchor}
            fontSize={TAMANO_ROTULO}
            fontWeight={600}
          >
            {lineas.map((linea, k) => (
              <tspan key={linea} x={x} y={y + k * INTERLINEA_ROTULO} fill={COLORES_ROSA.texto}>
                {linea}
              </tspan>
            ))}
            <tspan
              x={x}
              y={y + lineas.length * INTERLINEA_ROTULO}
              fill={puntaje === undefined ? COLORES_ROSA.ia : COLORES_ROSA.secundario}
            >
              {puntaje === undefined ? TEXTO_FALTA : Math.round(puntaje)}
            </tspan>
          </text>
        );
      })}

      {/* Marca del laboratorio sobre el anillo de IA. */}
      {anillos.laboratorioLeido && (
        <g data-marca="laboratorio">
          <path
            d={`M${LABORATORIO.trazo.x1} ${LABORATORIO.trazo.y} L${LABORATORIO.trazo.x2} ${LABORATORIO.trazo.y}`}
            fill="none"
            stroke={COLORES_ROSA.ia}
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray="0 4"
          />
          <circle
            cx={LABORATORIO.punto.cx}
            cy={LABORATORIO.punto.cy}
            r={LABORATORIO.punto.r}
            fill={COLORES_ROSA.ia}
            stroke={COLORES_ROSA.escenario}
            strokeWidth={2.5}
          />
          <text textAnchor="end" fontSize={TAMANO_NODO} fill={COLORES_ROSA.ia}>
            {LABORATORIO.lineas.map((linea, k) => (
              <tspan
                key={linea}
                x={LABORATORIO.texto.x}
                y={LABORATORIO.texto.y + k * 18}
                fontWeight={k === 0 ? 600 : 500}
              >
                {linea}
              </tspan>
            ))}
          </text>
        </g>
      )}

      {/* Nodos del equipo (los que tiene la paciente). */}
      {NODOS.filter((nodo) => anillos.equipo.includes(nodo)).map((nodo) => {
        const esSegundaOpinion = nodo === 'segunda-opinion';
        const texto = nodo === 'segunda-opinion' ? nombreSegundaOpinion : TEXTO_NODO[nodo];
        const { cx, cy, r, conector, pildora, estado, texto: base } = geometriaNodo(nodo, texto);
        const relleno = esSegundaOpinion ? COLORES_ROSA.equipo : COLORES_ROSA.escenario;
        const tinta = esSegundaOpinion ? COLORES_ROSA.escenario : COLORES_ROSA.equipo;
        const estadoTexto = esSegundaOpinion ? textoEstado(anillos) : undefined;
        return (
          <g key={nodo} data-nodo={nodo}>
            <path
              d={`M${conector.x1} ${conector.y1} L${conector.x2} ${conector.y2}`}
              stroke={COLORES_ROSA.equipo}
              strokeWidth={1.5}
              strokeLinecap="round"
            />
            <circle cx={cx} cy={cy} r={r} fill={relleno} stroke={tinta} strokeWidth={2} />
            <rect
              x={pildora.x0}
              y={pildora.y0}
              width={pildora.x1 - pildora.x0}
              height={ALTO_PILDORA}
              rx={ALTO_PILDORA / 2}
              fill={relleno}
              stroke={esSegundaOpinion ? undefined : COLORES_ROSA.equipo}
              strokeWidth={esSegundaOpinion ? undefined : 1.5}
            />
            <text x={base.x} y={base.y} textAnchor="middle" fontSize={TAMANO_NODO} fontWeight={600} fill={tinta}>
              {texto}
            </text>
            {estado && estadoTexto && (
              <text
                x={estado.x}
                y={estado.y}
                textAnchor="middle"
                fontSize={TAMANO_NODO}
                fontWeight={500}
                fill={COLORES_ROSA.secundario}
              >
                {estadoTexto}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** «en análisis» o «firmada», debajo del nodo de la Segunda Opinión. */
function textoEstado(anillos: AnillosRosa): string | undefined {
  if (anillos.segundaOpinion === 'en-analisis') {
    return 'en análisis';
  }
  return anillos.segundaOpinion === 'completada' ? 'firmada' : undefined;
}

/** El aria-label: todo lo que muestra la rosa, dicho en palabras. */
function descripcion(props: RosaLe8Props): string {
  const { dominios, total, totalInicial, anillos, nombreSegundaOpinion } = props;
  const habitos = LE8_DOMINIOS.map((dominio) => {
    const puntaje = puntajeDe(dominios, dominio);
    const nombre = LE8_DOMINIO_LABEL[dominio];
    return puntaje === undefined ? `${nombre} sin dato todavía` : `${nombre} ${Math.round(puntaje)}`;
  });
  const frases = [
    "Tu forma de hoy. Una rosa de 8 pétalos, uno por cada hábito de Life's Essential 8, cada uno tan largo " +
      `como su puntaje sobre 100: ${enumerar(habitos)}.`,
  ];

  const dia0 = totalInicial === undefined ? '' : `; el día 0 era ${Math.round(totalInicial)}`;
  if (total === undefined) {
    frases.push(`En el centro va tu total, que todavía no tiene datos${dia0}.`);
  } else {
    const categoria = props.categoria ?? categoriaLe8(total);
    frases.push(`En el centro, tu total: ${Math.round(total)}, banda ${categoria}${dia0}.`);
  }

  const queHaceLaIa = [
    ...(anillos.laboratorioLeido ? ['leyó tu laboratorio'] : []),
    ...(anillos.iaEnProceso ? ['está trabajando con tus datos'] : []),
  ];
  const ia =
    'el anillo punteado de nuestros agentes de IA' +
    (queHaceLaIa.length > 0 ? `, que ${enumerar(queHaceLaIa)}` : '');
  const nodos = NODOS.filter((nodo) => anillos.equipo.includes(nodo));
  const nombres = nodos.map((nodo) => (nodo === 'segunda-opinion' ? nombreSegundaOpinion : TEXTO_NODO[nodo]));
  const estado =
    anillos.segundaOpinion === 'en-analisis'
      ? 'que está en análisis'
      : anillos.segundaOpinion === 'completada'
        ? 'ya firmada'
        : undefined;
  // La Segunda Opinión es el último nodo de la lista: su estado va pegado a su nombre.
  const conNodoSegundaOpinion = nodos.includes('segunda-opinion');
  const equipo =
    'el anillo sólido de tu equipo médico' +
    (nombres.length > 0 ? `: ${enumerar(nombres)}` : '') +
    (estado && conNodoSegundaOpinion ? `, ${estado}` : '');
  frases.push(`Alrededor, ${ia}, y ${equipo}.`);
  if (anillos.segundaOpinion && !conNodoSegundaOpinion) {
    const como = anillos.segundaOpinion === 'en-analisis' ? 'está en análisis' : 'ya está firmada';
    frases.push(`Tu ${nombreSegundaOpinion} ${como}.`);
  }
  return frases.join(' ');
}

/** «a», «a y b», «a, b y c». */
function enumerar(partes: readonly string[]): string {
  if (partes.length <= 1) {
    return partes.join('');
  }
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}
