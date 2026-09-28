// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Términos del servicio y privacidad de la marca (/legal, pública): lo que se acepta al crear
// la cuenta. No es un texto nuevo: son las secciones del consentimiento informado de la marca
// que describen el servicio y sus límites (términos) y el tratamiento de los datos
// (privacidad), con la marca de `src/marca.ts`. El consentimiento completo se firma aparte,
// en la Bienvenida. Si la marca publica sus propios textos, `MARCA_TERMINOS_URL` /
// `MARCA_PRIVACIDAD_URL` hacen que "Crear cuenta" enlace allá.
import { Anchor, Divider, Stack, Text, Title } from '@mantine/core';
import { Document } from '@medplum/react';
import { useEffect } from 'react';
import type { JSX } from 'react';
import { useLocation } from 'react-router';
import { MARCA } from '../marca';
import { ConsentBody } from './health-record/InformedConsent';
import type { ConsentSection } from './health-record/InformedConsent.data';
import { SECCIONES_PRIVACIDAD, SECCIONES_TERMINOS } from './health-record/InformedConsent.data';

/** "2. Descripción del servicio" → "Descripción del servicio". */
function sinNumero(heading: string): string {
  return heading.replace(/^\d+\.\s*/, '');
}

function Parte({ id, titulo, items }: { id: string; titulo: string; items: ConsentSection[] }): JSX.Element {
  return (
    <Stack gap="sm" id={id}>
      <Title order={2}>{titulo}</Title>
      {items.map((s) => (
        <Stack key={s.heading} gap={4}>
          <Title order={4}>{sinNumero(s.heading)}</Title>
          {s.blocks.map((b, i) => (
            <ConsentBody key={i} block={b} />
          ))}
        </Stack>
      ))}
    </Stack>
  );
}

export function LegalPage(): JSX.Element {
  // "Crear cuenta" enlaza a /legal#terminos o /legal#privacidad: ir a esa parte.
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView?.();
    }
  }, [hash]);

  return (
    <Document width={760}>
      <Stack gap="lg">
        <div>
          <Title order={1}>Términos y privacidad</Title>
          <Text c="dimmed">
            {MARCA.nombre} · {MARCA.responsable}
          </Text>
        </div>
        <Parte id="terminos" titulo="Términos del servicio" items={SECCIONES_TERMINOS} />
        <Divider />
        <Parte id="privacidad" titulo="Política de privacidad" items={SECCIONES_PRIVACIDAD} />
        <Divider />
        <Text size="sm" c="dimmed">
          Antes de usar el servicio firmás el consentimiento informado completo desde tu cuenta. Consultas y pedidos
          sobre tus datos: <Anchor href={`mailto:${MARCA.email}`}>{MARCA.email}</Anchor> · {MARCA.direccion}.
        </Text>
      </Stack>
    </Document>
  );
}
