import type { Attachment, DocumentReference } from '@medplum/fhirtypes';
import { Alert, Button, Card, List, Loader, Stack, Text, Title } from '@mantine/core';
import { useMedplum } from '@medplum/react';
import { useState, type ReactElement } from 'react';
import { useDocumentosDelTurno } from '../hooks/useDocumentosDelTurno';

/** Opens a `Binary/…` or presigned attachment with the user's own session. */
export function BotonDescargar(props: { adjunto: Attachment; texto: string }): ReactElement {
  const medplum = useMedplum();
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState(false);
  const url = props.adjunto.url;

  const descargar = async (): Promise<void> => {
    if (!url) return;
    setBajando(true);
    setError(false);
    try {
      const blob = await medplum.download(url);
      const enlace = document.createElement('a');
      enlace.href = URL.createObjectURL(blob);
      enlace.download = props.adjunto.title ? `${props.adjunto.title}.pdf` : 'informe.pdf';
      enlace.target = '_blank';
      enlace.rel = 'noopener';
      enlace.click();
      setTimeout(() => URL.revokeObjectURL(enlace.href), 60_000);
    } catch {
      setError(true);
    } finally {
      setBajando(false);
    }
  };

  return (
    <Stack gap={4}>
      <Button variant="light" radius="xl" onClick={descargar} loading={bajando} disabled={!url}>
        {props.texto}
      </Button>
      {error && (
        <Text size="xs" c="red">
          No pudimos descargar el archivo. Probá de nuevo.
        </Text>
      )}
    </Stack>
  );
}

function tituloDocumento(doc: DocumentReference): string {
  return doc.description ?? doc.content?.[0]?.attachment?.title ?? 'Documento';
}

export interface DocumentosDeConsultaProps {
  appointmentId: string;
}

/**
 * After the consultation: the report (PDF), the requested studies and the
 * prescriptions — the same resources the portal already lists in its own
 * sections, gathered here for this appointment.
 */
export function DocumentosDeConsulta(props: DocumentosDeConsultaProps): ReactElement {
  const { informes, ordenes, recetas, cargando } = useDocumentosDelTurno(props.appointmentId);

  if (cargando) return <Loader size="sm" />;

  if (informes.length === 0 && ordenes.length === 0 && recetas.length === 0) {
    return (
      <Alert variant="light" color="gray" radius="md">
        El informe de esta consulta todavía no está disponible. Te avisamos cuando esté listo.
      </Alert>
    );
  }

  return (
    <Card withBorder radius="lg" padding="lg">
      <Stack gap="md">
        <Title order={4}>Lo que te dejó esta consulta</Title>
        {informes.map((doc) => {
          const adjunto = doc.content?.[0]?.attachment;
          return (
            adjunto && (
              <BotonDescargar key={doc.id} adjunto={adjunto} texto={`Descargar ${tituloDocumento(doc).toLowerCase()}`} />
            )
          );
        })}
        {ordenes.length > 0 && (
          <Stack gap={4}>
            <Text fw={600}>Estudios indicados</Text>
            <List size="sm">
              {ordenes.map((o) => (
                <List.Item key={o.id}>{o.code?.text ?? o.code?.coding?.[0]?.display ?? 'Estudio'}</List.Item>
              ))}
            </List>
          </Stack>
        )}
        {recetas.length > 0 && (
          <Stack gap={4}>
            <Text fw={600}>Medicación indicada</Text>
            <List size="sm">
              {recetas.map((r) => (
                <List.Item key={r.id}>
                  {r.medicationCodeableConcept?.text ?? 'Medicación'}
                  {r.dosageInstruction?.[0]?.text && ` — ${r.dosageInstruction[0].text}`}
                </List.Item>
              ))}
            </List>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
