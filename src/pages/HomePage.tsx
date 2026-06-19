// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Box,
  Button,
  Card,
  Container,
  Group,
  Overlay,
  SimpleGrid,
  Text,
  ThemeIcon,
  Title,
  useMantineTheme,
} from '@mantine/core';
import { formatHumanName } from '@medplum/core';
import type { Patient, Practitioner } from '@medplum/fhirtypes';
import { useMedplumProfile } from '@medplum/react';
import {
  IconActivity,
  IconCalendarEvent,
  IconClipboardHeart,
  IconFileCheck,
  IconFileText,
  IconLungs,
  IconMessage,
  IconMountain,
  IconReportMedical,
  IconSnowflake,
  IconSun,
  IconVaccine,
} from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import classes from './HomePage.module.css';

interface CardItem {
  readonly icon: Icon;
  readonly title: string;
  readonly description: string;
  readonly href?: string;
}

// Accesos rápidos a las funciones reales del portal.
const quickActions: CardItem[] = [
  {
    icon: IconReportMedical,
    title: 'Biomarcadores',
    description: 'Cargá tus resultados de laboratorio y seguí su evolución.',
    href: '/health-record/biomarkers',
  },
  {
    icon: IconFileText,
    title: 'Historia Clínica',
    description: 'Resultados, estudios y registros de tus visitas.',
    href: '/health-record',
  },
  {
    icon: IconCalendarEvent,
    title: 'Solicitar atención',
    description: 'Reservá tu próxima sesión o consulta.',
    href: '/get-care',
  },
  {
    icon: IconMessage,
    title: 'Mensajes',
    description: 'Comunicate con el equipo de BioWellness.',
    href: '/Communication',
  },
  {
    icon: IconClipboardHeart,
    title: 'Plan de cuidado',
    description: 'Los pasos de tu plan personalizado.',
    href: '/care-plan',
  },
  {
    icon: IconFileCheck,
    title: 'Consentimiento informado',
    description: 'Leé y firmá tu consentimiento.',
    href: '/health-record/consent',
  },
];

// "Nuestras terapias" — descripciones en voz de paciente, tomadas del playbook
// (reformuladas; sin precios ni lenguaje interno de venta).
const therapies: CardItem[] = [
  {
    icon: IconLungs,
    title: 'Oxigenoterapia Hiperbárica (HBOT)',
    description: 'Hasta 6 veces más oxígeno en tus células: activa la regeneración profunda y reduce la inflamación.',
  },
  {
    icon: IconMountain,
    title: 'IHHT — Entrenamiento mitocondrial',
    description: 'Como entrenar tus células en los Andes sin salir de San Isidro: fortalecés tus mitocondrias en 45 minutos.',
  },
  {
    icon: IconSun,
    title: 'Red Light — Fotobiomodulación',
    description: 'Luz roja e infrarroja que repara tu piel y desinflama músculos y articulaciones en 30 minutos.',
  },
  {
    icon: IconSnowflake,
    title: 'Recovery Pro',
    description: 'El circuito completo que usan los centros de longevidad del mundo —sauna, frío y red light— en un gabinete privado.',
  },
  {
    icon: IconActivity,
    title: 'Compresión y Crioterapia',
    description: 'Compresión neumática para el drenaje linfático y frío localizado para recuperar lesiones e inflamación.',
  },
  {
    icon: IconVaccine,
    title: 'Terapias IV y Medicina Regenerativa',
    description: 'Sueros endovenosos y medicina regenerativa avanzada, siempre con evaluación médica previa.',
  },
];

// "Cómo funciona" — la arquitectura de un protocolo en 3 pasos (playbook L09).
const steps = [
  {
    n: 1,
    title: 'Preparar el terreno',
    description: 'La HBOT satura tu sangre de oxígeno, baja la inflamación y prepara tus células.',
  },
  {
    n: 2,
    title: 'Adaptar y regenerar',
    description: 'Sobre ese terreno, el IHHT o las terapias médicas logran una adaptación más profunda.',
  },
  {
    n: 3,
    title: 'Recuperar',
    description: 'Frío, sauna y fotobiomodulación desinflaman y reparan para cerrar el ciclo.',
  },
];

