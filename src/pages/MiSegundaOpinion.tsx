// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Mi Segunda Opinión — el paciente ve el estado de sus solicitudes y, cuando están
// completadas, lee el informe (DiagnosticReport), el score PREVENT (RiskAssessment) y
// descarga el PDF. Todo es de SOLO LECTURA: lo genera el bot, el portal solo lo muestra.
// El informe llega firmado por un cardiólogo (R-24 de Recepción): mientras lo revisa, la
// solicitud dice «En revisión por el cardiólogo» (`estadoSolicitudSOM`, con las tareas de firma
// de la paciente en una sola búsqueda) y no se muestra nada del informe: ni secciones, ni PDF,
// ni PREVENT (el RiskAssessment nace con el borrador y la API ya lo deja leer). Firmado, dice
// «Firmado por …»; los informes de antes de la firma se ven como siempre.
// `?solicitud=<id>` abre esa solicitud (lo usa la Novedad `informe-som-firmado`).
// El PDF se baja con `descargarPdfDelDocumento`: vuelve a leer el documento antes (su link
// es firmado y vence, y el informe pudo quedar abierto un rato) y avisa si el server no da el
// archivo, en vez de guardar su error como si fuera el PDF.
// El nombre del servicio ("Segunda Opinión") sale de la marca (`MARCA.producto`).
import { Alert, Badge, Box, Button, Card, Divider, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { formatHumanName } from '@medplum/core';
import type { Patient, Practitioner, ServiceRequest, Task } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconDownload, IconFilePlus, IconInfoCircle, IconReportMedical } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { PreventScore } from '../components/PreventScore';
import { fechaYHora } from '../fhir/fechas';
import {
  cargarInformeSOM,
  cargarMisSolicitudesSOM,
  cargarTareasFirma,
  estadoSolicitudSOM,
  etiquetaSolicitudSOM,
  extractPrevent,
  firmanteDelInforme,
  SOM_SECTIONS_EXT,
  type InformeSOM,
} from '../fhir/som';
import { MARCA } from '../marca';
import { descargarPdfDelDocumento } from '../utils/adjuntos';
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

/** Lo que ve la paciente mientras el cardiólogo revisa el informe. */
export const TEXTO_EN_REVISION =
  'Un cardiólogo de nuestro equipo está revisando tu informe. Cuando lo firme, te avisamos y lo vas a poder ver acá.';

/** «Firmado por …» con el nombre del Practitioner, o sin nombre si no se pudo leer. */
function textoFirma(firmante: Practitioner | undefined): string {
  const nombre = firmante?.name?.[0] ? formatHumanName(firmante.name[0]).trim() : '';
  return nombre ? `Firmado por ${nombre}` : 'Firmado por el cardiólogo';
}

/** Las tareas de firma; si no se pueden leer, ninguna (la solicitud se ve «En análisis», como antes). */
async function tareasFirmaOVacio(...args: Parameters<typeof cargarTareasFirma>): Promise<Task[]> {
  try {
    return await cargarTareasFirma(...args);
  } catch (err) {
    console.warn('No se pudieron leer las tareas de firma de la Segunda Opinión.', err);
    return [];
  }
}

export function MiSegundaOpinion(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const pedida = params.get('solicitud');
  const patient = medplum.getProfile() as Patient;

  const [solicitudes, setSolicitudes] = useState<ServiceRequest[]>();
  const [tareasFirma, setTareasFirma] = useState<Task[]>([]);
  const [selected, setSelected] = useState<ServiceRequest>();
  const [informe, setInforme] = useState<InformeSOM>();
  const [firmante, setFirmante] = useState<Practitioner>();
  const [cargandoInforme, setCargandoInforme] = useState(false);
  const [descargando, setDescargando] = useState(false);
  // La última solicitud pedida: la respuesta de una anterior no pisa el informe de otra.
  const pedidoInforme = useRef<string>(undefined);

  useEffect(() => {
    if (pedida) {
      // Llega de la Novedad del informe firmado: las búsquedas en la caché del cliente (la Home
      // las acaba de hacer) pueden ser de antes de la firma.
      for (const tipo of ['ServiceRequest', 'Task', 'DiagnosticReport', 'DocumentReference'] as const) {
        medplum.invalidateSearches(tipo);
      }
    }
    Promise.all([cargarMisSolicitudesSOM(medplum, patient), tareasFirmaOVacio(medplum, patient)])
      .then(([srs, tareas]) => {
        setTareasFirma(tareas);
        setSolicitudes(srs);
      })
      .catch(showErrorNotification);
  }, [medplum, patient, pedida]);

  const verInforme = useCallback(
    (sr: ServiceRequest): void => {
      setSelected(sr);
      setInforme(undefined);
      setFirmante(undefined);
      setCargandoInforme(true);
      pedidoInforme.current = sr.id;
      const vigente = (): boolean => pedidoInforme.current === sr.id;
      cargarInformeSOM(medplum, sr)
        .then(async (cargado) => {
          // El nombre es opcional: si el Practitioner no se puede leer, dice «Firmado por el cardiólogo».
          const ref = firmanteDelInforme(cargado.report);
          const quien = ref ? await medplum.readReference(ref).catch(() => undefined) : undefined;
          if (vigente()) {
            setInforme(cargado);
            setFirmante(quien);
          }
        })
        .catch(showErrorNotification)
        .finally(() => {
          if (vigente()) {
            setCargandoInforme(false);
          }
        });
    },
    [medplum]
  );

  // `?solicitud=<id>` (la Novedad del informe firmado): abre ese informe, si ya está para ver.
  useEffect(() => {
    const sr = pedida ? solicitudes?.find((s) => s.id === pedida) : undefined;
    if (sr?.status === 'completed') {
      verInforme(sr);
    }
  }, [pedida, solicitudes, verInforme]);

  const handleDescargar = async (): Promise<void> => {
    if (!informe?.pdf) {
      return;
    }
    setDescargando(true);
    try {
      await descargarPdfDelDocumento(medplum, informe.pdf, 'informe-segunda-opinion.pdf');
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
            const e = etiquetaSolicitudSOM(sr, tareasFirma);
            const enRevision = estadoSolicitudSOM(sr, tareasFirma) === 'en-revision';
            const completada = sr.status === 'completed';
            const activa = selected?.id === sr.id;
            return (
              <Card key={sr.id} withBorder radius="md" p="md">
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <div>
                    <Text fw={500}>{sr.reasonCode?.[0]?.text ?? `${MARCA.producto} Cardiológica`}</Text>
                    <Text size="xs" c="dimmed">
                      {sr.authoredOn ? fechaYHora(sr.authoredOn) : ''}
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
                {enRevision && (
                  <Text size="sm" c="dimmed" mt="xs">
                    {TEXTO_EN_REVISION}
                  </Text>
                )}
              </Card>
            );
          })}
        </Stack>
      )}

      {/* Detalle del informe seleccionado: sólo de una solicitud completada (nunca el borrador). */}
      {selected?.status === 'completed' && (
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
              {firmanteDelInforme(informe.report) && (
                <Text size="sm" fw={500}>
                  {textoFirma(firmante)}
                </Text>
              )}

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
