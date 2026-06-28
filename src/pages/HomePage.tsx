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
  Stack,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
  useMantineTheme,
} from '@mantine/core';
import { formatHumanName } from '@medplum/core';
import type { Patient, Practitioner } from '@medplum/fhirtypes';
import { useMedplumProfile } from '@medplum/react';
import {
  IconActivity,
  IconCalendarEvent,
  IconChevronRight,
  IconClipboardHeart,
  IconFileCheck,
  IconFileText,
  IconLungs,
  IconMessage,
  IconMountain,
  IconReportMedical,
  IconSnowflake,
  IconStethoscope,
  IconSun,
  IconVaccine,
  IconWallet,
} from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import classes from './HomePage.module.css';

// Tablero mobile: 3 acciones rápidas + filas compactas a las secciones.
const mobileTiles: { icon: Icon; title: string; href: string }[] = [
  { icon: IconReportMedical, title: 'Cargar resultado', href: '/health-record/biomarkers' },
  { icon: IconCalendarEvent, title: 'Reservar', href: '/get-care' },
  { icon: IconMessage, title: 'Mensajes', href: '/Communication' },
];

const mobileRows: { icon: Icon; title: string; description: string; href: string }[] = [
  { icon: IconStethoscope, title: 'Mi Segunda Opinión', description: 'Estado e informe de tu consulta', href: '/mi-segunda-opinion' },
  { icon: IconReportMedical, title: 'Mis biomarcadores', description: 'Resultados y evolución', href: '/health-record/biomarkers' },
  { icon: IconFileText, title: 'Historia clínica', description: 'Estudios y registros', href: '/health-record' },
  { icon: IconClipboardHeart, title: 'Mi plan', description: 'Los pasos de tu tratamiento', href: '/care-plan' },
  { icon: IconFileCheck, title: 'Consentimiento', description: 'Leé y firmá', href: '/health-record/consent' },
  { icon: IconWallet, title: 'Mi membresía', description: 'Turnos, sesiones y pagos', href: '/membership' },
];

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
    description: 'Comunicate con el equipo de Segunda Opinión Médica.',
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
  const go = (href: string): void => {
    navigate(href)?.catch(console.error);
  };

  return (
    <>
      {/* MOBILE — tablero estilo app */}
      <Box hiddenFrom="sm" bg="gray.0" px="md" py="lg" mih="100%">
        <Text fz="sm" c="dimmed">
          Hola,
        </Text>
        <Title order={2} mb="md" style={{ letterSpacing: '-0.01em' }}>
          {profileName || 'qué bueno verte'}
        </Title>

        {/* Tarjeta de prioridad */}
        <Card radius="lg" p="lg" mb="lg" style={{ backgroundColor: 'var(--mantine-primary-color-filled)' }}>
          <Text c="white" fw={700} fz="lg">
            Empezá tu protocolo
          </Text>
          <Text c="gray.3" fz="sm" mt={4} mb="md">
            Reservá tu primera sesión o cargá tus biomarcadores y el equipo arma tu plan.
          </Text>
          <Button variant="white" radius="xl" size="sm" onClick={() => go('/get-care')}>
            Reservar turno
          </Button>
        </Card>

        {/* Acciones rápidas */}
        <SimpleGrid cols={3} spacing="sm" mb="lg">
          {mobileTiles.map((t) => (
            <UnstyledButton key={t.title} className={classes.tile} onClick={() => go(t.href)}>
              <ThemeIcon size={44} radius="md" variant="light" color={theme.primaryColor}>
                <t.icon size={22} stroke={1.5} />
              </ThemeIcon>
              <Text fz="xs" fw={600} ta="center" mt={6}>
                {t.title}
              </Text>
            </UnstyledButton>
          ))}
        </SimpleGrid>

        {/* Filas a las secciones */}
        <Stack gap="xs">
          {mobileRows.map((r) => (
            <UnstyledButton key={r.title} className={classes.row} onClick={() => go(r.href)}>
              <ThemeIcon size={38} radius="md" variant="light" color={theme.primaryColor}>
                <r.icon size={20} stroke={1.5} />
              </ThemeIcon>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text fw={600} fz="sm">
                  {r.title}
                </Text>
                <Text fz="xs" c="dimmed">
                  {r.description}
                </Text>
              </div>
              <IconChevronRight size={18} color="var(--mantine-color-gray-5)" />
            </UnstyledButton>
          ))}
        </Stack>
      </Box>

      {/* DESKTOP — home completa */}
      <Box visibleFrom="sm" bg="gray.0">
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
          La arquitectura de un protocolo Segunda Opinión Médica, en tres pasos.
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
    </>
  );
}
