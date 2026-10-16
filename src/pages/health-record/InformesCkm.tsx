// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// «Informes de tu médico»: los informes CKM que el médico firmó en el dashboard clínico
// (contrato en src/fhir/informesCkm.ts). La paciente ve cada uno con su fecha y lo baja en
// PDF. Es de solo lectura: el portal no escribe nada.
//
// El PDF se baja con `descargarAdjunto`, el mismo de Mensajes y de la campanita:
// `medplum.download` resuelve la autenticación del `Binary/<id>`. Un informe sin archivo se
// muestra igual, sin el botón.
import { Button, Card, Group, Loader, Stack, Text, Title } from '@mantine/core';
import type { DocumentReference, Patient } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconDownload, IconFileText } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { fechaYHora } from '../../fhir/fechas';
import { adjuntoPdf, cargarInformesCkm } from '../../fhir/informesCkm';
import { descargarAdjunto } from '../../utils/adjuntos';
import { showErrorNotification } from '../../utils/notifications';

function Informe({ doc }: { doc: DocumentReference }): JSX.Element {
  const medplum = useMedplum();
  const [descargando, setDescargando] = useState(false);
  const pdf = adjuntoPdf(doc);

  async function descargar(): Promise<void> {
    if (!pdf) {
      return;
    }
    setDescargando(true);
    try {
      await descargarAdjunto(medplum, { ...pdf, title: pdf.title ?? 'informe-ckm.pdf' });
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setDescargando(false);
    }
  }

  return (
    <Card withBorder radius="md" p="md">
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          <IconFileText size={20} style={{ flexShrink: 0 }} aria-hidden />
          <div style={{ minWidth: 0 }}>
            <Text fw={500}>{fechaYHora(doc.date) || 'Sin fecha'}</Text>
            <Text size="sm" c="dimmed">{doc.description ?? doc.type?.text ?? 'Informe CKM'}</Text>
          </div>
        </Group>
        {(pdf?.url || pdf?.data) && (
          <Button
            size="compact-sm"
            variant="light"
            leftSection={<IconDownload size={14} />}
            loading={descargando}
            style={{ flexShrink: 0 }}
            onClick={() => descargar().catch(console.error)}
          >
            Descargar PDF
          </Button>
        )}
      </Group>
    </Card>
  );
}

export function InformesCkm(): JSX.Element {
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  // undefined = cargando.
  const [informes, setInformes] = useState<DocumentReference[] | 'error'>();

  useEffect(() => {
    let activo = true;
    cargarInformesCkm(medplum, patient)
      .then((docs) => activo && setInformes(docs))
      .catch((err: unknown) => {
        if (activo) {
          showErrorNotification(err);
          setInformes('error');
        }
      });
    return () => {
      activo = false;
    };
  }, [medplum, patient]);

  let contenido: JSX.Element;
  if (informes === undefined) {
    contenido = (
      <Group justify="center" py="xl">
        <Loader size="sm" />
      </Group>
    );
  } else if (informes === 'error') {
    contenido = <Text c="dimmed">No pudimos cargar tus informes. Probá de nuevo más tarde.</Text>;
  } else if (informes.length === 0) {
    contenido = <Text c="dimmed">Todavía no tenés informes de tu médico. Cuando firme uno, lo vas a ver acá.</Text>;
  } else {
    contenido = (
      <Stack gap="sm">
        {informes.map((doc) => (
          <Informe key={doc.id} doc={doc} />
        ))}
      </Stack>
    );
  }

  return (
    <Document>
      <Title order={1} mb={4}>
        Informes de tu médico
      </Title>
      <Text c="dimmed" mb="lg">
        Acá están los informes que tu equipo médico firmó para vos. Podés bajar cada uno en PDF.
      </Text>
      {contenido}
    </Document>
  );
}
