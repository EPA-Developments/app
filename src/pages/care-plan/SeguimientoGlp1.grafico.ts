// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import type { ChartData } from 'chart.js';
import type { MetaGlp1, PesoRegistrado } from '../../fhir/glp1';
import { formatearInstante } from '../../fhir/glp1';

/** Serie de peso y, si la meta está en kg, una línea punteada con la meta. */
export function datosGraficoPeso(
  pesos: PesoRegistrado[],
  meta: MetaGlp1 | undefined
): ChartData<'line', number[]> | undefined {
  if (pesos.length === 0) {
    return undefined;
  }
  const datasets: ChartData<'line', number[]>['datasets'] = [
    {
      label: 'Tu peso (kg)',
      data: pesos.map((p) => p.kg),
      borderColor: 'rgba(29, 112, 214, 1)',
      backgroundColor: 'rgba(29, 112, 214, 0.7)',
    },
  ];
  if (meta?.tipo === 'kg') {
    datasets.push({
      label: 'Tu meta (kg)',
      data: pesos.map(() => meta.valor),
      borderColor: 'rgba(47, 158, 68, 1)',
      backgroundColor: 'rgba(47, 158, 68, 0.4)',
      borderDash: [6, 6],
      pointRadius: 0,
    });
  }
  return { labels: pesos.map((p) => formatearInstante(p.fecha).slice(0, 5)), datasets };
}
