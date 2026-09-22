// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Solicitar una Segunda Opinión Médica — modelo de "solicitud". El paciente carga su
// motivo, antecedentes, medicación y estudios; el portal escribe su QuestionnaireResponse
// y sus DocumentReference y ejecuta el bot `som-solicitar` (que crea la orden). El portal
// NO escribe la orden ni el informe: solo los lee desde "Mi Segunda Opinión".
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Divider,
  FileInput,
  Group,
  List,
  Loader,
  Select,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { formatHumanName } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconFileCheck, IconFileUpload, IconInfoCircle, IconSend } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { buscarConsentimiento } from '../fhir/consentimiento';
import { MENSAJE_SIN_CONSENTIMIENTO, crearSolicitudSOM, fileToArchivoSOM, type OrigenSOM } from '../fhir/som';
import { showErrorNotification } from '../utils/notifications';
import { motivoPorEstadio } from './ckm/ckm.contenido';
import { ANTECEDENTES_CV, ORIGENES_SOM } from './SolicitarSOM.data';

function getEmail(patient: Patient): string {
  return patient.telecom?.find((t) => t.system === 'email')?.value ?? '—';
}

export function SolicitarSOM(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const patient = medplum.getProfile() as Patient;
  const patientName = patient.name?.[0] ? formatHumanName(patient.name[0]) : '—';

  const [searchParams] = useSearchParams();
  // Si viene desde /ckm con su estadío, el motivo llega prellenado (editable).
  const estadioParam = Number.parseInt(searchParams.get('estadio') ?? '', 10);
  const motivoInicial = Number.isInteger(estadioParam) && estadioParam >= 0 && estadioParam <= 4
    ? motivoPorEstadio(estadioParam)
    : '';

  const [origin, setOrigin] = useState<OrigenSOM>('self');
  const [motivo, setMotivo] = useState(motivoInicial);
  const [antecedentes, setAntecedentes] = useState<string[]>([]);
  const [antecedentesTexto, setAntecedentesTexto] = useState('');
  const [medicacion, setMedicacion] = useState('');
  const [estudiosTexto, setEstudiosTexto] = useState('');
  const [archivos, setArchivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);
  const [consentimiento, setConsentimiento] = useState<'cargando' | 'firmado' | 'falta'>('cargando');

  useEffect(() => {
    buscarConsentimiento(medplum, patient)
      .then((doc) => setConsentimiento(doc ? 'firmado' : 'falta'))
      .catch((err) => {
        setConsentimiento('falta');
        showErrorNotification(err);
      });
  }, [medplum, patient]);

  const enviar = async (): Promise<void> => {
    if (!motivo.trim()) {
      return;
    }
    setEnviando(true);
    setOk(false);
    try {
      const adjuntos = await Promise.all(archivos.map(fileToArchivoSOM));
      const r = await crearSolicitudSOM(
        medplum,
        patient,
        {
          motivo: motivo.trim(),
          antecedentes: antecedentes.length ? antecedentes : undefined,
          antecedentesTexto: antecedentesTexto.trim() || undefined,
          medicacion: medicacion.trim() || undefined,
          estudiosTexto: estudiosTexto.trim() || undefined,
          origin,
        },
        adjuntos
      );
      if (r.ok) {
        setOk(true);
        setMotivo('');
        setAntecedentes([]);
        setAntecedentesTexto('');
        setMedicacion('');
        setEstudiosTexto('');
        setArchivos([]);
      } else {
        notifications.show({
          color: 'yellow',
          icon: <IconInfoCircle />,
          title: 'No pudimos iniciar la solicitud',
          message: r.mensaje ?? 'Intentá nuevamente más tarde.',
        });
      }
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Document width={800}>
      <Title order={2} mb="xs">
        Solicitar una Segunda Opinión Médica
      </Title>
      <Text c="dimmed" size="sm" mb="lg">
        Cargá el motivo de consulta y tus datos clínicos. Nuestro equipo prepara un informe de Segunda Opinión
        cardiológica y te avisamos cuando esté disponible en "Mi Segunda Opinión".
      </Text>

      {consentimiento === 'cargando' && (
        <Group justify="center" py="xl">
          <Loader size="sm" />
        </Group>
      )}

      {consentimiento === 'falta' && (
        <Alert color="yellow" variant="light" icon={<IconFileCheck />} title="Falta tu consentimiento informado">
          {MENSAJE_SIN_CONSENTIMIENTO} Es un paso único: después volvés acá y completás tu solicitud.
          <Group mt="sm">
            <Button size="xs" onClick={() => navigate('/health-record/consent')?.catch(console.error)}>
              Firmar el consentimiento
            </Button>
          </Group>
        </Alert>
      )}

      {consentimiento === 'firmado' && (
        <>
          {ok && (
            <Alert
              color="segundaOpinion"
              variant="light"
              icon={<IconCircleCheck />}
              mb="lg"
              title="¡Solicitud enviada!"
            >
              La recibimos. Vas a poder seguir su estado y descargar el informe desde "Mi Segunda Opinión".
              <Group mt="sm">
                <Button
                  size="xs"
                  variant="white"
                  onClick={() => navigate('/mi-segunda-opinion')?.catch(console.error)}
                >
                  Ir a Mi Segunda Opinión
                </Button>
              </Group>
            </Alert>
          )}

          {/* Datos del paciente (tomados del perfil) */}
          <Title order={4} mt="md">
            Datos del paciente
          </Title>
          <List size="sm" mt="xs" listStyleType="none">
            <List.Item>
              <b>Nombre:</b> {patientName}
            </List.Item>
            <List.Item>
              <b>Fecha de nacimiento:</b> {patient.birthDate ?? '—'}
            </List.Item>
            <List.Item>
              <b>Correo electrónico:</b> {getEmail(patient)}
            </List.Item>
          </List>
          <Text c="dimmed" size="xs" mt={4}>
            ¿Algún dato desactualizado? Podés corregirlo en tu perfil.
          </Text>

          <Divider my="lg" />

          <Stack gap="md" maw={620}>
            <Select
              label="¿Quién realiza la solicitud?"
              data={ORIGENES_SOM as unknown as { value: string; label: string }[]}
              value={origin}
              onChange={(v) => setOrigin((v as OrigenSOM) ?? 'self')}
              allowDeselect={false}
            />

            <Textarea
              label="Motivo de consulta"
              description="Contanos qué te gustaría que evaluemos."
              placeholder="Ej.: tengo dudas sobre el tratamiento indicado para mi arritmia…"
              required
              autosize
              minRows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.currentTarget.value)}
            />

            <Box>
              <Text fw={500} size="sm" mb={4}>
                Antecedentes cardiovasculares
              </Text>
              <Checkbox.Group value={antecedentes} onChange={setAntecedentes}>
                <Stack gap={6}>
                  {ANTECEDENTES_CV.map((a) => (
                    <Checkbox key={a} value={a} label={a} />
                  ))}
                </Stack>
              </Checkbox.Group>
            </Box>

            <Textarea
              label="Otros antecedentes (opcional)"
              placeholder="Cualquier otro antecedente relevante."
              autosize
              minRows={2}
              value={antecedentesTexto}
              onChange={(e) => setAntecedentesTexto(e.currentTarget.value)}
            />

            <Textarea
              label="Medicación actual"
              description="Incluí nombre y dosis si la conocés."
              placeholder="Ej.: Bisoprolol 2,5 mg/día; Atorvastatina 20 mg/noche…"
              autosize
              minRows={2}
              value={medicacion}
              onChange={(e) => setMedicacion(e.currentTarget.value)}
            />

            <Textarea
              label="Últimos estudios / laboratorio (opcional)"
              placeholder="Resumen de tus últimos estudios o valores de laboratorio."
              autosize
              minRows={2}
              value={estudiosTexto}
              onChange={(e) => setEstudiosTexto(e.currentTarget.value)}
            />

            <FileInput
              label="Adjuntar estudios"
              description="PDF o imágenes (ECG, ecocardiograma, laboratorio). Podés subir varios."
              placeholder="Elegí los archivos"
              leftSection={<IconFileUpload size={16} />}
              accept="application/pdf,image/*"
              multiple
              clearable
              value={archivos}
              onChange={setArchivos}
            />

            {/* Fase 2: confirmación y pago. Por ahora la solicitud se envía sin paso de pago. */}
            <Alert color="gray" variant="light" icon={<IconInfoCircle />}>
              La confirmación y el pago se habilitarán próximamente. Por ahora podés enviar tu solicitud sin costo.
            </Alert>

            <Group>
              <Button
                leftSection={<IconSend size={16} />}
                loading={enviando}
                disabled={!motivo.trim()}
                onClick={enviar}
              >
                Enviar solicitud
              </Button>
            </Group>
          </Stack>
        </>
      )}
    </Document>
  );
}
