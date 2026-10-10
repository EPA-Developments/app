// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Los datos de la Home E, cargados UNA sola vez y pasados por props a cada sección (la
// página es un solo árbol responsive: si cada tarjeta consultara lo suyo, se repetirían
// las consultas).
//  - LE8 (hoy y día 0) y el estadio CKM del plan: hook `useTableroLe8` del vendor.
//  - El estadio CKM estimado con sus datos, si el plan no trae uno: hook `useCkm`.
//  - PREVENT estimado con sus datos (sin revisión médica): hook `useRiesgoPrevent`, el mismo
//    cálculo que muestra la Home clásica.
//  - El resto, en un solo efecto con `Promise.allSettled`: el Plan Bienestar, la Segunda
//    Opinión más reciente (y su PREVENT si está firmada), el último PDF de laboratorio, el
//    equipo, las novedades sin leer, el consentimiento y el cuestionario de ingreso. Si una
//    consulta falla, la Home sigue sin ese dato.
// La combinación es pura (`armarDatosHomeE`, `cargasHomeE`) y se prueba sin red.
import type { CkmStage, EstadioCkm } from '@epa/careplan-menopausia';
import { useCkm, useRiesgoPrevent, useTableroLe8 } from '@epa/plan-bienestar-react';
import type { Ckm, RiesgoPrevent, TableroLe8Estado } from '@epa/plan-bienestar-react';
import type { MedplumClient, ProfileResource } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type {
  Appointment,
  DiagnosticReport,
  DocumentReference,
  Patient,
  QuestionnaireResponse,
  ServiceRequest,
} from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { useEffect, useMemo, useState } from 'react';
import type { PlanBienestar } from '../../fhir/bienestar';
import { cargarPlanBienestar } from '../../fhir/bienestar';
import { buscarConsentimiento, consentimientoAlDia } from '../../fhir/consentimiento';
import type { EquipoDeSalud } from '../../fhir/equipo';
import { cargarEquipoDeSalud } from '../../fhir/equipo';
import { cargarEstudiosEnviados, estadoEstudio } from '../../fhir/estudios';
import { hoyArgentina } from '../../fhir/glp1';
import { buscarUltimoIngreso } from '../../fhir/ingreso';
import { contarNoLeidas } from '../../fhir/notificaciones';
import { esTeleconsulta } from '../../fhir/teleconsulta';
import type { PreventValores } from '../../fhir/som';
import { cargarInformeSOM, cargarMisSolicitudesSOM, ESTADO_SOM, extractPrevent } from '../../fhir/som';
import { VERSION_CONSENTIMIENTO } from '../health-record/InformedConsent.data';
import type {
  DatosHomeE,
  EstadioCkmHome,
  EstadoConsentimiento,
  LaboratorioHome,
  PreventEstimado,
  PreventFirmado,
  ProximoTurno,
  SegundaOpinionHome,
} from './tipos';

// ─── Traducciones puras ──────────────────────────────────────────────────────────────

const ESTADIO_NUMERO: Record<EstadioCkm, EstadioCkmHome['estadio']> = { '0': 0, '1': 1, '2': 2, '3': 3, '4': 4 };

/** El estadio CKM de la Home: el del plan (lo registró el equipo) o, si no hay, el estimado. */
export function estadioCkmHome(
  delPlan: EstadioCkm | undefined,
  estimado: CkmStage | undefined
): EstadioCkmHome | undefined {
  if (delPlan !== undefined) {
    return { estadio: ESTADIO_NUMERO[delPlan], origen: 'plan' };
  }
  return estimado === undefined ? undefined : { estadio: estimado, origen: 'estimado' };
}

/** La Segunda Opinión más reciente, como la muestra la Home (ESTADO_SOM para la etiqueta). */
export function segundaOpinionHome(sr: ServiceRequest | undefined): SegundaOpinionHome | undefined {
  if (!sr?.id) {
    return undefined;
  }
  let estado: SegundaOpinionHome['estado'] = 'otro';
  if (sr.status === 'active') {
    estado = 'en-analisis';
  } else if (sr.status === 'completed') {
    estado = 'completada';
  }
  return {
    id: sr.id,
    estado,
    etiqueta: (ESTADO_SOM[sr.status] ?? ESTADO_SOM.unknown).label,
    pedida: sr.authoredOn,
    actualizada: sr.meta?.lastUpdated,
  };
}

/** Sin documento, falta; firmado con otra versión del texto, desactualizado. */
export function estadoConsentimiento(doc: DocumentReference | undefined): EstadoConsentimiento {
  if (!doc) {
    return 'falta';
  }
  return consentimientoAlDia(doc, VERSION_CONSENTIMIENTO) ? 'firmado' : 'desactualizado';
}

