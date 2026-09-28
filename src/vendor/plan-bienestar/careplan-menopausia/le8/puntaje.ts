/**
 * Puntaje Life's Essential 8 (AHA 2022) — lógica pura.
 *
 * Fuente: Lloyd-Jones DM et al., "Life's Essential 8: Updating and Enhancing the
 * AHA's Construct of Cardiovascular Health", Circulation 2022 (Tabla de puntaje por
 * dominio). Cada dominio puntúa 0 a 100; el total es el promedio de los dominios con
 * dato. Salud cardiovascular alta ≥ 80, moderada 50 a 79, baja < 50.
 *
 * LE8 es el tablero de la persona (el estadío CKM es el del médico): mide el progreso
 * en los 100 días y es la respuesta a 100 días del estadío 0
 * (`docs/plan-bienestar-ckm-items.md`, Apéndice A y sección 3).
 *
 * Con datos incompletos no se adivina: el dominio queda sin puntaje y dice qué falta;
 * el total promedia sólo lo que hay y `completo` avisa si faltan dominios.
 */
import type { Le8Domain } from '../model/planTemplate.js';

/** Los ocho dominios, en el orden de la publicación (conductas primero, factores después). */
export const LE8_DOMINIOS: readonly Le8Domain[] = [
  'dieta',
  'actividad-fisica',
  'nicotina',
  'sueno',
  'imc',
  'lipidos',
  'glucemia',
  'presion-arterial',
];

/** Nombre que ve la persona en el tablero. */
export const LE8_DOMINIO_LABEL: Record<Le8Domain, string> = {
  dieta: 'Alimentación',
  'actividad-fisica': 'Actividad física',
  nicotina: 'Nicotina',
  sueno: 'Sueño',
  imc: 'Peso (IMC)',
  lipidos: 'Colesterol',
  glucemia: 'Glucemia',
  'presion-arterial': 'Presión arterial',
};

export type CategoriaLe8 = 'alta' | 'moderada' | 'baja';

/** Cortes del puntaje total (y de cada dominio) según la AHA. */
export const LE8_CORTES = { alta: 80, moderada: 50 } as const;

export const LE8_CATEGORIA_LABEL: Record<CategoriaLe8, string> = {
  alta: 'Salud cardiovascular alta',
  moderada: 'Salud cardiovascular moderada',
  baja: 'Salud cardiovascular baja',
};

export function categoriaLe8(puntaje: number): CategoriaLe8 {
  if (puntaje >= LE8_CORTES.alta) return 'alta';
  if (puntaje >= LE8_CORTES.moderada) return 'moderada';
  return 'baja';
}

export type EstadoNicotina = 'nunca' | 'ex' | 'actual';
export type TiempoSinFumar = 'menos-1-anio' | '1-a-5-anios' | '5-anios-o-mas';

export interface NicotinaLe8 {
  estado: EstadoNicotina;
  /** Necesario cuando `estado` es `ex`. */
  tiempoSinFumar?: TiempoSinFumar;
  /** Convive con alguien que fuma dentro de la casa: resta 20 puntos. */
  humoAjenoEnCasa?: boolean;
}

/** Lo que hace falta para puntuar cada dominio. Todo opcional: lo que falta queda sin puntaje. */
export interface EntradaLe8 {
  /** Criterios mediterráneos cumplidos del MEDAS (0 a `medasTotal`). */
  medasPuntos?: number;
  /** Criterios que puntúan en el cuestionario (13 en el del portal: el ítem del vino es informativo). */
  medasTotal?: number;
  /** Minutos semanales de actividad moderada a vigorosa. */
  actividadMinSemana?: number;
  nicotina?: NicotinaLe8;
  /** Horas de sueño por noche (promedio). */
  suenoHoras?: number;
  /** kg/m². */
  imc?: number;
  /** Colesterol no-HDL, mg/dL. Si falta se calcula de total y HDL. */
  noHdlMgDl?: number;
  colesterolTotalMgDl?: number;
  hdlMgDl?: number;
  /** Toma hipolipemiantes: resta 20 puntos al dominio. */
  tratamientoLipidos?: boolean;
  glucemiaAyunasMgDl?: number;
  hba1cPorcentaje?: number;
  /** Diabetes diagnosticada. Sin la bandera se infiere de glucemia ≥ 126 o HbA1c ≥ 6,5 %. */
  diabetes?: boolean;
  sistolicaMmHg?: number;
  diastolicaMmHg?: number;
  /** Toma antihipertensivos: resta 20 puntos al dominio. */
  tratamientoPresion?: boolean;
}

