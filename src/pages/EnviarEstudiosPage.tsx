// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Enviar estudios en PDF (resultados de laboratorio). Se llega desde el "+" (menú
// inferior en smartphone, Header en web). El paciente sube el informe tal como se lo
// dio el laboratorio y autoriza su procesamiento; el portal escribe el Binary, el
// DocumentReference y el Consent (src/fhir/estudios.ts) y el bot
// `som-procesar-laboratorio` carga los valores en sus biomarcadores.
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  FileInput,
  Group,
  Loader,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { formatDateTime } from '@medplum/core';
import type { DocumentReference, Patient } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconFileCheck, IconFileTypePdf, IconFileUpload, IconInfoCircle } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { buscarConsentimiento } from '../fhir/consentimiento';
import {
  cargarEstudiosEnviados,
  enviarLaboratorioPdf,
  estadoEstudio,
  MAX_MB,
  MENSAJE_SIN_CONSENTIMIENTO,
  TEXTO_AUTORIZACION,
} from '../fhir/estudios';
import { showErrorNotification } from '../utils/notifications';

function EstudioEnviado({ doc }: { doc: DocumentReference }): JSX.Element {
  const navigate = useNavigate();
  const estado = estadoEstudio(doc);
  return (
    <Group justify="space-between" wrap="nowrap" gap="sm">
      <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
        <IconFileTypePdf size={20} style={{ flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <Text size="sm" truncate>
            {doc.content?.[0]?.attachment?.title ?? 'Resultado de laboratorio'}
          </Text>
          <Text size="xs" c="dimmed">
            {doc.date ? formatDateTime(doc.date) : '—'}
          </Text>
        </div>
      </Group>
      {estado.estado === 'procesado' ? (
        <Button
          size="compact-sm"
          variant="light"
          color="green"
          onClick={() => navigate(`/health-record/lab-results/${estado.informeId}`)?.catch(console.error)}
        >
          Ver resultados
        </Button>
      ) : (
        <Badge variant="light" color="gray" style={{ flexShrink: 0 }}>
          En proceso
        </Badge>
      )}
    </Group>
  );
}

export function EnviarEstudiosPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const patient = medplum.getProfile() as Patient;

  const [consentimiento, setConsentimiento] = useState<'cargando' | 'firmado' | 'falta'>('cargando');
  const [file, setFile] = useState<File | null>(null);
  const [autorizado, setAutorizado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [enviados, setEnviados] = useState<DocumentReference[]>();

  const cargarEnviados = useCallback((): void => {
    cargarEstudiosEnviados(medplum, patient)
      .then(setEnviados)
      .catch(() => setEnviados([]));
  }, [medplum, patient]);

  useEffect(() => {
    buscarConsentimiento(medplum, patient)
      .then((doc) => setConsentimiento(doc ? 'firmado' : 'falta'))
      .catch((err) => {
        setConsentimiento('falta');
        showErrorNotification(err);
      });
    cargarEnviados();
  }, [medplum, patient, cargarEnviados]);

  async function enviar(): Promise<void> {
    if (!file || !autorizado) {
      return;
    }
    setEnviando(true);
    try {
      const r = await enviarLaboratorioPdf(medplum, patient, file);
      if (r.ok) {
        setEnviado(true);
        setFile(null);
        setAutorizado(false);
        cargarEnviados();
        window.scrollTo(0, 0);
      } else {
        notifications.show({
          color: 'yellow',
          icon: <IconInfoCircle />,
          title: 'No pudimos enviar el PDF',
          message: r.mensaje ?? 'Intentá nuevamente más tarde.',
        });
      }
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setEnviando(false);
    }
  }

  const listaEnviados = enviados && enviados.length > 0 && (
    <Card withBorder radius="md" p="md">
      <Title order={4} mb="sm">
        Estudios enviados
      </Title>
      <Stack gap="sm">
        {enviados.map((d) => (
          <EstudioEnviado key={d.id} doc={d} />
        ))}
      </Stack>
    </Card>
  );

  if (consentimiento === 'cargando') {
    return (
      <Document width={700}>
        <Group justify="center" py="xl">
          <Loader size="sm" />
        </Group>
      </Document>
    );
  }

  // Regla dura: sin consentimiento informado firmado no se mandan estudios.
  if (consentimiento === 'falta') {
    return (
      <Document width={700}>
        <Title order={2} mb="md">
          Enviar estudios en PDF
        </Title>
        <Alert color="yellow" variant="light" icon={<IconFileCheck />} title="Falta tu consentimiento informado">
          {MENSAJE_SIN_CONSENTIMIENTO} Es un paso único: después volvés acá y subís tu PDF.
          <Group mt="sm">
            <Button size="xs" onClick={() => navigate('/health-record/consent')?.catch(console.error)}>
              Firmar el consentimiento
            </Button>
          </Group>
        </Alert>
      </Document>
    );
  }

  if (enviado) {
    return (
      <Document width={700}>
        <Stack align="center" gap="md" py="xl">
          <ThemeIcon size={56} radius="xl" variant="light">
            <IconCircleCheck size={30} stroke={1.5} />
          </ThemeIcon>
          <Title order={3} ta="center">
            ¡Recibimos tu estudio!
          </Title>
          <Text c="dimmed" ta="center" maw={460}>
            Lo procesamos y los valores se suman a tus biomarcadores; tu equipo de salud también los ve. Si algo no se
            puede leer del PDF, te contactamos por Mensajes.
          </Text>
          <Group justify="center">
            <Button variant="light" onClick={() => setEnviado(false)}>
              Enviar otro PDF
            </Button>
            <Button onClick={() => navigate('/health-record/biomarkers')?.catch(console.error)}>
              Ver mis biomarcadores
            </Button>
          </Group>
        </Stack>
        {listaEnviados}
      </Document>
    );
  }

  return (
    <Document width={700}>
      <Stack gap="md">
        <Title order={2}>Enviar estudios en PDF</Title>
        <Text c="dimmed">
          Subí el informe de tu laboratorio tal como te lo entregaron (PDF). Lo procesamos automáticamente y los
          resultados se incorporan a tu historia clínica, sin cargar nada a mano.
        </Text>

        <FileInput
          label="Resultados de laboratorio (PDF)"
          placeholder={`Elegí el archivo (hasta ${MAX_MB} MB)`}
          accept="application/pdf,.pdf"
          leftSection={<IconFileTypePdf size={18} />}
          value={file}
          onChange={setFile}
          clearable
          size="md"
        />

        <Checkbox
          checked={autorizado}
          onChange={(e) => setAutorizado(e.currentTarget.checked)}
          label={TEXTO_AUTORIZACION}
        />

        <Button
          size="md"
          fullWidth
          leftSection={<IconFileUpload size={18} />}
          onClick={enviar}
          loading={enviando}
          disabled={!file || !autorizado}
        >
          Enviar PDF
        </Button>

        <Alert color="gray" variant="light" radius="md">
          ¿Querés cargar un valor puntual a mano? Usá{' '}
          <Text span inherit fw={600}>
            Cargar resultado
          </Text>{' '}
          desde el botón +.
        </Alert>

        {listaEnviados}
      </Stack>
    </Document>
  );
}
