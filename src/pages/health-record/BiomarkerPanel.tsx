// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Accordion,
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { createReference, formatDate, getReferenceString } from '@medplum/core';
import type { Observation, Patient } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconInfoCircle, IconPlus } from '@tabler/icons-react';
import type { ChartData } from 'chart.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { Navigate, useParams } from 'react-router';
import { LineChart } from '../../components/LineChart';
import { showErrorNotification } from '../../utils/notifications';
import type { Biomarker, PatientSex } from './Biomarkers.data';
import { biomarkerPanels, isSexSpecific } from './Biomarkers.data';
import { EsencialesPendientes } from './EsencialesPendientes';
import type { ServerBiomarker } from '../../fhir/biomarkers';
import {
  codigosDe,
  fetchServerBiomarkers,
  observacionCargada,
  observacionesDe,
  rangoAplicable,
  semaforo,
  textoRango,
  textoValor,
  unidadVisible,
} from '../../fhir/biomarkers';

const chartColors = {
  backgroundColor: 'rgba(29, 112, 214, 0.7)',
  borderColor: 'rgba(29, 112, 214, 1)',
};

export function BiomarkerPanel(): JSX.Element {
  const { panelId } = useParams();
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  const sex: PatientSex = patient.gender === 'male' ? 'male' : patient.gender === 'female' ? 'female' : undefined;
  const panel = panelId ? biomarkerPanels[panelId] : undefined;

  const [observations, setObservations] = useState<Observation[]>([]);
  // undefined = cargando; [] = el servidor no publica el catálogo (o no se pudo leer).
  const [catalogo, setCatalogo] = useState<ServerBiomarker[] | undefined>();
  const [activeBiomarker, setActiveBiomarker] = useState<Biomarker | null>(null);
  const [value, setValue] = useState<number | string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));

  // Los analitos del panel los publica el servidor (ObservationDefinition).
  const items: Biomarker[] = useMemo(() => (catalogo ?? []).filter((b) => b.panel === panelId), [catalogo, panelId]);

  const codes = [...new Set(items.flatMap(codigosDe))].join(',');

  const loadData = useCallback(() => {
    if (!codes) {
      return;
    }
    medplum
      .searchResources('Observation', `code=${codes}&patient=${getReferenceString(patient)}&_sort=-date&_count=200`)
      .then(setObservations)
      .catch(showErrorNotification);
  }, [medplum, codes, patient]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    fetchServerBiomarkers(medplum)
      .then(setCatalogo)
      .catch((err) => {
        console.warn('Catálogo de biomarcadores del servidor no disponible.', err);
        setCatalogo([]);
      });
  }, [medplum]);

  if (!panel) {
    return <Navigate replace to="/health-record/biomarkers/metabolico" />;
  }

  function openModal(bm: Biomarker): void {
    setActiveBiomarker(bm);
    setValue('');
    setDate(new Date().toISOString().slice(0, 10));
  }

  function submitObservation(): void {
    const bm = activeBiomarker;
    if (!bm || !panel || value === '' || Number.isNaN(Number(value))) {
      return;
    }
    medplum
      .createResource(observacionCargada(bm, panel, Number(value), date, createReference(patient), sex))
      .then(() => {
        notifications.show({ color: 'green', title: 'Cargado', message: `${bm.title} guardado correctamente.` });
        setActiveBiomarker(null);
        loadData();
      })
      .catch(showErrorNotification);
  }

  return (
    <Document>
      <Title order={1} mb="xs">
        {panel.title}
      </Title>
      <Text c="dimmed" mb="xl">
        {panel.description}
      </Text>

      {catalogo && catalogo.length > 0 && <EsencialesPendientes catalogo={catalogo} />}

      {catalogo === undefined && <Loader size="sm" />}
      {catalogo !== undefined && items.length === 0 && (
        <Alert icon={<IconInfoCircle size={16} />} color="gray" radius="md">
          Los estudios de este panel no están disponibles en este momento. Probá de nuevo más tarde.
        </Alert>
      )}

      <Accordion variant="separated" multiple>
        {items.map((bm) => {
          const unidad = unidadVisible(bm);
          const history = observacionesDe(bm, observations);
          const latest = history[0];
          const aplicable = rangoAplicable(bm, sex, latest);
          const sexAware = isSexSpecific(bm);
          const noRangeForSex = sexAware && !aplicable;
          const valorTexto = textoValor(latest, unidad);
          const color = semaforo(latest?.valueQuantity?.value, aplicable?.rango);

          const ascending = [...history].reverse().filter((obs) => obs.valueQuantity?.value !== undefined);
          const chartData: ChartData<'line', number[]> = {
            labels: ascending.map((obs) => formatDate(obs.effectiveDateTime)),
            datasets: [
              {
                label: `${bm.title} (${unidad})`,
                data: ascending.map((obs) => obs.valueQuantity?.value as number),
                ...chartColors,
              },
            ],
          };

          return (
            <Accordion.Item key={bm.code} value={bm.code}>
              <Accordion.Control>
                <Group justify="space-between" wrap="nowrap" pr="md">
                  <Group gap="xs" wrap="nowrap">
                    <Text fw={500}>{bm.title}</Text>
                    {bm.nivel === 'esencial' && (
                      <Badge color="blue" variant="outline" size="xs">
                        Esencial
                      </Badge>
                    )}
                  </Group>
                  <Badge color={color} variant="light" size="lg">
                    {valorTexto ?? 'Sin datos'}
                  </Badge>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="md">
                  {bm.description && (
                    <Text size="sm" c="dimmed">
                      {bm.description}
                    </Text>
                  )}
                  <Text size="sm">
                    {aplicable?.fuente === 'guia' ? (
                      <>
                        <b>Rango de referencia (guía):</b> {textoRango(aplicable.rango)} {unidad}
                      </>
                    ) : aplicable ? (
                      <>
                        <b>Rango de tu laboratorio:</b> {textoRango(aplicable.rango)}
                        {aplicable.rango.low !== undefined || aplicable.rango.high !== undefined ? ` ${unidad}` : ''}
                      </>
                    ) : (
                      <>
                        <b>Rango de referencia:</b> el que figura en tu informe de laboratorio.
                      </>
                    )}
                  </Text>
                  {latest?.method?.text && (
                    <Text size="xs" c="dimmed">
                      Último valor: {latest.method.text}.
                    </Text>
                  )}
                  {sexAware &&
                    (sex ? (
                      <Text size="xs" c="dimmed">
                        Rango según tu sexo: {sex === 'male' ? 'masculino ♂' : 'femenino ♀'}
                      </Text>
                    ) : (
                      <Text size="xs" c="dimmed">
                        Cargá tu sexo en el perfil para ver el rango de referencia correcto.
                      </Text>
                    ))}
                  {noRangeForSex && (
                    <Text size="xs" c="orange.7">
                      Rango no definido para tu sexo — a confirmar con tu médico.
                    </Text>
                  )}

                  <Group justify="flex-end">
                    <Button leftSection={<IconPlus size={16} />} onClick={() => openModal(bm)}>
                      Cargar resultado
                    </Button>
                  </Group>

                  {history.length > 0 ? (
                    <>
                      {ascending.length > 1 && <LineChart chartData={chartData} />}
                      <Table.ScrollContainer minWidth={320}>
                        <Table striped highlightOnHover>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>Fecha</Table.Th>
                              <Table.Th>Valor</Table.Th>
                              <Table.Th>Estado</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {history.map((obs) => (
                              <Table.Tr key={obs.id}>
                                <Table.Td>{formatDate(obs.effectiveDateTime)}</Table.Td>
                                <Table.Td>{textoValor(obs, unidad) ?? '—'}</Table.Td>
                                <Table.Td>
                                  <Badge
                                    color={semaforo(obs.valueQuantity?.value, rangoAplicable(bm, sex, obs)?.rango)}
                                    variant="dot"
                                    size="sm"
                                  />
                                </Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </Table.ScrollContainer>
                    </>
                  ) : (
                    <Text size="sm" c="dimmed">
                      Todavía no hay resultados para este estudio.
                    </Text>
                  )}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          );
        })}
      </Accordion>

      <Box mt="xl">
        <Alert icon={<IconInfoCircle size={16} />} color="gray" radius="md">
          Los valores que cargás a mano quedan registrados como preliminares hasta que un profesional de tu equipo los
          valide. Los rangos son los de las guías (AHA/ACC, ADA, guía cardio-reno-metabólica 2026); si la guía no fija
          uno, se usa el de tu laboratorio.
        </Alert>
      </Box>

      <Modal
        opened={activeBiomarker !== null}
        onClose={() => setActiveBiomarker(null)}
        title={activeBiomarker ? `Cargar ${activeBiomarker.title}` : ''}
      >
        <Stack gap="md">
          <NumberInput
            label={`Valor${activeBiomarker ? ` (${unidadVisible(activeBiomarker)})` : ''}`}
            placeholder="Ingresá el valor"
            value={value}
            onChange={setValue}
            decimalScale={2}
            step={0.1}
          />
          <TextInput
            label="Fecha del estudio"
            type="date"
            value={date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setActiveBiomarker(null)}>
              Cancelar
            </Button>
            <Button onClick={submitObservation} disabled={value === ''}>
              Guardar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Document>
  );
}
