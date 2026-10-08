// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Mi Segunda Opinión — el paciente ve el estado de sus solicitudes y, cuando están
// completadas, lee el informe (DiagnosticReport), el score PREVENT (RiskAssessment) y
// descarga el PDF. Todo es de SOLO LECTURA: lo genera el bot, el portal solo lo muestra.
// El nombre del servicio ("Segunda Opinión") sale de la marca (`MARCA.producto`).
import { Alert, Badge, Box, Button, Card, Divider, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { formatDateTime } from '@medplum/core';
import type { DocumentReference, Patient, ServiceRequest } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconDownload, IconFilePlus, IconInfoCircle, IconReportMedical } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { PreventScore } from '../components/PreventScore';
import {
  cargarInformeSOM,
  cargarMisSolicitudesSOM,
  ESTADO_SOM,
  extractPrevent,
  SOM_SECTIONS_EXT,
  type InformeSOM,
} from '../fhir/som';
import { MARCA } from '../marca';
import { showErrorNotification } from '../utils/notifications';

// Secciones del informe (clave en la extensión som-sections → título legible).
const SECCIONES: readonly (readonly [string, string])[] = [
  ['executive-summary', 'Resumen ejecutivo'],
  ['risk-assessment', 'Análisis de riesgo cardiovascular'],
  ['history-analysis', 'Evaluación de antecedentes y medicación'],
  ['studies-analysis', 'Análisis de estudios presentados'],
  ['conclusions', 'Conclusiones y recomendaciones'],
  ['pending-studies', 'Estudios sugeridos'],
];

function getSecciones(informe: InformeSOM): { title: string; text: string }[] {
  const grupo = informe.report?.extension?.find((e) => e.url === SOM_SECTIONS_EXT);
  const subs = grupo?.extension ?? [];
  return SECCIONES.map(([key, title]) => ({
    title,
    text: subs.find((s) => s.url === key)?.valueString ?? '',
  })).filter((s) => s.text);
}

async function descargarPdf(medplum: ReturnType<typeof useMedplum>, pdf: DocumentReference): Promise<void> {
  const att =
    pdf.content?.find((c) => c.attachment?.contentType === 'application/pdf')?.attachment ?? pdf.content?.[0]?.attachment;
  if (!att) {
    return;
  }
  let blob: Blob;
  if (att.url) {
    blob = await medplum.download(att.url);
  } else if (att.data) {
    const bytes = Uint8Array.from(atob(att.data), (c) => c.charCodeAt(0));
    blob = new Blob([bytes], { type: att.contentType ?? 'application/pdf' });
  } else {
    return;
  }
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = att.title ?? 'informe-segunda-opinion.pdf';
  a.click();
  URL.revokeObjectURL(objectUrl);
}

function estadoDe(sr: ServiceRequest): { label: string; color: string } {
  return ESTADO_SOM[sr.status ?? ''] ?? { label: sr.status ?? '—', color: 'gray' };
}

export function MiSegundaOpinion(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const patient = medplum.getProfile() as Patient;

  const [solicitudes, setSolicitudes] = useState<ServiceRequest[]>();
  const [selected, setSelected] = useState<ServiceRequest>();
  const [informe, setInforme] = useState<InformeSOM>();
  const [cargandoInforme, setCargandoInforme] = useState(false);
  const [descargando, setDescargando] = useState(false);

  useEffect(() => {
    cargarMisSolicitudesSOM(medplum, patient).then(setSolicitudes).catch(showErrorNotification);
  }, [medplum, patient]);

  const verInforme = useCallback(
    (sr: ServiceRequest): void => {
      setSelected(sr);
      setInforme(undefined);
      setCargandoInforme(true);
      cargarInformeSOM(medplum, sr)
        .then(setInforme)
        .catch(showErrorNotification)
        .finally(() => setCargandoInforme(false));
    },
    [medplum]
  );

  const handleDescargar = async (): Promise<void> => {
    if (!informe?.pdf) {
      return;
    }
    setDescargando(true);
    try {
      await descargarPdf(medplum, informe.pdf);
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setDescargando(false);
    }
  };

  return (
    <Document width={800}>
      <Group justify="space-between" align="center" mb="md">
        <Title order={2}>Mi {MARCA.producto}</Title>
        <Button
          leftSection={<IconFilePlus size={16} />}
          variant="light"
          onClick={() => navigate('/solicitar-som')?.catch(console.error)}
        >
          Nueva solicitud
        </Button>
      </Group>

      {solicitudes === undefined ? (
        <Loader />
      ) : solicitudes.length === 0 ? (
        <Alert color="segundaOpinion" variant="light" icon={<IconInfoCircle />} title="Todavía no tenés solicitudes">
          Cuando pidas una {MARCA.producto} vas a ver acá su estado y, al completarse, el informe y el PDF.
          <Group mt="sm">
            <Button size="xs" onClick={() => navigate('/solicitar-som')?.catch(console.error)}>
              Solicitar una {MARCA.producto}
            </Button>
          </Group>
        </Alert>
      ) : (
        <Stack gap="sm">
          {solicitudes.map((sr) => {
            const e = estadoDe(sr);
            const completada = sr.status === 'completed';
            const activa = selected?.id === sr.id;
            return (
              <Card key={sr.id} withBorder radius="md" p="md">
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <div>
                    <Text fw={500}>{sr.reasonCode?.[0]?.text ?? `${MARCA.producto} Cardiológica`}</Text>
                    <Text size="xs" c="dimmed">
                      {sr.authoredOn ? formatDateTime(sr.authoredOn) : ''}
                    </Text>
                  </div>
                  <Group gap="xs" wrap="nowrap">
                    <Badge color={e.color} variant="light">
                      {e.label}
                    </Badge>
                    {completada && (
                      <Button
                        size="xs"
                        variant={activa ? 'filled' : 'light'}
                        leftSection={<IconReportMedical size={14} />}
                        onClick={() => verInforme(sr)}
                      >
                        Ver informe
                      </Button>
                    )}
                  </Group>
                </Group>
              </Card>
            );
          })}
        </Stack>
      )}

      {/* Detalle del informe seleccionado */}
      {selected && (
        <>
          <Divider my="xl" />
          <Title order={3} mb="md">
            Informe de {MARCA.producto}
          </Title>
          {cargandoInforme ? (
            <Loader />
          ) : !informe?.report ? (
            <Text c="dimmed">El informe todavía no está disponible.</Text>
          ) : (
            <Stack gap="lg">
              {informe.risk && <PreventScore valores={extractPrevent(informe.risk)} />}

              {getSecciones(informe).map((s) => (
                <Box key={s.title}>
                  <Title order={5} mb={4}>
                    {s.title}
                  </Title>
                  <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                    {s.text}
                  </Text>
                </Box>
              ))}

              {informe.pdf && (
                <Group>
                  <Button leftSection={<IconDownload size={16} />} loading={descargando} onClick={handleDescargar}>
                    Descargar PDF
                  </Button>
                </Group>
              )}
            </Stack>
          )}
        </>
      )}
    </Document>
  );
}
