// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import type { Coverage } from '@medplum/fhirtypes';
import { cargarSesiones, estadoDeCoverage } from './membership';

const SOM = 'https://segundaopinionmedica.org/fhir/StructureDefinition';
/** Namespace que usa Recepción (repo recepcionistas) al emitir las coberturas. */
const BW = 'https://biowellness.ar/fhir/StructureDefinition';

const cobertura = (extension: Coverage['extension']): Coverage => ({
  resourceType: 'Coverage',
  id: 'cov-1',
  status: 'active',
  beneficiary: { reference: 'Patient/p1' },
  payor: [{ reference: 'Patient/p1' }],
  extension,
});

test('lee una membresía emitida con el namespace de esta app', () => {
  const estado = estadoDeCoverage(
    cobertura([
      { url: `${SOM}/tipo-cobertura`, valueCode: 'membresia' },
      { url: `${SOM}/sesiones-mes`, valueInteger: 4 },
      { url: `${SOM}/sesiones-usadas`, valueInteger: 1 },
    ])
  );
  expect(estado).toMatchObject({ tipo: 'membresia', total: 4, usadas: 1, activo: true });
});

test('lee una membresía emitida por Recepción, que usa su propio namespace', () => {
  const estado = estadoDeCoverage(
    cobertura([
      { url: `${BW}/tipo-cobertura`, valueCode: 'membresia' },
      { url: `${BW}/sesiones-mes`, valueInteger: 4 },
      { url: `${BW}/sesiones-usadas`, valueInteger: 1 },
    ])
  );
  expect(estado).toMatchObject({ tipo: 'membresia', total: 4, usadas: 1, activo: true });
});

test('lee un paquete de Recepción con sus sesiones totales', () => {
  const estado = estadoDeCoverage(
    cobertura([
      { url: `${BW}/tipo-cobertura`, valueCode: 'paquete' },
      { url: `${BW}/sesiones-total`, valueInteger: 10 },
      { url: `${BW}/sesiones-usadas`, valueInteger: 3 },
    ])
  );
  expect(estado).toMatchObject({ tipo: 'paquete', total: 10, usadas: 3 });
});

test('reconoce el programa (Plan Bienestar), que no tiene sesiones', () => {
  const estado = estadoDeCoverage(
    cobertura([
      { url: `${BW}/tipo-cobertura`, valueCode: 'programa' },
      { url: `${BW}/plan-codigo`, valueString: 'PB100D' },
    ])
  );
  expect(estado.tipo).toBe('programa');
  expect(estado.total).toBe(0);
});

test('sin tipo declarado cae en membresía (comportamiento histórico)', () => {
  expect(estadoDeCoverage(cobertura([])).tipo).toBe('membresia');
});

test('Sesiones lista los planes de Recepción y excluye el programa', async () => {
  const ref = { reference: 'Patient/p1' };
  const coberturas: Coverage[] = [
    {
      resourceType: 'Coverage',
      id: 'cov-paquete',
      status: 'active',
      beneficiary: ref,
      payor: [ref],
      extension: [
        { url: `${BW}/tipo-cobertura`, valueCode: 'paquete' },
        { url: `${BW}/plan-codigo`, valueString: 'PAQ-10' },
        { url: `${BW}/sesiones-total`, valueInteger: 10 },
        { url: `${BW}/sesiones-usadas`, valueInteger: 2 },
      ],
    },
    {
      resourceType: 'Coverage',
      id: 'cov-programa',
      status: 'active',
      beneficiary: ref,
      payor: [ref],
      period: { start: '2026-07-25', end: '2026-11-02' },
      extension: [
        { url: `${BW}/tipo-cobertura`, valueCode: 'programa' },
        { url: `${BW}/plan-codigo`, valueString: 'PB100D' },
      ],
    },
  ];

  // MockClient no indexa el search param `beneficiary` de Coverage; alcanza con
  // un cliente mínimo que devuelva lo que la función consulta.
  const medplum = {
    searchResources: async (tipo: string) => (tipo === 'Coverage' ? coberturas : []),
  } as unknown as MedplumClient;

  const filas = await cargarSesiones(medplum, { resourceType: 'Patient', id: 'p1' });

  // El paquete se ve con su saldo; el programa no aparece (se vería "agotado").
  expect(filas.map((f) => f.planCodigo)).toEqual(['PAQ-10']);
  expect(filas[0]).toMatchObject({ total: 10, usadas: 2, restantes: 8, agotado: false });
});
