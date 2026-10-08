// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AppShell, Badge, Box, Button, Card, Container, Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import {
  IconActivity,
  IconArrowRight,
  IconDeviceWatch,
  IconDna2,
  IconGenderFemale,
  IconHeartbeat,
  IconStethoscope,
  IconUserPlus,
  IconUsers,
} from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { Footer } from '../../components/Footer';
import DoctorImage from '../../img/landingPage/doctor.jpg';
import LabImage from '../../img/landingPage/laboratory.jpg';
import { MARCA } from '../../marca';
import { Header } from './Header';
import classes from './index.module.css';

interface FeatureItem {
  readonly icon: Icon;
  readonly title: string;
  readonly description: string;
}

// Servicios cardiovasculares de la marca (el nombre y el servicio salen de src/marca.ts).
const services: FeatureItem[] = [
  {
    icon: IconStethoscope,
    title: `${MARCA.producto} Cardiológica`,
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
    description: 'Seguimiento de tus datos para prevenir antes de los síntomas.',
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

// Cómo funciona, en 3 pasos (refleja el flujo real del portal).
const steps = [
  {
    n: 1,
    title: 'Contanos tu caso',
    description: 'Cargá el motivo de consulta, tus antecedentes y subí tus estudios.',
  },
  {
    n: 2,
    title: 'Análisis cardiológico',
    description: 'Estimamos tu riesgo cardiovascular (score PREVENT) y revisamos tu información según las guías.',
  },
  {
    n: 3,
    title: 'Recibí tu informe',
    description: 'Un informe de segunda opinión claro y accionable, con recomendaciones.',
  },
];

// Para quién: situaciones en las que una segunda opinión suma.
const profiles: FeatureItem[] = [
  { icon: IconStethoscope, title: 'Ante un diagnóstico nuevo', description: 'Confirmá tu diagnóstico cardiológico con una mirada experta.' },
  { icon: IconHeartbeat, title: 'Antes de una intervención', description: 'Evaluá alternativas antes de un procedimiento o cirugía.' },
  { icon: IconActivity, title: 'Prevención y riesgo', description: 'Conocé tu riesgo cardiovascular y cómo reducirlo.' },
  { icon: IconUserPlus, title: 'Profesionales que derivan', description: 'Derivá a tu paciente y recibí copia del informe.' },
];

export function LandingPage(): JSX.Element {
  const navigate = useNavigate();
  const go = (href: string): void => {
    navigate(href)?.catch(console.error);
  };

  return (
    <AppShell className={classes.outer} header={{ height: 64 }}>
      <Header />
      <AppShell.Main>
        {/* Hero */}
        <Container size="lg" className={classes.hero}>
          <Stack gap="lg" maw={780}>
            <Badge variant="light" size="lg" radius="sm" leftSection={<IconHeartbeat size={14} />} w="fit-content">
              Cardiología · Salud 3.0
            </Badge>
            <Title className={classes.heroTitle}>
              Tu segunda opinión médica, con los <span className={classes.accent}>líderes globales en salud</span>
            </Title>
            <Text className={classes.lead}>
              Una segunda opinión cardiológica experta, basada en tus datos y en la evidencia. Subí tu caso y tus
              estudios y recibí un informe claro y accionable.
            </Text>
            {/* CTAs: en mobile apiladas y full-width; en tablet+ en línea */}
            <Stack gap="sm" mt="md" hiddenFrom="xs">
              <Button
                fullWidth
                size="md"
                radius="xl"
                rightSection={<IconArrowRight size={18} />}
                onClick={() => go('/register')}
              >
                Crear cuenta
              </Button>
              <Button fullWidth size="md" radius="xl" variant="default" onClick={() => go('/signin')}>
                Ya tengo cuenta
              </Button>
            </Stack>
            <Group mt="md" visibleFrom="xs">
              <Button size="md" radius="xl" rightSection={<IconArrowRight size={18} />} onClick={() => go('/register')}>
                Crear cuenta
              </Button>
              <Button size="md" radius="xl" variant="default" onClick={() => go('/signin')}>
                Iniciar sesión
              </Button>
            </Group>
          </Stack>
        </Container>

        {/* Salud 3.0 */}
        <Container size="lg" py={{ base: 44, md: 64 }}>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing={48} verticalSpacing="xl" style={{ alignItems: 'center' }}>
            <div>
              <Text className={classes.eyebrow}>Salud 3.0</Text>
              <Title className={classes.sectionTitle} mt="sm" mb="md">
                De reaccionar a la enfermedad a decidir con datos
              </Title>
              <Text c="gray.7" size="lg">
                La medicina reactiva espera a los síntomas. Una segunda opinión cardiológica centrada en datos y
                prevención te ayuda a anticiparte y a decidir mejor: evaluamos tu riesgo y revisamos tu caso según las
                guías internacionales.
              </Text>
            </div>
            <img
              src={LabImage}
              alt={`Análisis de datos clínicos en ${MARCA.nombre}`}
              className={classes.editorialImg}
            />
          </SimpleGrid>
        </Container>

        {/* Salud CKM: la guía AHA explicada fácil */}
        <Container size="lg" py={{ base: 44, md: 64 }}>
          <Stack align="center" gap="xs" mb="xl">
            <Text className={classes.eyebrow}>Salud CKM · Guía AHA 2023</Text>
            <Title className={classes.sectionTitle} ta="center" maw={760}>
              Corazón, riñones y metabolismo: un solo sistema, cinco fases
            </Title>
            <Text c="gray.7" size="lg" ta="center" maw={720}>
              La guía AHA 2023 (Ndumele y col.) ordena tu salud cardio-reno-metabólica en estadios 0 a 4 para actuar
              antes del evento. Conocé tu fase y pedí tu segunda opinión con contexto.
            </Text>
          </Stack>
          <Group justify="center" gap="sm" mb="lg" wrap="wrap">
            {[
              { n: 0, label: 'Salud preservada', color: 'teal' },
              { n: 1, label: 'Adiposidad / prediabetes', color: 'lime' },
              { n: 2, label: 'Factores metabólicos o renales', color: 'yellow' },
              { n: 3, label: 'Enfermedad subclínica', color: 'orange' },
              { n: 4, label: 'Enfermedad establecida', color: 'red' },
            ].map((e) => (
              <Badge key={e.n} size="lg" radius="xl" variant="light" color={e.color}>
                {e.n} · {e.label}
              </Badge>
            ))}
          </Group>
          <Group justify="center">
            <Button size="md" radius="xl" rightSection={<IconArrowRight size={18} />} onClick={() => go('/register')}>
              Descubrí tu estadío — Crear cuenta
            </Button>
          </Group>
        </Container>

        {/* Por qué una segunda opinión */}
        <Box className={classes.band}>
          <Container size="lg" py={{ base: 44, md: 64 }}>
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing={48} verticalSpacing="xl" style={{ alignItems: 'center' }}>
              <img src={DoctorImage} alt={`Cardiólogo de ${MARCA.nombre}`} className={classes.editorialImg} />
              <div>
                <Text className={classes.eyebrow}>Por qué una segunda opinión</Text>
                <Title className={classes.sectionTitle} mt="sm" mb="md">
                  Las decisiones importantes merecen una mirada experta
                </Title>
                <Text c="gray.7" size="lg">
                  Ante un diagnóstico o un tratamiento cardiológico que pesa, una segunda opinión de especialistas de
                  prestigio internacional te da confianza y claridad para decidir tu próximo paso.
                </Text>
              </div>
            </SimpleGrid>
          </Container>
        </Box>

        {/* Servicios */}
        <Container size="lg" py={{ base: 44, md: 64 }}>
          <Stack align="center" gap="xs" mb="xl">
            <Text className={classes.eyebrow}>Nuestros servicios</Text>
            <Title className={classes.sectionTitle} ta="center" maw={760}>
              Atención cardiovascular centrada en datos y prevención
            </Title>
          </Stack>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
            {services.map((t) => (
              <Card key={t.title} withBorder radius="lg" p="lg" className={classes.card}>
                <ThemeIcon size={48} radius="md" variant="light">
                  <t.icon size={26} stroke={1.5} />
                </ThemeIcon>
                <Text fw={600} fz="lg" mt="md">
                  {t.title}
                </Text>
                <Text c="dimmed" mt={4}>
                  {t.description}
                </Text>
              </Card>
            ))}
          </SimpleGrid>
        </Container>

        {/* Cómo funciona */}
        <Box className={classes.dark}>
          <Container size="lg" py={{ base: 48, md: 72 }}>
            <Stack align="center" gap="xs" mb="xl">
              <Text className={classes.eyebrowLight}>Cómo funciona</Text>
              <Title className={classes.sectionTitle} ta="center" c="white">
                Tu segunda opinión, en tres pasos
              </Title>
            </Stack>
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="xl">
              {steps.map((s) => (
                <div key={s.n}>
                  <ThemeIcon size={48} radius="xl" variant="white" color="segundaOpinion">
                    <Text fw={700}>{s.n}</Text>
                  </ThemeIcon>
                  <Text fw={600} fz="lg" c="white" mt="md">
                    {s.title}
                  </Text>
                  <Text c="gray.4" mt={4}>
                    {s.description}
                  </Text>
                </div>
              ))}
            </SimpleGrid>
          </Container>
        </Box>

        {/* Para quién */}
        <Container size="lg" py={{ base: 44, md: 64 }}>
          <Stack align="center" gap="xs" mb="xl">
            <Text className={classes.eyebrow}>Pensado para vos</Text>
            <Title className={classes.sectionTitle} ta="center">
              Una segunda opinión para cada situación
            </Title>
          </Stack>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="lg">
            {profiles.map((p) => (
              <Card key={p.title} withBorder radius="lg" p="lg" className={classes.card}>
                <ThemeIcon size={44} radius="xl" variant="light">
                  <p.icon size={24} stroke={1.5} />
                </ThemeIcon>
                <Text fw={600} mt="md">
                  {p.title}
                </Text>
                <Text c="dimmed" size="sm" mt={4}>
                  {p.description}
                </Text>
              </Card>
            ))}
          </SimpleGrid>
        </Container>

        {/* CTA final */}
        <Container size="lg" pb={{ base: 56, md: 80 }}>
          <Box className={classes.ctaCard}>
            <Stack align="center" gap="md" p={{ base: 28, md: 48 }}>
              <Title className={classes.sectionTitle} ta="center" c="white">
                Pedí tu segunda opinión cardiológica
              </Title>
              <Text c="gray.3" ta="center" maw={540}>
                Creá tu cuenta, cargá tu caso y tus estudios, y recibí un informe de segunda opinión del equipo de{' '}
                {MARCA.nombre}.
              </Text>
              <Button size="lg" radius="xl" variant="white" mt="xs" onClick={() => go('/register')}>
                Crear cuenta
              </Button>
            </Stack>
          </Box>
        </Container>
      </AppShell.Main>
      <Footer />
    </AppShell>
  );
}
