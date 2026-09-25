import { Alert, Loader, Stack, Text, Title } from '@mantine/core';
import { useMedplumProfile } from '@medplum/react';
import { useState, type ReactElement } from 'react';
import { useTurnosPaciente } from '../hooks/useTurnosPaciente';
import { TarjetaTurno } from './TarjetaTurno';

export interface MisTurnosProps {
  /** Patient id override; defaults to the logged-in Patient profile. */
  pacienteId?: string;
  titulo?: string;
  /** How many past appointments to show (default 5). */
  maxAnteriores?: number;
}

/**
 * "Mis turnos": upcoming videocalls with their actions and the most recent
 * past ones (with the report once available). Drop it in the host's
 * appointments page.
 */
export function MisTurnos(props: MisTurnosProps): ReactElement {
  const perfil = useMedplumProfile();
  const pacienteId = props.pacienteId ?? (perfil?.resourceType === 'Patient' ? perfil.id : undefined);
  const { proximos, anteriores, cargando, error, recargar } = useTurnosPaciente(pacienteId);
  const [aviso, setAviso] = useState<string | undefined>(undefined);

  const alCambiar = (mensaje: string): void => {
    setAviso(mensaje);
    void recargar();
  };

  return (
    <Stack gap="md">
      <Title order={3}>{props.titulo ?? 'Mis turnos'}</Title>
      {aviso && (
        <Alert variant="light" color="teal" radius="md" withCloseButton onClose={() => setAviso(undefined)}>
          {aviso}
        </Alert>
      )}
      {error && (
        <Alert variant="light" color="red" radius="md">
          {error}
        </Alert>
      )}
      {cargando && proximos.length === 0 && anteriores.length === 0 && <Loader size="sm" />}
      {!cargando && proximos.length === 0 && (
        <Text c="dimmed">No tenés videollamadas próximas.</Text>
      )}
      {proximos.map((t) => (
        <TarjetaTurno key={t.turno.id} {...t} onCambio={alCambiar} />
      ))}
      {anteriores.length > 0 && (
        <>
          <Title order={5} mt="md">
            Anteriores
          </Title>
          {anteriores.slice(0, props.maxAnteriores ?? 5).map((t) => (
            <TarjetaTurno key={t.turno.id} {...t} />
          ))}
        </>
      )}
    </Stack>
  );
}
