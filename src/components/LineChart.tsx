// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ChartData } from 'chart.js';
import { lazy, Suspense } from 'react';
import type { JSX } from 'react';

const lineChartOptions = {
  responsive: true,
  scales: {
    y: {
      min: 0,
    },
  },
  plugins: {
    legend: {
      position: 'bottom' as const,
    },
  },
};

interface LineChartProps {
  readonly chartData: ChartData<'line', number[]>;
  /** false: el eje Y se ajusta a los datos (p. ej. peso, donde desde 0 la curva queda plana). */
  readonly desdeCero?: boolean;
}

const lineChartOptionsAjustado = { ...lineChartOptions, scales: { y: {} } };

const AsyncLine = lazy(async () => {
  const { CategoryScale, Chart, Legend, LinearScale, LineElement, PointElement, Title, Tooltip } =
    await import('chart.js');
  Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);
  const { Line } = await import('react-chartjs-2');
  return { default: Line };
});

export function LineChart({ chartData, desdeCero = true }: LineChartProps): JSX.Element {
  return (
    <div className="my-5">
      <Suspense fallback={<div>Loading...</div>}>
        <AsyncLine options={desdeCero ? lineChartOptions : lineChartOptionsAjustado} data={chartData} />
      </Suspense>
    </div>
  );
}
