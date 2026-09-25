/**
 * @epa/teleconsulta-core
 *
 * FHIR R4 building blocks for EPA teleconsultations on Medplum + self-hosted
 * Jitsi + Mercado Pago: the virtual Appointment and its room, the access
 * window, status rules, the move/cancel/refund policy as server-side data,
 * the virtual Encounter, and the resources a professional leaves when closing
 * (report, orders, prescriptions, follow-up notice). Isomorphic: shared by the
 * bots, the patient app and the professional app.
 */

export { TC, BOTS, EPA_FHIR_BASE, ZONA_HORARIA_DEFAULT, identificadorBot, type NombreBot } from './terminologia.js';
export {
  POLITICA_DEFAULT,
  leerPolitica,
  extensionPolitica,
  type PoliticaTeleconsulta,
} from './politica.js';
export {
  esTurnoVirtual,
  salaDelTurno,
  movimientosUsados,
  pagoDelTurno,
  referenciaPaciente,
  referenciaProfesional,
  referenciaServicio,
  rolEnElTurno,
  tituloDelTurno,
  horarioDelTurno,
  type RolTeleconsulta,
} from './turno.js';
export { ventanaDeAcceso, type VentanaDeAcceso, type EstadoVentana } from './ventana.js';
export {
  ESTADOS_CON_ACCESO,
  ETIQUETA_ESTADO,
  etiquetaEstado,
  estadoAlEntrar,
  esEstadoFinal,
  type EstadoTurno,
} from './estados.js';
export {
  evaluarAcceso,
  evaluarMover,
  evaluarCancelar,
  validarNuevoHorario,
  type EvaluacionAcceso,
  type EvaluacionMover,
  type EvaluacionCancelar,
} from './reglas.js';
export { formatearFecha, formatearHora, formatearFechaHora, textoDesde } from './formato.js';
export {
  nuevaSala,
  buildTurnoVirtual,
  buildServicioTeleconsulta,
  buildEncounterVirtual,
  type TurnoVirtualContext,
  type ServicioTeleconsultaContext,
} from './builders.js';
export {
  buildInformeConsulta,
  buildOrdenEstudio,
  buildReceta,
  buildTareaAgendarControl,
  claveAgendarControl,
  docDefinitionInforme,
  type InformeConsultaContext,
  type OrdenEstudioContext,
  type CategoriaOrden,
  type RecetaContext,
  type AgendarControlContext,
  type DatosInforme,
} from './cierre.js';
export { claimsJitsi, type DatosTokenJitsi } from './jitsi.js';
export {
  preferenciaTeleconsulta,
  referenciaExterna,
  turnoDeReferenciaExterna,
  parsearFirmaMp,
  manifiestoFirmaMp,
  type PreferenciaContext,
} from './mercadopago.js';
