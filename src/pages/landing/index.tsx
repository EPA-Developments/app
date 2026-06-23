// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AppShell, Badge, Box, Button, Card, Container, Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import {
  IconActivity,
  IconArrowRight,
  IconBarbell,
  IconBriefcase,
  IconHeartbeat,
  IconLungs,
  IconMapPin,
  IconMoon,
  IconMountain,
  IconSnowflake,
  IconSun,
  IconVaccine,
} from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { Footer } from '../../components/Footer';
import DoctorImage from '../../img/landingPage/doctor.jpg';
import LabImage from '../../img/landingPage/laboratory.jpg';
import { Header } from './Header';
import classes from './index.module.css';

interface FeatureItem {
  readonly icon: Icon;
  readonly title: string;
  readonly description: string;
}

// Terapias (voz de paciente, contenido del Tactical Playbook; sin precios).
const therapies: FeatureItem[] = [
  {
    icon: IconLungs,
    title: 'Oxigenoterapia Hiperbárica (HBOT)',
    description: 'Hasta 6 veces más oxígeno en tus células: activa la regeneración profunda y reduce la inflamación.',
  },
  {
    icon: IconMountain,
    title: 'Entrenamiento mitocondrial (IHHT)',
    description: 'Como entrenar tus células en los Andes sin salir de San Isidro: fortalecés tus mitocondrias en 45 minutos.',
  },
  {
    icon: IconSun,
    title: 'Fotobiomodulación (Red Light)',
    description: 'Luz roja e infrarroja que repara tu piel y desinflama músculos y articulaciones en 30 minutos.',
  },
  {
    icon: IconSnowflake,
    title: 'Recovery Pro',
    description: 'El circuito completo que usan los centros de longevidad del mundo: sauna, frío y red light en un gabinete privado.',
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

// Protocolo en 3 pasos (Playbook: "La arquitectura de un protocolo").
const steps = [
  {
    n: 1,
    title: 'Preparar el terreno',
    description: 'La oxigenoterapia (HBOT) satura tu sangre de oxígeno, baja la inflamación y prepara tus células.',
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

// Perfiles (Playbook: matriz de combos y membresías, reformulados).
const profiles: FeatureItem[] = [
  { icon: IconBriefcase, title: 'Rendimiento y foco', description: 'Energía y claridad mental para tu día a día.' },
  { icon: IconBarbell, title: 'Deporte y recuperación', description: 'Recuperá lesiones y rendí al máximo.' },
  {
    icon: IconHeartbeat,
    title: 'Longevidad y anti-aging',
    description: 'Optimización biológica integral para vivir mejor, más tiempo.',
  },
  { icon: IconMoon, title: 'Bienestar y descanso', description: 'Bajá el estrés y recuperá tu vitalidad.' },
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
            <Badge variant="light" size="lg" radius="sm" leftSection={<IconMapPin size={14} />} w="fit-content">
              Medicina 3.0 · San Isidro
            </Badge>
            <Title className={classes.heroTitle}>
              Viví más años <span className={classes.accent}>en plena forma</span>
            </Title>
            <Text className={classes.lead}>
              Medicina integrativa y optimización biológica para extender tu Healthspan: actuamos antes de los síntomas.
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

        {/* Medicina 3.0 */}
        <Container size="lg" py={{ base: 44, md: 64 }}>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing={48} verticalSpacing="xl" style={{ alignItems: 'center' }}>
            <div>
              <Text className={classes.eyebrow}>Medicina 3.0</Text>
              <Title className={classes.sectionTitle} mt="sm" mb="md">
                Del tratamiento de la enfermedad a la optimización de tu biología
              </Title>
              <Text c="gray.7" size="lg">
                La medicina reactiva espera a la enfermedad. Nosotros trabajamos antes: detectamos, prevenimos y
                revertimos los signos del envejecimiento para extender tus años de vida en plena forma.
              </Text>
            </div>
            <img src={LabImage} alt="Laboratorio BioWellness" className={classes.editorialImg} />
          </SimpleGrid>
        </Container>

        {/* Hormesis */}
        <Box className={classes.band}>
          <Container size="lg" py={{ base: 44, md: 64 }}>
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing={48} verticalSpacing="xl" style={{ alignItems: 'center' }}>
              <img src={DoctorImage} alt="Profesional de BioWellness" className={classes.editorialImg} />
              <div>
                <Text className={classes.eyebrow}>Por qué funciona</Text>
                <Title className={classes.sectionTitle} mt="sm" mb="md">
                  El estímulo preciso que te hace más fuerte
                </Title>
                <Text c="gray.7" size="lg">
                  Igual que el ejercicio sobre el músculo, aplicamos un estrés biológico controlado —sin esfuerzo
                  físico— y tu cuerpo responde volviéndose más fuerte y eficiente: más energía, mejor recuperación y más
                  resiliencia celular.
                </Text>
              </div>
            </SimpleGrid>
          </Container>
        </Box>

        {/* Terapias */}
        <Container size="lg" py={{ base: 44, md: 64 }}>
          <Stack align="center" gap="xs" mb="xl">
            <Text className={classes.eyebrow}>Nuestras terapias</Text>
            <Title className={classes.sectionTitle} ta="center" maw={760}>
              Tecnología de los centros de longevidad del mundo, en San Isidro
            </Title>
          </Stack>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
            {therapies.map((t) => (
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

        {/* Protocolo */}
        <Box className={classes.dark}>
          <Container size="lg" py={{ base: 48, md: 72 }}>
            <Stack align="center" gap="xs" mb="xl">
              <Text className={classes.eyebrowLight}>Cómo funciona</Text>
              <Title className={classes.sectionTitle} ta="center" c="white">
                Un protocolo, tres pasos
              </Title>
            </Stack>
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="xl">
              {steps.map((s) => (
                <div key={s.n}>
                  <ThemeIcon size={48} radius="xl" variant="white" color="biowellness">
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
              Un plan según tu objetivo
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
                Empezá tu camino hacia la longevidad
              </Title>
              <Text c="gray.3" ta="center" maw={540}>
                Creá tu cuenta y cargá tus biomarcadores para que el equipo de BioWellness diseñe tu protocolo.
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
