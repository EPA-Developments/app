// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Gate del Patient Journey: si el paciente todavía no completó la Bienvenida/Onboarding,
// cualquier ruta redirige a /bienvenida (que es la única ruta permitida hasta completar).
import type { Patient } from '@medplum/fhirtypes';
import { useMedplumProfile } from '@medplum/react';
import type { JSX, ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { necesitaOnboarding } from '../fhir/onboarding';

/** ¿El usuario logueado es un paciente que todavía debe completar la Bienvenida? */
export function useOnboardingPendiente(): boolean {
  const profile = useMedplumProfile();
  // Solo aplica a pacientes (los perfiles Practitioner de prueba no pasan por el journey).
  return profile?.resourceType === 'Patient' && necesitaOnboarding(profile as Patient);
}

export function OnboardingGate({ children }: { children: ReactNode }): JSX.Element {
  const pendiente = useOnboardingPendiente();
  const { pathname } = useLocation();

  if (pendiente && pathname !== '/bienvenida' && pathname !== '/signout') {
    return <Navigate replace to="/bienvenida" />;
  }
  if (!pendiente && pathname === '/bienvenida') {
    return <Navigate replace to="/" />;
  }
  return <>{children}</>;
}
