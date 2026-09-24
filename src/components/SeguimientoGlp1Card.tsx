// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Tarjeta de Inicio del seguimiento GLP-1: semanas de tratamiento y próximo control.
// Si el paciente no está en el programa, no renderiza nada (mismo patrón que PlanBienestar100).
import { Card, Group, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import { useMedplum } from '@medplum/react';
import { IconChevronRight, IconPill } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import type { SeguimientoGlp1 } from '../fhir/glp1';
import {
  RUTA_SEGUIMIENTO_GLP1,
  cargarSeguimientoGlp1,
  hoyArgentina,
  proximoControl,
  textoEstado,
  textoSemanas,
  textoVentana,
} from '../fhir/glp1';

export function SeguimientoGlp1Card(): JSX.Element | null {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const profile = medplum.getProfile();
  const paciente = profile?.resourceType === 'Patient' ? profile : undefined;
  const [seguimiento, setSeguimiento] = useState<SeguimientoGlp1 | null>();

  useEffect(() => {
    if (!paciente) {
      return;
    }
    cargarSeguimientoGlp1(medplum, paciente)
      .then((s) => setSeguimiento(s ?? null))
      .catch((err) => {
        console.warn('Seguimiento GLP-1 no disponible', err);
        setSeguimiento(null);
      });
  }, [medplum, paciente]);

  if (!paciente || !seguimiento) {
    return null; // cargando o sin programa: no ocupar lugar
  }

  const hoy = hoyArgentina();
  const proximo = seguimiento.estado === 'activo' ? proximoControl(seguimiento.controles) : undefined;

  return (
    <UnstyledButton
      w="100%"
      onClick={() => navigate(RUTA_SEGUIMIENTO_GLP1)?.catch(console.error)}
      aria-label="Ver mi seguimiento GLP-1"
    >
      <Card withBorder radius="lg" p="lg">
        <Group wrap="nowrap" align="flex-start">
          <ThemeIcon size={44} radius="xl" variant="light">
            <IconPill size={24} stroke={1.5} />
          </ThemeIcon>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text fw={700}>Seguimiento GLP-1</Text>
            {seguimiento.estado === 'indicacion-pendiente' ? (
              <Text size="sm" c="dimmed">
                Tu médico está preparando tu plan de seguimiento.
              </Text>
            ) : (
              <>
                <Text size="sm">{textoSemanas(seguimiento.inicio, hoy)}</Text>
                {proximo && (
                  <Text size="sm" c="dimmed" mt={4}>
                    <b>Próximo: {proximo.nombre}</b> · {textoVentana(proximo, hoy)} · {textoEstado(proximo)}
                  </Text>
                )}
              </>
            )}
          </div>
          <IconChevronRight size={18} color="var(--mantine-color-gray-5)" />
        </Group>
      </Card>
    </UnstyledButton>
  );
}
