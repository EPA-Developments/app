import type { PoliticaTeleconsulta } from '@epa/teleconsulta-core';
import { useMedplum } from '@medplum/react';
import { useCallback, useEffect, useState } from 'react';
import { cargarPolitica } from '../bots';
import type { TurnoVirtual } from './useTurnosPaciente';

export interface EstadoTurnoCargado {
  turno?: TurnoVirtual;
  politica?: PoliticaTeleconsulta;
  cargando: boolean;
  error?: string;
  recargar: () => Promise<TurnoVirtual | undefined>;
}

/** One appointment (always fresh from the server) and its service policy. */
export function useTurno(appointmentId: string | undefined): EstadoTurnoCargado {
  const medplum = useMedplum();
  const [turno, setTurno] = useState<TurnoVirtual | undefined>(undefined);
  const [politica, setPolitica] = useState<PoliticaTeleconsulta | undefined>(undefined);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const recargar = useCallback(async (): Promise<TurnoVirtual | undefined> => {
    if (!appointmentId) {
      setCargando(false);
      setError('No encontramos esa videollamada en tu cuenta.');
      return undefined;
    }
    try {
      const leido = (await medplum.readResource('Appointment', appointmentId, { cache: 'no-cache' })) as TurnoVirtual;
      setPolitica(await cargarPolitica(medplum, leido));
      setTurno(leido);
      setError(undefined);
      return leido;
    } catch {
      setError('No encontramos esa videollamada en tu cuenta.');
      return undefined;
    } finally {
      setCargando(false);
    }
  }, [medplum, appointmentId]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { turno, politica, cargando, error, recargar };
}
