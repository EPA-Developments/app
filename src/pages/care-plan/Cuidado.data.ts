// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Opciones de "Plan de cuidado". Un solo catálogo para las dos navegaciones: el menú
// lateral de web y la pantalla de inicio de smartphone (CuidadoInicio).
import { IconClipboardHeart, IconHeartRateMonitor, IconListCheck, IconVaccine } from '@tabler/icons-react';
import type { SideMenuProps } from '../../components/SideMenu';
import type { OpcionDeMenu } from '../../components/TarjetaDeOpciones';

export const RUTA_CUIDADO = '/care-plan';
export const TITULO_CUIDADO = 'Plan de Cuidado';

export const OPCIONES_CUIDADO: readonly OpcionDeMenu[] = [
  {
    icon: IconListCheck,
    titulo: 'Pasos del plan',
    descripcion: 'Los pasos de tu seguimiento personalizado.',
    href: '/care-plan/action-items',
  },
  {
    icon: IconVaccine,
    titulo: 'Seguimiento GLP-1',
    descripcion: 'Tu tratamiento GLP-1: controles, meta y peso.',
    href: '/care-plan/glp1',
  },
  {
    icon: IconClipboardHeart,
    titulo: 'Plan Bienestar 100 Días',
    descripcion: 'Tus pasos, tus metas y tu progreso, semana a semana.',
    href: '/care-plan/plan-100-dias',
  },
  {
    icon: IconHeartRateMonitor,
    titulo: 'Mis datos de salud',
    descripcion: 'Tus mediciones y resultados: tu mapa cardiometabólico y tu riesgo.',
    href: '/care-plan/plan-100-dias/mis-datos',
  },
];

/** Menú lateral de web, derivado de las mismas opciones. */
export const MENU_LATERAL_CUIDADO: SideMenuProps = {
  title: TITULO_CUIDADO,
  menu: OPCIONES_CUIDADO.map((o) => ({ name: o.titulo, href: o.href })),
};
