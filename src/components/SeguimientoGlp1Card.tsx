// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Tarjeta de Inicio del seguimiento GLP-1: semanas de tratamiento y próximo control.
// Si el paciente no está en el programa, no renderiza nada (mismo patrón que PlanBienestar100).
//
// Accesibilidad:
// - Es un link de verdad (<a href>, con Link de react-router): se puede abrir en otra pestaña
//   o copiar, y un lector de pantalla lo anuncia como link, no como botón.
// - Sin aria-label: el nombre accesible es el texto que se ve (título, semanas y próximo
//   control). Quien usa un lector de pantalla oye lo mismo que se lee, y quien maneja la
//   compu con la voz la nombra por su título (WCAG 2.5.3, la etiqueta en el nombre).
// - El texto secundario va en gray.7 (#495057, 8,18:1 sobre la Card blanca); el «dimmed» de
//   Mantine (gray.6, #868e96) queda en 3,32:1 y no llega a 4,5:1. La Card es clara en las dos
//   Homes (el portal no usa el tema oscuro de Mantine), así que el color fijo sirve en las dos.
// - Foco visible: `mantine-focus-auto` le devuelve el anillo de foco de Mantine que la Card
//   (un Paper, con `outline: 0`) no trae; las Homes D y E lo pisan con el suyo.
// - Los íconos son decorativos: aria-hidden.
import { Card, Group, Text, ThemeIcon } from '@mantine/core';
import { useMedplum } from '@medplum/react';
import { IconChevronRight, IconPill } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Link } from 'react-router';
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

/** Texto secundario de la tarjeta: 8,18:1 sobre blanco (el «dimmed» de Mantine, 3,32:1). */
const COLOR_SECUNDARIO = 'gray.7';

export function SeguimientoGlp1Card(): JSX.Element | null {
  const medplum = useMedplum();
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
    <Card component={Link} to={RUTA_SEGUIMIENTO_GLP1} withBorder radius="lg" p="lg" className="mantine-focus-auto">
      <Group wrap="nowrap" align="flex-start">
        <ThemeIcon size={44} radius="xl" variant="light" aria-hidden>
          <IconPill size={24} stroke={1.5} />
        </ThemeIcon>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text fw={700}>Seguimiento GLP-1</Text>
          {seguimiento.estado === 'indicacion-pendiente' ? (
            <Text size="sm" c={COLOR_SECUNDARIO}>
              Tu médico está preparando tu plan de seguimiento.
            </Text>
          ) : (
            <>
              <Text size="sm">{textoSemanas(seguimiento.inicio, hoy)}</Text>
              {proximo && (
                <Text size="sm" c={COLOR_SECUNDARIO} mt={4}>
                  <b>Próximo: {proximo.nombre}</b> · {textoVentana(proximo, hoy)} · {textoEstado(proximo)}
                </Text>
              )}
            </>
          )}
        </div>
        <IconChevronRight size={18} color="var(--mantine-color-gray-6)" aria-hidden />
      </Group>
    </Card>
  );
}