export function HomePage(): JSX.Element {
  const navigate = useNavigate();
  const theme = useMantineTheme();
  const profile = useMedplumProfile() as Patient | Practitioner;
  const profileName = profile.name ? formatHumanName(profile.name[0]) : '';

  return (
    <Box bg="gray.0">
      {/* Hero */}
      <div className={classes.hero}>
        <Overlay
          gradient="linear-gradient(180deg, rgba(0, 0, 0, 0.35) 0%, rgba(0, 0, 0, 0.55) 100%)"
          opacity={1}
          zIndex={0}
        />
        <Container className={classes.heroContainer}>
          <Title className={classes.heroTitle}>
            Hola <span>{profileName}</span>,<br /> optimizá tu biología y extendé tu Healthspan
          </Title>
          <Text c="white" size="lg" maw={640} mt="md" style={{ position: 'relative', zIndex: 1 }}>
            Medicina 3.0: detectamos, prevenimos y optimizamos tu salud antes de los síntomas. Centro de longevidad y
            medicina integrativa en San Isidro.
          </Text>
          <Group mt="xl" style={{ position: 'relative', zIndex: 1 }}>
            <Button size="lg" radius="xl" className={classes.heroButton} onClick={() => navigate('/get-care')?.catch(console.error)}>
              Solicitar atención
            </Button>
            <Button
              size="lg"
              radius="xl"
              variant="white"
              onClick={() => navigate('/health-record/biomarkers')?.catch(console.error)}
            >
              Cargar mis biomarcadores
            </Button>
          </Group>
        </Container>
      </div>

      {/* Accesos rápidos */}
      <Container py={48}>
        <Title order={2} mb="lg">
          Accesos rápidos
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
          {quickActions.map((item) => (
            <Card
              key={item.title}
              withBorder
              radius="md"
              p="lg"
              className={classes.card}
              style={{ cursor: 'pointer' }}
              onClick={() => item.href && navigate(item.href)?.catch(console.error)}
            >
              <Group wrap="nowrap" align="flex-start">
                <ThemeIcon size={44} radius="md" variant="light" color={theme.primaryColor}>
                  <item.icon size={24} stroke={1.5} />
                </ThemeIcon>
                <div>
                  <Text fw={600}>{item.title}</Text>
                  <Text size="sm" c="dimmed">
                    {item.description}
                  </Text>
                </div>
              </Group>
            </Card>
          ))}
        </SimpleGrid>
      </Container>

      {/* Nuestras terapias */}
      <Box bg="white">
        <Container py={48}>
          <Title order={2} mb={4}>
            Nuestras terapias
          </Title>
          <Text c="dimmed" mb="lg" maw={720}>
            Optimización biológica basada en hormesis: estímulos precisos para que tu cuerpo se vuelva más fuerte y
            eficiente.
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
            {therapies.map((item) => (
              <Card key={item.title} withBorder radius="md" p="lg" className={classes.card}>
                <ThemeIcon size={44} radius="md" variant="light" color={theme.primaryColor}>
                  <item.icon size={24} stroke={1.5} />
                </ThemeIcon>
                <Text fw={600} mt="md">
                  {item.title}
                </Text>
                <Text size="sm" c="dimmed" mt={4}>
                  {item.description}
                </Text>
              </Card>
            ))}
          </SimpleGrid>
        </Container>
      </Box>

      {/* Cómo funciona */}
      <Container py={48}>
        <Title order={2} mb={4}>
          Cómo funciona
        </Title>
        <Text c="dimmed" mb="lg" maw={720}>
          La arquitectura de un protocolo BioWellness, en tres pasos.
        </Text>
        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
          {steps.map((step) => (
            <Card key={step.n} withBorder radius="md" p="lg" className={classes.card}>
              <ThemeIcon size={40} radius="xl" color={theme.primaryColor}>
                {step.n}
              </ThemeIcon>
              <Text fw={600} mt="md">
                {step.title}
              </Text>
              <Text size="sm" c="dimmed" mt={4}>
                {step.description}
              </Text>
            </Card>
          ))}
        </SimpleGrid>
      </Container>
    </Box>
  );
}
