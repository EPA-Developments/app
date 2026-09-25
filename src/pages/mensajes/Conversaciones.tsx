// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Mensajes: las conversaciones del paciente con su equipo, cada una con su motivo, y el
// botón "Nuevo mensaje" bien a la vista. Tocar una abre la conversación.
import {
  Badge,
  Box,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Stack,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core';
import type { Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconChevronRight, IconMessages, IconPencilPlus } from '@tabler/icons-react';
import { Fragment, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { cargarConversaciones, esMio, textoMensaje } from '../../fhir/mensajes';
import type { ResumenConversacion } from '../../fhir/mensajes';
import { haceCuanto } from '../../fhir/notificaciones';
import { showErrorNotification } from '../../utils/notifications';
import { iconoMotivo } from './iconos';
import classes from './Mensajes.module.css';

export const RUTA_MENSAJES = '/Communication';
export const RUTA_NUEVO_MENSAJE = '/Communication/nuevo';

function Fila({ c, patient, onClick }: { c: ResumenConversacion; patient: Patient; onClick: () => void }): JSX.Element {
  const Icono = iconoMotivo(c.motivo);
  const vista = c.ultimo
    ? `${esMio(c.ultimo, patient) ? 'Vos: ' : ''}${textoMensaje(c.ultimo) || 'Archivo adjunto'}`
    : '';
  return (
    <UnstyledButton className={classes.fila} onClick={onClick}>
      <ThemeIcon size={40} radius="md" variant="light">
        <Icono size={20} stroke={1.5} />
      </ThemeIcon>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Text fw={c.noLeidos ? 700 : 600} truncate>
            {c.titulo}
          </Text>
          <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
            {c.actividad ? haceCuanto(c.actividad) : ''}
          </Text>
        </Group>
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Text size="sm" c={c.noLeidos ? undefined : 'dimmed'} lineClamp={1}>
            {vista}
          </Text>
          {c.noLeidos > 0 && (
            <Badge color="red" size="sm" circle style={{ flexShrink: 0 }}>
              {c.noLeidos}
            </Badge>
          )}
          {!c.noLeidos && c.topic.status === 'completed' && (
            <Badge color="gray" variant="light" size="sm" style={{ flexShrink: 0 }}>
              Finalizada
            </Badge>
          )}
        </Group>
      </div>
      <IconChevronRight size={18} color="var(--mantine-color-gray-5)" style={{ alignSelf: 'center' }} />
    </UnstyledButton>
  );
}

export function Conversaciones(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const patient = medplum.getProfile() as Patient;
  const [lista, setLista] = useState<ResumenConversacion[]>();

  useEffect(() => {
    cargarConversaciones(medplum, patient)
      .then(setLista)
      .catch((err) => {
        setLista([]);
        showErrorNotification(err);
      });
  }, [medplum, patient]);

  const go = (href: string): void => {
    navigate(href)?.catch(console.error);
  };

  return (
    <Container size="sm" py="lg">
      <Title order={2}>Mensajes</Title>
      <Text c="dimmed" mt={4} mb="md">
        Escribile a tu equipo de salud. Te respondemos por acá.
      </Text>
      <Button fullWidth size="md" leftSection={<IconPencilPlus size={20} />} onClick={() => go(RUTA_NUEVO_MENSAJE)}>
        Nuevo mensaje
      </Button>

      <Box mt="lg">
        {lista === undefined ? (
          <Group justify="center" py="xl">
            <Loader size="sm" />
          </Group>
        ) : lista.length === 0 ? (
          <Stack align="center" gap="xs" py="xl">
            <ThemeIcon size={56} radius="xl" variant="light" color="gray">
              <IconMessages size={30} stroke={1.5} />
            </ThemeIcon>
            <Text fw={600}>Todavía no tenés mensajes</Text>
            <Text c="dimmed" ta="center" size="sm" maw={320}>
              Tocá "Nuevo mensaje", elegí el motivo y escribinos.
            </Text>
          </Stack>
        ) : (
          <>
            <Text size="sm" fw={700} tt="uppercase" c="dimmed" mb={6}>
              Tus conversaciones
            </Text>
            <Card withBorder radius="md" p={0}>
              {lista.map((c, i) => (
                <Fragment key={c.topic.id}>
                  {i > 0 && <Box style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }} />}
                  <Fila c={c} patient={patient} onClick={() => go(`${RUTA_MENSAJES}/${c.topic.id}`)} />
                </Fragment>
              ))}
            </Card>
          </>
        )}
      </Box>
    </Container>
  );
}
