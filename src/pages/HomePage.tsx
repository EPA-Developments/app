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
  IconChevronRight,
  IconClipboardHeart,
  IconDeviceWatch,
  IconDna2,
  IconFileCheck,
  IconFileText,
  IconGenderFemale,
  IconMessage,
  IconReportMedical,
  IconStethoscope,
  IconUserPlus,
  IconUsers,
  IconWallet,
} from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import classes from './HomePage.module.css';

// Tablero mobile: 3 acciones rápidas + filas compactas a las secciones.
const mobileTiles: { icon: Icon; title: string; href: string }[] = [
  { icon: IconStethoscope, title: 'Segunda Opinión', href: '/solicitar-som' },
  { icon: IconReportMedical, title: 'Biomarcadores', href: '/health-record/biomarkers' },
  { icon: IconMessage, title: 'Mensajes', href: '/Communication' },
];

const mobileRows: { icon: Icon; title: string; description: string; href: string }[] = [
  { icon: IconStethoscope, title: 'Mi Segunda Opinión', description: 'Estado e informe de tu consulta', href: '/mi-segunda-opinion' },
  { icon: IconReportMedical, title: 'Mis biomarcadores', description: 'Resultados y evolución', href: '/health-record/biomarkers' },
  { icon: IconFileText, title: 'Historia clínica', description: 'Estudios y registros', href: '/health-record' },
  { icon: IconClipboardHeart, title: 'Mi plan', description: 'Los pasos de tu seguimiento', href: '/care-plan' },
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
    icon: IconStethoscope,
    title: 'Pedir Segunda Opinión',
    description: 'Iniciá tu segunda opinión cardiológica: cargá tu caso y tus estudios.',
    href: '/solicitar-som',
  },
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
    icon: IconMessage,
    title: 'Mensajes',
    description: 'Comunicate con el equipo de Segunda Opinión Médica.',
    href: '/Communication',
  },
  {
    icon: IconClipboardHeart,
    title: 'Plan de cuidado',
    description: 'Los pasos de tu seguimiento personalizado.',
    href: '/care-plan',
  },
  {
    icon: IconFileCheck,
    title: 'Consentimiento informado',
    description: 'Leé y firmá tu consentimiento.',
    href: '/health-record/consent',
  },
];

// "Nuestros servicios" — la oferta cardiovascular de Segunda Opinión Médica
// (segundaopinionmedica.org). Salud convencional cardiovascular, centrada en datos y prevención.
const services: CardItem[] = [
  {
    icon: IconStethoscope,
    title: 'Segunda Opinión Cardiológica',
    description: 'Una revisión experta de tu caso por cardiólogos de prestigio internacional.',
  },
  {
    icon: IconUsers,
    title: 'Líderes globales en salud',
    description: 'Conectamos tu caso con especialistas y referentes globales en cardiología.',
  },
  {
    icon: IconUserPlus,
    title: 'Derivación de colegas',
    description: 'Si sos profesional, derivá a tu paciente y recibí una copia del informe.',
  },
  {
    icon: IconDeviceWatch,
    title: 'Monitoreo remoto',
    description: 'Seguimiento de tus datos para prevenir antes de los síntomas (Salud 3.0).',
  },
  {
    icon: IconDna2,
    title: 'Genómica',
    description: 'Información genética aplicada a tu prevención cardiovascular.',
  },
  {
    icon: IconGenderFemale,
    title: 'Corazón y Mujer',
    description: 'Atención cardiovascular pensada para la salud de la mujer.',
  },
];

// "Cómo funciona" — el recorrido de una Segunda Opinión, en 3 pasos (refleja el flujo real del portal).
const steps = [
  {
    n: 1,
    title: 'Contanos tu caso',
    description: 'Cargá el motivo de consulta, tus antecedentes y subí tus estudios.',
  },
  {
    n: 2,
    title: 'Análisis cardiológico',
    description: 'Estimamos tu riesgo (score PREVENT) y revisamos tu información según las guías.',
  },
  {
    n: 3,
    title: 'Recibí tu informe',
    description: 'Un informe de segunda opinión claro y accionable, con recomendaciones.',
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
            Pedí tu Segunda Opinión
          </Text>
          <Text c="gray.3" fz="sm" mt={4} mb="md">
            Cargá tu caso y tus estudios, y recibí un informe cardiológico con recomendaciones.
          </Text>
          <Button variant="white" radius="xl" size="sm" onClick={() => go('/solicitar-som')}>
            Pedir Segunda Opinión
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
            Hola <span>{profileName}</span>,<br /> tu segunda opinión cardiológica, con líderes globales en salud
          </Title>
          <Text c="white" size="lg" maw={640} mt="md" style={{ position: 'relative', zIndex: 1 }}>
            Salud 3.0: datos y prevención. Subí tu caso y tus estudios y recibí un informe de segunda opinión
            cardiológica, basado en las guías y en tu riesgo cardiovascular.
          </Text>
          <Group mt="xl" style={{ position: 'relative', zIndex: 1 }}>
            <Button size="lg" radius="xl" className={classes.heroButton} onClick={() => go('/solicitar-som')}>
              Pedir Segunda Opinión
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

      {/* Nuestros servicios */}
      <Box bg="white">
        <Container py={48}>
          <Title order={2} mb={4}>
            Nuestros servicios
          </Title>
          <Text c="dimmed" mb="lg" maw={720}>
            Atención cardiovascular centrada en datos y prevención: una segunda opinión experta para decidir mejor.
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
            {services.map((item) => (
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
          El recorrido de tu Segunda Opinión Médica, en tres pasos.
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
