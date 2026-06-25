// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Box, Button, Group, Modal, NumberInput, Stack, Table, Title } from '@mantine/core';
import { createReference, formatDate, formatDateTime, formatObservationValue, getReferenceString } from '@medplum/core';
import type { Observation, ObservationComponent, Patient } from '@medplum/fhirtypes';
import { Document, Form, useMedplum } from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import type { ChartData } from 'chart.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { useParams } from 'react-router';
import { LineChart } from '../../components/LineChart';
import { showErrorNotification } from '../../utils/notifications';
import { measurementsMeta } from './Measurement.data';

export function Measurement(): JSX.Element {
  const { measurementId } = useParams();
  const { code, title, description, chartDatasets } = measurementsMeta[measurementId as string];
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [observations, setObservations] = useState<Observation[]>();

  // Carga con estado (no Suspense): el `.read()` re-suspendía al guardar y dejaba el
  // Modal de Mantine a medio cerrar (scroll-lock activo) → la página quedaba "frizada".
  const loadData = useCallback(() => {
    medplum
      .searchResources('Observation', `code=${code}&patient=${getReferenceString(patient)}&_sort=-date&_count=200`)
      .then(setObservations)
      .catch(showErrorNotification);
  }, [medplum, code, patient]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const chartData = useMemo<ChartData<'line', number[]> | undefined>(() => {
    if (!observations) {
      return undefined;
    }
    // Las observaciones vienen ordenadas de la más nueva a la más vieja; el gráfico
    // las quiere cronológicas.
    const ascending = [...observations].reverse();
    const labels: string[] = [];
    const datasets = chartDatasets.map((item) => ({ ...item, data: [] as number[] }));
    for (const obs of ascending) {
      labels.push(formatDate(obs.effectiveDateTime));
      if (chartDatasets.length === 1) {
        datasets[0].data.push(obs.valueQuantity?.value as number);
      } else {
        for (let i = 0; i < chartDatasets.length; i++) {
          datasets[i].data.push((obs.component as ObservationComponent[])[i].valueQuantity?.value as number);
        }
      }
    }
    return { labels, datasets };
  }, [observations, chartDatasets]);

  function addObservation(formData: Record<string, string>): void {
    const obs: Observation = {
      resourceType: 'Observation',
      status: 'preliminary',
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'vital-signs',
              display: 'Vital Signs',
            },
          ],
        },
      ],
      subject: createReference(patient),
      effectiveDateTime: new Date().toISOString(),
      code: {
        coding: [
          {
            code,
            display: title,
            system: 'http://loinc.org',
          },
        ],
        text: title,
      },
    };

    if (chartDatasets.length === 1) {
      obs.valueQuantity = {
        value: Number.parseFloat(formData[chartDatasets[0].label]),
        system: 'http://unitsofmeasure.org',
        unit: chartDatasets[0].unit,
        code: chartDatasets[0].unit,
      };
    } else {
      obs.component = chartDatasets.map((item) => ({
        code: {
          coding: [
            {
              code: '8462-4',
              display: 'Diastolic Blood Pressure',
              system: 'http://loinc.org',
            },
          ],
          text: item.label,
        },
        valueQuantity: {
          value: Number.parseFloat(formData[item.label]),
          system: 'http://unitsofmeasure.org',
          unit: item.unit,
          code: item.unit,
        },
      }));
    }

    setSubmitting(true);
    medplum
      .createResource(obs)
      .then(() => {
        setModalOpen(false);
        loadData();
      })
      .catch(showErrorNotification)
      .finally(() => setSubmitting(false));
  }

  return (
    <Document>
      <Group justify="space-between" mb="xl">
        <Title order={1}>{title}</Title>
        <Button onClick={() => setModalOpen(true)}>Cargar medición</Button>
      </Group>
      {chartData && <LineChart chartData={chartData} />}
      <Box my="xl">
        <Alert icon={<IconAlertCircle size={16} />} title="¿Qué es esta medición?" color="gray" radius="md">
          {description}
        </Alert>
      </Box>
      {observations && observations.length > 0 && (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Fecha</Table.Th>
              <Table.Th>Tu valor</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {observations.map((obs) => (
              <Table.Tr key={obs.id}>
                <Table.Td>{formatDateTime(obs.effectiveDateTime as string)}</Table.Td>
                <Table.Td>{formatObservationValue(obs)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      <Modal size="lg" opened={modalOpen} onClose={() => setModalOpen(false)} title={title}>
        <Form onSubmit={addObservation}>
          <Stack gap="md">
            <Group grow wrap="nowrap">
              {chartDatasets.map((component) => (
                <NumberInput key={component.label} label={component.label} name={component.label} />
              ))}
            </Group>
            <Group justify="flex-end">
              <Button type="submit" loading={submitting}>
                Guardar
              </Button>
            </Group>
          </Stack>
        </Form>
      </Modal>
    </Document>
  );
}
