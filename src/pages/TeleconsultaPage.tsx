// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Videollamada de un turno virtual (/teleconsulta/:appointmentId): pagar si falta, esperar
// la confirmación del pago, entrar a la sala cuando abre y ver el informe al terminar.
// Todo lo resuelve el módulo de teleconsulta con los bots del servidor.
import { SalaTeleconsulta } from '@epa/teleconsulta-react';
import { Document } from '@medplum/react';
import type { JSX } from 'react';

export function TeleconsultaPage(): JSX.Element {
  return (
    <Document width={960}>
      <SalaTeleconsulta />
    </Document>
  );
}