export interface PuntajeDominio {
  dominio: Le8Domain;
  /** 0 a 100; ausente cuando falta el dato. */
  puntaje?: number;
  /** Qué se midió, en palabras ("135 min/semana"). */
  detalle?: string;
  /** Qué falta cuando no hay puntaje. */
  falta?: string;
  /** true cuando la conversión usada todavía no tiene firma médica (dieta). */
  pendienteValidacion?: boolean;
}

export interface ResultadoLe8 {
  dominios: PuntajeDominio[];
  /** Promedio (entero) de los dominios con puntaje; ausente sin ningún dato. */
  total?: number;
  categoria?: CategoriaLe8;
  /** Cuántos dominios tienen puntaje (de 8). */
  conDato: number;
  /** Los ocho dominios con puntaje. */
  completo: boolean;
  /** Qué falta, por dominio sin puntaje. */
  faltantes: string[];
  /** Dominios por debajo de 50 (la meta del estadío 0 pide ninguno). */
  dominiosBajos: Le8Domain[];
}

const def = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
const noNegativo = (v: number): number => Math.max(0, v);

/**
 * Dieta: la AHA puntúa por quintil de adherencia (MEPA de 16 ítems: 15–16 = 100,
 * 12–14 = 80, 8–11 = 50, 4–7 = 25, 0–3 = 0). El portal usa el MEDAS de 13 criterios
 * que puntúan, así que se aplica la misma proporción sobre el total del instrumento.
 * PENDIENTE_VALIDACION: la conversión MEDAS → quintiles la definen nutrición y los
 * cardiólogos (decisión abierta n.º 10 del catálogo); el corte firmado es MEDAS ≥ 9 =
 * buena adherencia.
 */
export const LE8_DIETA_PENDIENTE_VALIDACION = true;
const DIETA_CORTES: ReadonlyArray<{ proporcion: number; puntaje: number }> = [
  { proporcion: 15 / 16, puntaje: 100 },
  { proporcion: 12 / 16, puntaje: 80 },
  { proporcion: 8 / 16, puntaje: 50 },
  { proporcion: 4 / 16, puntaje: 25 },
];

export function puntajeDieta(medasPuntos: number, medasTotal = 13): number {
  const proporcion = Math.min(1, Math.max(0, medasPuntos / medasTotal));
  return DIETA_CORTES.find((c) => proporcion >= c.proporcion - 1e-9)?.puntaje ?? 0;
}

export function puntajeActividad(minSemana: number): number {
  if (minSemana >= 150) return 100;
  if (minSemana >= 120) return 90;
  if (minSemana >= 90) return 80;
  if (minSemana >= 60) return 60;
  if (minSemana >= 30) return 40;
  if (minSemana >= 1) return 20;
  return 0;
}

/** undefined cuando es ex fumador sin el tiempo desde el abandono. */
export function puntajeNicotina(n: NicotinaLe8): number | undefined {
  let base: number | undefined;
  if (n.estado === 'actual') return 0;
  if (n.estado === 'nunca') base = 100;
  else if (n.tiempoSinFumar === '5-anios-o-mas') base = 75;
  else if (n.tiempoSinFumar === '1-a-5-anios') base = 50;
  else if (n.tiempoSinFumar === 'menos-1-anio') base = 25;
  if (base === undefined) return undefined;
  return n.humoAjenoEnCasa ? noNegativo(base - 20) : base;
}

