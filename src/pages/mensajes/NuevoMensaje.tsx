// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Nuevo mensaje en dos pasos claros: 1) el motivo (obligatorio, así el equipo sabe de qué
// se trata y quién responde) y 2) el mensaje. Acepta ?motivo=<código> para llegar con el
// motivo ya elegido (p. ej. desde otra pantalla).
import {
  Alert,
  Anchor,
  Button,
  Container,
  Group,
  Radio,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  ThemeIcon,
  Title,
} from '@mantine/core';
import type { Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconAlertTriangle, IconChevronLeft, IconSend } from '@tabler/icons-react';
import { useState } from 'react';
import type { JSX } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { crearConversacion, MOTIVOS_MENSAJE, motivoPorCodigo } from '../../fhir/mensajes';
import { showErrorNotification } from '../../utils/notifications';
import { RUTA_MENSAJES } from './Conversaciones';
import { iconoMotivo } from './iconos';

export function NuevoMensaje(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const patient = medplum.getProfile() as Patient;
  const [params] = useSearchParams();

  const [motivo, setMotivo] = useState<string | null>(motivoPorCodigo(params.get('motivo'))?.code ?? null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const elegido = motivoPorCodigo(motivo);

  async function enviar(): Promise<void> {
    if (!motivo || !texto.trim()) {
      return;
    }
    setEnviando(true);
    try {
      const topic = await crearConversacion(medplum, patient, motivo, texto);
      navigate(`${RUTA_MENSAJES}/${topic.id}`, { replace: true })?.catch(console.error);
    } catch (err) {
      showErrorNotification(err);
      setEnviando(false);
    }
  }

  return (
    <Container size="sm" py="md">
      <Anchor component={Link} to={RUTA_MENSAJES} size="sm" fw={500}>
        <Group gap={2} wrap="nowrap">
          <IconChevronLeft size={16} />
          Mensajes
        </Group>
      </Anchor>
      <Title order={2} mt="xs" mb="lg">
        Nuevo mensaje
      </Title>

      <Stack gap="lg">
        <Radio.Group
          value={motivo}
          onChange={setMotivo}
          label={
            <Text fw={700} component="span">
              1. ¿Sobre qué es tu mensaje?
            </Text>
          }
          description="Elegí el motivo: así le llega a quien corresponde."
        >
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs" mt="xs">
            {MOTIVOS_MENSAJE.map((m) => {
              const Icono = iconoMotivo(m.code);
              return (
                <Radio.Card key={m.code} value={m.code} radius="md" p="sm">
                  <Group wrap="nowrap" align="center" gap="sm">
                    <Radio.Indicator />
                    <ThemeIcon size={36} radius="md" variant="light">
                      <Icono size={20} stroke={1.5} />
                    </ThemeIcon>
                    <div style={{ minWidth: 0 }}>
                      <Text fw={600} size="sm">
                        {m.titulo}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {m.descripcion}
                      </Text>
                    </div>
                  </Group>
                </Radio.Card>
              );
            })}
          </SimpleGrid>
        </Radio.Group>

        <Textarea
          label={
            <Text fw={700} component="span">
              2. Escribí tu mensaje
            </Text>
          }
          description={elegido ? `Motivo: ${elegido.titulo}` : 'Primero elegí el motivo.'}
          placeholder={elegido?.placeholder ?? 'Primero elegí el motivo de tu mensaje.'}
          disabled={!elegido}
          autosize
          minRows={5}
          maxRows={12}
          size="md"
          value={texto}
          onChange={(e) => setTexto(e.currentTarget.value)}
        />

        {motivo === 'consulta-salud' ? (
          <Alert
            color="red"
            variant="light"
            icon={<IconAlertTriangle />}
            title="Si es una urgencia, no esperes la respuesta"
          >
            Llamá al 107 (emergencias médicas) o andá a la guardia más cercana.
          </Alert>
        ) : (
          <Text size="xs" c="dimmed">
            Si es una urgencia, llamá al 107 o andá a la guardia más cercana.
          </Text>
        )}

        <Button
          fullWidth
          size="md"
          leftSection={<IconSend size={18} />}
          disabled={!motivo || !texto.trim()}
          loading={enviando}
          onClick={enviar}
        >
          Enviar mensaje
        </Button>
      </Stack>
    </Container>
  );
}
