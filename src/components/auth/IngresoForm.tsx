// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Ingreso al portal en castellano. Adaptado del SignInForm de @medplum/react (que solo
// está en inglés), con el mismo flujo contra el servidor: email → contraseña (o Google)
// → verificación en dos pasos si la cuenta la tiene → elección de perfil si hay más de
// uno → código de acceso.
import { ActionIcon, Anchor, Box, Button, Checkbox, Divider, Flex, Stack, Text, TextInput, Title } from '@mantine/core';
import type { GoogleCredentialResponse, LoginAuthenticationResponse } from '@medplum/core';
import { locationUtils } from '@medplum/core';
import type { OperationOutcome, ProjectMembership } from '@medplum/fhirtypes';
import {
  Document,
  Form,
  getErrorsForInput,
  getIssuesForExpression,
  MfaEnrollForm,
  OperationOutcomeAlert,
  PasswordInput,
  SubmitButton,
  useMedplum,
} from '@medplum/react';
import { IconPencil } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { BotonGoogle, googleClientIdDe } from './BotonGoogle';
import { errorEnCastellano } from './errores';

export interface IngresoFormProps {
  readonly projectId?: string;
  readonly clientId?: string;
  readonly googleClientId?: string;
  readonly onSuccess?: () => void;
  readonly onRegister?: () => void;
  readonly onForgotPassword?: () => void;
  readonly children?: ReactNode;
}

type MetodoMfa = 'totp' | 'email';

interface EstadoIngreso {
  login?: string;
  memberships?: ProjectMembership[];
  mfaRequerido?: { metodos: MetodoMfa[]; email?: string; porEmail: boolean };
  inscripcionMfa?: { metodos: MetodoMfa[]; qr?: string };
}

