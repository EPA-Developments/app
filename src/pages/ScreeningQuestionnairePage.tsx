// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import { Navigate } from 'react-router';

// El screening de ingreso ahora forma parte del cuestionario de ingreso de
// SOM. Mantenemos la ruta antigua como redirección para no
// romper enlaces existentes.
export function ScreeningQuestionnairePage(): JSX.Element {
  return <Navigate replace to="/health-record/ingreso" />;
}