export function puntajeSueno(horas: number): number {
  if (horas >= 7 && horas < 9) return 100;
  if (horas >= 9 && horas < 10) return 90;
  if (horas >= 6 && horas < 7) return 70;
  if ((horas >= 5 && horas < 6) || horas >= 10) return 40;
  if (horas >= 4 && horas < 5) return 20;
  return 0;
}

export function puntajeImc(imc: number): number {
  if (imc < 25) return 100;
  if (imc < 30) return 70;
  if (imc < 35) return 30;
  if (imc < 40) return 15;
  return 0;
}

export function puntajeLipidos(noHdl: number, tratado = false): number {
  let base: number;
  if (noHdl < 130) base = 100;
  else if (noHdl < 160) base = 60;
  else if (noHdl < 190) base = 40;
  else if (noHdl < 220) base = 20;
  else base = 0;
  return tratado ? noNegativo(base - 20) : base;
}

/**
 * Glucemia: sin diabetes puntúa la glucemia en ayunas o la HbA1c (la peor de las dos);
 * con diabetes puntúa sólo la HbA1c (undefined si falta).
 */
export function puntajeGlucemia(e: Pick<EntradaLe8, 'glucemiaAyunasMgDl' | 'hba1cPorcentaje' | 'diabetes'>): number | undefined {
  const { glucemiaAyunasMgDl: glu, hba1cPorcentaje: a1c } = e;
  const diabetes = e.diabetes === true || (def(glu) && glu >= 126) || (def(a1c) && a1c >= 6.5);
  if (diabetes) {
    if (!def(a1c)) return undefined;
    if (a1c < 7) return 40;
    if (a1c < 8) return 30;
    if (a1c < 9) return 20;
    if (a1c < 10) return 10;
    return 0;
  }
  if (!def(glu) && !def(a1c)) return undefined;
  const prediabetes = (def(glu) && glu >= 100) || (def(a1c) && a1c >= 5.7);
  return prediabetes ? 60 : 100;
}

/** Presión: con la sistólica alcanza; la diastólica, si está, puede bajar la banda. */
export function puntajePresion(sistolica: number, diastolica?: number, tratada = false): number {
  const dia = diastolica ?? 0;
  let base: number;
  if (sistolica >= 160 || dia >= 100) base = 0;
  else if (sistolica >= 140 || dia >= 90) base = 25;
  else if (sistolica >= 130 || dia >= 80) base = 50;
  else if (sistolica >= 120) base = 75;
  else base = 100;
  return tratada ? noNegativo(base - 20) : base;
}

const fmt = (v: number, decimales = 0): string => v.toFixed(decimales).replace('.', ',');

