// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AppShell, Box, Button, Container, Group, Stack, Text, Title, useMantineTheme } from '@mantine/core';
import cx from 'clsx';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { Footer } from '../../components/Footer';
import DoctorImage from '../../img/landingPage/doctor.jpg';
import EngineeringImage from '../../img/landingPage/engineering.jpg';
import LabImage from '../../img/landingPage/laboratory.jpg';
import WorkingEnvironmentImage from '../../img/landingPage/working-environment.jpg';
import { Header } from './Header';
import classes from './index.module.css';

// NOTA: descripciones placeholder (lorem) — reemplazar por contenido real de BioWellness.
const features = [
  {
    title: 'Planes de cuidado integrales',
    description:
      'Lorem ipsum, dolor sit amet consectetur adipisicing elit. Maiores impedit perferendis suscipit eaque, iste dolor cupiditate blanditiis ratione.',
  },
  {
    title: 'Sin costos ocultos',
    description:
      'Lorem ipsum, dolor sit amet consectetur adipisicing elit. Maiores impedit perferendis suscipit eaque, iste dolor cupiditate blanditiis ratione.',
  },
  {
    title: 'Mensajería 24/7',
    description:
      'Lorem ipsum, dolor sit amet consectetur adipisicing elit. Maiores impedit perferendis suscipit eaque, iste dolor cupiditate blanditiis ratione.',
  },
  {
    title: 'Rigor clínico',
    description:
      'Lorem ipsum, dolor sit amet consectetur adipisicing elit. Maiores impedit perferendis suscipit eaque, iste dolor cupiditate blanditiis ratione.',
  },
];

export function LandingPage(): JSX.Element {
  const theme = useMantineTheme();
  const navigate = useNavigate();
  return (
    <AppShell className={classes.outer} header={{ height: 64 }}>
      <Header />
      <AppShell.Main className={classes.outer}>
        <img className={classes.heroImage1} src={WorkingEnvironmentImage} alt="Working Environment" />
        <Container>
          <div className={classes.inner}>
            <div className={classes.content}>
              <Title className={classes.title}>
                Longevidad y
                <br />
                <span className={classes.highlight}>medicina integrativa</span>
              </Title>
              <Text size="lg" c="dimmed" mt="md">
                Centro premium de longevidad y medicina integrativa en San Isidro.
              </Text>
              <Group mt={30}>
                <Button
                  radius="xl"
                  size="md"
                  className={classes.control}
                  onClick={() => navigate('/register')?.catch(console.error)}
                >
                  Crear cuenta
                </Button>
                <Button
                  variant="default"
                  radius="xl"
                  size="md"
                  className={classes.control}
                  onClick={() => navigate('/signin')?.catch(console.error)}
                >
                  Iniciar sesión
                </Button>
              </Group>
            </div>
            <img className={classes.heroImage2} src={DoctorImage} alt="Doctor" />
          </div>
        </Container>
        <Container>
          <div className={classes.inner}>
            <div style={{ width: 500 }}>
              <Title order={3} fw={500} c={theme.primaryColor} mb="lg">
                Salud
              </Title>
              <Title order={1} fw={500} mb="md">
                Una mejor forma de cuidar tu salud
              </Title>
              <Text size="xl" c="gray">
                Lorem ipsum dolor sit amet consect adipisicing elit. Possimus magnam voluptatum cupiditate veritatis in
                accusamus quisquam.
              </Text>
            </div>
            <img className={classes.heroImage3} src={LabImage} alt="Laboratory" />
          </div>
        </Container>
        <Container>
          <div className={cx(classes.inner, classes.featureSection)}>
            <Stack align="flex-end">
              {features.map((feature, index) => (
                <Box key={`feature-${index}`} className={classes.featureBox}>
                  <Text className={classes.featureTitle}>{feature.title}</Text>
                  <Text className={classes.featureDescription}>{feature.description}</Text>
                </Box>
              ))}
            </Stack>
            <img className={classes.heroImage4} src={EngineeringImage} alt="Laboratory" />
          </div>
        </Container>
      </AppShell.Main>
      <Footer />
    </AppShell>
  );
}
