import { formatearFecha, referenciaPaciente } from '@epa/teleconsulta-core';
import { formatHumanName } from '@medplum/core';
import type { Consent, Observation, Patient, QuestionnaireResponse } from '@medplum/fhirtypes';
import { Card, Divider, Group, List, Loader, Stack, Text, Title } from '@mantine/core';
import { useMedplum } from '@medplum/react';
import { useEffect, useState, type ReactElement } from 'react';
import { edad } from '../fechas';
import { useDocumentosDelTurno } from '../hooks/useDocumentosDelTurno';
import type { TurnoVirtual } from '../hooks/useTurnosPaciente';
import { useTeleconsultaConfig } from '../TeleconsultaContext';
import { BotonDescargar } from './DocumentosDeConsulta';

const SEXO: Record<string, string> = { female: 'Femenino', male: 'Masculino', other: 'Otro', unknown: 'No informado' };

/** `120/80 mmHg`, `27.4 kg/m2`, `Sí`… — a readable value of an Observation. */
export function valorObservacion(o: Observation): string {
  if (o.valueQuantity?.value !== undefined) {
    return `${o.valueQuantity.value}${o.valueQuantity.unit ? ` ${o.valueQuantity.unit}` : ''}`;
  }
  if (o.valueString) return o.valueString;
  if (o.valueBoolean !== undefined) return o.valueBoolean ? 'Sí' : 'No';
  if (o.valueCodeableConcept) return o.valueCodeableConcept.text ?? o.valueCodeableConcept.coding?.[0]?.display ?? '';
  if (o.valueInteger !== undefined) return String(o.valueInteger);
  const componentes = (o.component ?? []).map((c) => c.valueQuantity?.value).filter((v) => v !== undefined);
  if (componentes.length > 0) {
    const unidad = o.component?.[0]?.valueQuantity?.unit;
    return `${componentes.join('/')}${unidad ? ` ${unidad}` : ''}`;
  }
  return '';
}

function nombreCuestionario(qr: QuestionnaireResponse): string {
  const canonico = qr.questionnaire?.split('|')[0] ?? '';
  const ultimo = canonico.split('/').pop() ?? '';
  return ultimo ? ultimo.replace(/[-_]/g, ' ') : 'Cuestionario';
}

interface Datos {
  paciente?: Patient;
  observaciones: Observation[];
  cuestionarios: QuestionnaireResponse[];
  consentimiento?: Consent;
}

/**
 * What the professional reads before entering: who the patient is, why they
 * booked, what they uploaded for this appointment, their latest data and
 * questionnaires, and the telehealth consent. Read-only.
 */
export function FichaPrevia(props: { turno: TurnoVirtual }): ReactElement {
  const medplum = useMedplum();
  const { zonaHoraria } = useTeleconsultaConfig();
  const { turno } = props;
  const pacienteRef = referenciaPaciente(turno)?.reference;
  const { adjuntos } = useDocumentosDelTurno(turno.id);
  const [datos, setDatos] = useState<Datos | undefined>(undefined);

  useEffect(() => {
    if (!pacienteRef) return;
    let vigente = true;
    const suave = async <T,>(p: Promise<T>, porDefecto: T): Promise<T> => p.catch(() => porDefecto);
    void Promise.all([
      suave(medplum.readReference<Patient>({ reference: pacienteRef }), undefined),
      suave(
        medplum.searchResources('Observation', { subject: pacienteRef, _sort: '-date', _count: '12' }),
        [] as Observation[],
      ),
      suave(
        medplum.searchResources('QuestionnaireResponse', { subject: pacienteRef, _sort: '-authored', _count: '5' }),
        [] as QuestionnaireResponse[],
      ),
      suave(medplum.searchOne('Consent', { patient: pacienteRef, status: 'active', _sort: '-date' }), undefined),
    ]).then(([paciente, observaciones, cuestionarios, consentimiento]) => {
      if (vigente) setDatos({ paciente, observaciones, cuestionarios, consentimiento });
    });
    return () => {
      vigente = false;
    };
  }, [medplum, pacienteRef]);

  if (!datos) return <Loader size="sm" />;
  const { paciente, observaciones, cuestionarios, consentimiento } = datos;
  const motivo = turno.comment ?? turno.reasonCode?.[0]?.text ?? turno.description;
  const anios = edad(paciente?.birthDate);

  return (
    <Card withBorder radius="lg" padding="lg">
      <Stack gap="sm">
        <Title order={4}>Ficha previa</Title>
        <Stack gap={2}>
          <Text fw={600}>{paciente?.name?.[0] ? formatHumanName(paciente.name[0]) : 'Paciente'}</Text>
          <Text size="sm" c="dimmed">
            {[anios !== undefined ? `${anios} años` : undefined, paciente?.gender ? SEXO[paciente.gender] : undefined]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </Stack>

        <Divider />
        <Text size="sm" fw={600}>
          Motivo de consulta
        </Text>
        <Text size="sm">{motivo ?? 'No lo indicó al reservar.'}</Text>

        <Text size="sm" fw={600}>
          Consentimiento de teleconsulta
        </Text>
        <Text size="sm" c={consentimiento ? undefined : 'orange'}>
          {consentimiento
            ? `Vigente${consentimiento.dateTime ? ` desde el ${formatearFecha(new Date(consentimiento.dateTime), zonaHoraria)}` : ''}.`
            : 'No encontramos un consentimiento vigente. Pedíselo al empezar.'}
        </Text>

        {adjuntos.length > 0 && (
          <>
            <Divider />
            <Text size="sm" fw={600}>
              Lo que subió para esta consulta
            </Text>
            {adjuntos.map((doc) => {
              const adjunto = doc.content?.[0]?.attachment;
              return adjunto ? (
                <BotonDescargar key={doc.id} adjunto={adjunto} texto={doc.description ?? adjunto.title ?? 'Documento'} />
              ) : null;
            })}
          </>
        )}

        <Divider />
        <Text size="sm" fw={600}>
          Últimos datos
        </Text>
        {observaciones.length === 0 ? (
          <Text size="sm" c="dimmed">
            Sin datos cargados.
          </Text>
        ) : (
          <Stack gap={4}>
            {observaciones.map((o) => (
              <Group key={o.id} justify="space-between" gap="xs" wrap="nowrap">
                <Text size="sm">{o.code?.text ?? o.code?.coding?.[0]?.display ?? 'Dato'}</Text>
                <Text size="sm" fw={600} ta="right">
                  {valorObservacion(o)}
                  {o.effectiveDateTime && (
                    <Text span size="xs" c="dimmed" fw={400}>
                      {' '}
                      · {formatearFecha(new Date(o.effectiveDateTime), zonaHoraria)}
                    </Text>
                  )}
                </Text>
              </Group>
            ))}
          </Stack>
        )}

        {cuestionarios.length > 0 && (
          <>
            <Divider />
            <Text size="sm" fw={600}>
              Cuestionarios recientes
            </Text>
            <List size="sm">
              {cuestionarios.map((qr) => (
                <List.Item key={qr.id}>
                  {nombreCuestionario(qr)}
                  {qr.authored && ` · ${formatearFecha(new Date(qr.authored), zonaHoraria)}`}
                </List.Item>
              ))}
            </List>
          </>
        )}
      </Stack>
    </Card>
  );
}
