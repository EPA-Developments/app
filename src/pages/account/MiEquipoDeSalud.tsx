// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// "Mi equipo de salud" (reemplaza a "Médico de cabecera"): separa el seguimiento continuo
// del Plan Bienestar (médico de cabecera y equipo del plan) de la revisión puntual de la
// Segunda Opinión. El médico de cabecera lo elige el propio paciente.
import { Alert, Badge, Box, Button, Card, Group, Loader, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { Patient, Practitioner } from '@medplum/fhirtypes';
import { ResourceAvatar, ResourceName, useMedplum } from '@medplum/react';
import { IconBuildingHospital, IconCalendarPlus, IconMessage, IconStethoscope, IconUsers } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import type { EquipoDeSalud, RefProfesional } from '../../fhir/equipo';
import { cargarEquipoDeSalud, elegirMedicoDeCabecera, esCentro, listarMedicosDeCabecera } from '../../fhir/equipo';
import { showErrorNotification } from '../../utils/notifications';

function Profesional({ value, detalle }: { value: RefProfesional; detalle?: string }): JSX.Element {
  return (
    <Group wrap="nowrap" gap="sm">
      {esCentro(value) ? (
        <ThemeIcon size={44} radius="xl" variant="light">
          <IconBuildingHospital size={22} stroke={1.5} />
        </ThemeIcon>
      ) : (
        <ResourceAvatar size={44} radius="xl" value={value} />
      )}
      <div style={{ minWidth: 0 }}>
        <Text fw={600}>
          <ResourceName value={value} />
        </Text>
        {detalle && (
          <Text size="sm" c="dimmed">
            {detalle}
          </Text>
        )}
      </div>
    </Group>
  );
}

function ElegirMedico({
  onElegir,
  onCancelar,
}: {
  onElegir: (medico: Practitioner) => Promise<void>;
  onCancelar?: () => void;
}): JSX.Element {
  const medplum = useMedplum();
  const [medicos, setMedicos] = useState<Practitioner[]>();
  const [guardando, setGuardando] = useState<string>();

  useEffect(() => {
    listarMedicosDeCabecera(medplum)
      .then(setMedicos)
      .catch((err) => {
        showErrorNotification(err);
        setMedicos([]);
      });
  }, [medplum]);

  if (!medicos) {
    return (
      <Group justify="center" py="md">
        <Loader size="sm" />
      </Group>
    );
  }
  if (medicos.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Todavía no hay profesionales para elegir. Escribile a tu equipo por Mensajes y te ayudamos.
      </Text>
    );
  }
  return (
    <Stack gap="xs">
      {medicos.map((m) => (
        <Card key={m.id} withBorder radius="md" p="sm">
          <Group justify="space-between" wrap="nowrap">
            <Profesional value={{ reference: `Practitioner/${m.id}` }} />
            <Button
              size="xs"
              radius="xl"
              variant="light"
              loading={guardando === m.id}
              disabled={Boolean(guardando) && guardando !== m.id}
              onClick={() => {
                setGuardando(m.id);
                onElegir(m)
                  .catch(console.error)
                  .finally(() => setGuardando(undefined));
              }}
            >
              Elegir
            </Button>
          </Group>
        </Card>
      ))}
      {onCancelar && (
        <Group>
          <Button variant="subtle" radius="xl" onClick={onCancelar}>
            Cancelar
          </Button>
        </Group>
      )}
    </Stack>
  );
}

