// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Aviso en el inicio cuando la persona firmó una versión anterior del consentimiento
// informado: lo vuelve a firmar (el texto cambió). Quien nunca lo firmó no lo ve acá: a
// ese lo lleva el recorrido de la Bienvenida.
import { Alert, Button, Text } from '@mantine/core';
import type { DocumentReference, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconRefresh } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { buscarConsentimiento, consentimientoAlDia } from '../fhir/consentimiento';
import { VERSION_CONSENTIMIENTO } from '../pages/health-record/InformedConsent.data';

export const RUTA_CONSENTIMIENTO = '/health-record/consent';

export function AvisoConsentimiento(): JSX.Element | null {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const profile = medplum.getProfile() as Patient | undefined;
  const [firmado, setFirmado] = useState<DocumentReference>();

  useEffect(() => {
    if (profile?.resourceType !== 'Patient') {
      return;
    }
    buscarConsentimiento(medplum, profile)
      .then(setFirmado)
      .catch(() => undefined);
  }, [medplum, profile]);

  if (!firmado || consentimientoAlDia(firmado, VERSION_CONSENTIMIENTO)) {
    return null;
  }
  return (
    <Alert
      icon={<IconRefresh size={18} />}
      color="yellow"
      radius="md"
      mb="md"
      title="Actualizamos el consentimiento informado"
    >
      <Text size="sm">
        Ahora incluye el Plan Bienestar · 100 días y explica para qué usamos inteligencia artificial y quién procesa tus
        datos. Leelo y firmalo de nuevo.
      </Text>
      <Button size="xs" mt="sm" radius="xl" onClick={() => navigate(RUTA_CONSENTIMIENTO)?.catch(console.error)}>
        Revisar y firmar
      </Button>
    </Alert>
  );
}
