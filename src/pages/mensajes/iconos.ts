// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
import {
  IconCalendarEvent,
  IconClipboardHeart,
  IconMessageCircle,
  IconReportMedical,
  IconStethoscope,
  IconWallet,
} from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';

const ICONOS: Record<string, Icon> = {
  turnos: IconCalendarEvent,
  estudios: IconReportMedical,
  'consulta-salud': IconStethoscope,
  'plan-bienestar': IconClipboardHeart,
  pagos: IconWallet,
};

/** Ícono del motivo del mensaje (los que no tienen uno propio usan el globo de chat). */
export function iconoMotivo(code: string | undefined): Icon {
  return (code && ICONOS[code]) || IconMessageCircle;
}
