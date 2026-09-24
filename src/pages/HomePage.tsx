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
  IconCalendarEvent,
  IconChevronRight,
  IconClipboardHeart,
  IconDropletHeart,
  IconFileCheck,
  IconFileText,
  IconFileUpload,
  IconHeartbeat,
  IconMessage,
  IconReportMedical,
  IconWallet,
} from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { RUTA_ENVIAR_ESTUDIOS } from '../components/AccionesRapidas';
import { PlanBienestar100 } from '../components/PlanBienestar100';
import { SeguimientoGlp1Card } from '../components/SeguimientoGlp1Card';
import { PLAN_BIENESTAR_CKM } from './ckm/ckm.contenido';
import classes from './HomePage.module.css';
import { EstadioCkmCard, PlanBienestarCard, RiesgoPreventCard } from '@epa/plan-bienestar-react';

const RUTA_PLAN = '/care-plan/plan-100-dias';
const RUTA_MI_SALUD_CV = '/health-record/cuestionarios';

// Tablero mobile: la card CTA lleva al Plan Bienestar · 100 días; las acciones rápidas y
// las filas NO duplican esa entrada (el Consentimiento vive dentro de Salud).
const mobileTiles: { icon: Icon; title: string; href: string }[] = [
  { icon: IconReportMedical, title: 'Cargar resultado', href: '/health-record/biomarkers' },
  { icon: IconCalendarEvent, title: 'Reservar', href: '/get-care' },
  { icon: IconMessage, title: 'Mensajes', href: '/Communication' },
];

const mobileRows: { icon: Icon; title: string; description: string; href: string }[] = [
  { icon: IconDropletHeart, title: 'Entendé tu salud CKM', description: 'Corazón, riñones y metabolismo, fase por fase', href: '/ckm' },
  { icon: IconHeartbeat, title: 'Mi salud cardiovascular', description: "Tus hábitos: Life's Essential 8", href: RUTA_MI_SALUD_CV },
  { icon: IconReportMedical, title: 'Mis biomarcadores', description: 'Resultados y evolución', href: '/health-record/biomarkers' },
  { icon: IconFileText, title: 'Historia clínica', description: 'Estudios y registros', href: '/health-record' },
  { icon: IconClipboardHeart, title: 'Mi plan', description: 'Los pasos de tu seguimiento', href: '/care-plan' },
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
    icon: IconClipboardHeart,
    title: 'Plan Bienestar · 100 días',
    description: 'Tus pasos, tus metas y tu progreso, semana a semana.',
    href: RUTA_PLAN,
  },
  {
    icon: IconHeartbeat,
    title: 'Mi salud cardiovascular',
    description: "Respondé los cuestionarios de Life's Essential 8: sueño, alimentación, actividad y tabaco.",
    href: RUTA_MI_SALUD_CV,
  },
  {
    icon: IconDropletHeart,
    title: 'Tu salud CKM',
    description: 'La guía AHA explicada fácil: descubrí tu estadío (0-4) y qué hacer en cada fase.',
    href: '/ckm',
  },
  {
    icon: IconReportMedical,
    title: 'Biomarcadores',
    description: 'Cargá tus resultados de laboratorio y seguí su evolución.',
    href: '/health-record/biomarkers',
  },
  {
    icon: IconFileUpload,
    title: 'Enviar estudios en PDF',
    description: 'Subí el PDF de tu laboratorio; lo procesamos y se suma a tus biomarcadores.',
    href: RUTA_ENVIAR_ESTUDIOS,
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
    description: 'Comunicate con tu equipo de salud.',
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

// "Cómo funciona" — el Plan Bienestar · 100 días en 3 pasos (mismo contenido que /ckm).
const steps = PLAN_BIENESTAR_CKM.bullets.map((description, i) => ({ n: i + 1, description }));

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
            Tu Plan Bienestar · 100 días
          </Text>
          <Text c="gray.3" fz="sm" mt={4} mb="md">
            Tus datos, tus hábitos y tus metas, paso a paso, con el acompañamiento de tu equipo.
          </Text>
          <Button variant="white" radius="xl" size="sm" onClick={() => go(RUTA_PLAN)}>
            Ver mi plan
          </Button>
        </Card>
        <Container mt="md">
          <PlanBienestarCard />
          <Box mt="md">
            <EstadioCkmCard />
          </Box>
          <Box mt="md">
            <RiesgoPreventCard basePath="/care-plan/plan-100-dias" />
          </Box>
        </Container>

        {/* Seguimiento GLP-1 (solo si el paciente está en el programa) */}
        <Box mb="lg">
          <SeguimientoGlp1Card />
        </Box>
        {/* Plan Bienestar · 100 días (solo si el paciente está inscripto) */}
        <Box mb="lg">
          <PlanBienestar100 />
        </Box>
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
            Hola <span>{profileName}</span>,<br /> tu Plan Bienestar de 100 días para cuidar tu corazón
          </Title>
          <Text c="white" size="lg" maw={640} mt="md" style={{ position: 'relative', zIndex: 1 }}>
            Salud 3.0: datos y prevención. Tus datos, tus hábitos y tus metas, paso a paso, basados en las guías
            y en tu riesgo cardiovascular.
          </Text>
          <Group mt="xl" style={{ position: 'relative', zIndex: 1 }}>
            <Button size="lg" radius="xl" className={classes.heroButton} onClick={() => go(RUTA_PLAN)}>
              Ver mi Plan Bienestar
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

      {/* Plan Bienestar · 100 días (solo si el paciente está inscripto) */}
      <Container pt={48}>
        <SeguimientoGlp1Card />
        <Box mt="md">
          <PlanBienestar100 />
        </Box>
      </Container>
      {/* Accesos rápidos */}
      <Container py={48}>
        {/* Plan Bienestar · 100 días: la card se auto-gestiona (null si el paciente no es elegible). */}
        <Box mb="xl">
          <PlanBienestarCard />
          <Box mt="md">
            <EstadioCkmCard />
          </Box>
          <Box mt="md">
            <RiesgoPreventCard basePath="/care-plan/plan-100-dias" />
          </Box>
        </Box>
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

      {/* Cómo funciona */}
      <Container py={48}>
        <Title order={2} mb={4}>
          Cómo funciona
        </Title>
        <Text c="dimmed" mb="lg" maw={720}>
          Tu Plan Bienestar · 100 días, en tres pasos.
        </Text>
        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
          {steps.map((step) => (
            <Card key={step.n} withBorder radius="md" p="lg" className={classes.card}>
              <ThemeIcon size={40} radius="xl" color={theme.primaryColor}>
                {step.n}
              </ThemeIcon>
              <Text mt="md">{step.description}</Text>
            </Card>
          ))}
        </SimpleGrid>
      </Container>
      </Box>
    </>
  );
}