/** El PREVENT del informe firmado, solo si trae al menos un valor. */
export function preventFirmado(valores: PreventValores): PreventFirmado | undefined {
  const { ascvd10, hf10, total30 } = valores;
  const hayValor = [ascvd10, hf10, total30].some((v) => typeof v === 'number' && Number.isFinite(v));
  return hayValor ? { ascvd10, hf10, total30 } : undefined;
}

/**
 * El último PDF de laboratorio y qué hizo el agente con él. `informe` es el DiagnosticReport
 * que sumó el bot (si se pudo leer): la revisión médica cuenta solo si está `final` y tiene
 * `resultsInterpreter`.
 */
export function laboratorioHome(doc: DocumentReference, informe?: DiagnosticReport): LaboratorioHome {
  const estado = estadoEstudio(doc);
  if (estado.estado === 'en-proceso') {
    return { estado: 'en-proceso', fecha: doc.date, revisionMedica: false };
  }
  return {
    estado: 'procesado',
    fecha: doc.date,
    informeId: estado.informeId,
    valores: informe ? (informe.result?.length ?? 0) : undefined,
    revisionMedica: informe?.status === 'final' && (informe.resultsInterpreter?.length ?? 0) > 0,
  };
}

// ─── Cargas ──────────────────────────────────────────────────────────────────────────

interface SegundaOpinionYPrevent {
  readonly segundaOpinion?: SegundaOpinionHome;
  readonly prevent?: PreventFirmado;
}

/** La Segunda Opinión más reciente (la primera: vienen por fecha de pedido) y, si está completada, su PREVENT. */
async function cargarSegundaOpinion(medplum: MedplumClient, patient: Patient): Promise<SegundaOpinionYPrevent> {
  const [ultima] = await cargarMisSolicitudesSOM(medplum, patient);
  const segundaOpinion = segundaOpinionHome(ultima);
  if (!ultima || segundaOpinion?.estado !== 'completada') {
    return { segundaOpinion };
  }
  // Sin el informe, la Segunda Opinión igual se muestra (sin PREVENT).
  const informe = await cargarInformeSOM(medplum, ultima).catch(() => undefined);
  return { segundaOpinion, prevent: informe ? preventFirmado(extractPrevent(informe.risk)) : undefined };
}

/** El último PDF de laboratorio; si ya está procesado, con el DiagnosticReport que creó el bot. */
async function cargarLaboratorio(medplum: MedplumClient, patient: Patient): Promise<LaboratorioHome | undefined> {
  const [ultimo] = await cargarEstudiosEnviados(medplum, patient);
  if (!ultimo) {
    return undefined;
  }
  const estado = estadoEstudio(ultimo);
  const informe =
    estado.estado === 'procesado'
      ? await medplum.readResource('DiagnosticReport', estado.informeId).catch(() => undefined)
      : undefined;
  return laboratorioHome(ultimo, informe);
}

/** Estados de un turno que ya no va a pasar (o ya pasó). */
const TURNO_TERMINADO = new Set<Appointment['status']>(['cancelled', 'noshow', 'fulfilled', 'entered-in-error']);

/**
 * El próximo turno: el Appointment que todavía no terminó (su fin, o su inicio, es ahora o
 * después) y que no está cancelado ni realizado; el más cercano. Pura (el mismo criterio que
 * «Mis turnos», src/pages/MyAppointments.tsx).
 */
export function proximoTurnoDe(turnos: readonly Appointment[], ahora: Date = new Date()): ProximoTurno | undefined {
  const proximo = turnos
    .filter((a) => a.id && a.start && !TURNO_TERMINADO.has(a.status))
    .filter((a) => Date.parse(a.end ?? (a.start as string)) >= ahora.getTime())
    .sort((a, b) => Date.parse(a.start as string) - Date.parse(b.start as string))[0];
  return proximo?.id && proximo.start
    ? { id: proximo.id, inicio: proximo.start, teleconsulta: esTeleconsulta(proximo) }
    : undefined;
}

