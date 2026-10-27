// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import type { Task } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import { calcularRachaSemanal, fechasDePasosMarcados } from './bienestar';

const tarea = (t: Partial<Task>): Task => ({ resourceType: 'Task', status: 'completed', intent: 'plan', ...t });

describe('marcar un paso del plan cuenta como actividad', () => {
  test('cuenta el día en que la persona lo marcó', () => {
    const fechas = fechasDePasosMarcados([tarea({ executionPeriod: { end: '2026-10-20T10:00:00Z' } })]);
    expect(fechas.map((f) => f.toISOString())).toEqual(['2026-10-20T10:00:00.000Z']);
  });

  test('no cuenta las del equipo, las no completadas ni las marcadas sin día', () => {
    expect(
      fechasDePasosMarcados([
        tarea({ intent: 'order', executionPeriod: { end: '2026-10-20' } }),
        tarea({ status: 'requested', executionPeriod: { end: '2026-10-20' } }),
        tarea({ lastModified: '2026-10-20' }),
      ])
    ).toEqual([]);
  });

  test('una semana con solo pasos marcados es una semana activa', () => {
    const fechas = fechasDePasosMarcados([tarea({ executionPeriod: { end: '2026-10-21T12:00:00' } })]);
    const r = calcularRachaSemanal(fechas, new Date('2026-10-01T00:00:00'), new Date('2026-10-22T12:00:00'));
    expect(r).toEqual({ semanasActivas: 1, rachaActual: 1 });
  });
});
