import { esTurnoVirtual } from '@epa/teleconsulta-core';
import { useMedplum } from '@medplum/react';
import { useCallback, useEffect, useState } from 'react';
import { inicioDelDia, sumarDias } from '../fechas';
import type { TurnoVirtual } from './useTurnosPaciente';

export interface AgendaProfesional {
  turnos: TurnoVirtual[];
  cargando: boolean;
  error?: string;
  recargar: () => Promise<void>;
}

/**
 * The professional's videocalls of one day (in the given timezone), soonest
 * first, refreshed every `intervaloMs` (default 30 s) so an arriving patient
 * shows up as "esperando" without reloading.
 */
export function useAgendaProfesional(
  practitionerId: string | undefined,
  dia: Date,
  zona: string,
  intervaloMs = 30_000,
): AgendaProfesional {
  const medplum = useMedplum();
  const [turnos, setTurnos] = useState<TurnoVirtual[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const desde = inicioDelDia(dia, zona).toISOString();
  const hasta = sumarDias(dia, 1, zona).toISOString();

  const recargar = useCallback(async () => {
    if (!practitionerId) {
      setCargando(false);
      return;
    }
    try {
      const encontrados = (await medplum.searchResources(
        'Appointment',
        new URLSearchParams([
          ['practitioner', `Practitioner/${practitionerId}`],
          ['date', `ge${desde}`],
          ['date', `lt${hasta}`],
          ['_sort', 'date'],
          ['_count', '100'],
        ]),
        { cache: 'no-cache' },
      )) as TurnoVirtual[];
      setTurnos(
        encontrados.filter(esTurnoVirtual).sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '')),
      );
      setError(undefined);
    } catch {
      setError('No pudimos cargar la agenda. Reintentamos en unos segundos.');
    } finally {
      setCargando(false);
    }
  }, [medplum, practitionerId, desde, hasta]);

  useEffect(() => {
    setCargando(true);
    void recargar();
    const t = setInterval(() => void recargar(), intervaloMs);
    return () => clearInterval(t);
  }, [recargar, intervaloMs]);

  return { turnos, cargando, error, recargar };
}
