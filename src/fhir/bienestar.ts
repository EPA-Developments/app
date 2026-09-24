// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Plan Bienestar · 100 días — gamificación MVP (solo lectura).
//
// El progreso, los hitos y la racha se calculan client-side desde los datos FHIR que el
// paciente ya genera. La inscripción la detectamos así:
//   1. CarePlan del paciente con category `care-plans|plan-bienestar-100` (contrato con
//      recepcionistas: se crea al inscribir, con period de 100 días), o
//   2. fallback: Coverage activo cuyo plan-codigo contenga "BIENESTAR".
// Sin plan → `cargarPlanBienestar` devuelve undefined y la UI no muestra nada.
import type { MedplumClient } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { CarePlan, Coverage, Observation, Patient, QuestionnaireResponse } from '@medplum/fhirtypes';
import { measurementsMeta } from '../pages/health-record/Measurement.data';
import { PANEL_SYSTEM } from './biomarkers';
import { cargarMisSolicitudes } from './solicitudes';

/** CodeSystem canónico de planes de cuidado SOM (debe coincidir con recepcionistas). */
export const CARE_PLAN_SYSTEM = 'https://segundaopinionmedica.org/fhir/CodeSystem/care-plans';
/** Código del Plan Bienestar de 100 días dentro de ese CodeSystem. */
export const PLAN_BIENESTAR_CODE = 'plan-bienestar-100';

const PLAN_DIAS = 100;
const LE8_PREFIX = 'https://segundaopinionmedica.org/fhir/Questionnaire/le8-';
const CONSENT_TYPE = 'http://loinc.org|59284-0';
const DIA_MS = 24 * 60 * 60 * 1000;

/** Un hito del plan: cumplido o pendiente, con su pantalla asociada. */
export interface HitoBienestar {
  id: string;
  label: string;
  /** Qué gana el paciente al cumplirlo (texto corto). */
  descripcion: string;
  href: string;
  cumplido: boolean;
}

export interface PlanBienestar {
  /** Día actual del plan (1..100; puede superar 100 si terminó). */
  dia: number;
  totalDias: number;
  /** ISO de inicio y fin. */
  inicio: string;
  fin: string;
  terminado: boolean;
  hitos: HitoBienestar[];
  /** Semanas (lunes-domingo) con al menos un registro desde el inicio del plan. */
  semanasActivas: number;
  /** Racha de semanas activas consecutivas contando hacia atrás desde esta semana. */
  rachaActual: number;
}

/** Día del plan (1-based) para una fecha dada. */
export function diaDelPlan(inicio: Date, hoy: Date = new Date()): number {
  return Math.max(1, Math.floor((hoy.getTime() - inicio.getTime()) / DIA_MS) + 1);
}

/** Lunes 00:00 (hora local) de la semana de una fecha. */
function lunesDe(fecha: Date): number {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const offset = (d.getDay() + 6) % 7; // lunes=0 … domingo=6
  return d.getTime() - offset * DIA_MS;
}

/**
 * Semanas activas y racha actual a partir de fechas de actividad del paciente.
 * Una semana está activa si tiene ≥1 registro desde el inicio del plan; la racha cuenta
 * semanas activas consecutivas hacia atrás desde la semana actual (si la semana en curso
 * todavía no tiene actividad, arranca desde la anterior).
 */
export function calcularRachaSemanal(
  fechas: Date[],
  inicio: Date,
  hoy: Date = new Date()
): { semanasActivas: number; rachaActual: number } {
  const inicioMs = inicio.getTime();
  const semanas = new Set<number>();
  for (const f of fechas) {
    if (!Number.isNaN(f.getTime()) && f.getTime() >= inicioMs && f.getTime() <= hoy.getTime() + DIA_MS) {
      semanas.add(lunesDe(f));
    }
  }
  const semanaActual = lunesDe(hoy);
  let cursor = semanas.has(semanaActual) ? semanaActual : semanaActual - 7 * DIA_MS;
  let racha = 0;
  while (semanas.has(cursor)) {
    racha += 1;
    cursor -= 7 * DIA_MS;
  }
  return { semanasActivas: semanas.size, rachaActual: racha };
}

/** Detecta la inscripción: CarePlan canónico primero, Coverage "BIENESTAR" como fallback. */
function detectarInicio(carePlans: CarePlan[], coverages: Coverage[]): { inicio?: string; fin?: string } {
  const cp = carePlans.find(
    (c) =>
      c.status === 'active' &&
      c.category?.some((cat) => cat.coding?.some((k) => k.system === CARE_PLAN_SYSTEM && k.code === PLAN_BIENESTAR_CODE))
  );
  if (cp?.period?.start) {
    return { inicio: cp.period.start, fin: cp.period.end };
  }
  const cov = coverages.find(
    (c) =>
      c.status === 'active' &&
      c.extension?.some(
        (e) => e.url.endsWith('/plan-codigo') && (e.valueString ?? '').toUpperCase().includes('BIENESTAR')
      )
  );
  if (cov?.period?.start) {
    return { inicio: cov.period.start, fin: cov.period.end };
  }
  return {};
}

