// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Container, Divider, Stack, Text } from '@mantine/core';
import type { JSX } from 'react';
import { MARCA } from '../marca';
import classes from './Footer.module.css';

export function Footer(): JSX.Element {
  return (
    <footer className={classes.footer}>
      <div className={classes.inner}>
        <Container p="xl">
          <Stack gap="md">
            <div>
              <Text fw={700}>{MARCA.nombre}</Text>
              <Text c="dimmed" size="sm">
                {MARCA.responsable}
              </Text>
              <Text c="dimmed" size="sm">
                {MARCA.direccion}
              </Text>
              <Text c="dimmed" size="sm">
                <Anchor href={`mailto:${MARCA.email}`}>{MARCA.email}</Anchor>
              </Text>
            </div>

            <Divider />

            <Text c="dimmed" size="sm">
              &copy; {new Date().getFullYear()} {MARCA.nombre}. Todos los derechos reservados.
            </Text>
            <Text c="dimmed" size="xs">
              Powered by EPA Bienestar IA · CTO: Dr. Alejandro Sergio D&apos;Alessandro
            </Text>
            <Text c="dimmed" size="xs">
              Cloud AWS · TypeScript · IA Anthropic · Infra IA NVIDIA
            </Text>
          </Stack>
        </Container>
      </div>
    </footer>
  );
}
