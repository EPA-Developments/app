// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Secciones de "Salud" (Historia Clínica). Un solo catálogo para las dos navegaciones:
// el menú lateral de web y la pantalla de inicio de smartphone (SaludInicio).
//
// Nota: las rutas y componentes de Resultados de Laboratorio, Medicación y Vacunas
// se mantienen (no se borran); solo se ocultan del menú.
//  - Resultados de Laboratorio: oculto por ahora; los informes los crea el bot
//    `som-procesar-laboratorio` a partir de los PDF que manda el paciente ("Enviar
//    estudios en PDF"). Volver a sumar acá cuando el bot esté en producción.
//  - Medicación / Vacunas: ocultos del menú por pedido.
import {
  IconActivityHeartbeat,
  IconClipboardList,
  IconFileCheck,
  IconHeartbeat,
  IconReportMedical,
} from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';
import type { SideMenuProps } from '../../components/SideMenu';
import { LE8_QUESTIONNAIRES } from '../../le8';
import { biomarkerPanels } from './Biomarkers.data';
import { measurementsMeta } from './Measurement.data';

export const RUTA_SALUD = '/health-record';
export const TITULO_SALUD = 'Historia Clínica';

export interface OpcionSalud {
  readonly titulo: string;
  readonly descripcion?: string;
  readonly href: string;
}

export interface SeccionSalud {
  readonly titulo: string;
  readonly href: string;
  readonly icon: Icon;
  readonly descripcion: string;
  /** Sub-opciones (paneles, mediciones, cuestionarios). Sin ellas, la sección es una sola opción. */
  readonly opciones?: readonly OpcionSalud[];
}

export const SECCIONES_SALUD: readonly SeccionSalud[] = [
  {
    titulo: 'Mi salud cardiovascular',
    href: '/health-record/cuestionarios',
    icon: IconHeartbeat,
    descripcion: "Tus hábitos: Life's Essential 8.",
    opciones: LE8_QUESTIONNAIRES.map((q) => ({
      titulo: q.label,
      descripcion: q.description,
      href: `/health-record/cuestionarios/${q.slug}`,
    })),
  },
  {
    titulo: 'Biomarcadores',
    href: '/health-record/biomarkers',
    icon: IconReportMedical,
    descripcion: 'Resultados y evolución.',
    opciones: Object.values(biomarkerPanels).map(({ title, id, description }) => ({
      titulo: title,
      descripcion: description,
      href: `/health-record/biomarkers/${id}`,
    })),
  },
  {
    titulo: 'Signos Vitales',
    href: '/health-record/vitals',
    icon: IconActivityHeartbeat,
    descripcion: 'Presión, frecuencia cardíaca, peso y más.',
    opciones: Object.values(measurementsMeta).map(({ title, id, description }) => ({
      titulo: title,
      descripcion: description,
      href: `/health-record/vitals/${id}`,
    })),
  },
  {
    titulo: 'Cuestionarios',
    href: '/health-record/questionnaire-responses',
    icon: IconClipboardList,
    descripcion: 'Tus respuestas a los cuestionarios.',
  },
  {
    titulo: 'Consentimiento Informado',
    href: '/health-record/consent',
    icon: IconFileCheck,
    descripcion: 'Leé y firmá tu consentimiento.',
  },
];

/** Menú lateral de web, derivado de las mismas secciones. */
export const MENU_LATERAL_SALUD: SideMenuProps = {
  title: TITULO_SALUD,
  menu: SECCIONES_SALUD.map((s) => ({
    name: s.titulo,
    href: s.href,
    subMenu: s.opciones?.map((o) => ({ name: o.titulo, href: o.href })),
  })),
};
