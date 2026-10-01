// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// "El eGFR se obtiene con tres datos": tu edad, tu sexo biológico y tu creatinina en sangre.
// Muestra cuáles tiene la paciente y cómo completar el que falta.
import { Anchor, Box, Group, List, Text, ThemeIcon } from '@mantine/core';
import { IconCheck, IconExclamationMark } from '@tabler/icons-react';
import type { JSX } from 'react';
import { Link } from 'react-router';
import { RUTA_ENVIAR_ESTUDIOS } from '../../components/AccionesRapidas';
import type { RequisitoEgfr } from '../../fhir/biomarkers';

const RUTA_PERFIL = '/account/profile';

export function RequisitosEgfr({ requisitos }: { readonly requisitos: readonly RequisitoEgfr[] }): JSX.Element {
  const completos = requisitos.every((r) => r.ok);
  return (
    <Box>
      <Text size="sm" fw={500} mb={4}>
        El eGFR se obtiene con tres datos:
      </Text>
      <List spacing={4} size="sm" center>
        {requisitos.map((r) => (
          <List.Item
            key={r.dato}
            icon={
              <ThemeIcon color={r.ok ? 'green' : 'orange'} size={18} radius="xl">
                {r.ok ? <IconCheck size={12} /> : <IconExclamationMark size={12} />}
              </ThemeIcon>
            }
          >
            <Group gap={6} wrap="wrap">
              <Text size="sm" fw={500}>
                {r.titulo}:
              </Text>
              <Text size="sm" c={r.ok ? undefined : 'orange.8'}>
                {r.detalle}
              </Text>
              {!r.ok && r.dato !== 'creatinina' && (
                <Anchor component={Link} to={RUTA_PERFIL} size="sm">
                  Completar mi perfil
                </Anchor>
              )}
              {!r.ok && r.dato === 'creatinina' && (
                <Anchor component={Link} to={RUTA_ENVIAR_ESTUDIOS} size="sm">
                  Enviar estudios en PDF
                </Anchor>
              )}
            </Group>
          </List.Item>
        ))}
      </List>
      {completos && (
        <Text size="xs" c="dimmed" mt={4}>
          Lo calculamos con la ecuación CKD-EPI 2021 cada vez que hay una creatinina nueva.
        </Text>
      )}
    </Box>
  );
}
