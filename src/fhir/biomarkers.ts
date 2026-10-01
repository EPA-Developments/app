// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Puente entre el portal y el catálogo de biomarcadores (laboratorio de rutina) del
// servidor. Los analitos viven en Medplum como ObservationDefinition
// (EPA-Developments/recepcionistas, src/config/biomarcadores.ts): códigos, panel, nivel
// (esencial/extensivo), unidad y rango de guía por sexo. Solo rangos convencionales; si la
// guía no fija uno, vale el del laboratorio de cada informe (Observation.referenceRange).
import type { MedplumClient } from '@medplum/core';
import type { Observation, ObservationDefinition, ObservationReferenceRange } from '@medplum/fhirtypes';
import type {
  Biomarker,
  BiomarkerCoding,
  BiomarkerRange,
  NivelLaboratorio,
  PatientSex,
  SexRanges,
} from '../pages/health-record/Biomarkers.data';
import { resolveBiomarkerRanges } from '../pages/health-record/Biomarkers.data';

/** CodeSystems canónicos de Segunda Opinión Médica (deben coincidir con el modelo FHIR en Medplum). */
export const PANEL_SYSTEM = 'https://segundaopinionmedica.org/fhir/CodeSystem/panel-biomarcador';
export const TIPO_RANGO_SYSTEM = 'https://segundaopinionmedica.org/fhir/CodeSystem/tipo-rango';
export const BIOMARKER_SYSTEM = 'https://segundaopinionmedica.org/fhir/CodeSystem/biomarker';
export const NIVEL_SYSTEM = 'https://segundaopinionmedica.org/fhir/CodeSystem/nivel-laboratorio';
export const ANALITO_SYSTEM = 'https://segundaopinionmedica.org/fhir/Identifier/analito';
export const EXT_CUENTA_COMO = 'https://segundaopinionmedica.org/fhir/StructureDefinition/cuenta-como';
export const LOINC = 'http://loinc.org';
export const UCUM = 'http://unitsofmeasure.org';
export const CATEGORIA_OBSERVACION_SYSTEM = 'http://terminology.hl7.org/CodeSystem/observation-category';

/** Ventana del laboratorio de rutina: los esenciales se piden una vez por año. */
export const MESES_LABORATORIO_RUTINA = 12;

/** Rangos de guía de un analito publicados por el servidor (ObservationDefinition.qualifiedInterval). */
export interface ServerBiomarkerRanges {
  conventional?: BiomarkerRange;
  male?: SexRanges;
  female?: SexRanges;
}

/** Los rangos `convencional` de una ObservationDefinition, por sexo (se ignora cualquier otro tipo). */
export function parseObservationDefinition(od: ObservationDefinition): ServerBiomarkerRanges {
  const out: {
    conventional?: BiomarkerRange;
    male?: { conventional?: BiomarkerRange };
    female?: { conventional?: BiomarkerRange };
  } = {};
  for (const iv of od.qualifiedInterval ?? []) {
    const tipo = iv.context?.coding?.find((c) => c.system === TIPO_RANGO_SYSTEM)?.code;
    if (tipo !== 'convencional') {
      continue;
    }
    const range: BiomarkerRange = { low: iv.range?.low?.value, high: iv.range?.high?.value };
    if (iv.gender === 'male') {
      (out.male ??= {}).conventional = range;
    } else if (iv.gender === 'female') {
      (out.female ??= {}).conventional = range;
    } else {
      out.conventional = range;
    }
  }
  return out;
}

/** Biomarcador publicado por el servidor: el del portal más su panel. */
export interface ServerBiomarker extends Biomarker {
  readonly panel?: string;
}

const deCategoria = (od: ObservationDefinition, system: string): string | undefined =>
  od.category?.flatMap((c) => c.coding ?? []).find((c) => c.system === system)?.code;

