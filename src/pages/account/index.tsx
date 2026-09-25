// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import { LayoutConMenuLateral } from '../../components/LayoutConMenuLateral';

const RUTA_RESUMEN = '/account/resumen';

const sideMenu = {
  title: 'Mi cuenta',
  menu: [
    { name: 'Resumen', href: RUTA_RESUMEN },
    { name: 'Mis datos', href: '/account/profile' },
    { name: 'Mi equipo de salud', href: '/account/equipo' },
    { name: 'Membresía', href: '/membership' },
    { name: 'Consentimiento y privacidad', href: '/health-record/consent' },
  ],
};

// En smartphone el Resumen ya lleva a cada opción: el menú lateral es solo de web.
export function AccountPage(): JSX.Element {
  return (
    <LayoutConMenuLateral menu={sideMenu} inicio={RUTA_RESUMEN} volver="Mi cuenta" otrasRutasDeInicio={['/account']} />
  );
}
