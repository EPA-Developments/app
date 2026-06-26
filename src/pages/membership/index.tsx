// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Membresía (eje Cliente/negocio): turnos, sesiones, cobertura y pagos. Solo lectura.
// Los datos los gestiona Recepción (app aparte) y el portal los muestra acotados al
// paciente (AccessPolicy "Paciente — Portal"). El saldo y los pagos se leen de los
// recursos Coverage/Invoice vía `src/fhir/membership.ts` (sin recalcular reglas).
import { Badge, Card, Container, Group, Stack, Table, Text, Title } from '@mantine/core';
import { formatCoding, formatDate, getReferenceString } from '@medplum/core';
import type { Coverage, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconCalendarEvent, IconReceipt } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import {
  cargarPagos,
  cargarSesiones,
  ESTADO_PAGO,
  formatARS,
  type PagoResumen,
  type SaldoSesiones,
} from '../../fhir/membership';
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

/** Una "pastilla" con el conteo de un balde de sesiones. */
function Balde({ n, label }: { n: number; label: string }): JSX.Element {
  return (
    <Stack gap={0} align="center" miw={64}>
      <Text fw={700} fz="xl">
        {n}
      </Text>
      <Text size="xs" c="dimmed" tt="uppercase">
        {label}
      </Text>
    </Stack>
  );
}

function PlanCard({ s }: { s: SaldoSesiones }): JSX.Element {
  // Aviso de urgencia: lo que está por perderse (membresía cierra el mes; paquete vence).
  let aviso: ReactNode = null;
  if (s.vencido) {
    aviso = (
      <Badge color="red" variant="light">
        Vencido
      </Badge>
    );
  } else if (s.libres > 0 && s.tipo === 'paquete' && s.vencimiento) {
    aviso = <Text size="xs" c="dimmed">Vence el {formatDate(s.vencimiento)}</Text>;
  } else if (s.libres > 0 && s.tipo === 'membresia') {
    aviso = <Text size="xs" c="dimmed">Tus sesiones libres se renuevan a fin de mes.</Text>;
  } else if (s.agotado) {
    aviso = (
      <Badge color="gray" variant="light">
        Sin sesiones disponibles
      </Badge>
    );
  }

  return (
    <Card withBorder radius="md" p="md">
      <Group justify="space-between" wrap="nowrap" align="flex-start" mb="sm">
        <div>
          <Text fw={600}>{s.nombre}</Text>
          <Text size="xs" c="dimmed" tt="capitalize">
            {s.tipo}
          </Text>
        </div>
        {aviso}
      </Group>
      <Group gap="lg">
        <Balde n={s.libres} label="Libres" />
        <Balde n={s.proximas} label="Agendadas" />
        <Balde n={s.realizadas} label="Realizadas" />
        <Balde n={s.total} label="Total" />
      </Group>
    </Card>
  );
}

export function MembershipPage(): JSX.Element {
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  const [coverages, setCoverages] = useState<Coverage[]>();
  const [sesiones, setSesiones] = useState<SaldoSesiones[]>();
  const [pagos, setPagos] = useState<PagoResumen[]>();

  useEffect(() => {
    medplum
      .searchResources('Coverage', { beneficiary: getReferenceString(patient) })
      .then(setCoverages)
      .catch(showErrorNotification);
    cargarSesiones(medplum, patient).then(setSesiones).catch(showErrorNotification);
    cargarPagos(medplum, patient).then(setPagos).catch(showErrorNotification);
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
          {sesiones === undefined ? (
            <Text c="dimmed">Cargando…</Text>
          ) : sesiones.length === 0 ? (
            <Group gap="xs" c="dimmed">
              <IconCalendarEvent size={18} />
              <Text>No tenés planes con sesiones activos. Consultá con el equipo de Segunda Opinión Médica.</Text>
            </Group>
          ) : (
            <Stack gap="sm">
              {sesiones.map((s) => (
                <PlanCard key={s.coverageId} s={s} />
              ))}
            </Stack>
          )}
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
          {pagos === undefined ? (
            <Text c="dimmed">Cargando…</Text>
          ) : pagos.length === 0 ? (
            <Group gap="xs" c="dimmed">
              <IconReceipt size={18} />
              <Text>Todavía no tenés pagos registrados.</Text>
            </Group>
          ) : (
            <Table.ScrollContainer minWidth={520}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Fecha</Table.Th>
                    <Table.Th>Concepto</Table.Th>
                    <Table.Th>Medio</Table.Th>
                    <Table.Th ta="right">Monto</Table.Th>
                    <Table.Th>Estado</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {pagos.map((p) => {
                    const e = ESTADO_PAGO[p.estado] ?? { label: p.estado, color: 'gray' };
                    return (
                      <Table.Tr key={p.id}>
                        <Table.Td>{p.fecha ? formatDate(p.fecha) : '—'}</Table.Td>
                        <Table.Td>
                          <Group gap="xs" wrap="nowrap">
                            <Text size="sm">{p.concepto}</Text>
                            {p.esSena && (
                              <Badge size="xs" variant="light" color="blue">
                                Seña
                              </Badge>
                            )}
                          </Group>
                        </Table.Td>
                        <Table.Td tt="capitalize">{p.medioPago ?? '—'}</Table.Td>
                        <Table.Td ta="right">{formatARS(p.total, p.moneda)}</Table.Td>
                        <Table.Td>
                          <Badge color={e.color} variant="light">
                            {e.label}
                          </Badge>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Section>
      </Stack>
    </Container>
  );
}
