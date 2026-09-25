// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import { LayoutConMenuLateral } from '../../components/LayoutConMenuLateral';
import { MENU_LATERAL_SALUD, RUTA_SALUD } from './Salud.data';

// Secciones y opciones: Salud.data.ts. En smartphone el menú lateral no se muestra: el
// inicio de Salud (SaludInicio) lleva a cada opción y las demás pantallas tienen "‹ Salud".
export function HealthRecord(): JSX.Element {
  return <LayoutConMenuLateral menu={MENU_LATERAL_SALUD} inicio={RUTA_SALUD} volver="Salud" />;
}
