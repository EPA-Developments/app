import {
  esEstadoFinal,
  esTurnoVirtual,
  leerPolitica,
  referenciaServicio,
  ventanaDeAcceso,
  type PoliticaTeleconsulta,
} from '@epa/teleconsulta-core';
import type { Appointment, HealthcareService } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useCallback, useEffect, useState } from 'react';

export type TurnoVirtual = Appointment & { id: string };

export interface TurnoConPolitica {
  turno: TurnoVirtual;
  politica: PoliticaTeleconsulta;
}

export interface TurnosPaciente {
  /** Not over yet, soonest first. */
  proximos: TurnoConPolitica[];
  /** Finished, cancelled or already past, most recent first. */
  anteriores: TurnoConPolitica[];
  cargando: boolean;
  error?: string;
  recargar: () => Promise<void>;
}

/**
 * The patient's videocall appointments, with each service policy (moves,
 * refund window, access window). Reads only what the patient's AccessPolicy
 * already allows; every change goes through the bots.
 */
export function useTurnosPaciente(pacienteId: string | undefined): TurnosPaciente {
  const medplum = useMedplum();
  const [lista, setLista] = useState<TurnoConPolitica[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const recargar = useCallback(async () => {
    if (!pacienteId) {
      setLista([]);
      setCargando(false);
      return;
    }
    setCargando(true);
    try {
      const turnos = (
        (await medplum.searchResources(
          'Appointment',
          { patient: `Patient/${pacienteId}`, _sort: '-date', _count: '100' },
          { cache: 'no-cache' },
        )) as TurnoVirtual[]
      ).filter(esTurnoVirtual);

      const servicios = new Map<string, Promise<PoliticaTeleconsulta>>();
      const politicaDe = (turno: Appointment): Promise<PoliticaTeleconsulta> => {
        const ref = referenciaServicio(turno)?.reference;
        if (!ref) return Promise.resolve(leerPolitica(undefined));
        let p = servicios.get(ref);
        if (!p) {
          p = medplum
            .readReference<HealthcareService>({ reference: ref })
            .then((s) => leerPolitica(s))
            .catch(() => leerPolitica(undefined));
          servicios.set(ref, p);
        }
        return p;
      };

      setLista(await Promise.all(turnos.map(async (turno) => ({ turno, politica: await politicaDe(turno) }))));
      setError(undefined);
    } catch {
      setError('No pudimos cargar tus turnos. Probá de nuevo en unos segundos.');
    } finally {
      setCargando(false);
    }
  }, [medplum, pacienteId]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const ahora = new Date();
  const terminado = (t: TurnoConPolitica): boolean =>
    esEstadoFinal(t.turno.status) || ventanaDeAcceso(t.turno, t.politica, ahora)?.estado === 'terminada';
  const proximos = lista
    .filter((t) => !terminado(t))
    .sort((a, b) => (a.turno.start ?? '').localeCompare(b.turno.start ?? ''));
  const anteriores = lista
    .filter(terminado)
    .sort((a, b) => (b.turno.start ?? '').localeCompare(a.turno.start ?? ''));

  return { proximos, anteriores, cargando, error, recargar };
}