/** Mapea una ObservationDefinition al biomarcador del portal (panel y nivel desde category, nombre desde code). */
export function parseServerBiomarker(od: ObservationDefinition): ServerBiomarker | undefined {
  const coding = od.code?.coding?.[0];
  const code = coding?.code;
  if (!code) {
    return undefined;
  }
  const codings: BiomarkerCoding[] = (od.code?.coding ?? [])
    .filter((c): c is typeof c & { code: string } => Boolean(c.code))
    .map((c) => ({ system: c.system, code: c.code }));
  const nivel = deCategoria(od, NIVEL_SYSTEM);
  const unit = od.quantitativeDetails?.unit?.coding?.[0]?.code ?? od.quantitativeDetails?.unit?.text ?? '';
  const unitText = od.quantitativeDetails?.unit?.text;
  const slug = od.identifier?.find((i) => i.system === ANALITO_SYSTEM)?.value;
  const cuentaComo = od.extension?.find((e) => e.url === EXT_CUENTA_COMO)?.valueString;
  return {
    code,
    system: coding?.system,
    codings,
    title: coding?.display ?? od.code?.text ?? code,
    unit,
    ...(unitText && unitText !== unit ? { unitText } : {}),
    description: '',
    panel: deCategoria(od, PANEL_SYSTEM) ?? od.category?.[0]?.coding?.[0]?.code,
    ...(nivel === 'esencial' || nivel === 'extensivo' ? { nivel: nivel as NivelLaboratorio } : {}),
    ...(slug ? { slug } : {}),
    ...(cuentaComo ? { cuentaComo } : {}),
    ...parseObservationDefinition(od),
  };
}

/** Trae todos los biomarcadores publicados por el servidor (ObservationDefinition). */
export async function fetchServerBiomarkers(medplum: MedplumClient): Promise<ServerBiomarker[]> {
  const defs = await medplum.searchResources('ObservationDefinition', '_count=500');
  return defs.map(parseServerBiomarker).filter((b): b is ServerBiomarker => b !== undefined);
}

/** Todos los códigos del analito (el principal y sus equivalentes). */
export function codigosDe(bm: Biomarker): string[] {
  return bm.codings?.length ? bm.codings.map((c) => c.code) : [bm.code];
}

/** Las Observation de un analito: las que tienen cualquiera de sus códigos. */
export function observacionesDe(bm: Biomarker, observaciones: Observation[]): Observation[] {
  const codigos = new Set(codigosDe(bm));
  return observaciones.filter((o) => o.code?.coding?.some((c) => c.code !== undefined && codigos.has(c.code)));
}

/** La unidad como la lee la paciente. */
export function unidadVisible(bm: Biomarker): string {
  return bm.unitText ?? bm.unit;
}

/** El rango que informó el laboratorio en la Observation (no uno de otro tipo que haya cargado el portal). */
export function rangoDelLaboratorio(obs: Observation | undefined): (BiomarkerRange & { text?: string }) | undefined {
  const r = obs?.referenceRange?.find(
    (x: ObservationReferenceRange) =>
      !x.type?.coding?.some((c) => c.system === TIPO_RANGO_SYSTEM) &&
      (x.low?.value !== undefined || x.high?.value !== undefined || x.text)
  );
  if (!r) {
    return undefined;
  }
  return {
    ...(r.low?.value !== undefined ? { low: r.low.value } : {}),
    ...(r.high?.value !== undefined ? { high: r.high.value } : {}),
    ...(r.text ? { text: r.text } : {}),
  };
}

/** El rango con el que se juzga un valor: el de la guía si hay; si no, el del laboratorio de ese informe. */
export function rangoAplicable(
  bm: Biomarker,
  sex: PatientSex,
  obs?: Observation
): { rango: BiomarkerRange & { text?: string }; fuente: 'guia' | 'laboratorio' } | undefined {
  const { conventional } = resolveBiomarkerRanges(bm, sex);
  if (conventional && (conventional.low !== undefined || conventional.high !== undefined)) {
    return { rango: conventional, fuente: 'guia' };
  }
  const delLaboratorio = rangoDelLaboratorio(obs);
  return delLaboratorio ? { rango: delLaboratorio, fuente: 'laboratorio' } : undefined;
}

/** Semáforo de un valor: verde dentro del rango, rojo fuera, gris sin valor o sin rango numérico. */
export function semaforo(valor: number | undefined, rango: BiomarkerRange | undefined): 'green' | 'red' | 'gray' {
  if (valor === undefined || !rango || (rango.low === undefined && rango.high === undefined)) {
    return 'gray';
  }
  const dentro = (rango.low === undefined || valor >= rango.low) && (rango.high === undefined || valor <= rango.high);
  return dentro ? 'green' : 'red';
}

/** "> 90 mL/min/1,73 m²", "131 mg/dL", "No reactivo" o undefined si no hay resultado. */
export function textoValor(obs: Observation | undefined, unidad: string): string | undefined {
  const q = obs?.valueQuantity;
  if (q?.value !== undefined) {
    const comparador = q.comparator ? `${q.comparator} ` : '';
    return `${comparador}${q.value}${unidad ? ` ${unidad}` : ''}`;
  }
  return obs?.valueString || undefined;
}

