// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// El estadío CKM del equipo: la serie que escribe el sistema del equipo gana, si no la
// validación de un médico, y nada escrito por la paciente cuenta. Pacientes sintéticas.
import { buildCkmStageObservation, ESTADIO_CKM, SYSTEM } from '@epa/careplan-menopausia';
import type { Observation } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { cargarEstadioDelEquipo, cargarLecturasCkm, estadioDelEquipo, SERIE_ESTADIO_SYSTEM } from './ckmEquipo';

function estadio(
  stage: 0 | 1 | 2 | 3 | 4,
  fecha: string,
  extra: { serie?: boolean; validado?: boolean; autor?: string; status?: Observation['status'] } = {}
): Observation {
  const base = buildCkmStageObservation(
    { stage, criterios: [], faltantes: [], datosSuficientes: true },
    { patient: { reference: 'Patient/p1' } }
  );
  return {
    ...base,
    status: extra.status ?? 'final',
    effectiveDateTime: fecha,
    ...(extra.serie ? { identifier: [{ system: SERIE_ESTADIO_SYSTEM, value: `p1/${fecha}` }] } : {}),
    ...(extra.validado ? { method: { coding: [{ system: SYSTEM.epa, code: ESTADIO_CKM.metodo.validado }] } } : {}),
    meta: { author: { reference: extra.autor ?? 'Bot/ckm-recalculate' } },
  };
}

describe('estadioDelEquipo', () => {
  test('la evaluación más nueva de la serie, aunque haya una validación más nueva', () => {
    const r = estadioDelEquipo([
      estadio(2, '2026-03-01', { serie: true }),
      estadio(4, '2026-09-15', { serie: true, status: 'preliminary' }),
      estadio(1, '2026-10-01', { validado: true, autor: 'Practitioner/dr' }),
    ]);
    expect(r).toEqual({ estadio: 4, origen: 'serie', fecha: '2026-09-15', provisorio: true });
  });

  test('sin serie, la última validación de un médico', () => {
    const r = estadioDelEquipo([
      estadio(1, '2026-05-01', { validado: true, autor: 'Practitioner/dr' }),
      estadio(2, '2026-08-01', { validado: true, autor: 'Practitioner/dr' }),
    ]);
    expect(r).toEqual({ estadio: 2, origen: 'validado', fecha: '2026-08-01', provisorio: false });
  });

  test('lo que escribió la paciente no cuenta: ni una serie ni una validación falsas, ni su estimación', () => {
    expect(
      estadioDelEquipo([
        estadio(0, '2026-10-20', { serie: true, autor: 'Patient/p1' }),
        estadio(0, '2026-10-20', { validado: true, autor: 'Patient/p1' }),
        estadio(0, '2026-10-20', { autor: 'Patient/p1' }),
      ])
    ).toBeUndefined();
    expect(
      estadioDelEquipo([
        estadio(0, '2026-10-20', { serie: true, autor: 'Patient/p1' }),
        estadio(3, '2026-06-01', { serie: true }),
      ])?.estadio
    ).toBe(3);
  });

  test('las anuladas no cuentan, y una estimación suelta del sistema tampoco', () => {
    expect(
      estadioDelEquipo([
        estadio(4, '2026-09-15', { serie: true, status: 'entered-in-error' }),
        estadio(2, '2026-01-10', { serie: true }),
        estadio(3, '2026-10-01'),
      ])
    ).toEqual({ estadio: 2, origen: 'serie', fecha: '2026-01-10', provisorio: false });
    expect(estadioDelEquipo([])).toBeUndefined();
  });
});

describe('las búsquedas', () => {
  test('el estadío: las Observations estadio-ckm de la paciente, sin caché', async () => {
    const medplum = new MockClient();
    const buscar = vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as never);
    await cargarEstadioDelEquipo(medplum, { resourceType: 'Patient', id: 'p1' });
    expect(buscar).toHaveBeenCalledWith(
      'Observation',
      expect.objectContaining({ subject: 'Patient/p1', code: `${SYSTEM.epa}|${ESTADIO_CKM.code}` }),
      { cache: 'no-cache' }
    );
  });

  test('las lecturas: los códigos del hGraph, sin las anuladas', async () => {
    const medplum = new MockClient();
    const viva: Observation = { resourceType: 'Observation', status: 'final', code: { text: 'x' } };
    const anulada: Observation = { ...viva, status: 'entered-in-error' };
    const buscar = vi.spyOn(medplum, 'searchResources').mockResolvedValue([viva, anulada] as never);
    expect(await cargarLecturasCkm(medplum, { resourceType: 'Patient', id: 'p1' })).toEqual([viva]);
    expect(buscar.mock.calls[0][1]).toMatchObject({ subject: 'Patient/p1', _sort: '-date' });
    expect(String((buscar.mock.calls[0][1] as Record<string, string>).code)).toContain('85354-9');
  });
});