const VITAL_CODES = new Set(
  Object.values(measurementsMeta).flatMap((m) => [m.code, ...m.chartDatasets.map((d) => d.code ?? '')])
);

/**
 * Carga el Plan Bienestar del paciente con progreso, hitos y racha resueltos.
 * Devuelve undefined si el paciente no está inscripto.
 */
export async function cargarPlanBienestar(
  medplum: MedplumClient,
  patient: Patient
): Promise<PlanBienestar | undefined> {
  const ref = getReferenceString(patient);

  const [carePlans, coverages, observations, respuestas, consentimientos, solicitudesTurno, turnos] = await Promise.all([
    medplum.searchResources('CarePlan', `subject=${ref}&_count=20`),
    medplum.searchResources('Coverage', `beneficiary=${ref}&status=active&_count=20`),
    medplum.searchResources('Observation', `patient=${ref}&_sort=-date&_count=200`),
    medplum.searchResources('QuestionnaireResponse', `subject=${ref}&_sort=-authored&_count=100`),
    medplum.searchResources('DocumentReference', `subject=${ref}&type=${CONSENT_TYPE}&_count=1`),
    cargarMisSolicitudes(medplum, patient).catch(() => []),
    medplum.searchResources('Appointment', `patient=${ref}&_count=1`).catch(() => []),
  ]);

  const { inicio, fin } = detectarInicio(carePlans as CarePlan[], coverages as Coverage[]);
  if (!inicio) {
    return undefined;
  }

  const inicioDate = new Date(inicio);
  const finDate = fin ? new Date(fin) : new Date(inicioDate.getTime() + PLAN_DIAS * DIA_MS);
  const dia = diaDelPlan(inicioDate);
  const totalDias = Math.max(1, Math.round((finDate.getTime() - inicioDate.getTime()) / DIA_MS));

  const obs = observations as Observation[];
  const qrs = respuestas as QuestionnaireResponse[];
  const tieneBiomarcadores = obs.some((o) =>
    o.category?.some((cat) => cat.coding?.some((k) => k.system === PANEL_SYSTEM))
  );
  const tieneVitales = obs.some((o) => o.code?.coding?.some((k) => k.code && VITAL_CODES.has(k.code)));
  const tieneLE8 = qrs.some((r) => (r.questionnaire ?? '').startsWith(LE8_PREFIX));

  const hitos: HitoBienestar[] = [
    {
      id: 'consentimiento',
      label: 'Firmá el consentimiento',
      descripcion: 'Habilita tu atención en el plan.',
      href: '/health-record/consent',
      cumplido: consentimientos.length > 0,
    },
    {
      id: 'biomarcadores',
      label: 'Cargá tus primeros biomarcadores',
      descripcion: 'La base de datos de tu prevención.',
      href: '/health-record/biomarkers',
      cumplido: tieneBiomarcadores,
    },
    {
      id: 'vitales',
      label: 'Registrá tus signos vitales',
      descripcion: 'Presión, frecuencia, peso y altura.',
      href: '/health-record/vitals',
      cumplido: tieneVitales,
    },
    {
      id: 'le8',
      label: 'Respondé los cuestionarios de hábitos',
      descripcion: "Life's Essential 8: sueño, dieta, actividad y tabaco.",
      href: '/health-record/cuestionarios',
      cumplido: tieneLE8,
    },
    {
      // Las consultas son parte del plan: un pedido de turno o un turno ya dado cuentan.
      id: 'consulta',
      label: 'Reservá tu consulta',
      descripcion: 'Tu equipo revisa tus datos y ajusta tu plan.',
      href: '/get-care',
      cumplido: solicitudesTurno.length > 0 || turnos.length > 0,
    },
  ];

  // Actividad = cualquier registro que el propio paciente genera.
  const fechasActividad: Date[] = [
    ...obs.map((o) => new Date(o.effectiveDateTime ?? o.meta?.lastUpdated ?? '')),
    ...qrs.map((r) => new Date(r.authored ?? r.meta?.lastUpdated ?? '')),
  ];
  const { semanasActivas, rachaActual } = calcularRachaSemanal(fechasActividad, inicioDate);

  return {
    dia: Math.min(dia, totalDias),
    totalDias,
    inicio,
    fin: finDate.toISOString(),
    terminado: dia > totalDias,
    hitos,
    semanasActivas,
    rachaActual,
  };
}
