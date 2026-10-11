// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useMedplumProfile } from '@medplum/react';
import type { JSX } from 'react';
import { useSearchParams } from 'react-router';
import { hoyArgentina } from '../fhir/glp1';
import { estiloDeHome, estiloForzado } from './inicio/estilo';
import { HomeEstiloD } from './inicio/HomeEstiloD';
import { HomeEstiloE } from './inicio/HomeEstiloE';

/**
 * El Inicio: cada persona ve el estilo de Home que le toca (src/pages/inicio/estilo.ts): las
 * mujeres de 45 a 55 años, el E («Vos en el centro»); el resto (hombres, mujeres fuera de ese
 * rango y quien no cargó sexo o fecha de nacimiento), el D («Salidas y llegadas»), que
 * reemplazó a la Home clásica. `?estilo=e` o `?estilo=d` en la URL fuerza uno, para que el
 * equipo pueda ver los dos con cualquier perfil (y `?tema=claro|oscuro`, el tema de la D).
 */
export function HomePage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const perfil = useMedplumProfile();
  const estilo = estiloForzado(searchParams.get('estilo')) ?? estiloDeHome(perfil, hoyArgentina());
  return estilo === 'E' ? <HomeEstiloE /> : <HomeEstiloD />;
}