/** Puntaje LE8 por dominio y total con lo que haya; lo que falta se informa, no se inventa. */
export function puntajeLe8(e: EntradaLe8): ResultadoLe8 {
  const dominios: PuntajeDominio[] = [];

  if (def(e.medasPuntos)) {
    const total = e.medasTotal ?? 13;
    dominios.push({
      dominio: 'dieta',
      puntaje: puntajeDieta(e.medasPuntos, total),
      detalle: `MEDAS ${e.medasPuntos} de ${total}`,
      pendienteValidacion: LE8_DIETA_PENDIENTE_VALIDACION,
    });
  } else {
    dominios.push({ dominio: 'dieta', falta: 'cuestionario de alimentación (MEDAS)' });
  }

  if (def(e.actividadMinSemana)) {
    dominios.push({
      dominio: 'actividad-fisica',
      puntaje: puntajeActividad(e.actividadMinSemana),
      detalle: `${fmt(e.actividadMinSemana)} min/semana`,
    });
  } else {
    dominios.push({ dominio: 'actividad-fisica', falta: 'minutos de actividad por semana' });
  }

  if (e.nicotina) {
    const puntaje = puntajeNicotina(e.nicotina);
    const estado =
      e.nicotina.estado === 'nunca' ? 'nunca fumó' : e.nicotina.estado === 'actual' ? 'fuma o vapea' : 'ex fumador';
    dominios.push(
      puntaje === undefined
        ? { dominio: 'nicotina', falta: 'hace cuánto dejaste de fumar' }
        : { dominio: 'nicotina', puntaje, detalle: `${estado}${e.nicotina.humoAjenoEnCasa ? ', con humo ajeno en casa' : ''}` },
    );
  } else {
    dominios.push({ dominio: 'nicotina', falta: 'cuestionario de tabaco' });
  }

  if (def(e.suenoHoras)) {
    dominios.push({ dominio: 'sueno', puntaje: puntajeSueno(e.suenoHoras), detalle: `${fmt(e.suenoHoras, 1)} h por noche` });
  } else {
    dominios.push({ dominio: 'sueno', falta: 'horas de sueño' });
  }

  if (def(e.imc)) {
    dominios.push({ dominio: 'imc', puntaje: puntajeImc(e.imc), detalle: `IMC ${fmt(e.imc, 1)}` });
  } else {
    dominios.push({ dominio: 'imc', falta: 'peso y altura' });
  }

  const noHdl = def(e.noHdlMgDl)
    ? e.noHdlMgDl
    : def(e.colesterolTotalMgDl) && def(e.hdlMgDl)
      ? e.colesterolTotalMgDl - e.hdlMgDl
      : undefined;
  if (def(noHdl)) {
    dominios.push({
      dominio: 'lipidos',
      puntaje: puntajeLipidos(noHdl, e.tratamientoLipidos),
      detalle: `no-HDL ${fmt(noHdl)} mg/dL${e.tratamientoLipidos ? ', con tratamiento' : ''}`,
    });
  } else {
    dominios.push({ dominio: 'lipidos', falta: 'colesterol total y HDL' });
  }

  const glucemia = puntajeGlucemia(e);
  if (glucemia !== undefined) {
    const partes = [
      ...(def(e.glucemiaAyunasMgDl) ? [`glucemia ${fmt(e.glucemiaAyunasMgDl)} mg/dL`] : []),
      ...(def(e.hba1cPorcentaje) ? [`HbA1c ${fmt(e.hba1cPorcentaje, 1)} %`] : []),
    ];
    dominios.push({ dominio: 'glucemia', puntaje: glucemia, detalle: partes.join(', ') });
  } else {
    const conDiabetes = e.diabetes === true || (def(e.glucemiaAyunasMgDl) && e.glucemiaAyunasMgDl >= 126);
    dominios.push({ dominio: 'glucemia', falta: conDiabetes ? 'HbA1c' : 'glucemia en ayunas o HbA1c' });
  }

  if (def(e.sistolicaMmHg)) {
    dominios.push({
      dominio: 'presion-arterial',
      puntaje: puntajePresion(e.sistolicaMmHg, e.diastolicaMmHg, e.tratamientoPresion),
      detalle: `${fmt(e.sistolicaMmHg)}/${def(e.diastolicaMmHg) ? fmt(e.diastolicaMmHg) : '—'} mmHg${e.tratamientoPresion ? ', con tratamiento' : ''}`,
    });
  } else {
    dominios.push({ dominio: 'presion-arterial', falta: 'presión arterial' });
  }

  const conPuntaje = dominios.filter((d): d is PuntajeDominio & { puntaje: number } => def(d.puntaje));
  const total = conPuntaje.length
    ? Math.round(conPuntaje.reduce((s, d) => s + d.puntaje, 0) / conPuntaje.length)
    : undefined;

  return {
    dominios,
    total,
    categoria: total === undefined ? undefined : categoriaLe8(total),
    conDato: conPuntaje.length,
    completo: conPuntaje.length === LE8_DOMINIOS.length,
    faltantes: dominios.filter((d) => d.falta).map((d) => `${LE8_DOMINIO_LABEL[d.dominio]}: ${d.falta}`),
    dominiosBajos: conPuntaje.filter((d) => d.puntaje < LE8_CORTES.moderada).map((d) => d.dominio),
  };
}