export function MiEquipoDeSalud(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const patient = medplum.getProfile() as Patient;
  const [equipo, setEquipo] = useState<EquipoDeSalud>();
  const [cambiando, setCambiando] = useState(false);

  const cargar = useCallback(() => {
    cargarEquipoDeSalud(medplum, patient)
      .then(setEquipo)
      .catch((err) => {
        showErrorNotification(err);
        setEquipo({ equipoPlan: [], segundaOpinion: [] });
      });
  }, [medplum, patient]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const elegir = async (medico: Practitioner): Promise<void> => {
    try {
      await elegirMedicoDeCabecera(medplum, patient, medico);
      notifications.show({ color: 'green', title: 'Listo', message: 'Guardamos tu médico de cabecera.' });
      setCambiando(false);
      cargar();
    } catch (err) {
      showErrorNotification(err);
    }
  };

  const go = (href: string): void => {
    navigate(href)?.catch(console.error);
  };

  if (!equipo) {
    return (
      <Group justify="center" py="xl">
        <Loader size="sm" />
      </Group>
    );
  }

  const { cabecera } = equipo;

  return (
    <Box p="xl">
      <Title mb="xs">Mi equipo de salud</Title>
      <Text c="dimmed" mb="lg">
        Quiénes te acompañan y en qué. Tu seguimiento del día a día lo hace tu médico de cabecera.
      </Text>

      <Stack gap="lg">
        <Card withBorder radius="md" p="lg" data-testid="cabecera">
          <Group gap="xs" mb="xs">
            <Title order={3}>{cabecera && esCentro(cabecera) ? 'Tu centro' : 'Tu médico de cabecera'}</Title>
            <Badge variant="light">Plan Bienestar · 100 días</Badge>
          </Group>
          <Text size="sm" c="dimmed" mb="md">
            Te acompaña en el Plan Bienestar: revisa tu progreso y ajusta tu plan.
          </Text>
          {cabecera && !cambiando ? (
            <Stack gap="md">
              <Profesional value={cabecera} />
              <Group gap="xs">
                <Button radius="xl" leftSection={<IconMessage size={16} />} onClick={() => go('/Communication')}>
                  Escribile
                </Button>
                <Button
                  radius="xl"
                  variant="light"
                  leftSection={<IconCalendarPlus size={16} />}
                  onClick={() => go('/get-care')}
                >
                  Reservá tu consulta
                </Button>
                <Button radius="xl" variant="subtle" onClick={() => setCambiando(true)}>
                  Cambiar médico de cabecera
                </Button>
              </Group>
            </Stack>
          ) : (
            <Stack gap="sm">
              {!cabecera && <Text fw={500}>Elegí quién te acompaña en tu plan:</Text>}
              <ElegirMedico onElegir={elegir} onCancelar={cabecera ? () => setCambiando(false) : undefined} />
            </Stack>
          )}
        </Card>

        {equipo.equipoPlan.length > 0 && (
          <Card withBorder radius="md" p="lg" data-testid="equipo-plan">
            <Group gap="xs" mb="md">
              <IconUsers size={20} />
              <Title order={3}>Tu equipo del plan</Title>
            </Group>
            <Stack gap="sm">
              {equipo.equipoPlan.map((m) => (
                <Profesional key={m.ref.reference} value={m.ref} detalle={m.rol} />
              ))}
            </Stack>
          </Card>
        )}

        {equipo.segundaOpinion.length > 0 && (
          <Card withBorder radius="md" p="lg" data-testid="segunda-opinion">
            <Group gap="xs" mb="xs">
              <IconStethoscope size={20} />
              <Title order={3}>Tu segunda opinión</Title>
            </Group>
            <Text size="sm" c="dimmed" mb="md">
              Una revisión experta puntual de tu caso; tu seguimiento continuo lo hace tu médico de cabecera.
            </Text>
            <Stack gap="sm">
              {equipo.segundaOpinion.map((ref) => (
                <Profesional key={ref.reference} value={ref} />
              ))}
            </Stack>
            <Group mt="md">
              <Button variant="light" radius="xl" onClick={() => go('/mi-segunda-opinion')}>
                Ver mi informe
              </Button>
            </Group>
          </Card>
        )}

        <Alert variant="light" color="gray">
          ¿Dudas sobre tu equipo? Escribinos por Mensajes.
        </Alert>
      </Stack>
    </Box>
  );
}