/** Los turnos de la paciente desde ayer (los de hoy pueden estar en curso). */
async function cargarProximoTurno(
  medplum: MedplumClient,
  patient: Patient,
  hoy: string
): Promise<ProximoTurno | undefined> {
  const desde = new Date(Date.parse(`${hoy}T00:00:00Z`) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const turnos = await medplum.searchResources(
    'Appointment',
    { patient: getReferenceString(patient) ?? '', date: `ge${desde}`, _sort: 'date', _count: '20' },
    { cache: 'no-cache' }
  );
  return proximoTurnoDe(turnos);
}

/** Lo que devuelve cada consulta del efecto, tal como lo deja `Promise.allSettled`. */
export interface ResultadosHomeE {
  readonly plan: PromiseSettledResult<PlanBienestar | undefined>;
  readonly segundaOpinion: PromiseSettledResult<SegundaOpinionYPrevent>;
  readonly laboratorio: PromiseSettledResult<LaboratorioHome | undefined>;
  readonly equipo: PromiseSettledResult<EquipoDeSalud>;
  readonly novedadesSinLeer: PromiseSettledResult<number>;
  readonly consentimiento: PromiseSettledResult<DocumentReference | undefined>;
  readonly ingreso: PromiseSettledResult<QuestionnaireResponse | undefined>;
  /** Opcional: si falta o falló, la Home no sabe de turnos (y ofrece reservar). */
  readonly turno?: PromiseSettledResult<ProximoTurno | undefined>;
}

/** Lo que trajo el efecto, ya traducido para la Home. */
export interface CargasHomeE {
  readonly plan?: PlanBienestar;
  readonly segundaOpinion?: SegundaOpinionHome;
  readonly prevent?: PreventFirmado;
  readonly laboratorio?: LaboratorioHome;
  readonly equipo?: EquipoDeSalud;
  readonly novedadesSinLeer: number;
  readonly consentimiento: EstadoConsentimiento;
  readonly fechaConsentimiento?: string;
  readonly ingresoPendiente: boolean;
  readonly proximoTurno?: ProximoTurno;
}

/** Mientras el efecto no terminó: nada que pedir ni que avisar todavía. */
const CARGAS_PENDIENTES: CargasHomeE = { consentimiento: 'cargando', ingresoPendiente: false, novedadesSinLeer: 0 };

function valor<T>(resultado: PromiseSettledResult<T>): T | undefined {
  return resultado.status === 'fulfilled' ? resultado.value : undefined;
}

/**
 * Traduce los resultados del efecto. Una consulta que falló queda sin dato, sin inventar
 * nada: el consentimiento queda en `cargando` (no se sabe si firmó: ni se le pide firmar de
 * nuevo ni se afirma que firmó) y el ingreso no figura pendiente.
 */
export function cargasHomeE(r: ResultadosHomeE): CargasHomeE {
  const som = valor(r.segundaOpinion);
  const consentimiento = r.consentimiento.status === 'fulfilled' ? r.consentimiento.value : undefined;
  return {
    plan: valor(r.plan),
    segundaOpinion: som?.segundaOpinion,
    prevent: som?.prevent,
    laboratorio: valor(r.laboratorio),
    equipo: valor(r.equipo),
    novedadesSinLeer: valor(r.novedadesSinLeer) ?? 0,
    consentimiento: r.consentimiento.status === 'fulfilled' ? estadoConsentimiento(consentimiento) : 'cargando',
    fechaConsentimiento: consentimiento?.date,
    ingresoPendiente: r.ingreso.status === 'fulfilled' && r.ingreso.value === undefined,
    proximoTurno: r.turno ? valor(r.turno) : undefined,
  };
}

/** Todas las consultas del efecto, en paralelo; ninguna tumba a las demás. */
export async function cargarHomeE(
  medplum: MedplumClient,
  patient: Patient,
  hoy: string = hoyArgentina()
): Promise<CargasHomeE> {
  const recipient = getReferenceString(patient);
  const [plan, segundaOpinion, laboratorio, equipo, novedadesSinLeer, consentimiento, ingreso, turno] =
    await Promise.allSettled([
      cargarPlanBienestar(medplum, patient),
      cargarSegundaOpinion(medplum, patient),
      cargarLaboratorio(medplum, patient),
      cargarEquipoDeSalud(medplum, patient),
      recipient ? contarNoLeidas(medplum, recipient) : Promise.resolve(0),
      buscarConsentimiento(medplum, patient),
      buscarUltimoIngreso(medplum, patient),
      cargarProximoTurno(medplum, patient, hoy),
    ]);
  return cargasHomeE({ plan, segundaOpinion, laboratorio, equipo, novedadesSinLeer, consentimiento, ingreso, turno });
}

// ─── Combinación ─────────────────────────────────────────────────────────────────────

export interface EntradaHomeE {
  readonly perfil: ProfileResource | undefined;
  /** Hoy en Argentina, AAAA-MM-DD. */
  readonly hoy: string;
  readonly tablero: Pick<TableroLe8Estado, 'cargando' | 'le8' | 'le8Inicial' | 'estadio'>;
  readonly ckm: Pick<Ckm, 'cargando' | 'resultado'>;
  /** PREVENT estimado del vendor; sin él (tests viejos), la Home no muestra estimación. */
  readonly prevent?: Pick<RiesgoPrevent, 'cargando' | 'resultado' | 'faltantes'>;
  /** Lo que trajo el efecto; undefined mientras carga. */
  readonly cargas?: CargasHomeE;
}

/** Junta los hooks del vendor y el efecto en lo que muestra la Home E. Pura. */
export function armarDatosHomeE({ perfil, hoy, tablero, ckm, prevent, cargas }: EntradaHomeE): DatosHomeE {
  if (perfil?.resourceType !== 'Patient') {
    // Un profesional (u otro perfil) no tiene datos de paciente: valores neutros, sin
    // pedirle que firme el consentimiento ni que complete el ingreso.
    return {
      cargando: false,
      esPaciente: false,
      hoy,
      consentimiento: 'firmado',
      ingresoPendiente: false,
      novedadesSinLeer: 0,
    };
  }
  return {
    ...(cargas ?? CARGAS_PENDIENTES),
    cargando: !cargas || tablero.cargando || ckm.cargando || Boolean(prevent?.cargando),
    esPaciente: true,
    nombre: perfil.name?.[0]?.given?.[0]?.trim() || undefined,
    hoy,
    le8: tablero.le8,
    le8Inicial: tablero.le8Inicial,
    // Mientras el tablero no dijo si el plan trae estadio, no se adelanta el estimado.
    ckm: estadioCkmHome(tablero.estadio, tablero.cargando ? undefined : ckm.resultado?.stage),
    preventEstimado: prevent ? preventEstimado(prevent.resultado, prevent.faltantes) : undefined,
    preventFaltantes: prevent && !prevent.resultado ? prevent.faltantes : undefined,
  };
}

/**
 * El PREVENT que estima el vendor (porcentajes 0-100) en la escala del firmado (0-1).
 * Undefined si no hubo resultado (faltan colesterol total y HDL).
 */
export function preventEstimado(
  resultado: RiesgoPrevent['resultado'],
  faltantes: readonly string[]
): PreventEstimado | undefined {
  if (!resultado) {
    return undefined;
  }
  const proporcion = (v: number): number | undefined => (Number.isFinite(v) ? v / 100 : undefined);
  return {
    ascvd10: proporcion(resultado.diezAnios.ascvd),
    hf10: proporcion(resultado.diezAnios.heartFailure),
    total30: proporcion(resultado.treintaAnios.totalCvd),
    faltantes: [...faltantes],
  };
}

/** Los datos de la Home E de la paciente logueada (con un profesional, sin datos). */
export function useDatosHomeE(): DatosHomeE {
  const medplum = useMedplum();
  const perfil = useMedplumProfile();
  const patient = perfil?.resourceType === 'Patient' ? perfil : undefined;
  const ref = patient ? getReferenceString(patient) : undefined;

  // Los hooks del vendor van siempre (reglas de hooks); sin paciente no consultan nada.
  const tablero = useTableroLe8({ patient });
  const ckm = useCkm({ patient });
  const riesgo = useRiesgoPrevent({ patient });

  // Las cargas quedan atadas a la paciente para la que se pidieron: si cambia el perfil,
  // no se muestran las de otra mientras llegan las nuevas.
  const [cargas, setCargas] = useState<{ readonly ref: string | undefined; readonly cargas: CargasHomeE }>();

  useEffect(() => {
    if (!patient) {
      return undefined;
    }
    let cancelado = false;
    const paraRef = getReferenceString(patient);
    cargarHomeE(medplum, patient)
      .then((nuevas) => {
        if (!cancelado) {
          setCargas({ ref: paraRef, cargas: nuevas });
        }
      })
      .catch(console.error); // por las dudas: allSettled no falla y la traducción es pura
    return () => {
      cancelado = true;
    };
  }, [medplum, patient]);

  const hoy = hoyArgentina();
  const vigentes = cargas && cargas.ref === ref ? cargas.cargas : undefined;
  const { cargando: tableroCargando, le8, le8Inicial, estadio } = tablero;
  const { cargando: ckmCargando, resultado } = ckm;
  const { cargando: preventCargando, resultado: preventResultado, faltantes: preventFaltantes } = riesgo;

  return useMemo(
    () =>
      armarDatosHomeE({
        perfil,
        hoy,
        tablero: { cargando: tableroCargando, le8, le8Inicial, estadio },
        ckm: { cargando: ckmCargando, resultado },
        prevent: { cargando: preventCargando, resultado: preventResultado, faltantes: preventFaltantes },
        cargas: vigentes,
      }),
    [
      perfil,
      hoy,
      tableroCargando,
      le8,
      le8Inicial,
      estadio,
      ckmCargando,
      resultado,
      preventCargando,
      preventResultado,
      preventFaltantes,
      vigentes,
    ]
  );
}
