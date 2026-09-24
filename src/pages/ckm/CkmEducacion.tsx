// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// /ckm — Flujo educativo de salud CKM (Cardio-Reno-Metabólica) para el paciente:
// qué es, qué trae la guía AHA 2023 (Ndumele), los estadios 0-4 explicados fácil,
// "¿en qué estadío estás?" (card real del vendor) y cómo acompaña el Plan Bienestar
// · 100 días, que es el siguiente paso en cualquier estadío.
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Container,
  Group,
  List,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { EstadioCkmCard, PlanBienestarCard } from '@epa/plan-bienestar-react';
import {
  IconArrowRight,
  IconClipboardHeart,
  IconDropletHeart,
  IconHeartbeat,
  IconInfoCircle,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import {
  DISCLAIMER_CKM,
  ESTADIOS,
  NOVEDADES_GUIA,
  PLAN_BIENESTAR_CKM,
  QUE_ES_CKM,
} from './ckm.contenido';

export function CkmEducacion(): JSX.Element {
  const navigate = useNavigate();
  const go = (href: string): void => {
    navigate(href)?.catch(console.error);
  };

  return (
    <Container size={860} py={{ base: 20, sm: 48 }}>
      <Stack gap="xl">
        {/* Hero: qué es la salud CKM */}
        <Stack gap="sm">
          <Group gap="xs">
            <ThemeIcon size={44} radius="xl" variant="light">
              <IconDropletHeart size={26} stroke={1.5} />
            </ThemeIcon>
            <Text fw={700} c="dimmed" size="sm" tt="uppercase">
              Salud CKM · corazón · riñones · metabolismo
            </Text>
          </Group>
          <Title order={1} style={{ letterSpacing: '-0.01em' }}>
            {QUE_ES_CKM.titulo}
          </Title>
          {QUE_ES_CKM.parrafos.map((p) => (
            <Text key={p.slice(0, 24)} size="lg" c="gray.7">
              {p}
            </Text>
          ))}
        </Stack>

        {/* Novedades de la guía AHA 2023 */}
        <Box>
          <Title order={3} mb="sm">
            Lo nuevo de la guía AHA 2023 (Ndumele y col.)
          </Title>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {NOVEDADES_GUIA.map((n) => (
              <Card key={n.titulo} withBorder radius="md" p="md">
                <Text fw={600}>{n.titulo}</Text>
                <Text size="sm" c="dimmed" mt={4}>
                  {n.texto}
                </Text>
              </Card>
            ))}
          </SimpleGrid>
        </Box>

        {/* Los 5 estadios */}
        <Box>
          <Title order={3} mb={4}>
            Las 5 fases de tu salud CKM
          </Title>
          <Text c="dimmed" mb="md">
            La guía ordena la salud cardio-reno-metabólica en estadios 0 a 4. Encontrá el tuyo: cada fase tiene
            acciones concretas.
          </Text>
          <Stack gap="sm">
            {ESTADIOS.map((e) => (
              <Card key={e.estadio} withBorder radius="md" p="md">
                <Group wrap="nowrap" align="flex-start">
                  <ThemeIcon size={44} radius="xl" color={e.color} variant="light">
                    <Text fw={800} fz="lg">
                      {e.estadio}
                    </Text>
                  </ThemeIcon>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Group gap="xs" mb={2}>
                      <Text fw={700}>{e.nombre}</Text>
                      <Badge color={e.color} variant="light" size="sm">
                        Estadío {e.estadio}
                      </Badge>
                    </Group>
                    <Text size="sm" c="gray.7">
                      {e.resumen}
                    </Text>
                    <List size="sm" mt={6} spacing={2}>
                      {e.ejemplos.map((ej) => (
                        <List.Item key={ej}>{ej}</List.Item>
                      ))}
                    </List>
                    <Text size="sm" fw={600} mt={8} c={`${e.color}.9`}>
                      💡 {e.quePodesHacer}
                    </Text>
                  </div>
                </Group>
              </Card>
            ))}
          </Stack>
        </Box>

        {/* ¿En qué estadío estás? (card real del vendor) */}
        <Box>
          <Title order={3} mb={4}>
            ¿En qué estadío estás vos?
          </Title>
          <Text c="dimmed" mb="md">
            Con tus datos (peso, cintura, presión, laboratorio) calculamos tu estadío automáticamente.
          </Text>
          <EstadioCkmCard />
          <Group mt="sm">
            <Button variant="default" radius="xl" onClick={() => go('/care-plan/plan-100-dias/mis-datos')}>
              Cargar / actualizar mis datos
            </Button>
            <Button
              radius="xl"
              leftSection={<IconClipboardHeart size={16} />}
              rightSection={<IconArrowRight size={16} />}
              onClick={() => go('/care-plan/plan-100-dias')}
            >
              Ir a mi Plan Bienestar
            </Button>
          </Group>
        </Box>

        {/* Plan Bienestar 100 días */}
        <Card withBorder radius="lg" p="lg">
          <Group gap="xs" mb="xs">
            <ThemeIcon size={40} radius="xl" variant="light">
              <IconClipboardHeart size={22} stroke={1.5} />
            </ThemeIcon>
            <Title order={3}>{PLAN_BIENESTAR_CKM.titulo}</Title>
          </Group>
          {PLAN_BIENESTAR_CKM.parrafos.map((p) => (
            <Text key={p.slice(0, 24)} c="gray.7">
              {p}
            </Text>
          ))}
          <List size="sm" mt="sm" spacing={4} icon={<IconHeartbeat size={14} />}>
            {PLAN_BIENESTAR_CKM.bullets.map((b) => (
              <List.Item key={b}>{b}</List.Item>
            ))}
          </List>
          <Box mt="md">
            <PlanBienestarCard />
          </Box>
          <Group mt="sm">
            <Button variant="light" radius="xl" onClick={() => go('/care-plan/plan-100-dias')}>
              Ver mi Plan Bienestar
            </Button>
          </Group>
        </Card>

        {/* Disclaimer */}
        <Alert color="gray" variant="light" icon={<IconInfoCircle />}>
          {DISCLAIMER_CKM}
        </Alert>
      </Stack>
    </Container>
  );
}
