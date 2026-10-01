// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// "Te faltan X estudios esenciales": qué analitos esenciales del laboratorio de rutina no
// tienen resultado en los últimos 12 meses (los que "cuentan como" otro lo cubren: el BUN
// cubre la urea, el LDL directo el LDL).
import { Alert, Anchor, Text } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import type { Observation, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconCircleCheck, IconListCheck } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { Link } from 'react-router';
import { RUTA_ENVIAR_ESTUDIOS } from '../../components/AccionesRapidas';
import {
  codigosQueCubren,
  esencialesFaltantes,
  esencialesRequeridos,
  fechaDesde,
  MESES_LABORATORIO_RUTINA,
} from '../../fhir/biomarkers';
import type { Biomarker } from './Biomarkers.data';

export function EsencialesPendientes({ catalogo }: { readonly catalogo: readonly Biomarker[] }): JSX.Element | null {
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  const [observaciones, setObservaciones] = useState<Observation[] | undefined>();

  const codigos = useMemo(
    () => [...new Set(esencialesRequeridos(catalogo).flatMap((r) => codigosQueCubren(r, catalogo)))].join(','),
    [catalogo]
  );

  useEffect(() => {
    if (!codigos) {
      return;
    }
    medplum
      .searchResources(
        'Observation',
        `code=${codigos}&patient=${getReferenceString(patient)}&date=ge${fechaDesde(MESES_LABORATORIO_RUTINA)}&_count=500`
      )
      .then(setObservaciones)
      .catch((err) => console.warn('No se pudieron traer los resultados de los esenciales.', err));
  }, [medplum, codigos, patient]);

  if (!codigos || !observaciones) {
    return null;
  }
  const { requeridos, faltan } = esencialesFaltantes(catalogo, observaciones);

  if (faltan.length === 0) {
    return (
      <Alert
        icon={<IconCircleCheck size={18} />}
        color="green"
        radius="md"
        mb="lg"
        title="Laboratorio de rutina al día"
      >
        Tenés los {requeridos.length} estudios esenciales de los últimos {MESES_LABORATORIO_RUTINA} meses.
      </Alert>
    );
  }
  const titulo =
    faltan.length === 1
      ? `Te falta 1 de ${requeridos.length} estudios esenciales`
      : `Te faltan ${faltan.length} de ${requeridos.length} estudios esenciales`;
  return (
    <Alert icon={<IconListCheck size={18} />} color="yellow" radius="md" mb="lg" title={titulo}>
      <Text size="sm">
        Sin resultados en los últimos {MESES_LABORATORIO_RUTINA} meses: {faltan.map((b) => b.title).join(', ')}.
      </Text>
      <Text size="sm" mt={4}>
        Pedíselos a tu médico en tu próximo laboratorio de rutina. Si ya los tenés,{' '}
        <Anchor component={Link} to={RUTA_ENVIAR_ESTUDIOS} size="sm">
          envianos el PDF
        </Anchor>
        .
      </Text>
    </Alert>
  );
}
