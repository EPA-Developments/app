// SPDX-FileCopyrightText: Copyright BioWellness
// SPDX-License-Identifier: Apache-2.0
//
// Membresía (eje Cliente/negocio): turnos, sesiones, cobertura y pagos. Solo lectura.
// Los datos los gestiona Recepción (app aparte). Hoy: "Mis turnos" y "Cobertura" reales;
// "Sesiones" y "Pagos" quedan como placeholders hasta cablear el modelo de recepción.
import { Card, Container, Stack, Table, Text, Title } from '@mantine/core';
import { formatCoding, getReferenceString } from '@medplum/core';
import type { Coverage, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import { MyAppointments } from '../MyAppointments';

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <Card withBorder radius="md" p="lg">
      <Title order={2} fz="h4" mb="md">
        {title}
      </Title>
      {children}
    </Card>
  );
}

export function MembershipPage(): JSX.Element {
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  const [coverages, setCoverages] = useState<Coverage[]>();

  useEffect(() => {
    medplum
      .searchResources('Coverage', { beneficiary: getReferenceString(patient) })
      .then(setCoverages)
      .catch(showErrorNotification);
  }, [medplum, patient]);

  return (
    <Container size="md" py="md">
      <Title order={1} mb="lg">
        Membresía
      </Title>
      <Stack gap="lg">
        <Section title="Mis turnos">
          <MyAppointments patient={patient} />
        </Section>

        <Section title="Sesiones">
          <Text c="dimmed">
            El saldo y el consumo de tus sesiones por terapia van a aparecer acá. Lo estamos conectando con la agenda de
            BioWellness.
          </Text>
        </Section>

        <Section title="Cobertura">
          {coverages === undefined ? (
            <Text c="dimmed">Cargando…</Text>
          ) : coverages.length === 0 ? (
            <Text c="dimmed">Sin cobertura registrada.</Text>
          ) : (
            <Table.ScrollContainer minWidth={320}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Cobertura</Table.Th>
                    <Table.Th>N° de afiliado</Table.Th>
                    <Table.Th>Relación</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {coverages.map((c) => (
                    <Table.Tr key={c.id}>
                      <Table.Td>{c.payor?.[0]?.display ?? '—'}</Table.Td>
                      <Table.Td>{c.subscriberId || '—'}</Table.Td>
                      <Table.Td>{formatCoding(c.relationship?.coding?.[0]) || '—'}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Section>

        <Section title="Pagos">
          <Text c="dimmed">El detalle de pagos y señas va a estar disponible próximamente.</Text>
        </Section>
      </Stack>
    </Container>
  );
}