export function IngresoForm(props: IngresoFormProps): JSX.Element {
  const { onSuccess, onRegister, onForgotPassword, children, ...pedidoBase } = props;
  const medplum = useMedplum();
  const [email, setEmail] = useState<string>();
  const [estado, setEstado] = useState<EstadoIngreso>({});
  const [outcome, setOutcome] = useState<OperationOutcome>();

  const alError = useCallback((err: unknown) => setOutcome(errorEnCastellano(err)), []);

  const procesarRespuesta = useCallback(
    (r: LoginAuthenticationResponse): void => {
      setOutcome(undefined);
      const metodos: MetodoMfa[] = r.mfaMethods ?? [];
      setEstado({
        login: r.login,
        memberships: r.memberships,
        mfaRequerido: r.mfaRequired
          ? { metodos, email: r.email, porEmail: metodos.length === 1 && metodos[0] === 'email' }
          : undefined,
        inscripcionMfa: r.mfaEnrollRequired
          ? { metodos: r.allowedMfaMethods ?? ['totp'], qr: r.enrollQrCode }
          : undefined,
      });
      if (r.code) {
        medplum
          .processCode(r.code)
          .then(() => onSuccess?.())
          .catch(alError);
      }
    },
    [medplum, onSuccess, alError]
  );

  const { login, memberships, mfaRequerido, inscripcionMfa } = estado;

  let paso: JSX.Element;
  if (login && inscripcionMfa) {
    paso = (
      <MfaEnrollForm
        allowedMethods={inscripcionMfa.metodos}
        qrCodeUrl={inscripcionMfa.qr}
        totpTitle="Activá la verificación en dos pasos"
        totpDescription="Escaneá este código QR con tu app de autenticación."
        totpButtonText="Verificar"
        onEnrollEmail={() => {
          medplum
            .post<LoginAuthenticationResponse>('auth/mfa/login-enroll', { login, method: 'email' })
            .then(procesarRespuesta)
            .catch(alError);
        }}
        onEnrollTotp={async (token) => {
          procesarRespuesta(
            await medplum.post<LoginAuthenticationResponse>('auth/mfa/login-enroll', { login, method: 'totp', token })
          );
        }}
      />
    );
  } else if (login && mfaRequerido) {
    paso = (
      <PasoCodigo
        email={mfaRequerido.email}
        metodos={mfaRequerido.metodos}
        porEmailInicial={mfaRequerido.porEmail}
        outcome={outcome}
        onPedirEmail={() => medplum.post('auth/mfa/send-email', { login })}
        onEnviar={(token) =>
          medplum
            .post<LoginAuthenticationResponse>('auth/mfa/verify', { login, token })
            .then(procesarRespuesta)
            .catch(alError)
        }
      />
    );
  } else if (login && memberships) {
    paso = (
      <PasoPerfil
        memberships={memberships}
        outcome={outcome}
        onElegir={(membershipId) =>
          medplum
            .post<LoginAuthenticationResponse>('auth/profile', { login, profile: membershipId })
            .then(procesarRespuesta)
            .catch(alError)
        }
      />
    );
  } else if (!email) {
    paso = (
      <PasoEmail
        pedidoBase={pedidoBase}
        outcome={outcome}
        onEmail={(e) => {
          setOutcome(undefined);
          setEmail(e);
        }}
        onRespuesta={procesarRespuesta}
        onError={alError}
        onRegister={onRegister}
      >
        {children}
      </PasoEmail>
    );
  } else {
    paso = (
      <Form
        onSubmit={(formData: Record<string, string>) =>
          medplum
            .startLogin({ ...pedidoBase, email, password: formData.password, remember: Boolean(formData.remember) })
            .then(procesarRespuesta)
            .catch(alError)
        }
      >
        <Flex direction="column" align="center" justify="center">
          {children}
        </Flex>
        <OperationOutcomeAlert issues={getIssuesForExpression(outcome, undefined)} mb="lg" />
        <Stack gap="sm">
          <TextInput
            label="Email"
            value={email}
            disabled
            rightSectionWidth={36}
            rightSection={
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={() => {
                  setOutcome(undefined);
                  setEmail(undefined);
                }}
                aria-label="Cambiar el email"
              >
                <IconPencil size="1rem" stroke={1.5} />
              </ActionIcon>
            }
          />
          <PasswordInput
            name="password"
            label="Contraseña"
            autoComplete="current-password"
            required
            autoFocus
            error={getErrorsForInput(outcome, 'password')}
          />
        </Stack>
        <Stack gap="xs">
          <Checkbox name="remember" label="Recordarme en este dispositivo" size="xs" pt="md" pb="xs" />
          <SubmitButton>Ingresar</SubmitButton>
          {onForgotPassword && (
            <Text size="sm" mt="lg" c="dimmed" ta="center">
              <Anchor component="button" type="button" onClick={onForgotPassword}>
                Olvidé mi contraseña
              </Anchor>
            </Text>
          )}
        </Stack>
      </Form>
    );
  }

  return (
    <Document width={400} px="xl" py="xl" bdrs="md">
      {paso}
    </Document>
  );
}

