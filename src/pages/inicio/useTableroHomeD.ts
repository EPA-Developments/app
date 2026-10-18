// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Los datos del tablero «Salidas y llegadas» de la Home D: seis consultas en paralelo con
// `Promise.allSettled` (si una falla, el tablero lo dice y muestra el resto), traducidas a
// filas por `tablero.ts` (puro). La AccessPolicy del paciente permite leer todo esto
// (docs/medplum/README.md): DocumentReference, DiagnosticReport, ServiceRequest,
// QuestionnaireResponse, Observation y Communication. Los PDFs se piden una sola vez al montar
// la Home (la misma consulta que useDatosHomeE, compartida mientras está en vuelo) y sus
// informes, en una sola búsqueda.
//
// «Nuevo»: lo que cambió desde la última visita en este dispositivo
// (`localStorage['home-d-visita:Patient/{id}']`). Al terminar de cargar se guarda «ahora»,
// aunque alguna consulta haya fallado (si una falla siempre, por ejemplo por permisos, la
// visita igual tiene que avanzar); las nuevas de esta sesión no cambian por eso.
// Tiempo real: como la campanita, con la misma Subscription de las novedades; lo que llega
// así se recarga (sin las búsquedas que el cliente tiene en caché) y entra como nuevo. Los
// avisos seguidos (p. ej. «Leer todas» en la campanita, que actualiza cada novedad) se juntan
// en una sola recarga.
import type { MedplumClient } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { DiagnosticReport, Patient } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile, useSubscription } from '@medplum/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIA_OBSERVACION_SYSTEM } from '../../fhir/biomarkers';
import { CODIGOS_CASA } from '../../fhir/datosDeSalud';
import { cargarEstudiosEnviados } from '../../fhir/estudios';
import { cargarNotificaciones, criteriaNotificaciones } from '../../fhir/notificaciones';
import { cargarInformeSOM, cargarMisSolicitudesSOM, cargarTareasFirma } from '../../fhir/som';
import { MARCA } from '../../marca';
import { tiempoRealHabilitado } from '../../utils/tiempoReal';
import type { CargaTablero, EstudiosTablero, OpcionesTablero, SegundaOpinionTablero, TableroCargado } from './tablero';
import { filasTablero, informesALeer, pedidosVigentes, siguienteTablero } from './tablero';
import type { TableroHomeD } from './tipos';
import { estudiosEnviadosCompartidos } from './useDatosHomeE';

/** Cuánto se espera después del último aviso en tiempo real para recargar (junta los seguidos). */
export const ESPERA_TIEMPO_REAL_MS = 1000;

// ─── Última visita (por dispositivo) ─────────────────────────────────────────────────

/** Clave de localStorage con la última visita de la persona en este dispositivo. */
export function claveVisita(ref: string): string {
  return `home-d-visita:${ref}`;
}

/** La última visita guardada (ISO), o undefined si no hay o el almacenamiento no está disponible. */
export function leerUltimaVisita(ref: string): string | undefined {
  try {
    return window.localStorage.getItem(claveVisita(ref)) ?? undefined;
  } catch {
    return undefined; // modo privado o almacenamiento bloqueado: ninguna fila es «nueva»
  }
}

/** Guarda la visita; si no se puede, la próxima vez ninguna fila es «nueva» (no pasa nada más). */
export function guardarVisita(ref: string, cuando: string): void {
  try {
    window.localStorage.setItem(claveVisita(ref), cuando);
  } catch {
    // sin almacenamiento: el tablero se ve igual, sin marcar nuevas
  }
}

// ─── Cargas ──────────────────────────────────────────────────────────────────────────

/**
 * Los PDFs enviados y el DiagnosticReport de cada uno de los procesados, en una sola búsqueda.
 * Si la búsqueda de los informes falla, los PDFs se muestran igual (sus llegadas, sin afirmar
 * nada de la revisión) y el tablero queda incompleto. `recarga`: sin compartir la consulta de
 * los PDFs (lo que avisa el tiempo real es posterior a cualquier consulta en vuelo).
 */
