// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Alta de paciente en castellano. Adaptado del RegisterForm/NewUserForm de @medplum/react
// (que solo están en inglés), con el mismo flujo contra el servidor: nuevo usuario (o
// Google) → nuevo paciente en el proyecto → código de acceso.
import { Anchor, Box, Checkbox, Divider, Flex, Stack, Text, TextInput } from '@mantine/core';
import type { GoogleCredentialResponse, LoginAuthenticationResponse } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import {
  Document,
  Form,
  getErrorsForInput,
  getIssuesForExpression,
  getRecaptcha,
  initRecaptcha,
  OperationOutcomeAlert,
  PasswordInput,
  SubmitButton,
  useMedplum,
} from '@medplum/react';
import type { JSX, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { MARCA } from '../../marca';
import { BotonGoogle, googleClientIdDe } from './BotonGoogle';
import { errorEnCastellano } from './errores';

export interface RegistroFormProps {
  readonly projectId: string;
  readonly clientId?: string;
  readonly googleClientId?: string;
  readonly recaptchaSiteKey?: string;
  readonly onSuccess: () => void;
  readonly onSignIn?: () => void;
  readonly children?: ReactNode;
}

export function RegistroForm(props: RegistroFormProps): JSX.Element {
  const { projectId, clientId, recaptchaSiteKey, onSuccess, onSignIn } = props;
  const medplum = useMedplum();
  const googleClientId = googleClientIdDe(props.googleClientId);
  const [login, setLogin] = useState<string>();
  const [verificarEmail, setVerificarEmail] = useState(false);
  const [outcome, setOutcome] = useState<OperationOutcome>();

  useEffect(() => {
    if (recaptchaSiteKey) {
      initRecaptcha(recaptchaSiteKey);
    }
  }, [recaptchaSiteKey]);

  // Con el usuario creado, se crea su perfil de paciente en el proyecto.
  useEffect(() => {
    if (login) {
      medplum
        .startNewPatient({ login, projectId })
        .then((r) => medplum.processCode(r.code as string))
        .then(() => onSuccess())
        .catch((err) => setOutcome(errorEnCastellano(err)));
    }
  }, [medplum, projectId, login, onSuccess]);

  const procesarRespuesta = (r: LoginAuthenticationResponse): void => {
    if (r.code) {
      medplum
        .processCode(r.code)
        .then(() => onSuccess())
        .catch((err) => setOutcome(errorEnCastellano(err)));
    }
    if (r.login) {
      setLogin(r.login);
    }
    if (r.emailVerificationRequired) {
      setVerificarEmail(true);
    }
  };

  const conGoogle = async (r: GoogleCredentialResponse): Promise<void> => {
    try {
      procesarRespuesta(
        await medplum.startGoogleLogin({
          googleClientId: r.clientId,
          googleCredential: r.credential,
          projectId,
          createUser: true,
        })
      );
    } catch (err) {
      setOutcome(errorEnCastellano(err));
    }
  };

  return (
    <Document width={400} px="xl" py="xl" bdrs="md">
      {verificarEmail ? (
        <Text>Te enviamos un email con un link para confirmar tu cuenta. Abrilo para terminar de crearla.</Text>
      ) : (
        <Form
          onSubmit={async (formData: Record<string, string>) => {
            setOutcome(undefined);
            try {
              const recaptchaToken = recaptchaSiteKey ? await getRecaptcha(recaptchaSiteKey) : '';
              procesarRespuesta(
                await medplum.startNewUser({
                  projectId,
                  clientId,
                  firstName: formData.firstName,
                  lastName: formData.lastName,
                  email: formData.email,
                  password: formData.password,
                  remember: Boolean(formData.remember),
                  recaptchaSiteKey,
                  recaptchaToken,
                })
              );
            } catch (err) {
              setOutcome(errorEnCastellano(err));
            }
          }}
        >
          <Flex direction="column" align="center" justify="center">
            {props.children}
          </Flex>
          <OperationOutcomeAlert issues={getIssuesForExpression(outcome, undefined)} mb="lg" />
          {googleClientId && (
            <>
              <Box style={{ minHeight: 40 }}>
                <BotonGoogle googleClientId={googleClientId} onCredencial={conGoogle} />
              </Box>
              <Divider label="o" labelPosition="center" my="lg" />
            </>
          )}
          <Stack gap="sm">
            <TextInput
              name="firstName"
              label="Nombre"
              autoComplete="given-name"
              required
              autoFocus
              error={getErrorsForInput(outcome, 'firstName')}
            />
            <TextInput
              name="lastName"
              label="Apellido"
              autoComplete="family-name"
              required
              error={getErrorsForInput(outcome, 'lastName')}
            />
            <TextInput
              name="email"
              type="email"
              label="Email"
              placeholder="nombre@ejemplo.com"
              autoComplete="email"
              required
              error={getErrorsForInput(outcome, 'email')}
            />
            <PasswordInput
              name="password"
              label="Contraseña"
              description="Al menos 8 caracteres."
              autoComplete="new-password"
              required
              error={getErrorsForInput(outcome, 'password')}
            />
          </Stack>
          <Stack gap="xs">
            <Checkbox name="remember" label="Recordarme en este dispositivo" size="xs" pt="md" pb="xs" />
            <SubmitButton fullWidth>Crear cuenta</SubmitButton>
            {onSignIn && (
              <Text size="sm" mt="lg" c="dimmed" ta="center">
                ¿Ya tenés cuenta?{' '}
                <Anchor component="button" type="button" onClick={onSignIn}>
                  Iniciá sesión
                </Anchor>
              </Text>
            )}
            <Text c="dimmed" size="xs" pt="lg" ta="center">
              Al hacer clic en «Crear cuenta» aceptás los{' '}
              <Anchor href={MARCA.terminosUrl} target="_blank" rel="noopener noreferrer">
                Términos&nbsp;del&nbsp;servicio
              </Anchor>{' '}
              y la{' '}
              <Anchor href={MARCA.privacidadUrl} target="_blank" rel="noopener noreferrer">
                Política&nbsp;de&nbsp;privacidad
              </Anchor>{' '}
              de {MARCA.nombre}.
            </Text>
            {recaptchaSiteKey && (
              <Text c="dimmed" size="xs" ta="center">
                Este sitio está protegido por reCAPTCHA y se aplican la{' '}
                <Anchor href="https://policies.google.com/privacy">Política&nbsp;de&nbsp;privacidad</Anchor> y los{' '}
                <Anchor href="https://policies.google.com/terms">Términos&nbsp;del&nbsp;servicio</Anchor> de Google.
              </Text>
            )}
          </Stack>
        </Form>
      )}
    </Document>
  );
}
