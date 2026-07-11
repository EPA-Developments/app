// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Perfil (eje Usuario): datos personales y de contacto del Patient.
// Cuidados FHIR: nunca mandar elementos vacíos ("" o {}) — un address sin campos o
// un gender "" hacen fallar la validación del server. Todo lo vacío se omite.
import { Box, Button, LoadingOverlay, NativeSelect, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { formatFamilyName, formatGivenName, formatHumanName, normalizeErrorString } from '@medplum/core';
import type { Address, HumanName, Patient, PatientContact } from '@medplum/fhirtypes';
import { Form, ResourceAvatar, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { InfoSection } from '../../components/InfoSection';

/** Domicilio argentino, apilado (usable en smartphone) y en español. */
function DomicilioInput({ value, onChange }: { value: Address; onChange: (a: Address) => void }): JSX.Element {
  const set = (campo: 'line' | 'city' | 'state' | 'postalCode', v: string): void => {
    const next: Address = { ...value };
    if (campo === 'line') {
      if (v) {
        next.line = [v];
      } else {
        delete next.line;
      }
    } else if (v) {
      next[campo] = v;
    } else {
      delete next[campo];
    }
    onChange(next);
  };

  return (
    <Stack gap="xs">
      <TextInput
        label="Calle y número"
        value={value.line?.[0] ?? ''}
        onChange={(e) => set('line', e.currentTarget.value)}
        autoComplete="street-address"
      />
      <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs">
        <TextInput
          label="Ciudad / Localidad"
          value={value.city ?? ''}
          onChange={(e) => set('city', e.currentTarget.value)}
          autoComplete="address-level2"
        />
        <TextInput
          label="Provincia"
          value={value.state ?? ''}
          onChange={(e) => set('state', e.currentTarget.value)}
          autoComplete="address-level1"
        />
      </SimpleGrid>
      <TextInput
        label="Código postal"
        maw={200}
        value={value.postalCode ?? ''}
        onChange={(e) => set('postalCode', e.currentTarget.value)}
        autoComplete="postal-code"
      />
    </Stack>
  );
}

// Contacto de emergencia: se guarda en Patient.contact con el código estándar
// "C" (Emergency Contact, v2-0131), así recepción y el dashboard lo identifican.
const V2_0131 = 'http://terminology.hl7.org/CodeSystem/v2-0131';

const RELACIONES = ['', 'Pareja / Cónyuge', 'Madre', 'Padre', 'Hijo/a', 'Hermano/a', 'Familiar', 'Amigo/a', 'Otro'];

function esContactoEmergencia(c: PatientContact): boolean {
  return Boolean(c.relationship?.some((r) => r.coding?.some((k) => k.system === V2_0131 && k.code === 'C')));
}

/**
 * Arma la entrada Patient.contact desde el formulario, sin campos vacíos.
 * Devuelve undefined si quedó todo vacío (FHIR exige nombre o teléfono en contact).
 */
function armarContactoEmergencia(d: {
  nombre?: string;
  apellido?: string;
  relacion?: string;
  telefono?: string;
  email?: string;
}): PatientContact | undefined {
  const given = d.nombre?.trim();
  const family = d.apellido?.trim();
  const telefono = d.telefono?.trim();
  const email = d.email?.trim();
  const name = given || family ? { ...(given ? { given: [given] } : {}), ...(family ? { family } : {}) } : undefined;
  const telecom = [
    ...(telefono ? [{ system: 'phone' as const, value: telefono, use: 'mobile' as const }] : []),
    ...(email ? [{ system: 'email' as const, value: email }] : []),
  ];
  if (!name && telecom.length === 0) {
    return undefined;
  }
  return {
    relationship: [
      {
        coding: [{ system: V2_0131, code: 'C', display: 'Emergency Contact' }],
        ...(d.relacion?.trim() ? { text: d.relacion.trim() } : {}),
      },
    ],
    ...(name ? { name } : {}),
    ...(telecom.length > 0 ? { telecom } : {}),
  };
}

/** Devuelve el domicilio sin campos vacíos, o undefined si quedó todo vacío. */
function limpiarDomicilio(a: Address): Address | undefined {
  const linea = a.line?.map((l) => l.trim()).filter(Boolean);
  const limpio: Address = {
    ...(linea && linea.length > 0 ? { line: linea } : {}),
    ...(a.city?.trim() ? { city: a.city.trim() } : {}),
    ...(a.state?.trim() ? { state: a.state.trim() } : {}),
    ...(a.postalCode?.trim() ? { postalCode: a.postalCode.trim() } : {}),
  };
  return Object.keys(limpio).length > 0 ? { use: 'home', ...limpio } : undefined;
}

export function Profile(): JSX.Element | null {
  const medplum = useMedplum();
  const [profile, setProfile] = useState(medplum.getProfile() as Patient);
  const [loading, setLoading] = useState(false);
  const [address, setAddress] = useState(profile.address?.[0] || {});
  const emergenciaActual = profile.contact?.find(esContactoEmergencia);

  async function handleProfileEdit(formData: Record<string, string>): Promise<void> {
    setLoading(true);
    const given = formData.givenName?.trim();
    const family = formData.familyName?.trim();
    const domicilio = limpiarDomicilio(address);
    // Reemplaza SOLO el contacto de emergencia; otros Patient.contact se preservan.
    const emergencia = armarContactoEmergencia({
      nombre: formData.contactoNombre,
      apellido: formData.contactoApellido,
      relacion: formData.contactoRelacion,
      telefono: formData.contactoTelefono,
      email: formData.contactoEmail,
    });
    const otrosContactos = (profile.contact ?? []).filter((c) => !esContactoEmergencia(c));
    const contactos = [...otrosContactos, ...(emergencia ? [emergencia] : [])];
    const newProfile: Patient = {
      ...profile,
      // Sin nombre nuevo se conserva el existente (nunca mandar name con "" adentro).
      name:
        given || family
          ? [{ use: 'official', ...(given ? { given: [given] } : {}), ...(family ? { family } : {}) }]
          : profile.name,
      birthDate: formData.birthDate || undefined,
      gender: (formData.gender || undefined) as Patient['gender'],
      address: domicilio ? [domicilio] : undefined,
      contact: contactos.length > 0 ? contactos : undefined,
    };
    const updatedProfile = await medplum
      .updateResource(newProfile)
      .then((profile) => {
        showNotification({
          icon: <IconCircleCheck />,
          title: 'Listo',
          message: 'Perfil actualizado',
        });
        window.scrollTo(0, 0);
        return profile;
      })
      .catch((err) => {
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(err),
        });
      });
    if (updatedProfile) {
      setProfile(updatedProfile);
      setAddress(updatedProfile.address?.[0] || {});
    }
    setLoading(false);
  }

  return (
    <Box p={{ base: 'xs', sm: 'xl' }} pos="relative">
      <LoadingOverlay visible={loading} />
      <Form onSubmit={handleProfileEdit}>
        <Stack align="center">
          <ResourceAvatar size={200} radius={100} value={profile} />
          <Title order={2}>{formatHumanName(profile.name?.[0])}</Title>
          <InfoSection title="Datos personales">
            <Box p={{ base: 'md', sm: 'xl' }}>
              <Stack>
                <TextInput
                  label="Nombre"
                  name="givenName"
                  defaultValue={formatGivenName(profile.name?.[0] as HumanName)}
                />
                <TextInput
                  label="Apellido"
                  name="familyName"
                  defaultValue={formatFamilyName(profile.name?.[0] as HumanName)}
                />
                <NativeSelect
                  label="Género"
                  name="gender"
                  defaultValue={profile.gender}
                  data={[
                    { value: '', label: '' },
                    { value: 'female', label: 'Femenino' },
                    { value: 'male', label: 'Masculino' },
                    { value: 'other', label: 'Otro' },
                    { value: 'unknown', label: 'Sin especificar' },
                  ]}
                />
                <TextInput label="Fecha de nacimiento" name="birthDate" type="date" defaultValue={profile.birthDate} />
                <Button type="submit" mr="auto">
                  Guardar
                </Button>
              </Stack>
            </Box>
          </InfoSection>
          <InfoSection title="Datos de contacto">
            <Box p={{ base: 'md', sm: 'xl' }}>
              <Stack>
                <TextInput
                  label="Email"
                  name="email"
                  defaultValue={profile.telecom?.find((t) => t.system === 'email')?.value}
                  disabled
                />
                <DomicilioInput value={address} onChange={setAddress} />
                <Button type="submit" mr="auto">
                  Guardar
                </Button>
              </Stack>
            </Box>
          </InfoSection>
          <InfoSection title="Contacto de emergencia">
            <Box p={{ base: 'md', sm: 'xl' }}>
              <Stack>
                <Text size="sm" c="dimmed">
                  A quién avisamos ante una urgencia durante tu tratamiento.
                </Text>
                <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs">
                  <TextInput
                    label="Nombre"
                    name="contactoNombre"
                    defaultValue={emergenciaActual?.name?.given?.[0] ?? ''}
                  />
                  <TextInput
                    label="Apellido"
                    name="contactoApellido"
                    defaultValue={emergenciaActual?.name?.family ?? ''}
                  />
                </SimpleGrid>
                <NativeSelect
                  label="Relación"
                  name="contactoRelacion"
                  defaultValue={emergenciaActual?.relationship?.[0]?.text ?? ''}
                  data={RELACIONES}
                />
                <TextInput
                  label="Teléfono (WhatsApp)"
                  name="contactoTelefono"
                  type="tel"
                  placeholder="+54 9 11 ..."
                  defaultValue={emergenciaActual?.telecom?.find((t) => t.system === 'phone')?.value ?? ''}
                />
                <TextInput
                  label="Email (opcional)"
                  name="contactoEmail"
                  type="email"
                  defaultValue={emergenciaActual?.telecom?.find((t) => t.system === 'email')?.value ?? ''}
                />
                <Button type="submit" mr="auto">
                  Guardar
                </Button>
              </Stack>
            </Box>
          </InfoSection>
        </Stack>
      </Form>
    </Box>
  );
}
