// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import { Navigate } from 'react-router';

// El screening de contraindicaciones (HBOT/IHHT) ahora forma parte del
// cuestionario de ingreso de BioWellness. Mantenemos la ruta antigua como
// redirección para no romper enlaces existentes.
export function ScreeningQuestionnairePage(): JSX.Element {
  return <Navigate replace to="/patient-intake-questionnaire" />;
}
