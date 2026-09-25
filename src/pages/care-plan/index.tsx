// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import { LayoutConMenuLateral } from '../../components/LayoutConMenuLateral';
import { MENU_LATERAL_CUIDADO, RUTA_CUIDADO } from './Cuidado.data';

// Opciones: Cuidado.data.ts. En smartphone el menú lateral no se muestra: el inicio del
// Plan de cuidado (CuidadoInicio) lleva a cada opción y las demás pantallas tienen "‹ Plan de cuidado".
export function CarePlanPage(): JSX.Element {
  return <LayoutConMenuLateral menu={MENU_LATERAL_CUIDADO} inicio={RUTA_CUIDADO} volver="Plan de cuidado" />;
}
