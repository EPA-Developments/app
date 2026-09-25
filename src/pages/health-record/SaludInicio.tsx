// SPDX-FileCopyrightText: Copyright Segunda Opinión Médica
// SPDX-License-Identifier: Apache-2.0
//
// Inicio de "Salud" en smartphone: cada sección de la Historia Clínica con sus opciones
// (cuestionarios, paneles de biomarcadores, mediciones…), igual que el Resumen de
// "Mi cuenta". En web manda el menú lateral y el inicio sigue siendo Biomarcadores.
import type { JSX } from 'react';
import { InicioDeSeccion } from '../../components/InicioDeSeccion';
import type { GrupoDeOpciones } from '../../components/InicioDeSeccion';
import { SECCIONES_SALUD, TITULO_SALUD } from './Salud.data';

export const INICIO_SALUD_WEB = '/health-record/biomarkers';

// Las secciones con sub-opciones van cada una con su título; las que son una sola opción
// (Cuestionarios, Consentimiento) se juntan al final.
const GRUPOS: GrupoDeOpciones[] = [
  ...SECCIONES_SALUD.filter((s) => s.opciones?.length).map((s) => ({
    titulo: s.titulo,
    opciones: (s.opciones ?? []).map((o) => ({ ...o, icon: s.icon })),
  })),
  {
    titulo: 'Registros',
    opciones: SECCIONES_SALUD.filter((s) => !s.opciones?.length).map((s) => ({
      icon: s.icon,
      titulo: s.titulo,
      descripcion: s.descripcion,
      href: s.href,
    })),
  },
];

export function SaludInicio(): JSX.Element {
  return <InicioDeSeccion titulo={TITULO_SALUD} grupos={GRUPOS} inicioWeb={INICIO_SALUD_WEB} />;
}
