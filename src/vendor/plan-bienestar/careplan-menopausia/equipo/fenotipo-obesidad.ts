import type { Observation, QuestionnaireResponse } from '@medplum/fhirtypes';
import { LOINC } from '../terminology/loinc.js';
import { SYSTEM } from '../terminology/systems.js';
import type { Condicion } from '../model/catalogo.js';
import { condicionRegistrable } from './condiciones.js';
import { fechaDeRespuesta, INSTRUMENTOS_EQUIPO, puntuarInstrumento, ultimaRespuestaInstrumento } from './instrumentos.js';
import type { PerfilPersona } from './perfil.js';

/**
 * Fenotipo metabólico: metabólicamente sana o no sana, con los criterios estrictos de Smith GI,
 * Petersen MC, Hartig SM y Klein S (Nature Medicine, 2026, Box 1), firmados en la hoja de firma
 * médica el 30/10/2026:
 *
 *  - F1 (modificado el 30/10/2026 por la dirección del plan): con cualquier IMC. El IMC solo no
 *    alcanza para asumir salud metabólica (Fig. 1b: con IMC < 30 también varía la sensibilidad a
 *    la insulina). El nombre dice la categoría de peso: obesidad, sobrepeso o peso normal.
 *  - F2: los seis criterios del artículo; la grasa hepática por resonancia se reemplaza por la
 *    ecografía abdominal (registro `ecografiaHepatica`: sin esteatosis cumple). Sin ecografía,
 *    el resultado sale «parcial».
 *  - F3: sólo informativo. No cambia el estadío, las alertas ni las acciones.
 *  - F4: lo ve sólo el equipo.
 *
 * Cada valor se toma de los últimos 12 meses. Un criterio sin dato no cuenta como cumplido:
 * el resultado pasa a «sin datos», salvo la ecografía, que sólo lo vuelve parcial. Con un
 * criterio no cumplido alcanza para «no sana».
 */
export type ResultadoFenotipo = 'sana' | 'no-sana' | 'sin-datos';

export type ClaveCriterioFenotipo = 'enfermedades' | 'glucemia' | 'hba1c' | 'trigliceridos' | 'tg-hdl' | 'higado';

export interface CriterioFenotipo {
  clave: ClaveCriterioFenotipo;
  /** Cómo se nombra en la ficha. */
  label: string;
  umbral: string;
  /** undefined: sin dato en los últimos 12 meses. */
  cumple?: boolean;
  /** El valor tomado, como se muestra («96 mg/dL», «2,6»). */
  valor?: string;
}

/** Categoría de peso por el IMC de los últimos 12 meses (OMS). */
export type CategoriaPeso = 'bajo-peso' | 'normal' | 'sobrepeso' | 'obesidad';

export interface FenotipoObesidad {
  /** Siempre se calcula (F1 modificado): queda por compatibilidad con quien lo lea. */
  aplica: boolean;
  imc?: number;
  /** Sin IMC de los últimos 12 meses, sin categoría. */
  categoria?: CategoriaPeso;
  resultado?: ResultadoFenotipo;
  /** «Sana» sin la ecografía abdominal (F2). */
  parcial?: boolean;
  criterios: CriterioFenotipo[];
  /** Los criterios sin dato, por su nombre. */
  faltan: string[];
}

export const UMBRAL_OBESIDAD_IMC = 30;
const DIAS_VIGENCIA = 365;

/** Enfermedades que excluyen la obesidad metabólicamente sana (Box 1, i). */
const EXCLUYEN: readonly Condicion[] = ['ecv', 'coronaria', 'acv', 'eap', 'ic', 'fa', 'dm2', 'erc', 'hta', 'toma-antihipertensivo'];

function fechaDe(o: Observation): string {
  return (o.effectiveDateTime ?? o.effectivePeriod?.start ?? o.issued ?? '').slice(0, 10);
}

