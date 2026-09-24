// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// "Datos de cobertura" de Mis datos: obra social o prepaga, plan y número de afiliado.
// Se guarda aparte del Patient, como Coverage (ver src/fhir/cobertura.ts).
import { Box, Button, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { Coverage, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { FormEvent, JSX } from 'react';
import { InfoSection } from '../../components/InfoSection';
import type { DatosCobertura } from '../../fhir/cobertura';
import { buscarCobertura, guardarCobertura, leerDatosCobertura } from '../../fhir/cobertura';

export function CoberturaSection({ patient }: { patient: Patient }): JSX.Element {
  const medplum = useMedplum();
  const [existente, setExistente] = useState<Coverage>();
  const [datos, setDatos] = useState<DatosCobertura>(leerDatosCobertura(undefined));
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    buscarCobertura(medplum, patient)
      .then((c) => {
        setExistente(c);
        setDatos(leerDatosCobertura(c));
      })
      .catch((err) => console.warn('Cobertura no disponible', err))
      .finally(() => setCargando(false));
  }, [medplum, patient]);

  const set = (campo: keyof DatosCobertura, valor: string): void => setDatos((d) => ({ ...d, [campo]: valor }));

  const guardar = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!datos.financiador.trim()) {
      return;
    }
    setGuardando(true);
    guardarCobertura(medplum, patient, datos, existente)
      .then((c) => {
        setExistente(c);
        setDatos(leerDatosCobertura(c));
        showNotification({ icon: <IconCircleCheck />, title: 'Listo', message: 'Cobertura actualizada' });
      })
      .catch((err) => {
        const mensaje = normalizeErrorString(err);
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'No pudimos guardar tu cobertura',
          // Sin el permiso de escritura en el servidor, el error es "Forbidden".
          message: /forbidden/i.test(mensaje) ? 'Escribinos por Mensajes y la cargamos por vos.' : mensaje,
        });
      })
      .finally(() => setGuardando(false));
  };

  return (
    <InfoSection title="Datos de cobertura">
      <Box p={{ base: 'md', sm: 'xl' }}>
        <form onSubmit={guardar}>
          <Stack>
            <Text size="sm" c="dimmed">
              Tu obra social o prepaga. Si no tenés, dejalo vacío.
            </Text>
            <TextInput
              label="Obra social o prepaga"
              placeholder="Ej.: OSDE, Swiss Medical, PAMI"
              value={datos.financiador}
              onChange={(e) => set('financiador', e.currentTarget.value)}
              disabled={cargando}
              required
            />
            <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs">
              <TextInput
                label="Plan"
                placeholder="Ej.: 210"
                value={datos.plan}
                onChange={(e) => set('plan', e.currentTarget.value)}
                disabled={cargando}
              />
              <TextInput
                label="Número de afiliado"
                inputMode="numeric"
                value={datos.numeroAfiliado}
                onChange={(e) => set('numeroAfiliado', e.currentTarget.value)}
                disabled={cargando}
              />
            </SimpleGrid>
            <Button type="submit" mr="auto" loading={guardando} disabled={cargando || !datos.financiador.trim()}>
              Guardar
            </Button>
          </Stack>
        </form>
      </Box>
    </InfoSection>
  );
}
