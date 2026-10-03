// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import { entradaLe8DesdeFhir } from '@epa/careplan-menopausia';
import type { Observation, Patient } from '@medplum/fhirtypes';
import {
  calcularImc,
  egfrDeLaCreatinina,
  hayDatos,
  observacionesDeCasa,
  observacionesDeLaboratorio,
  ultimoValor,
  validarDatosSalud,
} from './datosDeSalud';

const ana: Patient = { resourceType: 'Patient', id: 'p1', gender: 'female', birthDate: '1976-03-10' };
const AHORA = '2026-10-03T12:00:00.000Z';
const codigos = (o: Observation) => o.code?.coding?.map((c) => c.code);

describe('Tus datos de salud — validación', () => {
  test('rangos posibles: la altura en metros y la presión al revés se marcan', () => {
    expect(validarDatosSalud({ altura: 1.62 }, { manual: false })).toEqual({
      altura: 'La altura va en centímetros (p. ej. 162).',
    });
    expect(validarDatosSalud({ peso: 900 }, { manual: false }).peso).toMatch(/entre 25 y 300 kg/);
    expect(validarDatosSalud({ sistolica: 120 }, { manual: false })).toEqual({
      diastolica: 'Cargá las dos: la máxima y la mínima.',
    });
    expect(validarDatosSalud({ sistolica: 80, diastolica: 120 }, { manual: false })).toEqual({
      diastolica: 'La mínima tiene que ser menor que la máxima.',
    });
    expect(validarDatosSalud({ peso: 68, altura: 162, sistolica: 120, diastolica: 80 }, { manual: false })).toEqual({});
  });

  test('el laboratorio a mano pide la fecha del estudio (no posterior a hoy)', () => {
    expect(validarDatosSalud({ creatinina: 0.8 }, { manual: true })).toEqual({
      fechaLaboratorio: 'Ingresá la fecha del laboratorio.',
    });
    expect(
      validarDatosSalud({ creatinina: 0.8 }, { manual: true, fechaLaboratorio: '2026-12-01', hoy: '2026-10-03' })
    ).toEqual({ fechaLaboratorio: 'La fecha no puede ser posterior a hoy.' });
    // Con el laboratorio cerrado, sus valores no cuentan.
    expect(validarDatosSalud({ creatinina: 99 }, { manual: false })).toEqual({});
    expect(hayDatos({ creatinina: 0.8 }, false)).toBe(false);
    expect(hayDatos({ creatinina: 0.8 }, true)).toBe(true);
    expect(hayDatos({ peso: '' }, false)).toBe(false);
  });
});

describe('Tus datos de salud — lo que se guarda', () => {
  test('casa: peso, altura, cintura, la presión como panel y el IMC calculado', () => {
    const obs = observacionesDeCasa({ peso: 68, altura: 162, cintura: 84, sistolica: 124, diastolica: 78 }, ana, AHORA);
    expect(obs.map(codigos)).toEqual([['29463-7'], ['8302-2'], ['8280-0'], ['85354-9'], ['39156-5']]);
    expect(obs.every((o) => o.status === 'preliminary' && o.effectiveDateTime === AHORA)).toBe(true);
    expect(obs.every((o) => o.category?.[0]?.coding?.[0]?.code === 'vital-signs')).toBe(true);
    expect(obs[3]?.component?.map((c) => [c.code?.coding?.[0]?.code, c.valueQuantity?.value])).toEqual([
      ['8480-6', 124],
      ['8462-4', 78],
    ]);
    expect(obs[4]?.valueQuantity).toMatchObject({ value: 25.9, code: 'kg/m2' });
    expect(calcularImc(68, 162)).toBe(25.9);
  });

  test('solo el peso: el IMC sale con la última altura; sin nada, no se guarda nada', () => {
    const obs = observacionesDeCasa({ peso: 70 }, ana, AHORA, 162);
    expect(obs.map(codigos)).toEqual([['29463-7'], ['39156-5']]);
    expect(obs[1]?.valueQuantity?.value).toBe(26.7);
    expect(observacionesDeCasa({ peso: 70 }, ana, AHORA)).toHaveLength(1);
    expect(observacionesDeCasa({}, ana, AHORA)).toEqual([]);
  });

  test('laboratorio a mano: con su fecha, y el no-HDL calculado', () => {
    const obs = observacionesDeLaboratorio({ colesterolTotal: 210, hdl: 55, creatinina: 0.8 }, ana, '2026-09-18');
    expect(obs.map(codigos)).toEqual([['2093-3'], ['2085-9'], ['2160-0'], ['43396-1']]);
    expect(obs.every((o) => o.effectiveDateTime === '2026-09-18' && o.status === 'preliminary')).toBe(true);
    expect(obs[3]?.valueQuantity?.value).toBe(155);
  });

  test('con la creatinina, el eGFR (CKD-EPI 2021) con los códigos de hGraph y del plan', () => {
    const [creatinina] = observacionesDeLaboratorio({ creatinina: 0.8 }, ana, '2026-09-18');
    const egfr = egfrDeLaCreatinina({ ...creatinina, id: 'crea1' }, ana);
    expect(egfr?.valueQuantity?.value).toBe(90);
    expect(codigos(egfr as Observation)).toEqual(['62238-1', '33914-3', '98979-8']);
    expect(egfr?.derivedFrom).toEqual([{ reference: 'Observation/crea1' }]);
    expect(egfrDeLaCreatinina({ ...creatinina, id: 'crea1' }, { ...ana, gender: 'other' })).toBeUndefined();
  });

  test('el tablero de 8 hábitos lee lo que se guarda (IMC, presión, colesterol, glucemia)', () => {
    const obs = [
      ...observacionesDeCasa({ peso: 68, altura: 162, sistolica: 124, diastolica: 78 }, ana, AHORA),
      ...observacionesDeLaboratorio({ colesterolTotal: 210, hdl: 55, glucemia: 92, hba1c: 5.4 }, ana, '2026-09-18'),
    ];
    expect(entradaLe8DesdeFhir({ observations: obs })).toMatchObject({
      imc: 25.9,
      sistolicaMmHg: 124,
      diastolicaMmHg: 78,
      colesterolTotalMgDl: 210,
      hdlMgDl: 55,
      noHdlMgDl: 155,
      glucemiaAyunasMgDl: 92,
      hba1cPorcentaje: 5.4,
    });
  });

  test('último valor: directo o dentro del panel de presión; los anulados no cuentan', () => {
    const obs = observacionesDeCasa({ peso: 68, sistolica: 124, diastolica: 78 }, ana, AHORA);
    const anulado: Observation = {
      ...obs[0],
      status: 'entered-in-error',
      effectiveDateTime: '2026-10-04',
      valueQuantity: { value: 99 },
    };
    expect(ultimoValor([...obs, anulado], '29463-7')).toEqual({ valor: 68, fecha: AHORA });
    expect(ultimoValor(obs, '8480-6')).toEqual({ valor: 124, fecha: AHORA });
    expect(ultimoValor(obs, '8302-2')).toBeUndefined();
  });
});
