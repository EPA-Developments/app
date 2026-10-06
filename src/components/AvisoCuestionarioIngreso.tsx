// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Aviso en el inicio para quien todavía no respondió el Cuestionario de ingreso (p. ej.
// pacientes que se registraron antes de que fuera parte del camino de Bienvenida). Se
// muestra recién cuando se confirmó que no hay respuesta: nunca parpadea para quien ya
// lo completó.
import { Alert, Button, Text } from '@mantine/core';
import type { Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconClipboardList } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { buscarUltimoIngreso } from '../fhir/ingreso';

const RUTA_INGRESO = '/health-record/ingreso';

export function AvisoCuestionarioIngreso(): JSX.Element | null {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const profile = medplum.getProfile() as Patient | undefined;
  const [pendiente, setPendiente] = useState(false);

  useEffect(() => {
    if (profile?.resourceType !== 'Patient') {
      return;
    }
    buscarUltimoIngreso(medplum, profile)
      .then((r) => setPendiente(!r))
      .catch(() => undefined);
  }, [medplum, profile]);

  if (!pendiente) {
    return null;
  }
  return (
    <Alert
      icon={<IconClipboardList size={18} />}
      color="segundaOpinion"
      radius="md"
      mb="md"
      title="Completá tu cuestionario de ingreso"
    >
      <Text size="sm">
        Tus antecedentes, factores de riesgo, medicación y alergias. Tu equipo lo revisa antes de tu consulta y te lleva
        unos minutos.
      </Text>
      <Button size="xs" mt="sm" radius="xl" onClick={() => navigate(RUTA_INGRESO)?.catch(console.error)}>
        Completar ahora
      </Button>
    </Alert>
  );
}
