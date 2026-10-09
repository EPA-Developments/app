// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Consentimiento de teleconsulta (R-21) fuera de la reserva: la paciente lo lee y lo acepta
// una sola vez, antes de su primera videollamada. Lo abre el link que le manda Recepción por
// WhatsApp (bot `som-consentimiento-teleconsulta` de recepcionistas), la Novedad de la
// campanita, el menú de Salud y el consentimiento informado.
//
// Lo acepta SIEMPRE la paciente, acá, con el mismo `Consent` y el mismo texto legal que la
// reserva (`aceptarConsentimientoTeleconsulta`, `TEXTO_CONSENTIMIENTO_TELECONSULTA`): el texto
// no se reescribe. Recepción solo ve si está firmado (sí/no), nunca el Consent.
import { Alert, Anchor, Button, Card, Checkbox, Group, Loader, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { formatDateTime, getReferenceString } from '@medplum/core';
import type { WithId } from '@medplum/core';
import type { Consent, Patient } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconMessage, IconVideo } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  TEXTO_CONSENTIMIENTO_TELECONSULTA,
  aceptarConsentimientoTeleconsulta,
  buscarConsentimientoTeleconsulta,
} from '../../fhir/agenda';
import { buscarConsentimiento } from '../../fhir/consentimiento';
import { marcarLeidasDeTipo } from '../../fhir/notificaciones';
import { showErrorNotification } from '../../utils/notifications';
import { RUTA_NUEVO_MENSAJE } from '../mensajes/Conversaciones';

const RUTA_CONSENTIMIENTO_INFORMADO = '/health-record/consent';

export function ConsentimientoTeleconsulta(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const profile = medplum.getProfile();
  // Solo una paciente acepta su propio consentimiento (un perfil del equipo no).
  const patient = profile?.resourceType === 'Patient' ? (profile as WithId<Patient>) : undefined;

  // undefined = cargando; null = todavía no lo aceptó.
  const [consent, setConsent] = useState<Consent | null | undefined>(undefined);
  // ¿Firmó el consentimiento informado? undefined = no se sabe (no se muestra nada).
  const [general, setGeneral] = useState<boolean | undefined>(undefined);
  const [acepta, setAcepta] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!patient) {
      return undefined;
    }
    let activo = true;
    buscarConsentimientoTeleconsulta(medplum, patient)
      .then((c) => activo && setConsent(c ?? null))
      .catch((err: unknown) => {
        if (activo) {
          showErrorNotification(err);
          setConsent(null);
        }
      });
    buscarConsentimiento(medplum, patient)
      .then((doc) => activo && setGeneral(Boolean(doc)))
      .catch(() => undefined);
    return () => {
      activo = false;
    };
  }, [medplum, patient]);

  // Ya lo aceptó: el pedido de Recepción en la campanita queda leído.
  useEffect(() => {
    if (consent && patient) {
      marcarLeidasDeTipo(medplum, getReferenceString(patient), 'consentimiento-teleconsulta').catch(() => undefined);
    }
  }, [medplum, patient, consent]);

  async function aceptar(): Promise<void> {
    if (!patient || !acepta) {
      return;
    }
    setGuardando(true);
    try {
      // Si ya lo aceptó (en otra pestaña o en la reserva), no se duplica.
      const c =
        (await buscarConsentimientoTeleconsulta(medplum, patient)) ??
        (await aceptarConsentimientoTeleconsulta(medplum, patient));
      notifications.show({
        color: 'green',
        title: 'Consentimiento de teleconsulta aceptado',
        message: 'Ya podés atenderte por videollamada.',
      });
      setConsent(c);
    } catch (err) {
      showErrorNotification(err);
    } finally {
      setGuardando(false);
    }
  }

  let contenido: JSX.Element;
  if (!patient) {
    contenido = <Text c="dimmed">Esta página es para pacientes del portal.</Text>;
  } else if (consent === undefined) {
    contenido = <Loader />;
  } else if (consent) {
    contenido = (
      <>
        <Alert
          color="green"
          icon={<IconCircleCheck size={16} />}
          radius="md"
          title="Ya aceptaste el consentimiento de teleconsulta"
          mt="md"
          mb="lg"
        >
          Lo aceptaste{consent.dateTime ? ` el ${formatDateTime(consent.dateTime)}` : ''}. Si querés revocarlo,
          escribinos por Mensajes.
          <Group mt="sm">
            <Button
              size="xs"
              leftSection={<IconVideo size={14} />}
              onClick={() => navigate('/get-care')?.catch(console.error)}
            >
              Reservar una teleconsulta
            </Button>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconMessage size={14} />}
              onClick={() => navigate(`${RUTA_NUEVO_MENSAJE}?motivo=otro`)?.catch(console.error)}
            >
              Escribir por Mensajes
            </Button>
          </Group>
        </Alert>
        <Title order={4} mb="xs">
          Lo que aceptaste
        </Title>
        <Text size="sm" c="dimmed">
          {consent.policyRule?.text ?? TEXTO_CONSENTIMIENTO_TELECONSULTA}
        </Text>
      </>
    );
  } else {
    contenido = (
      <>
        <Text c="dimmed" mb="lg">
          Para atenderte por videollamada. Lo aceptás una sola vez.
        </Text>
        {/* No bloquea (no es una regla nueva): solo le recuerda el consentimiento informado. */}
        {general === false && (
          <Text size="sm" c="dimmed" mb="md">
            Este consentimiento se apoya en el consentimiento informado. Si todavía no lo firmaste,{' '}
            <Anchor component={Link} to={RUTA_CONSENTIMIENTO_INFORMADO}>
              leelo y firmalo acá
            </Anchor>
            .
          </Text>
        )}
        <Card withBorder radius="md" p="md">
          <Text size="sm" mb="sm">
            {TEXTO_CONSENTIMIENTO_TELECONSULTA}
          </Text>
          <Checkbox
            label="Leí y acepto el consentimiento de teleconsulta"
            checked={acepta}
            onChange={(e) => setAcepta(e.currentTarget.checked)}
          />
        </Card>
        <Button mt="md" disabled={!acepta} loading={guardando} onClick={() => aceptar().catch(console.error)}>
          Aceptar
        </Button>
      </>
    );
  }

  return (
    <Document>
      <Title order={1} mb={4}>
        Consentimiento de teleconsulta
      </Title>
      {contenido}
    </Document>
  );
}
