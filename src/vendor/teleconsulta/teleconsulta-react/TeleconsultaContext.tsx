import { ZONA_HORARIA_DEFAULT } from '@epa/teleconsulta-core';
import { createContext, useContext, type ReactElement, type ReactNode } from 'react';

export interface TeleconsultaConfig {
  /** Institution name printed on the consultation report PDF. */
  institucion: string;
  /** Timezone for patient-facing dates. */
  zonaHoraria: string;
  /** Route of the patient's videocall page for an appointment. */
  rutaSala: (appointmentId: string) => string;
  /** Route of the patient's appointments list. */
  rutaTurnos: string;
  /** Route of the professional's consultation page for an appointment. */
  rutaConsulta: (appointmentId: string) => string;
  /** Route of the professional's agenda. */
  rutaAgenda: string;
}

export const CONFIG_DEFAULT: TeleconsultaConfig = {
  institucion: 'Equipo de salud',
  zonaHoraria: ZONA_HORARIA_DEFAULT,
  rutaSala: (id) => `/teleconsulta/${id}`,
  rutaTurnos: '/get-care',
  rutaConsulta: (id) => `/consulta/${id}`,
  rutaAgenda: '/',
};

const Contexto = createContext<TeleconsultaConfig>(CONFIG_DEFAULT);

/** Optional: host apps override the institution name, routes or timezone. */
export function TeleconsultaProvider(props: Partial<TeleconsultaConfig> & { children: ReactNode }): ReactElement {
  const { children, ...config } = props;
  return <Contexto.Provider value={{ ...CONFIG_DEFAULT, ...config }}>{children}</Contexto.Provider>;
}

export function useTeleconsultaConfig(): TeleconsultaConfig {
  return useContext(Contexto);
}
