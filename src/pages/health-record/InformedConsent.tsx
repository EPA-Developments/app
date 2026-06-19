// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Box, Button, Checkbox, Divider, Group, List, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { createReference, formatDateTime, formatHumanName, getReferenceString } from '@medplum/core';
import type { DocumentReference, Patient } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconWriting } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import type { ConsentBlock } from './InformedConsent.data';
import { consentFooter, consentSections, consentSubtitle, consentTitle } from './InformedConsent.data';

const CONSENT_TYPE_SYSTEM = 'http://loinc.org';
const CONSENT_TYPE_CODE = '59284-0'; // Patient Consent

/** Codifica un string UTF-8 a base64 (para el adjunto del DocumentReference). */
function toBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
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
    '',
    '1. DATOS DEL CLIENTE',
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
    'Lugar: San Isidro, Buenos Aires',
    '',
    consentFooter
  );
  return lines.join('\n');
}

function ConsentBody({ block }: { block: ConsentBlock }): JSX.Element {
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
  const patient = medplum.getProfile() as Patient;
  const patientName = patient.name?.[0] ? formatHumanName(patient.name[0]) : '';
  const birthDate = patient.birthDate ?? '—';
  const email = getEmail(patient);

  const [signed, setSigned] = useState<DocumentReference | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [signatureName, setSignatureName] = useState(patientName);
  const [dni, setDni] = useState(getDni(patient));
  const [submitting, setSubmitting] = useState(false);

  const loadConsent = useCallback(() => {
    setLoading(true);
    medplum
      .searchResources(
        'DocumentReference',
        `subject=${getReferenceString(patient)}&type=${CONSENT_TYPE_SYSTEM}|${CONSENT_TYPE_CODE}&_sort=-date&_count=1`
      )
      .then((results) => setSigned(results[0] ?? null))
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
        text: 'Consentimiento Informado BIOWELLNESS',
      },
      category: [{ text: 'Consentimiento Informado' }],
      subject: createReference(patient),
      author: [createReference(patient)],
      date: timestamp,
      description: `Consentimiento Informado firmado por ${signatureName.trim()} (DNI ${dni.trim()})`,
      content: [
        {
          attachment: {
            contentType: 'text/plain; charset=utf-8',
            title: 'Consentimiento Informado BIOWELLNESS.txt',
            data: toBase64Utf8(text),
            creation: timestamp,
          },
        },
      ],
    };

    medplum
      .createResource(doc)
      .then(() => {
        notifications.show({
          color: 'green',
          title: 'Consentimiento firmado',
          message: 'Quedó registrado de forma segura en tu historia clínica.',
        });
        setAccepted(false);
        loadConsent();
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

      {!loading && signed && (
        <Alert
          icon={<IconCircleCheck size={16} />}
          color="green"
          radius="md"
          title="Consentimiento firmado"
          mb="lg"
        >
          Firmaste este consentimiento el {formatDateTime(signed.date)}. Si necesitás revocarlo, escribí a
          info@biowellness.ar. Podés volver a firmarlo si se actualiza el documento.
        </Alert>
      )}

      {/* 1. Datos del cliente (tomados de tu perfil) */}
      <Title order={3} mt="md">
        1. Datos del cliente
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
          label="He leído y comprendido este documento, y consiento libre y voluntariamente recibir los servicios de BIOWELLNESS. La información declarada sobre mi estado de salud es completa y veraz."
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
