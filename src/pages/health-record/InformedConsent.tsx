// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Box, Button, Checkbox, Divider, Group, List, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { createReference, formatDateTime, formatHumanName } from '@medplum/core';
import type { DocumentReference, Patient } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconArrowRight, IconCircleCheck, IconRefresh, IconWriting } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import {
  CONSENT_TYPE_CODE,
  CONSENT_TYPE_SYSTEM,
  CONSENT_VERSION_SYSTEM,
  buscarConsentimiento,
  consentimientoAlDia,
} from '../../fhir/consentimiento';
import { MARCA } from '../../marca';
import { showErrorNotification } from '../../utils/notifications';
import type { ConsentBlock } from './InformedConsent.data';
import {
  NOVEDADES_VERSION,
  VERSION_CONSENTIMIENTO,
  consentDatosHeading,
  consentFooter,
  consentSections,
  consentSubtitle,
  consentTitle,
} from './InformedConsent.data';

const RUTA_MI_SALUD_CV = '/health-record/cuestionarios';

/** Codifica un string UTF-8 a base64 (para el adjunto del DocumentReference). */
function toBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

/** dd/mm/aaaa (la fecha de nacimiento viene como AAAA-MM-DD). */
function fechaLegible(fecha: string | undefined): string {
  return fecha ? fecha.slice(0, 10).split('-').reverse().join('/') : '—';
}

function getEmail(patient: Patient): string {
  return patient.telecom?.find((t) => t.system === 'email')?.value ?? '—';
}

function getDni(patient: Patient): string {
  const identifier = patient.identifier?.find((i) => /dni|documento/i.test(i.system ?? i.type?.text ?? ''));
  return identifier?.value ?? patient.identifier?.[0]?.value ?? '';
}

function blockToPlainText(block: ConsentBlock): string {
  switch (block.type) {
    case 'p':
    case 'sub':
      return block.text;
    case 'ul':
      return block.items.map((i) => `• ${i}`).join('\n');
    default:
      return '';
  }
}

function buildConsentPlainText(
  patientName: string,
  birthDate: string,
  dni: string,
  email: string,
  timestamp: string
): string {
  const lines: string[] = [
    consentTitle.toUpperCase(),
    consentSubtitle,
    `Versión del documento: ${VERSION_CONSENTIMIENTO}`,
    '',
    consentDatosHeading.toUpperCase(),
    `Apellido y nombre completo: ${patientName}`,
    `Fecha de nacimiento: ${birthDate}`,
    `DNI / Pasaporte N°: ${dni}`,
    `Correo electrónico: ${email}`,
    `Fecha de aceptación: ${timestamp}`,
    '',
  ];
  for (const section of consentSections) {
    lines.push(section.heading.toUpperCase());
    for (const block of section.blocks) {
      lines.push(blockToPlainText(block));
    }
    lines.push('');
  }
  lines.push(
    'FIRMA ELECTRÓNICA',
    `Firmado por: ${patientName}`,
    `DNI: ${dni}`,
    `Fecha y hora: ${timestamp}`,
    'Lugar: Ciudad Autónoma de Buenos Aires, Argentina',
    '',
    consentFooter
  );
  return lines.join('\n');
}

export function ConsentBody({ block }: { block: ConsentBlock }): JSX.Element {
  switch (block.type) {
    case 'sub':
      return (
        <Text fw={600} mt="sm">
          {block.text}
        </Text>
      );
    case 'ul':
      return (
        <List spacing="xs" size="sm" mt="xs">
          {block.items.map((item) => (
            <List.Item key={item}>{item}</List.Item>
          ))}
        </List>
      );
    case 'p':
    default:
      return <Text size="sm">{block.text}</Text>;
  }
}

