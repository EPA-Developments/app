// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Reservar un turno. La paciente elige modalidad, consulta, profesional y horario, y el bot
// `som-reservar-portal` de Recepción reserva aplicando las reglas (R-23): la consulta del
// Plan Bienestar queda confirmada; las demás, tentativas hasta la seña del 50 % por
// Mercado Pago (horario retenido 30 minutos). El portal NO escribe la agenda. Queda, como
// alternativa, pedir que Recepción coordine (bot `som-solicitar-turno`).
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Collapse,
  Divider,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { formatDateTime } from '@medplum/core';
import type { Patient, Task } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconInfoCircle, IconMessage2 } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { ReservaTurno } from '../components/reserva/ReservaTurno';
import type { Modalidad } from '../fhir/agenda';
import {
  aceptarConsentimientoTeleconsulta,
  ETIQUETA_MODALIDAD,
  MODALIDADES,
  TEXTO_CONSENTIMIENTO_TELECONSULTA,
  tieneConsentimientoTeleconsulta,
} from '../fhir/agenda';
import { cargarMisSolicitudes, crearSolicitud, ESTADO_SOLICITUD, modalidadDeSolicitud } from '../fhir/solicitudes';
import { showErrorNotification } from '../utils/notifications';
import { MyAppointments } from './MyAppointments';

function SolicitudCard({ t }: { t: Task }): JSX.Element {
  const e = ESTADO_SOLICITUD[t.status ?? ''] ?? { label: t.status ?? '—', color: 'gray' };
  const modalidad = modalidadDeSolicitud(t);
  return (
    <Card withBorder radius="md" p="md">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <div>
          <Text size="sm">{t.description ?? 'Solicitud de turno'}</Text>
          {modalidad && (
            <Badge variant="outline" color="gray" size="sm" mt={4}>
              {modalidad === 'teleconsulta' ? 'Videollamada' : 'En el centro'}
            </Badge>
          )}
          <Text size="xs" c="dimmed">
            {t.authoredOn ? formatDateTime(t.authoredOn) : ''}
          </Text>
        </div>
        <Badge color={e.color} variant="light">
          {e.label}
        </Badge>
      </Group>
    </Card>
  );
}

/** Alternativa: pedir que Recepción coordine el turno (cuando no hay horario que sirva). */
function PedirCoordinacion({ patient, onEnviada }: { patient: Patient; onEnviada: () => void }): JSX.Element {
  const medplum = useMedplum();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [modalidad, setModalidad] = useState<Modalidad>(MODALIDADES[0]);
  const [tieneConsent, setTieneConsent] = useState<boolean>();
  const [aceptaConsent, setAceptaConsent] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!abierto || tieneConsent !== undefined) {
      return;
    }
    tieneConsentimientoTeleconsulta(medplum, patient)
      .then(setTieneConsent)
      .catch(() => setTieneConsent(false));
  }, [abierto, tieneConsent, medplum, patient]);

  const faltaConsent = modalidad === 'teleconsulta' && tieneConsent === false;

  const enviar = async (): Promise<void> => {
    setEnviando(true);
    setOk(false);
    try {
      // La teleconsulta exige el consentimiento (R-21): se firma una sola vez.
      if (faltaConsent) {
        await aceptarConsentimientoTeleconsulta(medplum, patient);
        setTieneConsent(true);
      }
      const r = await crearSolicitud(medplum, patient, {
        servicio: modalidad === 'teleconsulta' ? 'Teleconsulta a coordinar con Recepción' : 'Consulta a coordinar con Recepción',
        modalidad,
        preferenciaTexto: texto.trim() || undefined,
      });
      if (r.ok) {
        setOk(true);
        setTexto('');
        onEnviada();
      } else {
        showErrorNotification(new Error(r.mensaje ?? 'No se pudo enviar la solicitud.'));
      }
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Stack gap="sm">
      <Button variant="subtle" size="sm" leftSection={<IconMessage2 size={16} />} onClick={() => setAbierto((a) => !a)} w="fit-content">
        ¿No encontrás horario? Pedí que te contactemos
      </Button>
      <Collapse in={abierto}>
        <Stack gap="sm" maw={460}>
          {ok && (
            <Alert color="segundaOpinion" variant="light" icon={<IconCircleCheck />} title="¡Solicitud enviada!">
              La recibimos. Recepción te contacta para coordinar el turno.
            </Alert>
          )}
          <div>
            <Text size="sm" fw={500} mb={4}>
              ¿Cómo querés atenderte?
            </Text>
            <SegmentedControl
              fullWidth
              value={modalidad}
              onChange={(v) => setModalidad(v as Modalidad)}
              data={MODALIDADES.map((m) => ({ value: m, label: ETIQUETA_MODALIDAD[m] }))}
            />
          </div>
          <Textarea
            label="Contanos qué necesitás y cuándo podés"
            placeholder="Ej.: una consulta de Nutrición, los jueves a la tarde"
            autosize
            minRows={2}
            value={texto}
            onChange={(e) => setTexto(e.currentTarget.value)}
          />
          {faltaConsent && (
            <Card withBorder radius="md" p="sm">
              <Text size="xs" c="dimmed" mb="xs">
                {TEXTO_CONSENTIMIENTO_TELECONSULTA}
              </Text>
              <Checkbox
                label="Leí y acepto el consentimiento de teleconsulta"
                checked={aceptaConsent}
                onChange={(e) => setAceptaConsent(e.currentTarget.checked)}
              />
            </Card>
          )}
          <Group>
            <Button
              variant="light"
              loading={enviando}
              disabled={!texto.trim() || (faltaConsent && !aceptaConsent)}
              onClick={enviar}
            >
              Enviar solicitud
            </Button>
          </Group>
        </Stack>
      </Collapse>
    </Stack>
  );
}

export function GetCare(): JSX.Element {
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  const [version, setVersion] = useState(0);
  const [solicitudes, setSolicitudes] = useState<Task[]>();

  const recargar = useCallback(() => {
    cargarMisSolicitudes(medplum, patient).then(setSolicitudes).catch(showErrorNotification);
  }, [medplum, patient]);

  useEffect(recargar, [recargar]);

  return (
    <Document width={800}>
      <Title order={2} mb="md">
        Mis turnos
      </Title>
      <MyAppointments patient={patient} version={version} />

      <Divider my="xl" />

      <Title order={2} mb="xs">
        Reservar un turno
      </Title>
      <Text c="dimmed" size="sm" mb="md">
        Elegí cómo querés atenderte, la consulta, el profesional y el horario. Las consultas del Plan Bienestar 100
        Días® están incluidas; las demás se confirman con la seña del 50 %.
      </Text>
      <ReservaTurno patient={patient} onReservado={() => setVersion((v) => v + 1)} onSolicitado={recargar} />

      <Divider my="xl" />

      <PedirCoordinacion patient={patient} onEnviada={recargar} />

      {solicitudes === undefined ? (
        <Loader size="sm" mt="md" />
      ) : solicitudes.length > 0 ? (
        <Stack gap="sm" mt="md">
          <Title order={3}>Mis solicitudes</Title>
          {solicitudes.map((t) => (
            <SolicitudCard key={t.id} t={t} />
          ))}
        </Stack>
      ) : (
        <Group gap="xs" c="dimmed" mt="md">
          <IconInfoCircle size={18} />
          <Text size="sm">Sin solicitudes pendientes con Recepción.</Text>
        </Group>
      )}
    </Document>
  );
}
