// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Los datos del tablero «Salidas y llegadas» de la Home D: cinco consultas en paralelo con
// `Promise.allSettled` (si una falla, el tablero lo dice y muestra el resto), traducidas a
// filas por `tablero.ts` (puro). La AccessPolicy del paciente permite leer todo esto
// (docs/medplum/README.md): DocumentReference, DiagnosticReport, ServiceRequest,
// QuestionnaireResponse, Observation y Communication.
//
// «Nuevo»: lo que cambió desde la última visita en este dispositivo
// (`localStorage['home-d-visita:Patient/{id}']`). Al terminar de cargar se guarda «ahora»,
// aunque alguna consulta haya fallado (si una falla siempre, por ejemplo por permisos, la
// visita igual tiene que avanzar); las nuevas de esta sesión no cambian por eso.
// Tiempo real: como la campanita, con la misma Subscription de las novedades; lo que llega
// así se recarga (sin las búsquedas que el cliente tiene en caché) y entra como nuevo.
import type { MedplumClient } from '@medplum/core';
import { getReferenceString } from '@medplum/core';
import type { DiagnosticReport, Patient } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile, useSubscription } from '@medplum/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CODIGOS_CASA } from '../../fhir/datosDeSalud';
import { cargarEstudiosEnviados } from '../../fhir/estudios';
import { cargarNotificaciones, criteriaNotificaciones } from '../../fhir/notificaciones';
import { cargarInformeSOM, cargarMisSolicitudesSOM } from '../../fhir/som';
import { MARCA } from '../../marca';
import { tiempoRealHabilitado } from '../../utils/tiempoReal';
import type { CargaTablero, EstudiosTablero, OpcionesTablero, SegundaOpinionTablero, TableroCargado } from './tablero';
import { filasTablero, informesALeer, MAX_PEDIDOS_SOM, siguienteTablero } from './tablero';
import type { TableroHomeD } from './tipos';

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

/** Los PDFs enviados y el DiagnosticReport de los procesados más nuevos (los que se puedan leer). */
async function cargarEstudios(medplum: MedplumClient, patient: Patient): Promise<EstudiosTablero> {
  const documentos = await cargarEstudiosEnviados(medplum, patient);
  const leidos = await Promise.all(
    informesALeer(documentos).map((id) =>
      medplum.readResource('DiagnosticReport', id).catch((): DiagnosticReport | undefined => undefined)
    )
  );
  const informes = new Map<string, DiagnosticReport>();
  for (const informe of leidos) {
    if (informe?.id) {
      informes.set(informe.id, informe);
    }
  }
  return { documentos, informes };
}

/** Los pedidos más nuevos de la Segunda Opinión y, si el último está completado, su informe. */
async function cargarSegundaOpinion(medplum: MedplumClient, patient: Patient): Promise<SegundaOpinionTablero> {
  const pedidos = (await cargarMisSolicitudesSOM(medplum, patient)).slice(0, MAX_PEDIDOS_SOM);
  const [ultimo] = pedidos;
  // Sin el informe, la llegada igual se muestra («Listo», nunca «Firmado»).
  const informe =
    ultimo?.status === 'completed'
      ? (await cargarInformeSOM(medplum, ultimo).catch(() => undefined))?.report
      : undefined;
  return { pedidos, informe };
}

/** Las cinco consultas del tablero, en paralelo; ninguna tumba a las demás. */
export async function cargarTablero(
  medplum: MedplumClient,
  patient: Patient,
  opciones: OpcionesTablero
): Promise<CargaTablero> {
  const ref = getReferenceString(patient) ?? '';
  const [estudios, segundaOpinion, cuestionarios, mediciones, novedades] = await Promise.allSettled([
    cargarEstudios(medplum, patient),
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
    cargarNotificaciones(medplum, ref),
  ]);
  return filasTablero({ estudios, segundaOpinion, cuestionarios, mediciones, novedades }, opciones);
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

  // Cada aviso en tiempo real suma una versión: el efecto vuelve a cargar.
  const [version, setVersion] = useState(0);
  useSubscription(
    tiempoRealHabilitado() && ref ? criteriaNotificaciones(ref) : undefined,
    () => setVersion((v) => v + 1),
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
    cargarTablero(medplum, patient, { producto: MARCA.producto })
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