export function InformedConsent(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const patient = medplum.getProfile() as Patient;
  const patientName = patient.name?.[0] ? formatHumanName(patient.name[0]) : '';
  const birthDate = fechaLegible(patient.birthDate);
  const email = getEmail(patient);

  const [signed, setSigned] = useState<DocumentReference | null>(null);
  const alDia = consentimientoAlDia(signed ?? undefined, VERSION_CONSENTIMIENTO);
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [signatureName, setSignatureName] = useState(patientName);
  const [dni, setDni] = useState(getDni(patient));
  const [submitting, setSubmitting] = useState(false);

  const loadConsent = useCallback(() => {
    setLoading(true);
    buscarConsentimiento(medplum, patient)
      .then((doc) => setSigned(doc ?? null))
      .catch(showErrorNotification)
      .finally(() => setLoading(false));
  }, [medplum, patient]);

  useEffect(() => {
    loadConsent();
  }, [loadConsent]);

  function handleSign(): void {
    if (!accepted || !signatureName.trim() || !dni.trim()) {
      return;
    }
    setSubmitting(true);
    const timestamp = new Date().toISOString();
    const text = buildConsentPlainText(signatureName.trim(), birthDate, dni.trim(), email, timestamp);

    const doc: DocumentReference = {
      resourceType: 'DocumentReference',
      status: 'current',
      docStatus: 'final',
      type: {
        coding: [{ system: CONSENT_TYPE_SYSTEM, code: CONSENT_TYPE_CODE, display: 'Patient Consent' }],
        text: `Consentimiento Informado ${MARCA.nombreConsentimiento}`,
      },
      category: [{ text: 'Consentimiento Informado' }],
      subject: createReference(patient),
      author: [createReference(patient)],
      date: timestamp,
      // La versión del texto firmado: si el texto cambia, se vuelve a firmar.
      identifier: [{ system: CONSENT_VERSION_SYSTEM, value: VERSION_CONSENTIMIENTO }],
      description: `Consentimiento Informado (versión ${VERSION_CONSENTIMIENTO}) firmado por ${signatureName.trim()} (DNI ${dni.trim()})`,
      content: [
        {
          attachment: {
            contentType: 'text/plain; charset=utf-8',
            title: `Consentimiento Informado ${MARCA.nombreConsentimiento}.txt`,
            data: toBase64Utf8(text),
            creation: timestamp,
          },
        },
      ],
    };

    // Primera firma = viene del camino de Bienvenida: sigue en Mi salud cardiovascular.
    const primeraFirma = !loading && !signed;
    medplum
      .createResource(doc)
      .then(() => {
        notifications.show({
          color: 'green',
          title: 'Consentimiento firmado',
          message: primeraFirma
            ? 'Quedó registrado en tu historia clínica. Seguimos con Mi salud cardiovascular.'
            : 'Quedó registrado de forma segura en tu historia clínica.',
        });
        setAccepted(false);
        if (primeraFirma) {
          navigate(RUTA_MI_SALUD_CV)?.catch(console.error);
        } else {
          loadConsent();
        }
      })
      .catch(showErrorNotification)
      .finally(() => setSubmitting(false));
  }

  return (
    <Document>
      <Title order={1} mb={4}>
        {consentTitle}
      </Title>
      <Text c="dimmed" mb="lg">
        {consentSubtitle}
      </Text>

      {!loading && signed && alDia && (
        <Alert icon={<IconCircleCheck size={16} />} color="green" radius="md" title="Consentimiento firmado" mb="lg">
          Firmaste este consentimiento el {formatDateTime(signed.date)}. Si necesitás revocarlo, escribí a {MARCA.email}
          . Podés volver a firmarlo si se actualiza el documento.
          <Group mt="sm">
            <Button
              size="xs"
              rightSection={<IconArrowRight size={14} />}
              onClick={() => navigate(RUTA_MI_SALUD_CV)?.catch(console.error)}
            >
              Seguí con Mi salud cardiovascular
            </Button>
          </Group>
        </Alert>
      )}

      {!loading && signed && !alDia && (
        <Alert
          icon={<IconRefresh size={16} />}
          color="yellow"
          radius="md"
          title="Actualizamos el consentimiento informado"
          mb="lg"
        >
          Firmaste una versión anterior el {formatDateTime(signed.date)}. Estos son los cambios:
          <List size="sm" mt="xs" spacing={4}>
            {NOVEDADES_VERSION.map((n) => (
              <List.Item key={n}>{n}</List.Item>
            ))}
          </List>
          <Text size="sm" mt="xs">
            Leelo y firmalo de nuevo al final de la página.
          </Text>
        </Alert>
      )}

      {/* 1. Tus datos (tomados de tu perfil) */}
      <Title order={3} mt="md">
        {consentDatosHeading}
      </Title>
      <List size="sm" mt="xs" listStyleType="none">
        <List.Item>
          <b>Apellido y nombre:</b> {patientName || '—'}
        </List.Item>
        <List.Item>
          <b>Fecha de nacimiento:</b> {birthDate}
        </List.Item>
        <List.Item>
          <b>Correo electrónico:</b> {email}
        </List.Item>
      </List>

      {consentSections.map((section) => (
        <Box key={section.heading} mt="lg">
          <Title order={3} mb="xs">
            {section.heading}
          </Title>
          <Stack gap="xs">
            {section.blocks.map((block, index) => (
              <ConsentBody key={`${section.heading}-${index}`} block={block} />
            ))}
          </Stack>
        </Box>
      ))}

      <Divider my="xl" />

      <Title order={3} mb="sm">
        Firma electrónica
      </Title>
      <Stack gap="md" maw={520}>
        <Checkbox
          checked={accepted}
          onChange={(e) => setAccepted(e.currentTarget.checked)}
          label={`He leído y comprendido este documento, y consiento libre y voluntariamente recibir los servicios de ${MARCA.nombreConsentimiento}, incluido el uso de inteligencia artificial y el tratamiento de mis datos de salud descriptos. La información declarada sobre mi estado de salud es completa y veraz.`}
        />
        <TextInput
          label="Aclaración (nombre completo)"
          value={signatureName}
          onChange={(e) => setSignatureName(e.currentTarget.value)}
          required
        />
        <TextInput label="DNI" value={dni} onChange={(e) => setDni(e.currentTarget.value)} required />
        <Group>
          <Button
            leftSection={<IconWriting size={16} />}
            onClick={handleSign}
            loading={submitting}
            disabled={!accepted || !signatureName.trim() || !dni.trim()}
          >
            Firmar y aceptar
          </Button>
        </Group>
      </Stack>

      <Text c="dimmed" size="xs" mt="xl" ta="center">
        {consentFooter}
      </Text>
    </Document>
  );
}