async function cargarEstudios(medplum: MedplumClient, patient: Patient, recarga: boolean): Promise<EstudiosTablero> {
  const documentos = await (recarga
    ? cargarEstudiosEnviados(medplum, patient)
    : estudiosEnviadosCompartidos(medplum, patient));
  const ids = informesALeer(documentos);
  const informes = new Map<string, DiagnosticReport>();
  if (ids.length === 0) {
    return { documentos, informes };
  }
  try {
    const leidos = await medplum.searchResources('DiagnosticReport', {
      _id: ids.join(','),
      _count: String(ids.length),
    });
    for (const informe of leidos) {
      informes.set(informe.id, informe);
    }
    return { documentos, informes };
  } catch (err) {
    console.warn('No se pudieron leer los informes de laboratorio del tablero.', err);
    return { documentos, informes, incompleto: true };
  }
}

/**
 * Los pedidos más nuevos de la Segunda Opinión; si alguno está activo, las tareas de firma (UNA
 * búsqueda, para todos: «En revisión por el cardiólogo»); y si el último está completado, su
 * informe. Lo que no se pudo leer queda afuera y el tablero avisa que no trajo todo.
 */
async function cargarSegundaOpinion(medplum: MedplumClient, patient: Patient): Promise<SegundaOpinionTablero> {
  // Los cargados por error no cuentan: la llegada es la del último pedido de verdad.
  const pedidos = pedidosVigentes(await cargarMisSolicitudesSOM(medplum, patient));
  const [ultimo] = pedidos;
  const [tareas, informe] = await Promise.allSettled([
    pedidos.some((p) => p.status === 'active') ? cargarTareasFirma(medplum, patient) : Promise.resolve(undefined),
    ultimo?.status === 'completed' ? cargarInformeSOM(medplum, ultimo) : Promise.resolve(undefined),
  ]);
  if (tareas.status === 'rejected') {
    // Sin las tareas, los activos se ven «En análisis», como antes de la firma.
    console.warn('No se pudieron leer las tareas de firma de la Segunda Opinión del tablero.', tareas.reason);
  }
  if (informe.status === 'rejected') {
    // Sin el informe, la llegada igual se muestra («Listo», sin afirmar nada de la firma).
    console.warn('No se pudo leer el informe de la Segunda Opinión del tablero.', informe.reason);
  }
  const tareasFirma = tareas.status === 'fulfilled' ? tareas.value : undefined;
  const report = informe.status === 'fulfilled' ? informe.value?.report : undefined;
  return {
    pedidos,
    ...(report ? { informe: report } : {}),
    ...(tareasFirma ? { tareasFirma } : {}),
    ...(tareas.status === 'rejected' || informe.status === 'rejected' ? { incompleto: true } : {}),
  };
}

/** Opciones de una carga del tablero. */
export interface OpcionesCarga extends OpcionesTablero {
  /**
   * true en una recarga por tiempo real: los PDFs se piden de nuevo (sin compartir la consulta
   * en vuelo); las búsquedas que usan la caché del cliente las invalida antes el efecto.
   */
  readonly recarga?: boolean;
}

