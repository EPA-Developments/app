// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Patient Journey — pantalla de primera vez, en tres pasos:
//  1. Bienvenida según origen: auto-registrado / invitado por Recepción / derivado.
//  2. Datos personales: sexo y fecha de nacimiento (además de identificar el
//     informe, habilitan la elegibilidad del Plan Bienestar · 100 días, que la
//     PlanDefinition evalúa por gender + edad).
//  3. Contacto: celular, DNI (FHIR Argentina / RENAPER) y domicilio.
// Todo se guarda en el Patient en una sola escritura junto con la extensión
// onboarding-completed, y la pantalla no vuelve a aparecer (OnboardingGate).
import {
  Button,
  Card,
  Container,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Stepper,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { formatHumanName } from '@medplum/core';
import type { Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconArrowRight, IconFileCheck, IconHeartbeat, IconStethoscope, IconUserCheck } from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';
import { useState } from 'react';
import type { JSX } from 'react';
import type { Demografia, Sexo } from '../fhir/demografia';
import { SEXO_OPCIONES, aplicarDemografia, leerDemografia } from '../fhir/demografia';
import { getPatientOrigin, marcarOnboardingCompleto } from '../fhir/onboarding';
import { showErrorNotification } from '../utils/notifications';

interface Paso {
  readonly icon: Icon;
  readonly title: string;
  readonly description: string;
}

const PASOS_SELF: Paso[] = [
  {
    icon: IconUserCheck,
    title: 'Completá tu perfil',
    description: 'Unas preguntas simples para que el informe salga a tu nombre.',
  },
  {
    icon: IconFileCheck,
    title: 'Firmá el consentimiento',
    description: 'Leé y firmá el consentimiento informado del servicio.',
  },
  {
    icon: IconStethoscope,
    title: 'Pedí tu Segunda Opinión',
    description: 'Contanos tu caso, subí tus estudios y recibí tu informe cardiológico.',
  },
];

const PASOS_INVITADO: Paso[] = [
  {
    icon: IconUserCheck,
    title: 'Confirmá tus datos',
    description: 'Verificá que tu información personal esté correcta.',
  },
  {
    icon: IconFileCheck,
    title: 'Firmá el consentimiento',
    description: 'Leé y firmá el consentimiento informado del servicio.',
  },
  {
    icon: IconStethoscope,
    title: 'Completá tu solicitud',
    description: 'Sumá el motivo de consulta y los estudios que tengas para tu Segunda Opinión.',
  },
];

type Errores = Partial<Record<keyof Demografia, string>>;

/** Valida el paso "Datos personales": sexo y fecha de nacimiento. */
function validarDatosPersonales(datos: Demografia): Errores {
  const errores: Errores = {};
  if (!datos.sexo) {
    errores.sexo = 'Elegí una opción.';
  }
  if (!datos.fechaNacimiento) {
    errores.fechaNacimiento = 'Ingresá tu fecha de nacimiento.';
  } else if (Number.isNaN(Date.parse(datos.fechaNacimiento)) || datos.fechaNacimiento >= hoyISO()) {
    errores.fechaNacimiento = 'La fecha debe ser válida y anterior a hoy.';
  }
  return errores;
}

/** Valida el paso "Contacto": celular, DNI y domicilio. */
function validarContacto(datos: Demografia): Errores {
  const errores: Errores = {};
  if (!datos.celular?.trim()) {
    errores.celular = 'Ingresá tu número de celular.';
  }
  const dni = datos.dni?.trim() ?? '';
  if (!dni) {
    errores.dni = 'Ingresá tu DNI.';
  } else if (!/^\d{7,9}$/.test(dni)) {
    errores.dni = 'El DNI se ingresa solo con números (7 a 9 dígitos, sin puntos).';
  }
  if (!datos.calle?.trim()) {
    errores.calle = 'Ingresá calle y número.';
  }
  if (!datos.localidad?.trim()) {
    errores.localidad = 'Ingresá tu localidad.';
  }
  return errores;
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function Welcome(): JSX.Element {
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  const origin = getPatientOrigin(patient);
  const nombre = patient.name?.[0] ? formatHumanName(patient.name[0]) : '';

  const [active, setActive] = useState(0);
  const [datos, setDatos] = useState<Demografia>(() => leerDemografia(patient));
  const [errores, setErrores] = useState<Errores>({});
  const [saving, setSaving] = useState(false);

  const esInvitado = origin !== 'self';
  const titulo = esInvitado ? `Hola ${nombre}, te estábamos esperando` : `¡Bienvenido/a ${nombre}!`;
  const intro = esInvitado
    ? origin === 'referral'
      ? 'Tu médico te derivó a Segunda Opinión Médica para una revisión cardiológica experta. Confirmá tus datos y en unos pasos completás tu solicitud.'
      : 'Nuestro equipo te invitó a Segunda Opinión Médica. Confirmá tus datos y en unos pasos completás tu solicitud.'
    : 'Creaste tu cuenta en Segunda Opinión Médica: una segunda opinión cardiológica experta, basada en tus datos y en la evidencia.';
  const pasos = esInvitado ? PASOS_INVITADO : PASOS_SELF;

  const setCampo = <K extends keyof Demografia>(campo: K, valor: Demografia[K]): void => {
    setDatos((d) => ({ ...d, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: undefined }));
  };

  const continuarDatosPersonales = (): void => {
    const errs = validarDatosPersonales(datos);
    setErrores(errs);
    if (Object.values(errs).every((v) => !v)) {
      setActive(2);
    }
  };

  const finalizar = async (): Promise<void> => {
    const errs = validarContacto(datos);
    setErrores(errs);
    if (!Object.values(errs).every((v) => !v)) {
      return;
    }
    setSaving(true);
    try {
      // Una sola escritura: demografía + extensión onboarding-completed.
      await marcarOnboardingCompleto(medplum, aplicarDemografia(patient, datos));
      // Recarga completa (no SPA): el profile de MedplumClient se cachea al iniciar
      // sesión, y el Plan Bienestar evalúa la elegibilidad sobre ese profile — con
      // la recarga el sexo y la fecha recién guardados se ven de inmediato.
      window.location.assign('/');
    } catch (err) {
      showErrorNotification(err);
      setSaving(false);
    }
  };

  return (
    <Container size={720} py={{ base: 24, sm: 64 }}>
      <Stack gap="lg">
        <Group gap="xs">
          <ThemeIcon size={44} radius="xl" variant="light">
            <IconHeartbeat size={26} stroke={1.5} />
          </ThemeIcon>
          <Text fw={700} c="dimmed" size="sm" tt="uppercase">
            Segunda Opinión Médica
          </Text>
        </Group>

        <Stepper active={active} size="sm" allowNextStepsSelect={false}>
          <Stepper.Step label="Bienvenida">
            <Stack gap="lg" mt="md">
              <Title order={1} style={{ letterSpacing: '-0.01em' }}>
                {titulo}
              </Title>
              <Text size="lg" c="gray.7">
                {intro}
              </Text>

              <Stack gap="sm" mt="sm">
                {pasos.map((p, i) => (
                  <Card key={p.title} withBorder radius="md" p="md">
                    <Group wrap="nowrap" align="flex-start">
                      <ThemeIcon size={40} radius="xl" variant="light">
                        <p.icon size={22} stroke={1.5} />
                      </ThemeIcon>
                      <div>
                        <Text fw={600}>
                          {i + 1}. {p.title}
                        </Text>
                        <Text size="sm" c="dimmed">
                          {p.description}
                        </Text>
                      </div>
                    </Group>
                  </Card>
                ))}
              </Stack>

              <Group mt="md">
                <Button
                  size="md"
                  radius="xl"
                  rightSection={<IconArrowRight size={18} />}
                  onClick={() => setActive(1)}
                >
                  Comenzar
                </Button>
              </Group>
            </Stack>
          </Stepper.Step>

          <Stepper.Step label="Datos personales">
            <Stack gap="md" mt="md">
              <Title order={2}>{esInvitado ? 'Confirmá tus datos personales' : 'Contanos sobre vos'}</Title>
              <Text c="gray.7">
                Con tu sexo y tu fecha de nacimiento personalizamos el informe y, si corresponde, te ofrecemos
                programas de prevención como el Plan Bienestar · 100 días.
              </Text>

              <div>
                <Text fw={600} size="sm" mb={6}>
                  Sexo
                </Text>
                <SegmentedControl
                  fullWidth
                  value={datos.sexo ?? ''}
                  onChange={(v) => setCampo('sexo', v as Sexo)}
                  data={SEXO_OPCIONES.map((o) => ({ value: o.value, label: o.label }))}
                />
                {errores.sexo && (
                  <Text size="xs" c="red" mt={4}>
                    {errores.sexo}
                  </Text>
                )}
              </div>

              <TextInput
                type="date"
                label="Fecha de nacimiento"
                max={hoyISO()}
                value={datos.fechaNacimiento ?? ''}
                onChange={(e) => setCampo('fechaNacimiento', e.currentTarget.value)}
                error={errores.fechaNacimiento}
                required
              />

              <Group mt="md" justify="space-between">
                <Button variant="subtle" radius="xl" onClick={() => setActive(0)}>
                  Volver
                </Button>
                <Button size="md" radius="xl" rightSection={<IconArrowRight size={18} />} onClick={continuarDatosPersonales}>
                  Continuar
                </Button>
              </Group>
            </Stack>
          </Stepper.Step>

          <Stepper.Step label="Contacto">
            <Stack gap="md" mt="md">
              <Title order={2}>{esInvitado ? 'Confirmá cómo contactarte' : '¿Cómo te contactamos?'}</Title>
              <Text c="gray.7">
                Usamos tu celular y tu domicilio solo para el seguimiento de tu atención. El DNI identifica tu
                historia clínica en la red de salud argentina.
              </Text>

              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <TextInput
                  label="Teléfono celular"
                  placeholder="+54 9 11 5555-1234"
                  inputMode="tel"
                  value={datos.celular ?? ''}
                  onChange={(e) => setCampo('celular', e.currentTarget.value)}
                  error={errores.celular}
                  required
                />
                <TextInput
                  label="DNI"
                  placeholder="Solo números, sin puntos"
                  inputMode="numeric"
                  value={datos.dni ?? ''}
                  onChange={(e) => setCampo('dni', e.currentTarget.value)}
                  error={errores.dni}
                  required
                />
              </SimpleGrid>

              <TextInput
                label="Dirección (calle y número)"
                placeholder="Av. Belgrano 1782, 3° B"
                value={datos.calle ?? ''}
                onChange={(e) => setCampo('calle', e.currentTarget.value)}
                error={errores.calle}
                required
              />
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <TextInput
                  label="Localidad"
                  placeholder="Ciudad Autónoma de Buenos Aires"
                  value={datos.localidad ?? ''}
                  onChange={(e) => setCampo('localidad', e.currentTarget.value)}
                  error={errores.localidad}
                  required
                />
                <TextInput
                  label="Provincia"
                  placeholder="Buenos Aires"
                  value={datos.provincia ?? ''}
                  onChange={(e) => setCampo('provincia', e.currentTarget.value)}
                />
              </SimpleGrid>

              <Group mt="md" justify="space-between">
                <Button variant="subtle" radius="xl" onClick={() => setActive(1)} disabled={saving}>
                  Volver
                </Button>
                <Button
                  size="md"
                  radius="xl"
                  rightSection={<IconArrowRight size={18} />}
                  loading={saving}
                  onClick={finalizar}
                >
                  Guardar y empezar
                </Button>
              </Group>
            </Stack>
          </Stepper.Step>
        </Stepper>
      </Stack>
    </Container>
  );
}
