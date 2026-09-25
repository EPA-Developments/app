// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Inicio de "Plan de cuidado" en smartphone: sus opciones en tarjetas. En web manda el
// menú lateral y el inicio sigue siendo "Pasos del plan".
import type { JSX } from 'react';
import { InicioDeSeccion } from '../../components/InicioDeSeccion';
import { OPCIONES_CUIDADO, TITULO_CUIDADO } from './Cuidado.data';

export const INICIO_CUIDADO_WEB = '/care-plan/action-items';

export function CuidadoInicio(): JSX.Element {
  return (
    <InicioDeSeccion titulo={TITULO_CUIDADO} grupos={[{ opciones: OPCIONES_CUIDADO }]} inicioWeb={INICIO_CUIDADO_WEB} />
  );
}