/** Las seis consultas del tablero, en paralelo; ninguna tumba a las demás. */
export async function cargarTablero(
  medplum: MedplumClient,
  patient: Patient,
  opciones: OpcionesCarga
): Promise<CargaTablero> {
  const ref = getReferenceString(patient) ?? '';
  const [estudios, segundaOpinion, cuestionarios, mediciones, laboratorioManual, novedades] = await Promise.allSettled([
    cargarEstudios(medplum, patient, opciones.recarga ?? false),
    cargarSegundaOpinion(medplum, patient),
    medplum.searchResources(
      'QuestionnaireResponse',
      { subject: ref, _sort: '-authored', _count: '10' },
      { cache: 'no-cache' }
    ),
    medplum.searchResources(
      'Observation',
      { subject: ref, code: CODIGOS_CASA.join(','), _sort: '-date', _count: '30' },
      { cache: 'no-cache' }
    ),
    // El laboratorio cargado a mano: el portal lo guarda `preliminary`; el bot que lee los PDFs,
    // `final` (y esos ya son la llegada de su PDF).
    medplum.searchResources(
      'Observation',
      {
        subject: ref,
        category: `${CATEGORIA_OBSERVACION_SYSTEM}|laboratory`,
        status: 'preliminary',
        _sort: '-_lastUpdated',
        _count: '30',
      },
      { cache: 'no-cache' }
    ),
    cargarNotificaciones(medplum, ref),
  ]);
  return filasTablero(
    { estudios, segundaOpinion, cuestionarios, mediciones, laboratorioManual, novedades },
    { producto: opciones.producto, ahora: opciones.ahora }
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────────────

const SIN_NUEVAS: ReadonlySet<string> = new Set();
const SIN_FILAS: TableroCargado = { filas: [], nuevas: SIN_NUEVAS, incompleto: false };

/** Con un perfil que no es Patient no hay tablero (ni consultas). */
const SIN_PACIENTE: TableroHomeD = { cargando: false, filas: [], nuevas: SIN_NUEVAS, incompleto: false };
const CARGANDO: TableroHomeD = { cargando: true, filas: [], nuevas: SIN_NUEVAS, incompleto: false };

/** El tablero «Salidas y llegadas» de la persona logueada. */
export function useTableroHomeD(): TableroHomeD {
  const medplum = useMedplum();
  const perfil = useMedplumProfile();
  const perfilPaciente = perfil?.resourceType === 'Patient' ? perfil : undefined;
  const ref = perfilPaciente ? getReferenceString(perfilPaciente) : undefined;
  // Al renovar el token llega el mismo perfil en otro objeto: se fija por su referencia para no
  // repetir las consultas ni volver al skeleton.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const patient = useMemo(() => perfilPaciente, [ref]);

  // Cada tanda de avisos en tiempo real suma una versión: el efecto vuelve a cargar. Los avisos
  // seguidos se juntan (ESPERA_TIEMPO_REAL_MS después del último) en una sola recarga.
  const [version, setVersion] = useState(0);
  const espera = useRef<number>(undefined);
  useEffect(() => () => window.clearTimeout(espera.current), []);
  useSubscription(
    tiempoRealHabilitado() && ref ? criteriaNotificaciones(ref) : undefined,
    () => {
      window.clearTimeout(espera.current);
      espera.current = window.setTimeout(() => setVersion((v) => v + 1), ESPERA_TIEMPO_REAL_MS);
    },
    { onError: (err) => console.warn('Tablero sin tiempo real; se actualiza al volver a entrar.', err) }
  );

  // La última visita se lee UNA vez por persona, antes de guardar la de ahora.
  const visita = useRef<{ readonly ref: string; readonly cuando?: string }>(undefined);
  // El tablero queda atado a la persona para la que se cargó.
  const [estado, setEstado] = useState<{ readonly ref: string; readonly tablero: TableroCargado }>();

  useEffect(() => {
    if (!patient) {
      return undefined;
    }
    const paraRef = getReferenceString(patient) ?? '';
    if (visita.current?.ref !== paraRef) {
      visita.current = { ref: paraRef, cuando: leerUltimaVisita(paraRef) };
    }
    const ultimaVisita = visita.current.cuando;
    if (version > 0) {
      // Lo que avisa el tiempo real lo cambió un bot del lado del servidor: las búsquedas de la
      // Segunda Opinión y de su informe (que no piden `no-cache`) pueden estar viejas en la
      // caché del cliente (hasta un minuto) y seguirían diciendo «En camino».
      medplum.invalidateSearches('ServiceRequest');
      medplum.invalidateSearches('DiagnosticReport');
    }
    let cancelado = false;
    cargarTablero(medplum, patient, { producto: MARCA.producto, recarga: version > 0 })
      .then((carga) => {
        if (cancelado) {
          return;
        }
        setEstado((previo) => ({
          ref: paraRef,
          tablero: siguienteTablero(previo?.ref === paraRef ? previo.tablero : undefined, carga, ultimaVisita),
        }));
        guardarVisita(paraRef, new Date().toISOString());
      })
      .catch((err: unknown) => {
        // Por las dudas (allSettled no falla y la traducción es pura): nunca un skeleton eterno.
        // Lo que ya se veía queda, avisando que no está completo.
        console.error(err);
        if (!cancelado) {
          setEstado((previo) => ({
            ref: paraRef,
            tablero: { ...(previo?.ref === paraRef ? previo.tablero : SIN_FILAS), incompleto: true },
          }));
        }
      });
    return () => {
      cancelado = true;
    };
  }, [medplum, patient, version]);

  return useMemo(() => {
    if (!ref) {
      return SIN_PACIENTE;
    }
    const vigente = estado?.ref === ref ? estado.tablero : undefined;
    return vigente ? { cargando: false, ...vigente } : CARGANDO;
  }, [ref, estado]);
}
