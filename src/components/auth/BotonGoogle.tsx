// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Botón "Continuar con Google" (Google Identity Services). Adaptado del GoogleButton de
// @medplum/react, que no se exporta, para mostrarlo en castellano.
import { Box } from '@mantine/core';
import type { GoogleCredentialResponse } from '@medplum/core';
import { locationUtils } from '@medplum/core';
import { createScriptTag } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';

interface GoogleApi {
  readonly accounts: {
    id: {
      initialize: (args: Record<string, unknown>) => void;
      renderButton: (parent: HTMLElement, args: Record<string, unknown>) => void;
    };
  };
}

declare const google: GoogleApi;

/** Client ID de Google: el configurado o, si el origen está autorizado, el del entorno. */
export function googleClientIdDe(clientId: string | undefined): string | undefined {
  if (clientId) {
    return clientId;
  }
  const origin = locationUtils.getOrigin();
  const autorizados: string[] = import.meta.env.GOOGLE_AUTH_ORIGINS?.split(',') ?? [];
  return origin && autorizados.includes(origin) ? import.meta.env.GOOGLE_CLIENT_ID : undefined;
}

export function BotonGoogle({
  googleClientId,
  onCredencial,
}: {
  googleClientId?: string;
  onCredencial: (response: GoogleCredentialResponse) => void;
}): JSX.Element | null {
  const contenedor = useRef<HTMLDivElement>(null);
  const [scriptCargado, setScriptCargado] = useState(typeof google !== 'undefined');
  const inicializado = useRef(false);
  const dibujado = useRef(false);

  useEffect(() => {
    if (typeof google === 'undefined') {
      createScriptTag('https://accounts.google.com/gsi/client', () => setScriptCargado(true));
      return;
    }
    if (!inicializado.current) {
      google.accounts.id.initialize({ client_id: googleClientId, callback: onCredencial });
      inicializado.current = true;
    }
    if (contenedor.current && !dibujado.current) {
      google.accounts.id.renderButton(contenedor.current, {
        type: 'standard',
        text: 'continue_with',
        logo_alignment: 'center',
        locale: 'es-419',
        width: contenedor.current.clientWidth,
      });
      dibujado.current = true;
    }
  }, [googleClientId, scriptCargado, onCredencial]);

  if (!googleClientId) {
    return null;
  }
  return <Box ref={contenedor} w="100%" h={40} display="flex" style={{ justifyContent: 'center' }} />;
}