function PasoEmail({
  pedidoBase,
  outcome,
  onEmail,
  onRespuesta,
  onError,
  onRegister,
  children,
}: {
  pedidoBase: { projectId?: string; clientId?: string; googleClientId?: string };
  outcome?: OperationOutcome;
  onEmail: (email: string) => void;
  onRespuesta: (r: LoginAuthenticationResponse) => void;
  onError: (err: unknown) => void;
  onRegister?: () => void;
  children?: ReactNode;
}): JSX.Element {
  const medplum = useMedplum();
  const googleClientId = googleClientIdDe(pedidoBase.googleClientId);

  // Si el dominio del email usa un proveedor externo (SSO), el servidor devuelve a dónde ir.
  const irAProveedorExterno = useCallback(
    async (metodo: { authorizeUrl?: string; domain?: string }): Promise<boolean> => {
      if (!metodo.authorizeUrl) {
        return false;
      }
      const state = JSON.stringify({
        ...(await medplum.ensureCodeChallenge(pedidoBase)),
        domain: metodo.domain,
        returnTo: locationUtils.getLocation(),
      });
      const url = new URL(metodo.authorizeUrl);
      url.searchParams.set('state', state);
      locationUtils.assign(url.toString());
      return true;
    },
    [medplum, pedidoBase]
  );

  const conGoogle = useCallback(
    async (r: GoogleCredentialResponse) => {
      try {
        const respuesta = await medplum.startGoogleLogin({
          ...pedidoBase,
          googleClientId: r.clientId,
          googleCredential: r.credential,
        });
        if (!(await irAProveedorExterno(respuesta as { authorizeUrl?: string }))) {
          onRespuesta(respuesta);
        }
      } catch (err) {
        onError(err);
      }
    },
    [medplum, pedidoBase, irAProveedorExterno, onRespuesta, onError]
  );

  return (
    <Form
      onSubmit={async (formData: Record<string, string>) => {
        try {
          const metodo = await medplum.post('auth/method', { email: formData.email });
          if (!(await irAProveedorExterno(metodo ?? {}))) {
            onEmail(formData.email);
          }
        } catch (err) {
          onError(err);
        }
      }}
    >
      <Flex direction="column" align="center" justify="center">
        {children}
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
      <TextInput
        name="email"
        type="email"
        label="Email"
        mb="md"
        placeholder="nombre@ejemplo.com"
        autoComplete="email"
        required
        autoFocus
        error={getErrorsForInput(outcome, 'email')}
      />
      <Stack gap="xs">
        <SubmitButton fullWidth>Continuar</SubmitButton>
        {onRegister && (
          <Text size="sm" mt="lg" c="dimmed" ta="center">
            ¿No tenés cuenta?{' '}
            <Anchor component="button" type="button" onClick={onRegister}>
              Creala acá
            </Anchor>
          </Text>
        )}
      </Stack>
    </Form>
  );
}

/** Verificación en dos pasos: código de la app de autenticación o enviado por email. */
function PasoCodigo({
  email,
  metodos,
  porEmailInicial,
  outcome,
  onPedirEmail,
  onEnviar,
}: {
  email?: string;
  metodos: MetodoMfa[];
  porEmailInicial: boolean;
  outcome?: OperationOutcome;
  onPedirEmail: () => Promise<unknown>;
  onEnviar: (token: string) => Promise<void>;
}): JSX.Element {
  const [porEmail, setPorEmail] = useState(porEmailInicial);
  const pedirEmail = (): void => {
    onPedirEmail()
      .then(() => setPorEmail(true))
      .catch(console.error);
  };
  return (
    <Form onSubmit={(formData: Record<string, string>) => onEnviar(formData.token)}>
      <Stack align="center" gap={4} mb="lg">
        <Title order={3}>{porEmail ? 'Ingresá el código que te enviamos' : 'Verificación en dos pasos'}</Title>
        <Text c="dimmed" ta="center" size="sm">
          {porEmail
            ? `Te enviamos un código de 6 dígitos${email ? ` a ${email}` : ''}.`
            : 'Ingresá el código de tu app de autenticación.'}
        </Text>
      </Stack>
      <OperationOutcomeAlert issues={getIssuesForExpression(outcome, undefined)} mb="lg" />
      <TextInput name="token" label="Código" autoComplete="one-time-code" inputMode="numeric" required autoFocus />
      <Stack gap="xs" pt="md">
        <SubmitButton fullWidth>Verificar</SubmitButton>
        {(porEmail || metodos.includes('email')) && (
          <Anchor component="button" type="button" size="sm" ta="center" onClick={pedirEmail}>
            {porEmail ? 'Reenviar el código' : 'Prefiero recibir un código por email'}
          </Anchor>
        )}
      </Stack>
    </Form>
  );
}

/** Si la cuenta tiene más de un perfil, se elige con cuál entrar. */
function PasoPerfil({
  memberships,
  outcome,
  onElegir,
}: {
  memberships: ProjectMembership[];
  outcome?: OperationOutcome;
  onElegir: (membershipId: string) => void;
}): JSX.Element {
  return (
    <Stack gap="sm">
      <Title order={3} ta="center">
        ¿Con qué perfil querés ingresar?
      </Title>
      <OperationOutcomeAlert issues={getIssuesForExpression(outcome, undefined)} />
      {memberships.map((m) => (
        <Button key={m.id} variant="light" fullWidth onClick={() => m.id && onElegir(m.id)}>
          {m.profile?.display ?? m.project?.display ?? 'Perfil'}
        </Button>
      ))}
    </Stack>
  );
}
