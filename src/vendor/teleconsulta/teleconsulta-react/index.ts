/**
 * @epa/teleconsulta-react
 *
 * Drop-in teleconsultation screens for FooMedical / Medplum apps, on a
 * self-hosted Jitsi (JWT) and Mercado Pago:
 *
 * - Patient: `<MisTurnos />` (enter, pay, move, cancel) and the
 *   `<SalaTeleconsulta />` page (`/teleconsulta/:appointmentId`).
 * - Professional: `<AgendaTeleconsulta />` and the `<ConsultaProfesional />`
 *   page (`/consulta/:appointmentId`): pre-visit file, room as moderator and
 *   closing (report PDF, orders, prescriptions, follow-up notice).
 *
 * Every change of state goes through the `epa-teleconsulta-*` bots; the
 * browser never signs tokens, sets prices or decides roles.
 */

export { TeleconsultaProvider, useTeleconsultaConfig, CONFIG_DEFAULT, type TeleconsultaConfig } from './TeleconsultaContext';
export { llamarBot, cargarPolitica, esUrlDePago, type RespuestaBot } from './bots';

// Patient
export { MisTurnos, type MisTurnosProps } from './componentes/MisTurnos';
export { TarjetaTurno, type TarjetaTurnoProps } from './componentes/TarjetaTurno';
export { PagarBoton, type PagarBotonProps } from './componentes/PagarBoton';
export { MoverTurnoModal, type MoverTurnoModalProps } from './componentes/MoverTurnoModal';
export { CancelarTurnoModal, type CancelarTurnoModalProps } from './componentes/CancelarTurnoModal';
export { DocumentosDeConsulta, BotonDescargar, type DocumentosDeConsultaProps } from './componentes/DocumentosDeConsulta';
export { SalaTeleconsulta, type SalaTeleconsultaProps } from './paginas/SalaTeleconsulta';

// Professional
export { AgendaTeleconsulta, type AgendaTeleconsultaProps } from './componentes/AgendaTeleconsulta';
export { FichaPrevia, valorObservacion } from './componentes/FichaPrevia';
export { CerrarConsulta, type CerrarConsultaProps } from './componentes/CerrarConsulta';
export { ConsultaProfesional, type ConsultaProfesionalProps } from './paginas/ConsultaProfesional';

// Shared
export { Sala, type SalaProps } from './componentes/Sala';
export { EncabezadoTurno } from './componentes/EncabezadoTurno';
export { useSalaJitsi, cargarApiJitsi, type ApiJitsi, type DatosSala, type OpcionesSala } from './hooks/useSalaJitsi';
export { useTurnosPaciente, type TurnoVirtual, type TurnoConPolitica, type TurnosPaciente } from './hooks/useTurnosPaciente';
export { useTurno, type EstadoTurnoCargado } from './hooks/useTurno';
export { useAgendaProfesional, type AgendaProfesional } from './hooks/useAgendaProfesional';
export { useDocumentosDelTurno, esInforme, type DocumentosDelTurno } from './hooks/useDocumentosDelTurno';
export { inicioDelDia, sumarDias, edad } from './fechas';