/** "≥ 60", "0,5 – 1,1", "≤ 200" o el texto del laboratorio. */
export function textoRango(rango: (BiomarkerRange & { text?: string }) | undefined): string {
  if (!rango) {
    return '—';
  }
  const n = (v: number): string => v.toLocaleString('es-AR');
  if (rango.low !== undefined && rango.high !== undefined) {
    return `${n(rango.low)} – ${n(rango.high)}`;
  }
  if (rango.low !== undefined) {
    return `≥ ${n(rango.low)}`;
  }
  if (rango.high !== undefined) {
    return `≤ ${n(rango.high)}`;
  }
  return rango.text ?? '—';
}

/** Los esenciales del laboratorio de rutina (los que "cuentan como" otro se cuentan en aquel). */
export function esencialesRequeridos(catalogo: readonly Biomarker[]): Biomarker[] {
  return catalogo.filter((b) => b.nivel === 'esencial' && !b.cuentaComo);
}

/** Todos los códigos que cubren a un esencial: los suyos y los de los analitos que cuentan como él. */
export function codigosQueCubren(requerido: Biomarker, catalogo: readonly Biomarker[]): string[] {
  const alternativas = requerido.slug ? catalogo.filter((b) => b.cuentaComo === requerido.slug) : [];
  return [requerido, ...alternativas].flatMap(codigosDe);
}

/** Los esenciales sin ningún resultado entre las Observation dadas (ya filtradas por fecha). */
export function esencialesFaltantes(
  catalogo: readonly Biomarker[],
  observaciones: Observation[]
): { requeridos: Biomarker[]; faltan: Biomarker[] } {
  const presentes = new Set(
    observaciones
      .filter((o) => o.status !== 'entered-in-error' && (o.valueQuantity?.value !== undefined || o.valueString))
      .flatMap((o) => o.code?.coding?.map((c) => c.code) ?? [])
  );
  const requeridos = esencialesRequeridos(catalogo);
  const faltan = requeridos.filter((r) => !codigosQueCubren(r, catalogo).some((c) => presentes.has(c)));
  return { requeridos, faltan };
}

/** AAAA-MM-DD de hace `meses` meses. */
export function fechaDesde(meses: number, hoy: Date = new Date()): string {
  const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - meses, hoy.getUTCDate()));
  return d.toISOString().slice(0, 10);
}

/** La Observation de un valor que carga la paciente a mano (preliminar hasta que la valide su equipo). */
export function observacionCargada(
  bm: Biomarker,
  panel: { id: string; title: string },
  valor: number,
  fecha: string,
  paciente: NonNullable<Observation['subject']>,
  sex: PatientSex
): Observation {
  const { conventional } = resolveBiomarkerRanges(bm, sex);
  const qty = (v: number): Observation['valueQuantity'] => ({
    value: v,
    unit: unidadVisible(bm),
    system: UCUM,
    code: bm.unit,
  });
  const codings = bm.codings?.length ? bm.codings : [{ system: bm.system ?? LOINC, code: bm.code }];
  return {
    resourceType: 'Observation',
    status: 'preliminary',
    category: [
      { coding: [{ system: CATEGORIA_OBSERVACION_SYSTEM, code: 'laboratory', display: 'Laboratory' }] },
      { coding: [{ system: PANEL_SYSTEM, code: panel.id, display: panel.title }] },
    ],
    subject: paciente,
    effectiveDateTime: fecha,
    // Todos los códigos del analito: así lo encuentra cada lector (eGFR: 62238-1 para hGraph,
    // 33914-3 para el Plan Bienestar).
    code: {
      coding: codings.map((c) => ({ system: c.system ?? LOINC, code: c.code, display: bm.title })),
      text: bm.title,
    },
    valueQuantity: qty(valor),
    ...(conventional && (conventional.low !== undefined || conventional.high !== undefined)
      ? {
          referenceRange: [
            {
              ...(conventional.low !== undefined ? { low: qty(conventional.low) } : {}),
              ...(conventional.high !== undefined ? { high: qty(conventional.high) } : {}),
              type: { coding: [{ system: TIPO_RANGO_SYSTEM, code: 'convencional' }] },
            },
          ],
        }
      : {}),
  };
}
