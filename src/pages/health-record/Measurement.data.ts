// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
export interface ObservationType {
  id: string;
  code: string;
  title: string;
  description: string;
  chartDatasets: {
    label: string;
    code?: string;
    unit: string;
    backgroundColor: string;
    borderColor: string;
  }[];
}

const backgroundColor = 'rgba(29, 112, 214, 0.7)';
const borderColor = 'rgba(29, 112, 214, 1)';
const secondBackgroundColor = 'rgba(255, 119, 0, 0.7)';
const secondBorderColor = 'rgba(255, 119, 0, 1)';

export const measurementsMeta: Record<string, ObservationType> = {
  'blood-pressure': {
    id: 'blood-pressure',
    code: '85354-9',
    title: 'Presión arterial',
    description:
      'La presión arterial es la fuerza que ejerce la sangre sobre las paredes de tus vasos sanguíneos. Cuando es alta, puede dañarlos y aumentar el riesgo de infarto o ACV. La medimos periódicamente para controlar que no se mantenga elevada. La hipertensión es la condición de tener la presión arterial alta de forma sostenida.',
    chartDatasets: [
      {
        label: 'Diastólica',
        code: '8462-4',
        unit: 'mm[Hg]',
        backgroundColor: secondBackgroundColor,
        borderColor: secondBorderColor,
      },
      {
        label: 'Sistólica',
        code: '8480-6',
        unit: 'mm[Hg]',
        backgroundColor,
        borderColor,
      },
    ],
  },
  'body-temperature': {
    id: 'body-temperature',
    code: '8310-5',
    title: 'Temperatura corporal',
    description: 'Tus valores de temperatura corporal',
    chartDatasets: [
      {
        label: 'Temperatura corporal',
        unit: '°C',
        backgroundColor,
        borderColor,
      },
    ],
  },
  height: {
    id: 'height',
    code: '8302-2',
    title: 'Altura',
    description: 'Tus valores de altura',
    chartDatasets: [
      {
        label: 'Altura',
        unit: 'cm',
        backgroundColor,
        borderColor,
      },
    ],
  },
  'respiratory-rate': {
    id: 'respiratory-rate',
    code: '9279-1',
    title: 'Frecuencia respiratoria',
    description: 'Tus valores de frecuencia respiratoria',
    chartDatasets: [
      {
        label: 'Frecuencia respiratoria',
        unit: 'resp/min',
        backgroundColor,
        borderColor,
      },
    ],
  },
  'heart-rate': {
    id: 'heart-rate',
    code: '8867-4',
    title: 'Frecuencia cardíaca',
    description: 'Tus valores de frecuencia cardíaca',
    chartDatasets: [
      {
        label: 'Frecuencia cardíaca',
        unit: 'lpm',
        backgroundColor,
        borderColor,
      },
    ],
  },
  weight: {
    id: 'weight',
    code: '29463-7',
    title: 'Peso',
    description: 'Tus valores de peso',
    chartDatasets: [
      {
        label: 'Peso',
        unit: 'kg',
        backgroundColor,
        borderColor,
      },
    ],
  },
};
