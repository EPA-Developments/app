// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// «Tus valores» dibujado: el gráfico con su descripción, el anillo del origen (punteado sin
// revisión, sólido del equipo), los ejes sin dato y la lista que se lee en el celular.
// Pacientes sintéticas.
import type { Observation } from '@medplum/fhirtypes';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { RUTA_ENVIAR_ESTUDIOS } from '../../components/AccionesRapidas';
import { BASICOS, modeloHgraph } from './hgraph';
import { HGraphPaciente, NOTA_HGRAPH, TEXTO_SIN_VALORES } from './HGraphPaciente';

const HOY = '2026-10-10';

const lectura = (code: string, value: number, unit: string, autor: string): Observation => ({
  resourceType: 'Observation',
  status: 'final',
  code: { coding: [{ system: 'http://loinc.org', code }] },
  effectiveDateTime: '2026-09-15',
  valueQuantity: { value, unit },
  meta: { author: { reference: autor } },
});

function dibujar(observaciones: Observation[], tema: 'claro' | 'oscuro' = 'claro'): HTMLElement {
  const { container } = render(
    <MemoryRouter>
      <HGraphPaciente modelo={modeloHgraph(observaciones, { sexo: 'male', hoy: HOY })} tema={tema} hoy={HOY} />
    </MemoryRouter>
  );
  return container;
}

test('el gráfico, el origen de cada punto y los ejes que faltan', () => {
  const contenedor = dibujar([
    lectura('1558-6', 96, 'mg/dL', 'Patient/p1'),
    lectura('13457-7', 130, 'mg/dL', 'Practitioner/dr'),
    lectura('2085-9', 52, 'mg/dL', 'Bot/lab'),
  ]);
  expect(screen.getByRole('img', { name: 'Tus valores: 2 en rango, 1 para mirar. Faltan 10.' })).toBeInTheDocument();
  const glucemia = contenedor.querySelector('[data-punto="glucoseFasting"]') as SVGElement;
  const ldl = contenedor.querySelector('[data-punto="ldlc"]') as SVGElement;
  expect(glucemia.dataset.estado).toBe('healthy');
  expect(ldl.dataset.estado).toBe('moderate');
  // Punteado lo que nadie del equipo cargó, sólido lo del equipo.
  expect(glucemia.querySelector('circle')?.getAttribute('stroke-dasharray')).toBeTruthy();
  expect(ldl.querySelector('circle')?.getAttribute('stroke-dasharray')).toBeNull();
  expect(contenedor.querySelectorAll('[data-falta]')).toHaveLength(BASICOS.length - 3);
});

test('la lista: valor con coma, estado, fecha y quién lo cargó; «Falta» donde no hay', () => {
  const contenedor = dibujar([lectura('4548-4', 5.9, '%', 'Bot/lab')]);
  const fila = contenedor.querySelector('[data-valor="hba1c"]') as HTMLElement;
  expect(within(fila).getByText('Azúcar promedio (HbA1c)')).toBeInTheDocument();
  expect(fila).toHaveTextContent('5,9 %');
  expect(fila).toHaveTextContent('Para mirar');
  expect(fila).toHaveTextContent('15 de septiembre · Leído de tu laboratorio, sin revisar');
  const sinDato = contenedor.querySelector('[data-valor="sbp"]') as HTMLElement;
  expect(within(sinDato).getByText('Falta')).toBeInTheDocument();
  expect(screen.getByText(NOTA_HGRAPH)).toBeInTheDocument();
  // Con básicos que faltan, cómo traerlos.
  expect(screen.getByRole('link', { name: 'Mandá tu laboratorio en PDF' })).toHaveAttribute(
    'href',
    RUTA_ENVIAR_ESTUDIOS
  );
});

test('sin ningún dato no se dibuja un gráfico vacío', () => {
  dibujar([], 'oscuro');
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByText(TEXTO_SIN_VALORES)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Cargá tus datos' })).toBeInTheDocument();
});
