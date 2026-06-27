// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Página PÚBLICA para fijar la contraseña desde el link de activación.
// Recepción (app aparte) invita al paciente con `invite` y `sendEmail:false`, y genera
// un link mágico https://app.segundaopinion.org/setpassword/:id/:secret que envía por
// WhatsApp / email / QR. Esta página resuelve ese link, fija la contraseña y manda al
// paciente al login del portal.
//
// IMPORTANTE: vive en la zona NO autenticada del router (junto a signin/register en
// App.tsx). Si estuviera detrás del guard de sesión, redirigiría al login y rompería el
// flujo de activación.
//
// @medplum/react no exporta SetPasswordPage/SetPasswordForm y no existe medplum.setPassword();
// por eso llamamos directo al endpoint: medplum.post('auth/setpassword', { id, secret, password }).
import { Alert, Anchor, Button, Center, Paper, PasswordInput, Stack, Text, Title } from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import { useMedplum } from '@medplum/react';
import { IconCircleCheck } from '@tabler/icons-react';
import { useState } from 'react';
import type { FormEvent, JSX } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Logo } from '../components/Logo';

export function SetPasswordPage(): JSX.Element {
  const { id, secret } = useParams();
  const medplum = useMedplum();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setError(undefined);

    if (!id || !secret) {
      setError('El link de activación es inválido o está incompleto.');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    medplum
      .post('auth/setpassword', { id, secret, password })
      .then(() => setSuccess(true))
      .catch((err) => setError(normalizeErrorString(err)))
      .finally(() => setLoading(false));
  }

  return (
    <Center mih="100vh" bg="var(--mantine-primary-color-light)" p="md">
      <Paper shadow="md" radius="lg" p="xl" w="100%" maw={420} withBorder>
        <Stack align="center" gap="lg">
          <Logo width={220} />

          {success ? (
            <Stack align="center" gap="md">
              <IconCircleCheck size={56} color="var(--mantine-primary-color-filled)" />
              <Title order={2} ta="center" fz="h3">
                ¡Listo!
              </Title>
              <Text ta="center" c="dimmed">
                Tu contraseña quedó configurada. Ya podés ingresar al portal con tu email y tu nueva contraseña.
              </Text>
              <Button fullWidth size="md" onClick={() => navigate('/signin')?.catch(console.error)}>
                Ir a iniciar sesión
              </Button>
            </Stack>
          ) : (
            <form onSubmit={handleSubmit} style={{ width: '100%' }}>
              <Stack gap="md">
                <Stack gap={4} align="center">
                  <Title order={1} ta="center" fz="h3">
                    Activá tu cuenta
                  </Title>
                  <Text ta="center" c="dimmed" size="sm">
                    Creá tu contraseña para acceder al portal de Segunda Opinión Médica.
                  </Text>
                </Stack>

                {error && (
                  <Alert color="red" radius="md" variant="light">
                    {error}
                  </Alert>
                )}

                <PasswordInput
                  label="Nueva contraseña"
                  placeholder="Al menos 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                  autoComplete="new-password"
                  required
                />
                <PasswordInput
                  label="Repetí la contraseña"
                  placeholder="Volvé a escribirla"
                  value={confirm}
                  onChange={(e) => setConfirm(e.currentTarget.value)}
                  autoComplete="new-password"
                  required
                />

                <Button type="submit" fullWidth size="md" loading={loading}>
                  Guardar contraseña
                </Button>

                <Text ta="center" size="sm" c="dimmed">
                  ¿Ya tenés tu contraseña?{' '}
                  <Anchor component="button" type="button" onClick={() => navigate('/signin')?.catch(console.error)}>
                    Iniciar sesión
                  </Anchor>
                </Text>
              </Stack>
            </form>
          )}
        </Stack>
      </Paper>
    </Center>
  );
}