function desde(hoy: string): string {
  const d = new Date(`${hoy}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - DIAS_VIGENCIA);
  return d.toISOString().slice(0, 10);
}

/** El valor más reciente de un código LOINC en la ventana (también como componente). */
function ultimoValor(observations: Observation[], code: string, hoy: string): number | undefined {
  const limite = desde(hoy);
  let mejor: { fecha: string; valor: number } | undefined;
  for (const o of observations) {
    if (o.status === 'entered-in-error' || o.status === 'cancelled') continue;
    const fecha = fechaDe(o);
    if (!fecha || fecha < limite || fecha > hoy) continue;
    const esDirecta = (o.code?.coding ?? []).some((c) => c.system === SYSTEM.loinc && c.code === code);
    const valor = esDirecta
      ? o.valueQuantity?.value
      : (o.component ?? []).find((comp) => (comp.code?.coding ?? []).some((c) => c.system === SYSTEM.loinc && c.code === code))
          ?.valueQuantity?.value;
    if (valor === undefined) continue;
    if (!mejor || fecha >= mejor.fecha) mejor = { fecha, valor };
  }
  return mejor?.valor;
}

export function categoriaPeso(imc: number): CategoriaPeso {
  if (imc >= UMBRAL_OBESIDAD_IMC) return 'obesidad';
  if (imc >= 25) return 'sobrepeso';
  if (imc >= 18.5) return 'normal';
  return 'bajo-peso';
}

/** El nombre del fenotipo según el peso: «Obesidad metabólicamente sana», «Peso normal metabólicamente no sano»… */
function nombreFenotipo(categoria: CategoriaPeso | undefined, sana: boolean): string {
  const estado = (femenino: boolean): string =>
    `metabólicamente ${sana ? '' : 'no '}${femenino ? 'sana' : 'sano'}`;
  switch (categoria) {
    case 'obesidad':
      return `Obesidad ${estado(true)}`;
    case 'sobrepeso':
      return `Sobrepeso ${estado(false)}`;
    case 'normal':
      return `Peso normal ${estado(false)}`;
    case 'bajo-peso':
      return `Bajo peso ${estado(false)}`;
    default:
      return `Perfil ${estado(false)} (sin IMC de los últimos 12 meses)`;
  }
}

const coma = (n: number, decimales = 1): string => n.toFixed(decimales).replace('.', ',').replace(/,0$/, '');

export function fenotipoObesidad(ctx: {
  persona: PerfilPersona;
  observations: Observation[];
  questionnaireResponses: QuestionnaireResponse[];
  hoy?: string;
}): FenotipoObesidad {
  const hoy = ctx.hoy ?? ctx.persona.hoy;
  const obs = ctx.observations;
  const imc = ultimoValor(obs, LOINC.bmi.code!, hoy);
  const categoria = imc === undefined ? undefined : categoriaPeso(imc);

  const glucemia = ultimoValor(obs, LOINC.fastingGlucose.code!, hoy);
  const hba1c = ultimoValor(obs, LOINC.hba1c.code!, hoy);
  const tg = ultimoValor(obs, LOINC.triglycerides.code!, hoy);
  const hdl = ultimoValor(obs, LOINC.hdlCholesterol.code!, hoy);
  const enfermedades = ctx.persona.condiciones.filter((c) => EXCLUYEN.includes(c));

  const eco = ultimaRespuestaInstrumento(ctx.questionnaireResponses, INSTRUMENTOS_EQUIPO.ecografiaHepatica);
  const fechaEco = eco ? (fechaDeRespuesta(eco) ?? '').slice(0, 10) : '';
  const ecoVigente = eco && fechaEco >= desde(hoy) && fechaEco <= hoy ? puntuarInstrumento('ecografiaHepatica', eco) : undefined;

  const criterios: CriterioFenotipo[] = [
    {
      clave: 'enfermedades',
      label: 'Sin enfermedad cardiovascular, diabetes tipo 2, enfermedad renal crónica ni hipertensión',
      umbral: 'Ninguna registrada',
      cumple: enfermedades.length === 0,
      ...(enfermedades.length ? { valor: enfermedades.map((c) => condicionRegistrable(c)?.label ?? c).join(', ') } : {}),
    },
    {
      clave: 'glucemia',
      label: 'Glucemia en ayunas',
      umbral: '≤ 89 mg/dL',
      ...(glucemia !== undefined ? { cumple: glucemia <= 89, valor: `${coma(glucemia, 0)} mg/dL` } : {}),
    },
    {
      clave: 'hba1c',
      label: 'HbA1c',
      umbral: '≤ 5,4 %',
      ...(hba1c !== undefined ? { cumple: hba1c <= 5.4, valor: `${coma(hba1c)} %` } : {}),
    },
    {
      clave: 'trigliceridos',
      label: 'Triglicéridos',
      umbral: '< 95 mg/dL',
      ...(tg !== undefined ? { cumple: tg < 95, valor: `${coma(tg, 0)} mg/dL` } : {}),
    },
    {
      clave: 'tg-hdl',
      label: 'Triglicéridos/HDL',
      umbral: '< 2,0',
      ...(tg !== undefined && hdl !== undefined && hdl > 0 ? { cumple: tg / hdl < 2, valor: coma(tg / hdl) } : {}),
    },
    {
      clave: 'higado',
      label: 'Hígado graso en la ecografía abdominal',
      umbral: 'Sin esteatosis',
      ...(ecoVigente?.puntaje !== undefined ? { cumple: ecoVigente.puntaje === 0, valor: ecoVigente.detalle } : {}),
    },
  ];

  const faltan = criterios.filter((c) => c.cumple === undefined).map((c) => c.label);
  const algunoNo = criterios.some((c) => c.cumple === false);
  const faltaSoloHigado = faltan.length === 1 && criterios.find((c) => c.clave === 'higado')?.cumple === undefined;
  const resultado: ResultadoFenotipo = algunoNo ? 'no-sana' : faltan.length === 0 || faltaSoloHigado ? 'sana' : 'sin-datos';
  return {
    aplica: true,
    ...(imc !== undefined ? { imc } : {}),
    ...(categoria ? { categoria } : {}),
    resultado,
    ...(resultado === 'sana' && faltaSoloHigado ? { parcial: true } : {}),
    criterios,
    faltan,
  };
}

/** Lo que muestra la ficha (textos firmados el 30/10/2026; F1 con cualquier IMC). */
export function textoFenotipoObesidad(f: FenotipoObesidad): { titulo: string; detalle: string; nota?: string } | undefined {
  if (!f.resultado) return undefined;
  const fuente = 'criterios estrictos (Smith y Klein, 2026)';
  if (f.resultado === 'sana') {
    return {
      titulo: `${nombreFenotipo(f.categoria, true)} · ${fuente}`,
      detalle: f.parcial
        ? 'Cumple los 5 criterios disponibles; falta la ecografía abdominal (resultado parcial).'
        : 'Cumple los 6 criterios.',
      // El hallazgo sobre el descenso de peso es de la obesidad metabólicamente sana.
      ...(f.categoria === 'obesidad'
        ? {
            nota:
              'En la obesidad metabólicamente sana, bajar de peso no mejora la sensibilidad a la insulina, que ya es normal. ' +
              'Sigue indicado para lo no metabólico (articulaciones, apnea, calidad de vida) y cuando hay valores en el límite alto de lo normal.',
          }
        : {}),
    };
  }
  if (f.resultado === 'no-sana') {
    const noCumple = f.criterios.filter((c) => c.cumple === false).map(motivoNoCumple);
    return {
      titulo: `${nombreFenotipo(f.categoria, false)} · ${fuente}`,
      detalle: `No cumple: ${noCumple.join(', ')}.`,
      ...(f.categoria && f.categoria !== 'obesidad'
        ? { nota: 'Con un IMC menor a 30 también puede haber disfunción metabólica: el IMC solo no alcanza para asumir salud metabólica.' }
        : {}),
    };
  }
  return { titulo: 'Fenotipo metabólico: sin datos suficientes', detalle: `Faltan: ${f.faltan.join(', ')} (de los últimos 12 meses).` };
}

/** Por qué un criterio no se cumple, con el valor y el umbral («glucemia en ayunas 96 mg/dL (> 89)»). */
function motivoNoCumple(c: CriterioFenotipo): string {
  switch (c.clave) {
    case 'enfermedades':
      return `diagnóstico registrado (${c.valor ?? ''})`;
    case 'glucemia':
      return `glucemia en ayunas ${c.valor} (> 89)`;
    case 'hba1c':
      return `HbA1c ${c.valor} (> 5,4 %)`;
    case 'trigliceridos':
      return `triglicéridos ${c.valor} (≥ 95)`;
    case 'tg-hdl':
      return `triglicéridos/HDL ${c.valor} (≥ 2,0)`;
    case 'higado':
      return `ecografía con ${(c.valor ?? 'esteatosis').toLowerCase()}`;
  }
}
