import type { Appointment } from '@medplum/fhirtypes';
import { ESTADOS_CON_ACCESO } from './estados.js';
import { textoDesde } from './formato.js';
import type { PoliticaTeleconsulta } from './politica.js';
import { ZONA_HORARIA_DEFAULT } from './terminologia.js';
import { esTurnoVirtual, horarioDelTurno, movimientosUsados, pagoDelTurno, salaDelTurno } from './turno.js';
import { ventanaDeAcceso, type VentanaDeAcceso } from './ventana.js';

const HORA_MS = 3_600_000;

export interface EvaluacionAcceso {
  permitido: boolean;
  /** Patient-safe Spanish message when not allowed (shown as-is). */
  motivo?: string;
  ventana?: VentanaDeAcceso;
}

/**
 * Can a participant enter the room right now? One rule for the UI and the
 * token bot: virtual + has a room + confirmed status + open window.
 */
export function evaluarAcceso(
  turno: Appointment,
  politica: PoliticaTeleconsulta,
  ahora: Date = new Date(),
  zona = ZONA_HORARIA_DEFAULT,
): EvaluacionAcceso {
  if (!esTurnoVirtual(turno) || !salaDelTurno(turno)) {
    return { permitido: false, motivo: 'Ese turno no es una videollamada.' };
  }
  const ventana = ventanaDeAcceso(turno, politica, ahora);
  if (!ventana) {
    return { permitido: false, motivo: 'Ese turno no tiene horario asignado.' };
  }
  if (turno.status === 'pending') {
    return { permitido: false, motivo: 'Esta videollamada todavía no está confirmada: falta el pago.', ventana };
  }
  if (turno.status === 'fulfilled') {
    return { permitido: false, motivo: 'Esta videollamada ya terminó.', ventana };
  }
  if (!turno.status || !ESTADOS_CON_ACCESO.includes(turno.status)) {
    return { permitido: false, motivo: 'Esta videollamada no está confirmada. Escribinos y la resolvemos.', ventana };
  }
  if (ventana.estado === 'antes') {
    return {
      permitido: false,
      motivo: `Todavía no es la hora. Vas a poder entrar ${textoDesde(ventana.abre, ahora, zona)}.`,
      ventana,
    };
  }
  if (ventana.estado === 'terminada') {
    return { permitido: false, motivo: 'Esta videollamada ya terminó.', ventana };
  }
  return { permitido: true, ventana };
}

export interface EvaluacionMover {
  permitido: boolean;
  motivo?: string;
  usados: number;
  restantes: number;
  /** Last moment a move is accepted. */
  limite?: Date;
}

/** Can the patient move this appointment now, under the service policy? */
export function evaluarMover(
  turno: Appointment,
  politica: PoliticaTeleconsulta,
  ahora: Date = new Date(),
): EvaluacionMover {
  const usados = movimientosUsados(turno);
  const restantes = Math.max(0, politica.maxMovimientos - usados);
  const horario = horarioDelTurno(turno, politica.duracionMinutos);
  const limite = horario ? new Date(horario.inicio.getTime() - politica.horasLimiteCambios * HORA_MS) : undefined;
  const base = { usados, restantes, limite };

  if (turno.status !== 'booked' && turno.status !== 'pending') {
    return { ...base, permitido: false, motivo: 'Este turno ya no se puede mover.' };
  }
  if (restantes <= 0) {
    return {
      ...base,
      permitido: false,
      motivo: `Ya usaste los ${politica.maxMovimientos} movimientos de este turno. Escribinos y lo resolvemos.`,
    };
  }
  if (!limite || ahora.getTime() > limite.getTime()) {
    return {
      ...base,
      permitido: false,
      motivo: `Los turnos se pueden mover hasta ${politica.horasLimiteCambios} horas antes.`,
    };
  }
  return { ...base, permitido: true };
}

/** Validates the target time of a move: it must be in the future and well formed. */
export function validarNuevoHorario(
  inicio: string,
  fin: string | undefined,
  ahora: Date = new Date(),
): { valido: boolean; motivo?: string } {
  const i = new Date(inicio);
  if (Number.isNaN(i.getTime())) return { valido: false, motivo: 'El nuevo horario no es válido.' };
  if (i.getTime() <= ahora.getTime()) return { valido: false, motivo: 'El nuevo horario tiene que ser en el futuro.' };
  if (fin !== undefined) {
    const f = new Date(fin);
    if (Number.isNaN(f.getTime()) || f.getTime() <= i.getTime()) {
      return { valido: false, motivo: 'El nuevo horario no es válido.' };
    }
  }
  return { valido: true };
}

export interface EvaluacionCancelar {
  permitido: boolean;
  /** True when cancelling now triggers an automatic full refund. */
  conReintegro: boolean;
  motivo?: string;
  /** Last moment a cancellation is refunded. */
  limiteReintegro?: Date;
}

/**
 * Can the patient cancel, and is it refunded? Unpaid (`pending`) appointments
 * cancel with nothing to refund; paid ones are refunded in full up to
 * `horasReintegro` before the start, and cancel without refund after that.
 */
export function evaluarCancelar(
  turno: Appointment,
  politica: PoliticaTeleconsulta,
  ahora: Date = new Date(),
): EvaluacionCancelar {
  const horario = horarioDelTurno(turno, politica.duracionMinutos);
  const limiteReintegro = horario
    ? new Date(horario.inicio.getTime() - politica.horasReintegro * HORA_MS)
    : undefined;

  if (turno.status !== 'booked' && turno.status !== 'pending') {
    return { permitido: false, conReintegro: false, motivo: 'Este turno ya no se puede cancelar.', limiteReintegro };
  }
  if (horario && ahora.getTime() >= horario.inicio.getTime()) {
    return {
      permitido: false,
      conReintegro: false,
      motivo: 'El turno ya empezó. Escribinos y lo resolvemos.',
      limiteReintegro,
    };
  }
  const pagado = turno.status === 'booked' && pagoDelTurno(turno) !== undefined;
  const aTiempo = limiteReintegro !== undefined && ahora.getTime() <= limiteReintegro.getTime();
  return { permitido: true, conReintegro: pagado && aTiempo, limiteReintegro };
}
